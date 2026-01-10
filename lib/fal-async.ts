/**
 * FAL Async Processor
 * 
 * Ejecuta la inferencia de FAL de forma desacoplada del request HTTP.
 * Actualiza el job store con timestamps en cada fase.
 * 
 * IMPORTANTE: Esta función se ejecuta fire-and-forget desde el endpoint submit.
 * No debe bloquear ni esperar respuesta.
 */

import { fal } from "@fal-ai/client";
import { 
  markJobProcessing, 
  markJobDone, 
  markJobError 
} from './job-store';
import { logLatency } from './latency';

// Configurar credenciales (mismo que fal-client.ts)
fal.config({
  credentials: process.env.FAL_KEY || process.env.FAL_API_KEY || '',
});

const FAL_MODEL = 'fal-ai/bytedance/seedream/v4.5/edit';

export interface AsyncFalRequest {
  jobId: string;
  userImage: string;       // base64 o URL
  garments: string[];      // array de base64 o URLs
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
  const isPng = base64.startsWith('iVBORw');
  const mimeType = isPng ? 'image/png' : 'image/jpeg';
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Procesa un job de forma async.
 * 
 * FLUJO:
 * 1. Marca job como 'processing' + timestamp fal_start
 * 2. Llama a FAL (blocking para esta función, pero fire-and-forget desde caller)
 * 3. Marca job como 'done' o 'error' + timestamps
 * 
 * Esta función NO debe ser awaited desde el endpoint.
 */
export async function processJobAsync(request: AsyncFalRequest): Promise<void> {
  const { jobId, userImage, garments } = request;
  
  try {
    // Validar inputs
    const validGarments = garments.filter(g => g !== null && g !== undefined && g !== '');
    if (validGarments.length === 0) {
      await markJobError(jobId, 'Se requiere al menos una prenda');
      return;
    }

    // === FASE 1: Marcar como processing ===
    await markJobProcessing(jobId);
    
    const falStartTs = Date.now();
    logLatency({
      requestId: jobId,
      phase: 'async_fal_start',
      durationMs: 0,
      timestamp: new Date().toISOString(),
      metadata: { model: FAL_MODEL, garments: validGarments.length },
    });

    // Preparar imágenes
    const personImage = ensureDataUrl(userImage);
    const garmentImages = validGarments.map(g => ensureDataUrl(g));
    const allImageUrls = [personImage, ...garmentImages];

    // Construir prompt (idéntico a fal-client.ts)
    const garmentDescriptions = garmentImages.map((_, i) => `Figure ${i + 2}`).join(' and ');
    const prompt = validGarments.length === 1
      ? `Add the clothing garment from Figure 2 onto the person in Figure 1. DO NOT MODIFY the structure, shape, pose, face, or proportions of the original image. KEEP THE ORIGINAL IMAGE EXACTLY AS IT IS, only incorporating the clothing garment onto the person.`
      : `Add the clothing garments from ${garmentDescriptions} onto the person in Figure 1. DO NOT MODIFY the structure, shape, pose, face, or proportions of the original image. KEEP THE ORIGINAL IMAGE EXACTLY AS IT IS, only incorporating the clothing garments onto the person.`;

    // === FASE 2: Llamar a FAL ===
    // NOTA: Mismos parámetros exactos que el endpoint sync actual
    const result = await fal.subscribe(FAL_MODEL, {
      input: {
        prompt,
        image_urls: allImageUrls,
        image_size: 'auto_4K',
        num_images: 1,
        enable_safety_checker: true,
      },
    });

    const falEndTs = Date.now();
    const falDuration = falEndTs - falStartTs;

    logLatency({
      requestId: jobId,
      phase: 'async_fal_end',
      durationMs: falDuration,
      timestamp: new Date().toISOString(),
      metadata: { model: FAL_MODEL, success: true },
    });

    // === FASE 3: Procesar resultado ===
    const data = result.data as { images?: Array<{ url: string }> };
    
    if (!data.images?.[0]?.url) {
      await markJobError(jobId, 'FAL no devolvió imagen');
      return;
    }

    const imageUrl = data.images[0].url;
    
    // === FASE 4: Marcar como done ===
    await markJobDone(jobId, imageUrl);

    console.log(`[AsyncFal] Job ${jobId} completed in ${falDuration}ms`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    
    logLatency({
      requestId: jobId,
      phase: 'async_fal_error',
      durationMs: 0,
      timestamp: new Date().toISOString(),
      metadata: { error: errorMessage },
    });

    await markJobError(jobId, errorMessage);
    console.error(`[AsyncFal] Job ${jobId} failed:`, errorMessage);
  }
}
