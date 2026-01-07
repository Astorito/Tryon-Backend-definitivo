/**
 * Cliente FAL AI - Virtual Try-On
 * 
 * Usa el modelo fal-ai/image-apps-v2/virtual-try-on
 * Documentación: https://fal.ai/models/fal-ai/image-apps-v2/virtual-try-on
 */

import { fal } from "@fal-ai/client";

// Configurar credenciales
fal.config({
  credentials: process.env.FAL_KEY || process.env.FAL_API_KEY || '',
});

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
  const isPng = base64.startsWith('iVBORw');
  const mimeType = isPng ? 'image/png' : 'image/jpeg';
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Genera una imagen de virtual try-on usando FAL AI
 * Soporta hasta 3 prendas aplicadas secuencialmente
 */
export async function generateWithFal(
  request: FalTryOnRequest
): Promise<FalTryOnResponse> {
  try {
    const validGarments = request.garments.filter(g => g !== null && g !== undefined && g !== '');
    
    if (validGarments.length === 0) {
      throw new Error('Se requiere al menos una prenda');
    }

    console.log('[FAL] Processing', validGarments.length, 'garment(s)');

    let currentImage = ensureDataUrl(request.userImage);

    for (let i = 0; i < validGarments.length; i++) {
      const clothingUrl = ensureDataUrl(validGarments[i]);
      
      const result = await fal.subscribe(FAL_MODEL, {
        input: {
          person_image_url: currentImage,
          clothing_image_url: clothingUrl,
          preserve_pose: true,
        },
      });

      const data = result.data as { images?: Array<{ url: string }> };
      
      if (!data.images?.[0]?.url) {
        throw new Error(`Error aplicando prenda ${i + 1}`);
      }

      currentImage = data.images[0].url;
    }

    return {
      resultImage: currentImage,
      success: true,
    };

  } catch (error) {
    console.error('[FAL] Error:', error);
    
    // Mejorar el mensaje de error para debugging
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    
    return {
      resultImage: '',
      success: false,
      error: `FAL API error: ${errorMessage}`,
    };
  }
}
