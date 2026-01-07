import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { generateWithFal } from '@/lib/fal-client';
import { sendMetricsEvent } from '@/lib/metrics';

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
  try {
    // Parsear body
    const body: GenerateRequest = await request.json();
    
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
    const result = await generateWithFal({
      userImage: body.userImage,
      garments: body.garments,
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
    return NextResponse.json({
      success: true,
      resultImage: result.resultImage,
      // Metadata for UI state management
      metadata: {
        generatedAt: new Date().toISOString(),
        inputsCount: {
          garments: body.garments.length,
        },
      },
    });

  } catch (error) {
    console.error('[Generate] Error:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
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
