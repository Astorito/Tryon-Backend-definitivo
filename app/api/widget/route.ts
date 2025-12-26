import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Endpoint principal del widget
 * GET /api/widget
 * 
 * Devuelve JavaScript puro que se auto-inicializa.
 * El script lee data-tryon-key del <script> tag que lo invoca.
 */
export async function GET(request: NextRequest) {
  try {
    // Leer el código del widget
    const widgetPath = join(process.cwd(), 'lib', 'widget-core.js');
    const widgetCode = readFileSync(widgetPath, 'utf-8');

    // Devolver como JavaScript puro
    // El widget detecta automáticamente la URL del backend desde script.src
    return new NextResponse(widgetCode, {
      status: 200,
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('[Widget API] Error:', error);
    
    // Devolver error como comentario JS válido
    const errorCode = `
      console.error('[TryOn Widget] Failed to load widget');
      console.error('Error: ${error instanceof Error ? error.message : 'Unknown error'}');
    `;
    
    return new NextResponse(errorCode, {
      status: 500,
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
      },
    });
  }
}

// Manejar OPTIONS para CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
