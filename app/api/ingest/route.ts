/**
 * API Endpoint: /api/ingest
 * 
 * Recibe eventos de métricas desde los widgets/backends.
 * Cada request debe incluir el header x-client-key para identificar la empresa.
 */

import { NextRequest, NextResponse } from 'next/server';
import { recordEvent } from '@/lib/metrics-store';

export async function POST(request: NextRequest) {
  try {
    // Obtener client key del header
    const clientKey = request.headers.get('x-client-key');
    
    if (!clientKey) {
      return NextResponse.json(
        { error: 'Missing x-client-key header' },
        { status: 401 }
      );
    }

    // Parsear el body
    const body = await request.json();

    // Validar campos requeridos
    if (!body.type || !body.timestamp) {
      return NextResponse.json(
        { error: 'Missing required fields: type, timestamp' },
        { status: 400 }
      );
    }

    // Registrar el evento
    recordEvent(clientKey, {
      type: body.type,
      timestamp: body.timestamp,
      model: body.model || 'unknown',
      clientId: body.clientId || clientKey,
      clientName: body.clientName || 'Unknown',
    });

    return NextResponse.json({ 
      success: true,
      message: 'Event recorded',
    });

  } catch (error) {
    console.error('[Ingest] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// También soportar GET para health check
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: 'ingest',
    description: 'POST events with x-client-key header',
  });
}
