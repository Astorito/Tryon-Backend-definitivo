/**
 * Cliente FAL AI - Virtual Try-On
 * 
 * Integración con el modelo fal-ai/image-apps-v2/virtual-try-on
 * Documentación: https://fal.ai/models/fal-ai/image-apps-v2/virtual-try-on
 */

const FAL_API_KEY = process.env.FAL_API_KEY || '';
const FAL_MODEL = 'fal-ai/image-apps-v2/virtual-try-on';

export interface FalTryOnRequest {
  userImage: string; // base64 o URL
  garments: string[]; // array de base64 o URLs
}

export interface FalTryOnResponse {
  resultImage: string; // URL de la imagen generada
  success: boolean;
  error?: string;
}

/**
 * Convierte base64 a URL de datos si es necesario
 */
function ensureDataUrl(base64: string): string {
  if (base64.startsWith('data:')) {
    return base64;
  }
  // Detectar tipo de imagen
  const isJpeg = base64.startsWith('/9j/');
  const isPng = base64.startsWith('iVBORw');
  const mimeType = isPng ? 'image/png' : 'image/jpeg';
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Genera una imagen de virtual try-on usando FAL AI
 */
export async function generateWithFal(
  request: FalTryOnRequest
): Promise<FalTryOnResponse> {
  try {
    // Validar que tengamos API key
    if (!FAL_API_KEY) {
      throw new Error('FAL_API_KEY not configured');
    }

    console.log('[FAL] Iniciando generación de virtual try-on...');

    // Preparar la imagen del usuario
    const personImage = ensureDataUrl(request.userImage);
    
    // Tomar la primera prenda (el modelo de FAL acepta una prenda a la vez)
    const garmentImage = ensureDataUrl(request.garments[0]);

    // Llamar a FAL AI
    const response = await fetch(`https://queue.fal.run/${FAL_MODEL}`, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        person_image_url: personImage,
        garment_image_url: garmentImage,
        // Opciones adicionales del modelo
        category: 'tops', // tops, bottoms, one-pieces
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[FAL] Error response:', errorText);
      throw new Error(`FAL API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('[FAL] Respuesta recibida:', JSON.stringify(data).slice(0, 200));

    // FAL puede devolver un request_id para polling o el resultado directamente
    if (data.request_id) {
      // Modo async - necesitamos hacer polling
      return await pollFalResult(data.request_id);
    }

    // Resultado directo
    if (data.image?.url) {
      return {
        resultImage: data.image.url,
        success: true,
      };
    }

    // Formato alternativo
    if (data.output?.url) {
      return {
        resultImage: data.output.url,
        success: true,
      };
    }

    throw new Error('Unexpected FAL response format');

  } catch (error) {
    console.error('[FAL] Generation error:', error);
    return {
      resultImage: '',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown FAL error',
    };
  }
}

/**
 * Polling para resultados async de FAL
 */
async function pollFalResult(requestId: string): Promise<FalTryOnResponse> {
  const maxAttempts = 60; // 2 minutos máximo
  const pollInterval = 2000; // 2 segundos

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));

    const statusResponse = await fetch(
      `https://queue.fal.run/${FAL_MODEL}/requests/${requestId}/status`,
      {
        headers: {
          'Authorization': `Key ${FAL_API_KEY}`,
        },
      }
    );

    if (!statusResponse.ok) {
      continue;
    }

    const status = await statusResponse.json();
    console.log(`[FAL] Polling attempt ${attempt + 1}, status:`, status.status);

    if (status.status === 'COMPLETED') {
      // Obtener resultado
      const resultResponse = await fetch(
        `https://queue.fal.run/${FAL_MODEL}/requests/${requestId}`,
        {
          headers: {
            'Authorization': `Key ${FAL_API_KEY}`,
          },
        }
      );

      const result = await resultResponse.json();
      
      if (result.image?.url) {
        return {
          resultImage: result.image.url,
          success: true,
        };
      }
      
      if (result.output?.url) {
        return {
          resultImage: result.output.url,
          success: true,
        };
      }
    }

    if (status.status === 'FAILED') {
      throw new Error(`FAL generation failed: ${status.error || 'Unknown error'}`);
    }
  }

  throw new Error('FAL generation timeout');
}
