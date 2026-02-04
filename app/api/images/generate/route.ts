import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { generateWithFal } from '@/lib/fal-client';
import { recordEvent } from '@/lib/metrics-store';
import { createTimingContext, elapsed, logLatency } from '@/lib/latency';

// Configuración de runtime para evitar timeouts
export const maxDuration = 60; // 60 segundos máximo
export const dynamic = 'force-dynamic';

/**
 * Endpoint de generación de imágenes
 * POST /api/images/generate
 * 
 * Recibe:
 * - apiKey: API key del cliente
 * - userImage: imagen del usuario (base64)
 * - garments: array de imágenes de prendas (base64)
 * - _requestId: (opcional) ID del frontend para correlación
 * - _feClickTs: (opcional) timestamp del click en frontend
 * 
 * Devuelve:
 * - resultImage: imagen generada (base64)
 * 
 * NO persiste nada, NO cachea resultados.
 */

// === COLD START DETECTION ===
// Variable global que persiste mientras el lambda/edge está warm
let lastRequestTime = 0;
let requestCount = 0;

function detectColdStart(): { isCold: boolean; timeSinceLastMs: number } {
  const now = Date.now();
  const timeSinceLastMs = lastRequestTime === 0 ? 0 : now - lastRequestTime;
  const isCold = lastRequestTime === 0 || timeSinceLastMs > 300000; // 5 min threshold
  lastRequestTime = now;
  requestCount++;
  return { isCold, timeSinceLastMs };
}

interface GenerateRequest {
  apiKey: string;
  userImage?: string;          // Mantener para backward compatibility
  garments?: string[];         // Mantener para backward compatibility
  userImageUrl?: string;       // NUEVO
  garmentUrls?: string[];      // NUEVO
  _requestId?: string;
  _feClickTs?: number;
}

export async function POST(request: NextRequest) {
  // === TIMING: Inicio del request handler ===
  const beReceivedTs = Date.now();
  const coldStartInfo = detectColdStart();
  const ctx = createTimingContext('generate_request');
  
  try {
    // Parsear body
    const body: GenerateRequest = await request.json();
    const bodyParsedTs = Date.now();
    
    // Use frontend request ID if provided, otherwise use backend generated
    const correlationId = body._requestId || ctx.requestId;
    
    // === TIMING: Request received (with cold start info) ===
    logLatency({
      requestId: correlationId,
      phase: 'be_request_received',
      durationMs: 0,
      timestamp: new Date().toISOString(),
      metadata: { 
        cold_start: coldStartInfo.isCold,
        time_since_last_ms: coldStartInfo.timeSinceLastMs,
        request_count: requestCount,
        fe_click_ts: body._feClickTs,
        network_latency_up_ms: body._feClickTs ? beReceivedTs - body._feClickTs : null,
      },
    });
    
    // === TIMING: Body parseado ===
    logLatency({
      requestId: correlationId,
      phase: 'be_body_parsed',
      durationMs: bodyParsedTs - beReceivedTs,
      timestamp: new Date().toISOString(),
    });
    
    // Validar campos requeridos
    if (!body.apiKey) {
      return NextResponse.json(
        { error: 'Missing apiKey' },
        { status: 400 }
      );
    }


    // Determinar si usa URLs o base64
    const useUrls = !!body.userImageUrl;
    const userInput = useUrls ? body.userImageUrl : body.userImage;
    const garmentInputs = useUrls ? body.garmentUrls : body.garments;

    if (!userInput) {
      return NextResponse.json(
        { error: 'Missing userImage or userImageUrl' },
        { status: 400 }
      );
    }

    if (!garmentInputs || garmentInputs.length === 0) {
      return NextResponse.json(
        { error: 'At least one garment is required' },
        { status: 400 }
      );
    }

    if (garmentInputs.length > 4) {
      return NextResponse.json(
        { error: 'Maximum 4 garments allowed' },
        { status: 400 }
      );
    }

    // Validar API key
    const authStartTs = Date.now();
    const client = validateApiKey(body.apiKey);
    const authEndTs = Date.now();
    
    // === TIMING: Auth completed ===
    logLatency({
      requestId: correlationId,
      phase: 'be_auth_done',
      durationMs: authEndTs - authStartTs,
      timestamp: new Date().toISOString(),
    });
    
    if (!client) {
      return NextResponse.json(
        { error: 'Invalid or inactive API key' },
        { status: 401 }
      );
    }

    // === TIMING: FAL call start ===
    const falStartTs = Date.now();
    logLatency({
      requestId: correlationId,
      phase: 'be_fal_request_sent',
      durationMs: falStartTs - beReceivedTs,
      timestamp: new Date().toISOString(),
      metadata: { 
        overhead_pre_fal_ms: falStartTs - beReceivedTs,
        garments_count: (body.garments ?? []).length 
      },
    });

    // Llamar a FAL AI - Virtual Try-On
    let result;
    try {
      console.log(`[Generate] Calling FAL for client: ${body.apiKey}`);
      result = await generateWithFal({
        userImage: userInput,
        garments: garmentInputs,
      }, correlationId);
      console.log(`[Generate] FAL response received, success: ${result.success}`);
    } catch (falError: any) {
      console.error(`[Generate] FAL call failed:`, {
        error: falError.message,
        stack: falError.stack?.substring(0, 300),
      });
      
      // Registrar métrica de error
      recordEvent(body.apiKey, {
        type: 'generation',
        timestamp: new Date().toISOString(),
        model: 'fal-virtual-try-on-error',
        clientId: client.id,
        clientName: client.name,
      }).catch(err => console.error('[Generate] Metrics error:', err));
      
      return NextResponse.json(
        { 
          success: false,
          error: `Generation failed: ${falError.message}`,
          details: 'FAL API error - please try again'
        },
        { status: 500 }
      );
    }
    
    const falEndTs = Date.now();
    
    // === TIMING: FAL call end ===
    logLatency({
      requestId: correlationId,
      phase: 'be_fal_response_received',
      durationMs: falEndTs - falStartTs,
      timestamp: new Date().toISOString(),
      metadata: { 
        fal_duration_ms: falEndTs - falStartTs,
        success: result.success,
      },
    });

    // Record metrics (non-blocking) - registrar SIEMPRE, incluso en caso de error
    console.log(`[Generate] Recording metrics for client: ${body.apiKey}, success: ${result.success}`);
    recordEvent(body.apiKey, {
      type: 'generation',
      timestamp: new Date().toISOString(),
      model: 'fal-virtual-try-on',
      clientId: client.id,
      clientName: client.name,
    }).catch(err => {
      console.error('[Generate] Metrics error:', err);
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Generation failed' },
        { status: 500 }
      );
    }

    // Preparar response
    const responseSentTs = Date.now();
    const totalDuration = responseSentTs - beReceivedTs;
    const backendOverhead = totalDuration - (falEndTs - falStartTs);
    
    // === TIMING: Response sent ===
    logLatency({
      requestId: correlationId,
      phase: 'be_response_sent',
      durationMs: totalDuration,
      timestamp: new Date().toISOString(),
      metadata: { 
        success: true,
        backend_overhead_ms: backendOverhead,
        fal_duration_ms: falEndTs - falStartTs,
        cold_start: coldStartInfo.isCold,
      },
    });
    
    return NextResponse.json({
      success: true,
      resultImage: result.resultImage,
      // Metadata for UI state management
      metadata: {
        generatedAt: new Date().toISOString(),
        inputsCount: {
          garments: (body.garments ?? []).length,
        },
        // Timings para frontend (correlación e2e)
        timings: {
          requestId: correlationId,
          be_received_ts: beReceivedTs,
          be_response_sent_ts: responseSentTs,
          total_backend_ms: totalDuration,
          fal_duration_ms: falEndTs - falStartTs,
          backend_overhead_ms: backendOverhead,
          cold_start: coldStartInfo.isCold,
        },
      },
    });

  } catch (error) {
    console.error('[Generate] Error:', error);
    const errorTs = Date.now();
    
    // === TIMING: Log de error ===
    logLatency({
      requestId: ctx.requestId,
      phase: 'be_request_error',
      durationMs: errorTs - beReceivedTs,
      timestamp: new Date().toISOString(),
      metadata: { 
        error: error instanceof Error ? error.message : 'Unknown',
        cold_start: coldStartInfo.isCold,
      },
    });
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
        requestId: ctx.requestId, // Para debugging
      },
      { status: 500 }
    );
  }
}

// Manejar OPTIONS para CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
