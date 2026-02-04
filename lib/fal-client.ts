/**
 * Cliente FAL AI - Virtual Try-On
 * 
 * Usa el modelo fal-ai/bytedance/seedream/v4.5/edit
 * Documentación: https://fal.ai/models/fal-ai/bytedance/seedream/v4.5/edit
 * 
 * Este modelo de edición permite virtual try-on pasando:
 * - Imagen 1: Foto de la persona
 * - Imagen 2+: Prendas a aplicar
 * - Prompt: Instrucción de vestir a la persona con las prendas
 */

import { fal } from "@fal-ai/client";
import { 
  type FalCallTiming, 
  type RequestTimings,
  logLatency,
  logRequestTimings,
  calculateTimings 
} from './latency';

// Configurar credenciales
fal.config({
  credentials: process.env.FAL_KEY || process.env.FAL_API_KEY || '',
});

// Modelo virtual try-on que definitivamente funciona
const FAL_MODEL = 'fal-ai/idm-vton';

export interface FalTryOnRequest {
  userImage: string; // base64 o URL
  garments: string[]; // array de base64 o URLs
}

export interface FalTryOnResponse {
  resultImage: string; // URL de la imagen generada
  success: boolean;
  error?: string;
  timings?: RequestTimings; // Tiempos de latencia detallados
}

/**
 * Convierte base64 a data URL si es necesario
 */
import { getHttpsAgent } from './http-agent';
function ensureDataUrl(base64: string): string {
  if (base64.startsWith('data:')) {
    return base64;
  }
  if (base64.startsWith('http://') || base64.startsWith('https://')) {
    return base64;
  }
// Configurar HTTP agent con keep-alive
if (typeof window === 'undefined') {
  // Solo en Node.js (backend), no en browser
  const agent = getHttpsAgent();
  // FAL client usa fetch internamente, configurar agent global
  (global as any).falHttpAgent = agent;
}
  // Detectar tipo de imagen
  const isPng = base64.startsWith('iVBORw');
  const mimeType = isPng ? 'image/png' : 'image/jpeg';
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Genera una imagen de virtual try-on usando FAL AI SeedDream v4.5 Edit
 * 
 * A diferencia del modelo anterior, este usa:
 * - prompt: Instrucción de texto para la edición
 * - image_urls: Array con persona + prendas
 * 
 * @param request - Datos de la request
 * @param requestId - ID opcional para correlacionar logs (generado si no se provee)
 */
export interface GenerateInput {
  userImage: string;  // Puede ser base64 o URL
  garments: string[]; // Pueden ser base64 o URLs
}

function isUrl(str: string): boolean {
  return str.startsWith('http://') || str.startsWith('https://');
}

export async function generateWithFal(
  request: GenerateInput,
  requestId?: string
): Promise<FalTryOnResponse> {
  // === TIMING: Inicio de request ===
  const reqId = requestId || Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const totalStart = performance.now();
  const falCalls: FalCallTiming[] = [];
  
  try {
    const validGarments = request.garments.filter(g => g !== null && g !== undefined && g !== '');
    
    if (validGarments.length === 0) {
      throw new Error('Se requiere al menos una prenda');
    }

    console.log('[FAL] Processing', validGarments.length, 'garment(s) with IDM-VTON', `[reqId=${reqId}]`);

    // IDM-VTON requiere formato específico: person_image y garment_image
    const personImage = request.userImage;
    const garmentImage = validGarments[0]; // IDM-VTON maneja solo 1 prenda
    
    console.log(`[FAL] Calling ${FAL_MODEL}`);
    console.log(`[FAL] Person image type:`, personImage.startsWith('data:') ? 'base64' : 'url');
    console.log(`[FAL] Garment image type:`, garmentImage.startsWith('data:') ? 'base64' : 'url');
    
    // === TIMING: Fin de pre-procesamiento ===
    const preProcessingEnd = performance.now();
    
    // === TIMING: Inicio llamada FAL ===
    const falStart = performance.now();
    
    let result;
    try {
      result = await fal.subscribe(FAL_MODEL, {
        input: {
          person_image_url: personImage,
          garment_image_url: garmentImage,
        },
      });
    } catch (falError: any) {
      console.error('[FAL] Error calling FAL API:', {
        message: falError.message,
        status: falError.status,
        body: falError.body,
        stack: falError.stack?.substring(0, 200),
      });
      throw new Error(`FAL API error: ${falError.message || 'Unknown error'}`);
    }
    
    // === TIMING: Fin llamada FAL ===
    const falEnd = performance.now();
    const falDuration = falEnd - falStart;
    
    // Log de la llamada FAL
    logLatency({
      requestId: reqId,
      phase: 'fal_call_0',
      durationMs: Math.round(falDuration),
      timestamp: new Date().toISOString(),
      metadata: { 
        model: FAL_MODEL,
        totalImages: 2, // person + garment
        garments: 1 
      },
    });

    console.log('[FAL] Raw response:', JSON.stringify(result.data, null, 2));

    const data = result.data as { image?: { url: string } };
    
    if (!data.image?.url) {
      console.error('[FAL] No image in response:', data);
      throw new Error('Error generando imagen con IDM-VTON - no image returned');
    }

    const resultImage = data.image.url;
    
    // === TIMING: Post-procesamiento ===
    const postProcessingStart = performance.now();
    const totalEnd = performance.now();
    
    // Calcular y loguear timings completos
    const timings = calculateTimings(
      reqId,
      0,
      preProcessingEnd - totalStart,
      falCalls,
      postProcessingStart - totalStart,
      totalEnd - totalStart
    );
    
    logRequestTimings(timings);

    return {
      resultImage,
      success: true,
      timings,
    };

  } catch (error) {
    console.error('[FAL] Error details:', {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      requestId: reqId,
    });
    
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    
    const errorEnd = performance.now();
    logLatency({
      requestId: reqId,
      phase: 'error',
      durationMs: Math.round(errorEnd - totalStart),
      timestamp: new Date().toISOString(),
      metadata: { error: errorMessage, model: FAL_MODEL },
    });
    
    return {
      resultImage: '',
      success: false,
      error: `FAL API error: ${errorMessage}`,
    };
  }
}
