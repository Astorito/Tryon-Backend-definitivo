import { NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';
import { getHttpsAgent, getAgentStats } from '@/lib/http-agent';

/**
 * Health check endpoint para warm-up de serverless
 * GET /api/health
 * 
 * PROPÓSITO:
 * - Mantener la función serverless "caliente" 
 * - Evitar cold starts de ~800-2000ms
 * - Verificar conectividad con FAL
 * - Inicializar connection pool
 * 
 * CÓMO USAR:
 * 1. Vercel Cron: Agregar a vercel.json
 * 2. External: UptimeRobot, Pingdom, etc. cada 5 min
 * 
 * IMPORTANTE: Este endpoint NO cuenta como generación
 */

// Inicializar FAL para calentar el cliente
fal.config({
  credentials: process.env.FAL_KEY || process.env.FAL_API_KEY || '',
});

// Inicializar HTTP agent con keep-alive
getHttpsAgent();

export async function GET() {
  const startTime = Date.now();
  
  try {
    // Verificaciones ligeras (no hacen requests externos costosos)
    const checks = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage().heapUsed / 1024 / 1024, // MB
      falConfigured: !!(process.env.FAL_KEY || process.env.FAL_API_KEY),
      nodeVersion: process.version,
      httpAgent: getAgentStats(),
    };
    
    const responseTime = Date.now() - startTime;
    
    return NextResponse.json({
      status: 'healthy',
      responseTime,
      checks,
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
    
  } catch (error) {
    return NextResponse.json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

// HEAD request para pings más ligeros
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}
