/**
 * API Endpoint: /api/clients
 * 
 * CRUD para gestionar empresas/clientes.
 * Requiere x-admin-key para todas las operaciones.
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  getRegisteredClients, 
  registerClient, 
  deleteClient,
  getClientMetrics 
} from '@/lib/metrics-store';

// Admin key para acceso completo
const ADMIN_KEY = process.env.ADMIN_KEY || 'admin_secret_key_2024';

function validateAdmin(request: NextRequest): boolean {
  const adminKey = request.headers.get('x-admin-key');
  const authCookie = request.cookies.get('admin_auth');
  
  // Permitir acceso con admin key o con cookie de sesión
  return adminKey === ADMIN_KEY || authCookie?.value === 'authenticated';
}

// GET: Listar todos los clientes
export async function GET(request: NextRequest) {
  if (!validateAdmin(request)) {
    return NextResponse.json(
      { error: 'Unauthorized. Provide x-admin-key header' },
      { status: 401 }
    );
  }

  const clients = getRegisteredClients().map(client => {
    const metrics = getClientMetrics(client.clientKey);
    return {
      id: client.clientKey,
      name: client.name,
      email: null, // Por ahora no guardamos email en el store
      api_key: client.clientKey, // El clientKey es el API key
      created_at: client.createdAt,
      usage_count: metrics?.totalGenerations || 0,
      limit: 5000,
      lastGeneration: metrics?.lastGeneration || null,
    };
  });

  return NextResponse.json({
    success: true,
    clients: clients, // Cambiar 'data' por 'clients' que es lo que espera el frontend
  });
}

// POST: Registrar nuevo cliente
export async function POST(request: NextRequest) {
  if (!validateAdmin(request)) {
    return NextResponse.json(
      { error: 'Unauthorized. Provide x-admin-key header' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();

    if (!body.name) {
      return NextResponse.json(
        { error: 'Missing required field: name' },
        { status: 400 }
      );
    }

    // Generar clientKey automáticamente (prefijo + timestamp + random)
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    const clientKey = `tryon_${timestamp}_${random}`;

    // El clientKey generado es también el API key para el widget
    const apiKey = clientKey;

    registerClient(clientKey, body.name);

    return NextResponse.json({
      success: true,
      message: 'Client registered',
      client: {
        id: clientKey,
        name: body.name,
        email: body.email || null,
        api_key: apiKey,
        created_at: new Date().toISOString(),
        usage_count: 0,
        limit: 5000,
      },
    });

  } catch (error) {
    console.error('[Clients] POST Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE: Eliminar cliente
export async function DELETE(request: NextRequest) {
  if (!validateAdmin(request)) {
    return NextResponse.json(
      { error: 'Unauthorized. Provide x-admin-key header' },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const clientKey = searchParams.get('clientKey');

    if (!clientKey) {
      return NextResponse.json(
        { error: 'Missing clientKey query parameter' },
        { status: 400 }
      );
    }

    const deleted = deleteClient(clientKey);

    if (!deleted) {
      return NextResponse.json(
        { error: 'Client not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Client deleted',
    });

  } catch (error) {
    console.error('[Clients] DELETE Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
