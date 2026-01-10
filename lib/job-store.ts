/**
 * Job Store - Storage de jobs async
 * 
 * Maneja el ciclo de vida de jobs de generación:
 * - queued → processing → done/error
 * 
 * Usa Redis con TTL de 1 hora para auto-cleanup.
 */

import { getRedis } from './redis';

// TTL de jobs en segundos (1 hora)
const JOB_TTL_SECONDS = 3600;

// Prefijo para keys en Redis
const JOB_PREFIX = 'job:';

export type JobStatus = 'queued' | 'processing' | 'done' | 'error';

export interface JobData {
  id: string;
  status: JobStatus;
  
  // Timestamps (ms desde epoch)
  created_at: number;
  fal_start: number | null;
  fal_end: number | null;
  completed_at: number | null;
  
  // Resultado
  image_url: string | null;
  error: string | null;
  
  // Metadata (opcional, para debugging)
  client_id?: string;
  garments_count?: number;
}

export interface CreateJobInput {
  id: string;
  client_id?: string;
  garments_count?: number;
}

/**
 * Crea un nuevo job en estado 'queued'
 */
export async function createJob(input: CreateJobInput): Promise<JobData> {
  const redis = getRedis();
  const now = Date.now();
  
  const job: JobData = {
    id: input.id,
    status: 'queued',
    created_at: now,
    fal_start: null,
    fal_end: null,
    completed_at: null,
    image_url: null,
    error: null,
    client_id: input.client_id,
    garments_count: input.garments_count,
  };
  
  const key = `${JOB_PREFIX}${input.id}`;
  await redis.set(key, JSON.stringify(job), { ex: JOB_TTL_SECONDS });
  
  console.log(`[JobStore] Created job ${input.id}`);
  return job;
}

/**
 * Obtiene un job por ID
 */
export async function getJob(jobId: string): Promise<JobData | null> {
  const redis = getRedis();
  const key = `${JOB_PREFIX}${jobId}`;
  
  const data = await redis.get<string>(key);
  if (!data) {
    return null;
  }
  
  // Upstash puede devolver ya parseado o string
  if (typeof data === 'object') {
    return data as unknown as JobData;
  }
  
  return JSON.parse(data) as JobData;
}

/**
 * Actualiza el status de un job a 'processing'
 * Marca el timestamp de inicio de FAL
 */
export async function markJobProcessing(jobId: string): Promise<void> {
  const redis = getRedis();
  const key = `${JOB_PREFIX}${jobId}`;
  
  const job = await getJob(jobId);
  if (!job) {
    console.error(`[JobStore] Job ${jobId} not found for markProcessing`);
    return;
  }
  
  job.status = 'processing';
  job.fal_start = Date.now();
  
  await redis.set(key, JSON.stringify(job), { ex: JOB_TTL_SECONDS });
  console.log(`[JobStore] Job ${jobId} → processing`);
}

/**
 * Marca un job como completado exitosamente
 */
export async function markJobDone(jobId: string, imageUrl: string): Promise<void> {
  const redis = getRedis();
  const key = `${JOB_PREFIX}${jobId}`;
  
  const job = await getJob(jobId);
  if (!job) {
    console.error(`[JobStore] Job ${jobId} not found for markDone`);
    return;
  }
  
  const now = Date.now();
  job.status = 'done';
  job.fal_end = now;
  job.completed_at = now;
  job.image_url = imageUrl;
  
  await redis.set(key, JSON.stringify(job), { ex: JOB_TTL_SECONDS });
  
  // Log timing para análisis
  const falDuration = job.fal_start ? now - job.fal_start : null;
  const totalDuration = now - job.created_at;
  console.log(`[JobStore] Job ${jobId} → done | FAL: ${falDuration}ms | Total: ${totalDuration}ms`);
}

/**
 * Marca un job como error
 */
export async function markJobError(jobId: string, errorMessage: string): Promise<void> {
  const redis = getRedis();
  const key = `${JOB_PREFIX}${jobId}`;
  
  const job = await getJob(jobId);
  if (!job) {
    console.error(`[JobStore] Job ${jobId} not found for markError`);
    return;
  }
  
  const now = Date.now();
  job.status = 'error';
  job.fal_end = now;
  job.completed_at = now;
  job.error = errorMessage;
  
  await redis.set(key, JSON.stringify(job), { ex: JOB_TTL_SECONDS });
  console.log(`[JobStore] Job ${jobId} → error: ${errorMessage}`);
}

/**
 * Formato de respuesta para el endpoint /status
 */
export interface JobStatusResponse {
  status: JobStatus;
  image_url: string | null;
  error: string | null;
  timestamps: {
    created_at: number;
    fal_start: number | null;
    fal_end: number | null;
    completed_at: number | null;
  };
}

/**
 * Convierte JobData al formato de respuesta del API
 */
export function toStatusResponse(job: JobData): JobStatusResponse {
  return {
    status: job.status,
    image_url: job.image_url,
    error: job.error,
    timestamps: {
      created_at: job.created_at,
      fal_start: job.fal_start,
      fal_end: job.fal_end,
      completed_at: job.completed_at,
    },
  };
}
