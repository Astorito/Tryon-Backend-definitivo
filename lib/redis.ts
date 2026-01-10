/**
 * Cliente Redis (Upstash)
 * 
 * Storage para jobs async. Usa Upstash Redis (serverless-friendly).
 * 
 * Variables de entorno requeridas:
 * - UPSTASH_REDIS_REST_URL
 * - UPSTASH_REDIS_REST_TOKEN
 */

import { Redis } from '@upstash/redis';

// Singleton del cliente Redis
let redisClient: Redis | null = null;

/**
 * Obtiene o crea el cliente Redis.
 * Lazy init para no fallar en build si no hay env vars.
 */
export function getRedis(): Redis {
  if (!redisClient) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
      throw new Error(
        'Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN. ' +
        'Set these in your Vercel environment variables.'
      );
    }

    redisClient = new Redis({
      url,
      token,
    });
  }

  return redisClient;
}

/**
 * Check si Redis está configurado (sin tirar error)
 */
export function isRedisConfigured(): boolean {
  return !!(
    process.env.UPSTASH_REDIS_REST_URL && 
    process.env.UPSTASH_REDIS_REST_TOKEN
  );
}
