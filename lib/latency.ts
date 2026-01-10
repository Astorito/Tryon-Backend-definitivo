/**
 * Instrumentación de Latencia
 * 
 * Módulo para medir tiempos de ejecución en entornos serverless (Edge/Node).
 * Usa performance.now() para alta precisión (sub-milisegundo).
 * 
 * Estructura de logs:
 * - Cada log es JSON parseable para análisis posterior
 * - Incluye requestId para correlacionar logs de la misma request
 */

// Usar crypto.randomUUID si disponible, fallback a timestamp
function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().slice(0, 8);
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export interface TimingContext {
  requestId: string;
  startTime: number;
  phase: string;
}

export interface LatencyLog {
  requestId: string;
  phase: string;
  durationMs: number;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface FalCallTiming {
  callIndex: number;
  startMs: number;
  endMs: number;
  durationMs: number;
}

export interface RequestTimings {
  requestId: string;
  totalDurationMs: number;
  backendOverheadMs: number;
  falTotalMs: number;
  falCalls: FalCallTiming[];
  breakdown: {
    preProcessingMs: number;  // Tiempo antes de primera llamada FAL
    postProcessingMs: number; // Tiempo después de última llamada FAL
    falInferenceMs: number;   // Tiempo puro en FAL (suma de todas las llamadas)
  };
}

/**
 * Crea un contexto de timing para una request
 */
export function createTimingContext(phase: string = 'request'): TimingContext {
  return {
    requestId: generateRequestId(),
    startTime: performance.now(),
    phase,
  };
}

/**
 * Mide el tiempo transcurrido desde el inicio del contexto
 */
export function elapsed(ctx: TimingContext): number {
  return performance.now() - ctx.startTime;
}

/**
 * Marca un timestamp relativo al inicio del contexto
 */
export function mark(ctx: TimingContext): number {
  return performance.now() - ctx.startTime;
}

/**
 * Loguea un evento de latencia en formato JSON estructurado
 */
export function logLatency(log: LatencyLog): void {
  const entry = {
    level: 'info',
    type: 'latency',
    ...log,
  };
  console.log(JSON.stringify(entry));
}

/**
 * Loguea el resumen completo de timings de una request
 */
export function logRequestTimings(timings: RequestTimings): void {
  const entry = {
    level: 'info',
    type: 'request_timings',
    timestamp: new Date().toISOString(),
    ...timings,
  };
  console.log(JSON.stringify(entry));
}

/**
 * Wrapper para medir una función async
 */
export async function measureAsync<T>(
  ctx: TimingContext,
  phase: string,
  fn: () => Promise<T>,
  metadata?: Record<string, unknown>
): Promise<{ result: T; durationMs: number }> {
  const start = performance.now();
  const result = await fn();
  const durationMs = performance.now() - start;

  logLatency({
    requestId: ctx.requestId,
    phase,
    durationMs: Math.round(durationMs * 100) / 100,
    timestamp: new Date().toISOString(),
    metadata,
  });

  return { result, durationMs };
}

/**
 * Calcula y retorna el resumen de timings de una request
 */
export function calculateTimings(
  requestId: string,
  totalStartMs: number,
  preProcessingEndMs: number,
  falCalls: FalCallTiming[],
  postProcessingStartMs: number,
  totalEndMs: number
): RequestTimings {
  const totalDurationMs = totalEndMs - totalStartMs;
  const preProcessingMs = preProcessingEndMs - totalStartMs;
  const postProcessingMs = totalEndMs - postProcessingStartMs;
  const falInferenceMs = falCalls.reduce((sum, call) => sum + call.durationMs, 0);
  const backendOverheadMs = totalDurationMs - falInferenceMs;

  return {
    requestId,
    totalDurationMs: Math.round(totalDurationMs),
    backendOverheadMs: Math.round(backendOverheadMs),
    falTotalMs: Math.round(falInferenceMs),
    falCalls: falCalls.map(c => ({
      ...c,
      startMs: Math.round(c.startMs),
      endMs: Math.round(c.endMs),
      durationMs: Math.round(c.durationMs),
    })),
    breakdown: {
      preProcessingMs: Math.round(preProcessingMs),
      postProcessingMs: Math.round(postProcessingMs),
      falInferenceMs: Math.round(falInferenceMs),
    },
  };
}
