/**
 * CORS Helper para permitir requests desde dominios externos
 */

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-key, x-admin-key',
  'Access-Control-Max-Age': '86400',
};

export function corsResponse(data: any, status: number = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  });
}

export function corsOptions() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}
