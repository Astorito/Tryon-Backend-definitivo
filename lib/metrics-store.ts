import { getRedis } from './redis';

/**
 * Almacenamiento de métricas en memoria
 * 
 * En producción esto debería usar una base de datos como:
 * - Redis para datos volátiles
 * - PostgreSQL/MongoDB para persistencia
 * 
 * Por ahora usamos memoria con persistencia opcional a archivo.
 */

export interface MetricEvent {
  id: string;
  type: 'generation';
  timestamp: string;
  model: string;
  clientKey: string;
  clientId: string;
  clientName: string;
}

export interface ClientMetrics {
  clientKey: string;
  clientId: string;
  clientName: string;
  totalGenerations: number;
  lastGeneration: string | null;
  generationsByModel: Record<string, number>;
  recentEvents: MetricEvent[];
}

// Almacenamiento en memoria
const metricsStore: Map<string, MetricEvent[]> = new Map();

// Configuración de empresas registradas
const registeredClients: Map<string, { name: string; createdAt: string }> = new Map([
  ['demotryon01', { name: 'Demo TryOn', createdAt: '2025-12-06' }],
  ['testtryon01', { name: 'Test TryOn', createdAt: '2025-12-07' }],
  ['demo_key_12345', { name: 'Demo Company', createdAt: '2025-01-01' }],
]);

/**
 * Registra un nuevo evento de métrica
 */
export function recordEventInMemory(clientKey: string, event: Omit<MetricEvent, 'id' | 'clientKey'>): void {
  const fullEvent: MetricEvent = {
    ...event,
    id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    clientKey,
  };

  if (!metricsStore.has(clientKey)) {
    metricsStore.set(clientKey, []);
  }

  const events = metricsStore.get(clientKey)!;
  events.push(fullEvent);

  // Mantener solo los últimos 1000 eventos por cliente
  if (events.length > 1000) {
    events.shift();
  }

  console.log(`[MetricsStore] Recorded event for ${clientKey}:`, fullEvent.id);
}

/**
 * Obtiene métricas agregadas para un cliente
 */
export function getClientMetrics(clientKey: string): ClientMetrics | null {
  const events = metricsStore.get(clientKey);
  const clientInfo = registeredClients.get(clientKey);

  if (!events && !clientInfo) {
    return null;
  }

  const clientEvents = events || [];
  const generationsByModel: Record<string, number> = {};

  for (const event of clientEvents) {
    if (event.type === 'generation') {
      generationsByModel[event.model] = (generationsByModel[event.model] || 0) + 1;
    }
  }

  // Ordenar eventos por timestamp descendente
  const sortedEvents = [...clientEvents].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return {
    clientKey,
    clientId: clientEvents[0]?.clientId || clientKey,
    clientName: clientInfo?.name || clientEvents[0]?.clientName || 'Unknown',
    totalGenerations: clientEvents.filter(e => e.type === 'generation').length,
    lastGeneration: sortedEvents[0]?.timestamp || null,
    generationsByModel,
    recentEvents: sortedEvents.slice(0, 50), // Últimos 50 eventos
  };
}

/**
 * Obtiene métricas de todos los clientes (para admin)
 */
export function getAllMetrics(): {
  clients: ClientMetrics[];
  totals: {
    totalClients: number;
    totalGenerations: number;
    generationsByModel: Record<string, number>;
  };
} {
  const clients: ClientMetrics[] = [];
  const overallGenerationsByModel: Record<string, number> = {};
  let totalGenerations = 0;

  // Incluir todos los clientes registrados
  const allClientKeys = new Set([
    ...registeredClients.keys(),
    ...metricsStore.keys(),
  ]);

  for (const clientKey of allClientKeys) {
    const metrics = getClientMetrics(clientKey);
    if (metrics) {
      clients.push(metrics);
      totalGenerations += metrics.totalGenerations;
      
      for (const [model, count] of Object.entries(metrics.generationsByModel)) {
        overallGenerationsByModel[model] = (overallGenerationsByModel[model] || 0) + count;
      }
    }
  }

  // Ordenar por total de generaciones descendente
  clients.sort((a, b) => b.totalGenerations - a.totalGenerations);

  return {
    clients,
    totals: {
      totalClients: clients.length,
      totalGenerations,
      generationsByModel: overallGenerationsByModel,
    },
  };
}

/**
 * Registra un nuevo cliente
 */
export function registerClient(clientKey: string, name: string): void {
  registeredClients.set(clientKey, {
    name,
    createdAt: new Date().toISOString().split('T')[0],
  });
}

/**
 * Lista todos los clientes registrados
 */
export function getRegisteredClients(): Array<{
  clientKey: string;
  name: string;
  createdAt: string;
}> {
  return Array.from(registeredClients.entries()).map(([key, info]) => ({
    clientKey: key,
    name: info.name,
    createdAt: info.createdAt,
  }));
}

/**
 * Elimina un cliente
 */
export function deleteClient(clientKey: string): boolean {
  const existed = registeredClients.has(clientKey);
  registeredClients.delete(clientKey);
  metricsStore.delete(clientKey);
  return existed;
}

export interface GenerationMetric {
  id: string;
  client_id: string;
  timestamp: number;
  endpoint: string;
  duration_total_ms: number;
  duration_fal_ms: number;
  status: 'success' | 'error';
  error: string | null;
  metadata: {
    model: string;
    garments_count: number;
    cold_start: boolean;
    job_id?: string;
  };
}

export async function recordEvent(clientKey: string, event: {
  type: string;
  timestamp: string;
  model: string;
  jobId?: string;
  clientId?: string;
  clientName?: string;
}): Promise<void> {
  const redis = getRedis();
  const client = await getClientByApiKey(clientKey);
  
  if (!client) {
    console.warn(`[Metrics] Unknown client key: ${clientKey}`);
    return;
  }

  const genId = `gen_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const metric: GenerationMetric = {
    id: genId,
    client_id: client.id,
    timestamp: new Date(event.timestamp).getTime(),
    endpoint: '/api/images/generate',
    duration_total_ms: 0,
    duration_fal_ms: 0,
    status: 'success',
    error: null,
    metadata: {
      model: event.model,
      garments_count: 1,
      cold_start: false,
      job_id: event.jobId,
    },
  };

  await redis.set(`generations:${genId}`, JSON.stringify(metric), { ex: 30 * 24 * 3600 });
  await redis.zadd(`metrics:${client.id}:generations`, {
    score: metric.timestamp,
    member: genId,
  });
}
