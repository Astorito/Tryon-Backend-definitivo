/**
 * Cliente FAL AI - Virtual Try-On Optimizado
 * 
 * Usa el modelo CAT-VTON que es específico para virtual try-on
 * y mucho más rápido (~3-5 segundos vs 15-20 segundos)
 * 
 * Documentación: https://fal.ai/models/fal-ai/cat-vton
 */

const FAL_API_KEY = process.env.FAL_API_KEY || '';

// CAT-VTON es un modelo especializado en virtual try-on, más rápido y preciso
const FAL_MODEL = 'fal-ai/cat-vton';

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
 * Genera una imagen de virtual try-on usando FAL AI CAT-VTON
 * Optimizado para velocidad: ~3-5 segundos
 */
export async function generateWithFal(
  request: FalTryOnRequest
): Promise<FalTryOnResponse> {
  try {
    if (!FAL_API_KEY) {
      throw new Error('FAL_API_KEY not configured');
    }

    const startTime = Date.now();
    console.log('[FAL] Iniciando generación con CAT-VTON (optimizado)...');

    // Preparar imágenes
    const humanImage = ensureDataUrl(request.userImage);
    const garmentImage = request.garments[0] ? ensureDataUrl(request.garments[0]) : null;

    if (!garmentImage) {
      throw new Error('Se requiere al menos una prenda');
    }

    console.log('[FAL] Enviando request síncrono...');

    // Usar endpoint SÍNCRONO (fal.run) en lugar de queue para mayor velocidad
    const response = await fetch(`https://fal.run/${FAL_MODEL}`, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        human_image_url: humanImage,
        garment_image_url: garmentImage,
        // Opciones para mayor velocidad
        num_inference_steps: 30, // Menos pasos = más rápido (default 50)
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[FAL] Error response:', errorText);
      
      // Si CAT-VTON falla, intentar con modelo alternativo
      console.log('[FAL] Intentando modelo alternativo (IDM-VTON)...');
      return await generateWithFallback(request);
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
 * Modelo alternativo si CAT-VTON falla
 * Usa IDM-VTON que también es rápido
 */
async function generateWithFallback(
  request: FalTryOnRequest
): Promise<FalTryOnResponse> {
  const startTime = Date.now();
  console.log('[FAL] Usando modelo alternativo: IDM-VTON...');

  const humanImage = ensureDataUrl(request.userImage);
  const garmentImage = request.garments[0] ? ensureDataUrl(request.garments[0]) : null;

  if (!garmentImage) {
    throw new Error('Se requiere al menos una prenda');
  }

  // IDM-VTON es otro modelo rápido de virtual try-on
  const response = await fetch('https://fal.run/fal-ai/idm-vton', {
    method: 'POST',
    headers: {
      'Authorization': `Key ${FAL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      human_image_url: humanImage,
      garment_image_url: garmentImage,
      num_inference_steps: 30,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`FAL API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[FAL] Fallback completado en ${elapsed}s`);

  const resultUrl = extractImageUrl(data);
  if (resultUrl) {
    return {
      resultImage: resultUrl,
      success: true,
    };
  }

  throw new Error('No se pudo extraer la imagen del resultado');
}

/**
 * Extrae la URL de imagen de varios formatos de respuesta
 */
function extractImageUrl(data: any): string | null {
  // Formato CAT-VTON: { image: { url: "..." } }
  if (data.image?.url) return data.image.url;
  
  // Formato IDM-VTON: { image: "url" }
  if (typeof data.image === 'string') return data.image;
  
  // Otros formatos
  if (data.output?.url) return data.output.url;
  if (data.images?.[0]?.url) return data.images[0].url;
  if (data.url) return data.url;
  if (typeof data.output === 'string') return data.output;

  return null;
}
