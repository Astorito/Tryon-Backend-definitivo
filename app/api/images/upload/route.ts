import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { fal } from '@fal-ai/client';

/**
 * Endpoint de pre-upload de imágenes a FAL Storage
 * POST /api/images/upload
 * 
 * Recibe:
 * - apiKey: API key del cliente
 * - image: imagen en base64
 * 
 * Devuelve:
 * - url: URL de la imagen en FAL CDN (válida por 24h)
 * 
 * BENEFICIO: Reduce latencia de generación ~1-2s
 * - FAL accede a su propio CDN en vez de decodificar base64
 * - Menor payload en el request de generación
 */

// Configurar FAL credentials
fal.config({
  credentials: process.env.FAL_KEY || process.env.FAL_API_KEY || '',
});

interface UploadRequest {
  apiKey: string;
  image: string; // base64 o data URL
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const body: UploadRequest = await request.json();
    
    // Validar campos requeridos
    if (!body.apiKey) {
      return NextResponse.json(
        { error: 'Missing apiKey' },
        { status: 400 }
      );
    }

    if (!body.image) {
      return NextResponse.json(
        { error: 'Missing image' },
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

    // Convertir base64 a Blob para upload
    let imageData = body.image;
    
    // Asegurar que tenga prefijo data URL
    if (!imageData.startsWith('data:')) {
      const isPng = imageData.startsWith('iVBORw');
      const mimeType = isPng ? 'image/png' : 'image/jpeg';
      imageData = `data:${mimeType};base64,${imageData}`;
    }

    // Extraer el base64 puro y convertir a Blob
    const base64Match = imageData.match(/^data:([^;]+);base64,(.+)$/);
    if (!base64Match) {
      return NextResponse.json(
        { error: 'Invalid image format' },
        { status: 400 }
      );
    }

    const mimeType = base64Match[1];
    const base64Data = base64Match[2];
    
    // Convertir base64 a Buffer
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Crear un Blob-like object para FAL
    const blob = new Blob([buffer], { type: mimeType });
    const file = new File([blob], `upload-${Date.now()}.${mimeType.split('/')[1]}`, { 
      type: mimeType 
    });

    // Subir a FAL Storage
    const url = await fal.storage.upload(file);

    const uploadTime = Date.now() - startTime;
    console.log(`[Upload] Completed in ${uploadTime}ms for client: ${client.name}`);

    return NextResponse.json({
      success: true,
      url,
      uploadTime,
    });

  } catch (error) {
    console.error('[Upload] Error:', error);
    
    return NextResponse.json(
      { 
        error: 'Upload failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// CORS preflight
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
