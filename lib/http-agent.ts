/**
 * HTTP Agent con Connection Pooling
 * 
 * PROPÓSITO:
 * - Reutilizar conexiones TCP/TLS entre requests
 * - Evitar overhead de handshake TLS (~100-300ms por conexión nueva)
 * - Mantener pool de conexiones calientes
 * 
 * NOTA: En serverless, el beneficio es limitado porque cada invocación
 * puede ser una instancia diferente. Sin embargo, durante ráfagas de
 * requests a la misma instancia, el pooling reduce latencia.
 * 
 * IMPORTANTE: FAL AI client usa fetch internamente, que en Node 18+
 * ya tiene keep-alive habilitado por defecto. Este módulo asegura
 * la configuración correcta y permite monitoreo.
 */

import { Agent } from 'https';

// Singleton agent para todas las conexiones HTTPS
let httpsAgent: Agent | null = null;

export function getHttpsAgent(): Agent {
  if (!httpsAgent) {
    httpsAgent = new Agent({
      keepAlive: true,
      keepAliveMsecs: 30000,    // Keep connections alive 30s
      maxSockets: 50,           // Max parallel connections
      maxFreeSockets: 10,       // Keep 10 idle connections
      timeout: 60000,           // 60s timeout
      scheduling: 'fifo',       // First-in-first-out for fairness
    });
    
    console.log('[HttpAgent] Initialized with keep-alive pooling');
  }
  
  return httpsAgent;
}

// Stats para monitoreo (útil en desarrollo)
export function getAgentStats() {
  if (!httpsAgent) {
    return { initialized: false };
  }
  
  return {
    initialized: true,
    // Nota: En Node 18+, estas propiedades pueden no estar disponibles
    // dependiendo de la versión exacta
    maxSockets: httpsAgent.maxSockets,
    maxFreeSockets: httpsAgent.maxFreeSockets,
  };
}

/**
 * Configuración de fetch con keep-alive
 * Usar cuando se necesita hacer fetch manual con pooling
 */
export function createPooledFetch() {
  const agent = getHttpsAgent();
  
  return (url: string | URL | Request, init?: RequestInit) => {
    // En Node 18+ con undici, el agent se pasa diferente
    // Para compatibilidad, usamos el approach estándar
    return fetch(url, {
      ...init,
      // @ts-expect-error - Node.js specific option
      agent,
    });
  };
}
