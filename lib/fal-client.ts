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

// Modelo Nano Banana Edit - optimizado para velocidad
const FAL_MODEL = 'fal-ai/nano-banana-pro/edit';

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

    console.log('[FAL] Processing', validGarments.length, 'garment(s) with SeedDream v4.5 Edit', `[reqId=${reqId}]`);

    // Preparar imágenes: persona primero, luego prendas (acepta base64 o URL)
    const personImage = request.userImage;
    const garmentImages = validGarments;
    const allImageUrls = [personImage, ...garmentImages];
    
    // Construir prompt dinámico para virtual try-on
    const garmentDescriptions = garmentImages.map((_, i) => `Figure ${i + 2}`).join(' and ');
    const prompt = validGarments.length === 1
      ? `Add the clothing garment from Figure 2 onto the person in Figure 1. DO NOT MODIFY the structure, shape, pose, face, or proportions of the original image. KEEP THE ORIGINAL IMAGE EXACTLY AS IT IS, only incorporating the clothing garment onto the person.`
      : `Add the clothing garments from ${garmentDescriptions} onto the person in Figure 1. DO NOT MODIFY the structure, shape, pose, face, or proportions of the original image. KEEP THE ORIGINAL IMAGE EXACTLY AS IT IS, only incorporating the clothing garments onto the person.`;
    
    // === TIMING: Fin de pre-procesamiento ===
    const preProcessingEnd = performance.now();
    
    // === TIMING: Inicio llamada FAL ===
    const falStart = performance.now();
    
    const result = await fal.subscribe(FAL_MODEL, {
      input: {
        prompt,
        image_urls: allImageUrls, // Puede ser base64 o URLs
      },
    });
    
    // === TIMING: Fin llamada FAL ===
    const falEnd = performance.now();
    const falDuration = falEnd - falStart;
    
    // Registrar timing de esta llamada
    falCalls.push({
      callIndex: 0,
      startMs: falStart - totalStart,
      endMs: falEnd - totalStart,
      durationMs: falDuration,
    });
    
    // Log de la llamada FAL
    logLatency({
      requestId: reqId,
      phase: 'fal_call_0',
      durationMs: Math.round(falDuration),
      timestamp: new Date().toISOString(),
      metadata: { 
        model: FAL_MODEL,
        totalImages: allImageUrls.length,
        garments: validGarments.length 
      },
    });

    const data = result.data as { images?: Array<{ url: string }> };
    
    if (!data.images?.[0]?.url) {
      throw new Error('Error generando imagen con SeedDream');
    }

    const resultImage = data.images[0].url;
    
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
    console.error('[FAL] Error:', error, `[reqId=${reqId}]`);
    
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
