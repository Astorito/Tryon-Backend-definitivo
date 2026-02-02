import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  const body = await request.json();
  const { password } = body;

  const validPassword = process.env.ADMIN_PASSWORD || 'tryon_admin_2024';

  if (password === validPassword) {
    const response = NextResponse.json({ success: true });
    
    // Crear cookie de sesión (válida por 7 días)
    response.cookies.set('admin_auth', 'authenticated', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 días
      path: '/',
    });

    return response;
  }

  return NextResponse.json({ success: false, error: 'Contraseña incorrecta' }, { status: 401 });
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete('admin_auth');
  return response;
}
