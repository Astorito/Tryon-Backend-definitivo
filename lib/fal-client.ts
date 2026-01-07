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
 */
export async function generateWithFal(
  request: FalTryOnRequest
): Promise<FalTryOnResponse> {
  try {
    if (!request.garments[0]) {
      throw new Error('Se requiere al menos una prenda');
    }

    // Preparar imágenes como data URLs
    const personImageUrl = ensureDataUrl(request.userImage);
    const clothingImageUrl = ensureDataUrl(request.garments[0]);

    console.log('[FAL] Calling model:', FAL_MODEL);
    console.log('[FAL] Person image length:', personImageUrl.length);
    console.log('[FAL] Clothing image length:', clothingImageUrl.length);

    // Llamar al modelo usando el cliente oficial
    const result = await fal.subscribe(FAL_MODEL, {
      input: {
        person_image_url: personImageUrl,
        clothing_image_url: clothingImageUrl,
        preserve_pose: true,
      },
    });

    console.log('[FAL] Result keys:', Object.keys(result.data || {}));

    // Extraer URL de imagen del resultado
    // FAL puede devolver 'image' (objeto) o 'images' (array)
    const data = result.data as { 
      image?: { url: string };
      images?: Array<{ url: string }>;
    };
    
    if (data.image?.url) {
      return {
        resultImage: data.image.url,
        success: true,
      };
    }
    
    if (data.images && data.images[0]?.url) {
      return {
        resultImage: data.images[0].url,
        success: true,
      };
    }

    throw new Error('No se pudo extraer la imagen del resultado');

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
