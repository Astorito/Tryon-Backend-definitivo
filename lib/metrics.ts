/**
 * Cliente de métricas
 * 
 * Envía eventos de generación al dashboard externo.
 * Dashboard: https://tryon-kappa.vercel.app/dashboard
 * 
 * El dashboard gestiona:
 * - Empresas y sus Client Keys
 * - Seguimiento de imágenes generadas
 * - Analytics por empresa
 */

import { recordEvent } from './metrics-store';

// Endpoint del dashboard externo
const METRICS_ENDPOINT = process.env.METRICS_ENDPOINT || 'https://tryon-kappa.vercel.app/api/ingest';

export interface GenerationEvent {
  type: 'generation';
  timestamp: string;
  model: 'banana-pro' | 'fal-virtual-try-on' | 'nano-banana-pro';
  clientId: string;
  clientName: string;
}

/**
 * Envía evento de generación al dashboard externo
 * 
 * @param clientKey - Client Key de la empresa (x-client-key header)
 * @param event - Datos del evento
 */
export async function sendMetricsEvent(clientKey: string, event: GenerationEvent): Promise<void> {
  try {
    console.log(`[Metrics] Sending event for client: ${event.clientName} (${event.clientId})`);
    
    // Registrar localmente (backup)
    recordEvent(clientKey, {
      type: event.type,
      timestamp: event.timestamp,
      model: event.model,
      clientId: event.clientId,
      clientName: event.clientName,
    });

    // Enviar al dashboard externo
    const response = await fetch(METRICS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-key': clientKey, // ← Identifica la empresa en el dashboard
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      console.error('[Metrics] Failed to send to dashboard:', response.status, await response.text());
    } else {
      console.log('[Metrics] Event sent to dashboard successfully');
    }
  } catch (error) {
    // No bloqueamos la generación si falla el envío de métricas
    console.error('[Metrics] Error sending event:', error);
  }
}
