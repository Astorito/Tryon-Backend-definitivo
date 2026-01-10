import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { createJob, toStatusResponse, getJob } from '@/lib/job-store';
import { processJobAsync } from '@/lib/fal-async';
import { isRedisConfigured } from '@/lib/redis';
import { logLatency } from '@/lib/latency';

/**
 * POST /api/jobs/submit
 * 
 * Endpoint async para generación de imágenes.
 * Responde inmediatamente con job_id, procesa en background.
 * 
 * Request:
 * {
 *   "apiKey": "string",
 *   "userImage": "base64 string",
 *   "garments": ["base64 string", ...]
 * }
 * 
 * Response (inmediata, <300ms):
 * {
 *   "job_id": "uuid",
 *   "status": "queued"
 * }
 * 
 * El frontend debe hacer polling a /api/jobs/[id]/status
 */

interface SubmitRequest {
  apiKey: string;
  userImage: string;
  garments: string[];
}

// Generar UUID simple (no necesita crypto para esto)
function generateJobId(): string {
  return `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 11)}`;
}

export async function POST(request: NextRequest) {
  const startTs = Date.now();
  
  try {
    // Check Redis disponible
    if (!isRedisConfigured()) {
      return NextResponse.json(
        { 
          error: 'Async jobs not available', 
          detail: 'Redis not configured. Use /api/images/generate for sync mode.' 
        },
        { status: 503 }
      );
    }

    // Parsear body
    const body: SubmitRequest = await request.json();
    
    // Validaciones básicas
    if (!body.apiKey) {
      return NextResponse.json({ error: 'Missing apiKey' }, { status: 400 });
    }

    if (!body.userImage) {
      return NextResponse.json({ error: 'Missing userImage' }, { status: 400 });
    }

    if (!body.garments || body.garments.length === 0) {
      return NextResponse.json({ error: 'At least one garment is required' }, { status: 400 });
    }

    if (body.garments.length > 4) {
      return NextResponse.json({ error: 'Maximum 4 garments allowed' }, { status: 400 });
    }

    // Validar API key
    const client = validateApiKey(body.apiKey);
    if (!client) {
      return NextResponse.json({ error: 'Invalid or inactive API key' }, { status: 401 });
    }

    // Generar job ID
    const jobId = generateJobId();
    
    // Crear job en Redis (estado: queued)
    await createJob({
      id: jobId,
      client_id: client.id,
      garments_count: body.garments.length,
    });

    const jobCreatedTs = Date.now();

    // Log timing de creación
    logLatency({
      requestId: jobId,
      phase: 'job_created',
      durationMs: jobCreatedTs - startTs,
      timestamp: new Date().toISOString(),
      metadata: { client_id: client.id, garments: body.garments.length },
    });

    // === FIRE AND FORGET ===
    // Disparar procesamiento async SIN await
    // Esto permite responder inmediatamente al cliente
    processJobAsync({
      jobId,
      userImage: body.userImage,
      garments: body.garments,
    }).catch(err => {
      // Este catch es solo para evitar unhandled rejection
      // El error real se maneja dentro de processJobAsync
      console.error(`[Submit] Background processing error for ${jobId}:`, err);
    });

    // Responder inmediatamente
    const responseTs = Date.now();
    const responseTime = responseTs - startTs;

    logLatency({
      requestId: jobId,
      phase: 'job_submit_response',
      durationMs: responseTime,
      timestamp: new Date().toISOString(),
    });

    // Obtener job para incluir timestamps en response
    const job = await getJob(jobId);

    return NextResponse.json({
      job_id: jobId,
      status: 'queued',
      poll_url: `/api/jobs/${jobId}/status`,
      timestamps: {
        created_at: job?.created_at || jobCreatedTs,
      },
      _meta: {
        response_time_ms: responseTime,
      },
    });

  } catch (error) {
    console.error('[Submit] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// CORS
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
