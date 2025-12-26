/**
 * Cliente FAL AI - Nano Banana Pro Edit
 * 
 * Integración con el modelo fal-ai/nano-banana-pro/edit
 * Documentación: https://fal.ai/models/fal-ai/nano-banana-pro/edit
 */

const FAL_API_KEY = process.env.FAL_API_KEY || '';
const FAL_MODEL = 'fal-ai/nano-banana-pro/edit';

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
 * Convierte base64 a data URL si es necesario
 */
function ensureDataUrl(base64: string): string {
  if (base64.startsWith('data:')) {
    return base64;
  }
  if (base64.startsWith('http://') || base64.startsWith('https://')) {
    return base64;
  }
  // Detectar tipo de imagen
  const isJpeg = base64.startsWith('/9j/');
  const isPng = base64.startsWith('iVBORw');
  const mimeType = isPng ? 'image/png' : 'image/jpeg';
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Genera una imagen de virtual try-on usando FAL AI Nano Banana Pro
 */
export async function generateWithFal(
  request: FalTryOnRequest
): Promise<FalTryOnResponse> {
  try {
    // Validar que tengamos API key
    if (!FAL_API_KEY) {
      throw new Error('FAL_API_KEY not configured');
    }

    console.log('[FAL] Iniciando generación con nano-banana-pro/edit...');

    // Preparar las imágenes (usuario + prendas)
    const imageUrls: string[] = [];
    
    // Agregar imagen del usuario
    imageUrls.push(ensureDataUrl(request.userImage));
    
    // Agregar prendas
    for (const garment of request.garments) {
      if (garment) {
        imageUrls.push(ensureDataUrl(garment));
      }
    }

    console.log('[FAL] Enviando', imageUrls.length, 'imágenes');

    // Prompt para virtual try-on
    const prompt = "Make the person in the first image wear the clothing items shown in the other images. Keep the person's face, body and pose exactly the same. Only change their clothes to match the garments provided.";

    // Llamar a FAL AI usando el endpoint de queue
    // nano-banana-pro/edit espera: prompt, image_urls
    const response = await fetch(`https://queue.fal.run/${FAL_MODEL}`, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: prompt,
        image_urls: imageUrls,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[FAL] Error response:', errorText);
      throw new Error(`FAL API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('[FAL] Respuesta recibida:', JSON.stringify(data).slice(0, 500));

    // FAL puede devolver un request_id para polling o el resultado directamente
    if (data.request_id && data.status_url && data.response_url) {
      // Modo async - necesitamos hacer polling usando las URLs que FAL nos da
      console.log('[FAL] Request en cola, ID:', data.request_id);
      return await pollFalResult(data.request_id, data.status_url, data.response_url);
    }

    // Resultado directo - buscar la imagen en varios formatos posibles
    const resultUrl = extractImageUrl(data);
    if (resultUrl) {
      return {
        resultImage: resultUrl,
        success: true,
      };
    }

    throw new Error('Unexpected FAL response format: ' + JSON.stringify(data).slice(0, 200));

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
 * Extrae la URL de imagen de la respuesta de FAL
 */
function extractImageUrl(data: any): string | null {
  // Formato: { image: { url: "..." } }
  if (data.image?.url) return data.image.url;
  
  // Formato: { output: { url: "..." } }
  if (data.output?.url) return data.output.url;
  
  // Formato: { images: [{ url: "..." }] }
  if (data.images?.[0]?.url) return data.images[0].url;
  
  // Formato: { data: { image: { url: "..." } } }
  if (data.data?.image?.url) return data.data.image.url;
  
  // Formato: { url: "..." } directo
  if (data.url) return data.url;

  // Formato: { output: "url" } string directo
  if (typeof data.output === 'string') return data.output;

  return null;
}

/**
 * Polling para resultados async de FAL usando las URLs proporcionadas
 */
async function pollFalResult(
  requestId: string, 
  statusUrl: string, 
  responseUrl: string
): Promise<FalTryOnResponse> {
  const maxAttempts = 60; // ~2 minutos máximo con polling adaptativo
  
  // Polling adaptativo: empieza rápido, luego más lento
  const getInterval = (attempt: number): number => {
    if (attempt < 5) return 1000;  // Primeros 5: cada 1s
    if (attempt < 15) return 2000; // Siguientes 10: cada 2s
    return 3000;                    // Resto: cada 3s
  };

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, getInterval(attempt)));

    try {
      // Verificar estado usando la URL que FAL nos dio
      const statusResponse = await fetch(statusUrl, {
        headers: {
          'Authorization': `Key ${FAL_API_KEY}`,
        },
      });

      if (!statusResponse.ok) {
        console.log(`[FAL] Status check failed (${statusResponse.status}), retrying...`);
        continue;
      }

      const status = await statusResponse.json();
      console.log(`[FAL] Polling attempt ${attempt + 1}, status:`, status.status);

      if (status.status === 'COMPLETED') {
        // Obtener resultado usando la URL que FAL nos dio
        const resultResponse = await fetch(responseUrl, {
          headers: {
            'Authorization': `Key ${FAL_API_KEY}`,
          },
        });

        const result = await resultResponse.json();
        console.log('[FAL] Result received:', JSON.stringify(result).slice(0, 300));
        
        const resultUrl = extractImageUrl(result);
        if (resultUrl) {
          return {
            resultImage: resultUrl,
            success: true,
          };
        }

        throw new Error('Could not extract image URL from result');
      }

      if (status.status === 'FAILED') {
        throw new Error(`FAL generation failed: ${status.error || 'Unknown error'}`);
      }

      // IN_QUEUE o IN_PROGRESS - seguir esperando
    } catch (pollError) {
      console.error(`[FAL] Polling error on attempt ${attempt + 1}:`, pollError);
      // Continuar intentando
    }
  }

  throw new Error('FAL generation timeout after 3 minutes');
}
