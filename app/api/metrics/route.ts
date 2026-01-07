/**
 * API Endpoint: /api/metrics
 * 
 * Retorna métricas agregadas para el dashboard.
 * Requiere x-admin-key para acceso completo a todas las empresas.
 * O x-client-key para ver solo métricas de una empresa específica.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAllMetrics, getClientMetrics } from '@/lib/metrics-store';

// Admin key para acceso completo (en producción usar variable de entorno)
const ADMIN_KEY = process.env.ADMIN_KEY || 'admin_secret_key_2024';

export async function GET(request: NextRequest) {
  try {
    const adminKey = request.headers.get('x-admin-key');
    const clientKey = request.headers.get('x-client-key');

    // Si tiene admin key, retornar todas las métricas
    if (adminKey === ADMIN_KEY) {
      const metrics = getAllMetrics();
      return NextResponse.json({
        success: true,
        data: metrics,
      });
    }

    // Si tiene client key, retornar solo sus métricas
    if (clientKey) {
      const metrics = getClientMetrics(clientKey);
      
      if (!metrics) {
        return NextResponse.json(
          { error: 'Client not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        data: metrics,
      });
    }

    // Sin autenticación
    return NextResponse.json(
      { error: 'Missing authentication. Provide x-admin-key or x-client-key header' },
      { status: 401 }
    );

  } catch (error) {
    console.error('[Metrics] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
