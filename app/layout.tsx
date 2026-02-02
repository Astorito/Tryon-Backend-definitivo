import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TryOn Backend',
  description: 'Minimal backend for TryOn embeddable widget',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
