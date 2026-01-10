import { NextRequest, NextResponse } from 'next/server';
import { getJob, toStatusResponse } from '@/lib/job-store';
import { isRedisConfigured } from '@/lib/redis';

/**
 * GET /api/jobs/[id]/status
 * 
 * Endpoint de polling para verificar estado de un job.
 * Optimizado para llamadas frecuentes (cada 2s).
 * 
 * Response:
 * {
 *   "status": "queued" | "processing" | "done" | "error",
 *   "image_url": "string | null",
 *   "error": "string | null",
 *   "timestamps": {
 *     "created_at": number,
 *     "fal_start": number | null,
 *     "fal_end": number | null,
 *     "completed_at": number | null
 *   }
 * }
 */

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    // Check Redis disponible
    if (!isRedisConfigured()) {
      return NextResponse.json(
        { error: 'Async jobs not available' },
        { status: 503 }
      );
    }

    const { id: jobId } = await params;

    if (!jobId) {
      return NextResponse.json(
        { error: 'Missing job ID' },
        { status: 400 }
      );
    }

    // Obtener job de Redis
    const job = await getJob(jobId);

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found', job_id: jobId },
        { status: 404 }
      );
    }

    // Convertir a formato de respuesta
    const response = toStatusResponse(job);

    // Headers para polling eficiente
    const headers: HeadersInit = {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    };

    // Si el job está done o error, es cacheable por un rato
    if (job.status === 'done' || job.status === 'error') {
      headers['Cache-Control'] = 'public, max-age=60';
    }

    return NextResponse.json(response, { headers });

  } catch (error) {
    console.error('[JobStatus] Error:', error);
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
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
