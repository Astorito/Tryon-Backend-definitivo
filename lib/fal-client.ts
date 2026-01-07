/**
 * Cliente FAL AI - Virtual Try-On
 * 
 * Usa el modelo fal-ai/image-apps-v2/virtual-try-on
 * Documentación: https://fal.ai/models/fal-ai/image-apps-v2/virtual-try-on
 */

const FAL_API_KEY = process.env.FAL_API_KEY || '';

// Modelo de virtual try-on de FAL
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
 * Genera una imagen de virtual try-on usando FAL AI
 */
export async function generateWithFal(
  request: FalTryOnRequest
): Promise<FalTryOnResponse> {
  try {
    if (!FAL_API_KEY) {
      throw new Error('FAL_API_KEY not configured');
    }

    const startTime = Date.now();
    console.log('[FAL] Iniciando generación con image-apps-v2/virtual-try-on...');

    // Preparar imágenes
    const modelImage = ensureDataUrl(request.userImage);
    const garmentImage = request.garments[0] ? ensureDataUrl(request.garments[0]) : null;

    if (!garmentImage) {
      throw new Error('Se requiere al menos una prenda');
    }

    console.log('[FAL] Enviando request...');

    // Llamar al modelo de virtual try-on
    const response = await fetch(`https://fal.run/${FAL_MODEL}`, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model_image: modelImage,
        garment_image: garmentImage,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[FAL] Error response:', errorText);
      throw new Error(`FAL API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[FAL] Respuesta en ${elapsed}s:`, JSON.stringify(data).slice(0, 300));

    // Extraer URL de imagen
    const resultUrl = extractImageUrl(data);
    if (resultUrl) {
      console.log(`[FAL] ✓ Generación completada en ${elapsed}s`);
      return {
        resultImage: resultUrl,
        success: true,
      };
    }

    throw new Error('No se pudo extraer la imagen del resultado');

  } catch (error) {
    console.error('[FAL] Error:', error);
    return {
      resultImage: '',
      success: false,
      error: error instanceof Error ? error.message : 'Error desconocido',
    };
  }
}

/**
 * Extrae la URL de imagen de varios formatos de respuesta
 */
function extractImageUrl(data: any): string | null {
  // Formato: { image: { url: "..." } }
  if (data.image?.url) return data.image.url;
  
  // Formato: { image: "url" }
  if (typeof data.image === 'string') return data.image;
  
  // Formato: { output: { url: "..." } }
  if (data.output?.url) return data.output.url;
  
  // Formato: { images: [{ url: "..." }] }
  if (data.images?.[0]?.url) return data.images[0].url;
  
  // Formato: { url: "..." }
  if (data.url) return data.url;
  
  // Formato: { output: "url" }
  if (typeof data.output === 'string') return data.output;

  return null;
}
