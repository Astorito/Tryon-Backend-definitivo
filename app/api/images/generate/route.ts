import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { generateWithFal } from '@/lib/fal-client';
import { sendMetricsEvent } from '@/lib/metrics';
import { createTimingContext, elapsed, logLatency } from '@/lib/latency';

/**
 * Endpoint de generación de imágenes
 * POST /api/images/generate
 * 
 * Recibe:
 * - apiKey: API key del cliente
 * - userImage: imagen del usuario (base64)
 * - garments: array de imágenes de prendas (base64)
 * 
 * Devuelve:
 * - resultImage: imagen generada (base64)
 * 
 * NO persiste nada, NO cachea resultados.
 */

interface GenerateRequest {
  apiKey: string;
  userImage: string;
  garments: string[];
}

export async function POST(request: NextRequest) {
  // === TIMING: Inicio del request handler ===
  const ctx = createTimingContext('generate_request');
  
  try {
    // Parsear body
    const body: GenerateRequest = await request.json();
    
    // === TIMING: Body parseado ===
    logLatency({
      requestId: ctx.requestId,
      phase: 'body_parsed',
      durationMs: Math.round(elapsed(ctx)),
      timestamp: new Date().toISOString(),
    });
    
    // Validar campos requeridos
    if (!body.apiKey) {
      return NextResponse.json(
        { error: 'Missing apiKey' },
        { status: 400 }
      );
    }

    if (!body.userImage) {
      return NextResponse.json(
        { error: 'Missing userImage' },
        { status: 400 }
      );
    }

    if (!body.garments || body.garments.length === 0) {
      return NextResponse.json(
        { error: 'At least one garment is required' },
        { status: 400 }
      );
    }

    if (body.garments.length > 4) {
      return NextResponse.json(
        { error: 'Maximum 4 garments allowed' },
        { status: 400 }
      );
    }

    // Validar API key
    const client = validateApiKey(body.apiKey);
    if (!client) {
      return NextResponse.json(
        { error: 'Invalid or inactive API key' },
        { status: 401 }
      );
    }

    // Llamar a FAL AI - Virtual Try-On
    const beforeFal = elapsed(ctx);
    const result = await generateWithFal({
      userImage: body.userImage,
      garments: body.garments,
    }, ctx.requestId);
    const afterFal = elapsed(ctx);
    
    // === TIMING: Log de llamada FAL completa desde perspectiva del route ===
    logLatency({
      requestId: ctx.requestId,
      phase: 'fal_total_from_route',
      durationMs: Math.round(afterFal - beforeFal),
      timestamp: new Date().toISOString(),
      metadata: { garmentsCount: body.garments.length },
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Generation failed' },
        { status: 500 }
      );
    }

    // Enviar métricas (no bloqueante)
    sendMetricsEvent(body.apiKey, {
      type: 'generation',
      timestamp: new Date().toISOString(),
      model: 'fal-virtual-try-on',
      clientId: client.id,
      clientName: client.name,
    }).catch(err => {
      console.error('[Generate] Metrics error:', err);
      // No afecta la respuesta
    });

    // Devolver resultado con metadatos para UI
    const totalDuration = elapsed(ctx);
    
    // === TIMING: Log final del request ===
    logLatency({
      requestId: ctx.requestId,
      phase: 'request_complete',
      durationMs: Math.round(totalDuration),
      timestamp: new Date().toISOString(),
      metadata: { 
        success: true,
        falTimings: result.timings,
      },
    });
    
    return NextResponse.json({
      success: true,
      resultImage: result.resultImage,
      // Metadata for UI state management
      metadata: {
        generatedAt: new Date().toISOString(),
        inputsCount: {
          garments: body.garments.length,
        },
        // Incluir timings en respuesta para debugging del frontend
        timings: result.timings ? {
          requestId: ctx.requestId,
          totalMs: Math.round(totalDuration),
          falInferenceMs: result.timings.breakdown.falInferenceMs,
          backendOverheadMs: result.timings.backendOverheadMs,
        } : undefined,
      },
    });

  } catch (error) {
    console.error('[Generate] Error:', error);
    
    // === TIMING: Log de error ===
    logLatency({
      requestId: ctx.requestId,
      phase: 'request_error',
      durationMs: Math.round(elapsed(ctx)),
      timestamp: new Date().toISOString(),
      metadata: { error: error instanceof Error ? error.message : 'Unknown' },
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
