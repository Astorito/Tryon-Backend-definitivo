/**
 * Cliente FAL AI - Virtual Try-On
 * 
 * Usa el modelo fal-ai/nano-banana/edit
 * Documentación: https://fal.ai/models/fal-ai/nano-banana/edit
 */

import { fal } from "@fal-ai/client";

// Configurar credenciales
fal.config({
  credentials: process.env.FAL_KEY || process.env.FAL_API_KEY || '',
});

// Modelo nano-banana/edit para virtual try-on
const FAL_MODEL = 'fal-ai/nano-banana/edit';

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
 * Genera una imagen de virtual try-on usando FAL AI nano-banana/edit
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

    // Llamar al modelo nano-banana/edit
    // Prompt simple y directo
    const result = await fal.subscribe(FAL_MODEL, {
      input: {
        prompt: "Put the clothing from the second image onto the person in the first image. Do not modify anything else. Keep face, pose, background, lighting exactly the same.",
        image_urls: [personImageUrl, clothingImageUrl],
        num_images: 1,
        output_format: "jpeg",
      },
    });

    console.log('[FAL] Result keys:', Object.keys(result.data || {}));

    // Extraer URL de imagen del resultado
    const data = result.data as { 
      images?: Array<{ url: string }>;
      description?: string;
    };
    
    if (data.images && data.images[0]?.url) {
      console.log('[FAL] Success, description:', data.description);
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
