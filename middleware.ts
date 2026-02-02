import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Rutas protegidas que requieren autenticación
const protectedRoutes = ['/dashboard', '/admin'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Verificar si la ruta está protegida
  const isProtected = protectedRoutes.some(route => pathname.startsWith(route));
  
  if (isProtected) {
    // Verificar autenticación básica
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      return new NextResponse('Authentication required', {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Basic realm="Dashboard Access"',
        },
      });
    }

    try {
      // Decodificar credenciales
      const base64Credentials = authHeader.split(' ')[1];
      const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
      const [username, password] = credentials.split(':');

      // Validar credenciales
      const validUsername = process.env.ADMIN_USERNAME || 'admin';
      const validPassword = process.env.ADMIN_PASSWORD || 'tryon_admin_2024';

      if (username !== validUsername || password !== validPassword) {
        return new NextResponse('Invalid credentials', {
          status: 401,
          headers: {
            'WWW-Authenticate': 'Basic realm="Dashboard Access"',
          },
        });
      }
    } catch (error) {
      return new NextResponse('Invalid authorization header', { status: 400 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*'],
};
