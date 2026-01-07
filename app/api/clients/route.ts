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
  return adminKey === ADMIN_KEY;
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
      ...client,
      totalGenerations: metrics?.totalGenerations || 0,
      lastGeneration: metrics?.lastGeneration || null,
    };
  });

  return NextResponse.json({
    success: true,
    data: clients,
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

    if (!body.clientKey || !body.name) {
      return NextResponse.json(
        { error: 'Missing required fields: clientKey, name' },
        { status: 400 }
      );
    }

    // Validar formato de clientKey (alfanumérico, sin espacios)
    if (!/^[a-zA-Z0-9_-]+$/.test(body.clientKey)) {
      return NextResponse.json(
        { error: 'clientKey must be alphanumeric (letters, numbers, underscores, hyphens only)' },
        { status: 400 }
      );
    }

    registerClient(body.clientKey, body.name);

    return NextResponse.json({
      success: true,
      message: 'Client registered',
      data: {
        clientKey: body.clientKey,
        name: body.name,
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
