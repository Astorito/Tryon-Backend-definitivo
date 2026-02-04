import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Rutas protegidas que requieren autenticación
const protectedRoutes = ['/dashboard', '/admin'];

// CORS headers para permitir requests desde cualquier origen
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-key, x-admin-key',
  'Access-Control-Max-Age': '86400',
  'Content-Security-Policy': "default-src 'self' 'unsafe-inline' 'unsafe-eval' *; img-src * data: blob:; font-src * data:; style-src * 'unsafe-inline'; connect-src *",
};

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Manejar preflight requests (OPTIONS) para todas las rutas API
  if (request.method === 'OPTIONS' && pathname.startsWith('/api/')) {
    return new NextResponse(null, {
      status: 204,
      headers: CORS_HEADERS,
    });
  }

  // Agregar CORS headers a todas las responses de API
  if (pathname.startsWith('/api/')) {
    const response = NextResponse.next();
    Object.entries(CORS_HEADERS).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    return response;
  }

  // No aplicar autenticación a la ruta de login
  if (pathname === '/login') {
    return NextResponse.next();
  }

  // Verificar si la ruta está protegida
  const isProtected = protectedRoutes.some(route => pathname.startsWith(route));
  
  if (isProtected) {
    // Verificar cookie de sesión primero
    const authCookie = request.cookies.get('admin_auth');
    
    if (authCookie?.value === 'authenticated') {
      return NextResponse.next();
    }

    // Si no hay cookie válida, redirigir a login
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*', '/api/:path*'],
};
