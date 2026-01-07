/**
 * Cliente API Keys
 * 
 * Mapeo de API keys a empresas (sin base de datos)
 * En producción esto se puede mover a variables de entorno
 * o un servicio externo de autenticación.
 */

export interface ClientInfo {
  id: string;
  name: string;
  apiKey: string;
  active: boolean;
}

const CLIENTS: Record<string, ClientInfo> = {
  'demo_key_12345': {
    id: 'client_001',
    name: 'Demo Company',
    apiKey: 'demo_key_12345',
    active: true,
  },
  'demotryon01': {
    id: 'client_002',
    name: 'Demo TryOn',
    apiKey: 'demotryon01',
    active: true,
  },
  'testtryon01': {
    id: 'client_003',
    name: 'Test TryOn',
    apiKey: 'testtryon01',
    active: true,
  },
  // Agregar más clientes aquí
};

export function validateApiKey(apiKey: string): ClientInfo | null {
  const client = CLIENTS[apiKey];
  
  if (!client) {
    return null;
  }

  if (!client.active) {
    return null;
  }

  return client;
}

export function getClientByApiKey(apiKey: string): ClientInfo | null {
  return validateApiKey(apiKey);
}
