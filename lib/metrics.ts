/**
 * Cliente de métricas
 * 
 * Envía eventos de generación al sistema de métricas externo.
 * Cada evento incluye la Client Key para identificar la empresa.
 * 
 * El sistema de métricas (https://tryon-kappa.vercel.app) recibe:
 * - Header: x-client-key (identifica la empresa)
 * - Body: detalles del evento (timestamp, modelo, etc)
 * 
 * El dashboard usa estos datos para mostrar métricas por empresa.
 */

const METRICS_ENDPOINT = process.env.METRICS_ENDPOINT || 'https://tryon-kappa.vercel.app/api/ingest';

export interface GenerationEvent {
  type: 'generation';
  timestamp: string;
  model: 'banana-pro' | 'fal-virtual-try-on' | 'nano-banana-pro';
  clientId: string;
  clientName: string;
}

/**
 * Envía evento de generación al sistema de métricas
 * 
 * @param clientKey - Client Key de la empresa (se envía en header x-client-key)
 * @param event - Datos del evento
 */
export async function sendMetricsEvent(clientKey: string, event: GenerationEvent): Promise<void> {
  try {
    console.log(`[Metrics] Sending event for client: ${event.clientName} (${event.clientId})`);
    
    const response = await fetch(METRICS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-key': clientKey, // ← Identifica la empresa
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      console.error('[Metrics] Failed to send event:', response.status, await response.text());
    } else {
      console.log('[Metrics] Event sent successfully');
    }
  } catch (error) {
    // No bloqueamos la generación si falla el envío de métricas
    console.error('[Metrics] Error sending event:', error);
  }
}
