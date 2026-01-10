import { NextResponse } from 'next/server';
import { getRedis, isRedisConfigured } from '@/lib/redis';

/**
 * GET /api/jobs/health
 * 
 * Health check para el sistema de jobs async.
 * Verifica conectividad con Redis.
 */

export async function GET() {
  const status = {
    redis_configured: isRedisConfigured(),
    redis_connected: false,
    timestamp: new Date().toISOString(),
  };

  if (!status.redis_configured) {
    return NextResponse.json({
      ...status,
      message: 'Redis not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.',
    }, { status: 503 });
  }

  try {
    // Test de conexión real
    const redis = getRedis();
    await redis.ping();
    status.redis_connected = true;

    return NextResponse.json({
      ...status,
      message: 'Async jobs system operational',
    });

  } catch (error) {
    return NextResponse.json({
      ...status,
      message: 'Redis connection failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 503 });
  }
}
