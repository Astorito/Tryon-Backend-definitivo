export default function Home() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: '20px',
    }}>
      <div style={{
        maxWidth: '600px',
        background: 'white',
        borderRadius: '16px',
        padding: '48px',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
        textAlign: 'center',
      }}>
        <h1 style={{
          fontSize: '48px',
          marginBottom: '16px',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>
          🚀 TryOn Backend
        </h1>
        <p style={{
          fontSize: '18px',
          color: '#6b7280',
          lineHeight: '1.6',
          marginBottom: '32px',
        }}>
          Backend minimalista para widget embebible.
          <br />
          Sin base de datos. Sin estado. Robusto y confiable.
        </p>
        <div style={{
          background: '#f9fafb',
          padding: '24px',
          borderRadius: '12px',
          textAlign: 'left',
          marginBottom: '24px',
        }}>
          <h2 style={{ fontSize: '20px', marginBottom: '16px', color: '#111827' }}>
            📡 Endpoints disponibles:
          </h2>
          <ul style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
          }}>
            <li style={{ padding: '8px 0', color: '#374151' }}>
              <code style={{
                background: '#111827',
                color: '#10b981',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '14px',
              }}>
                GET /api/widget
              </code>
              {' '}- JavaScript del widget
            </li>
            <li style={{ padding: '8px 0', color: '#374151' }}>
              <code style={{
                background: '#111827',
                color: '#10b981',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '14px',
              }}>
                POST /api/images/generate
              </code>
              {' '}- Generar imágenes
            </li>
          </ul>
        </div>
        <a 
          href="/demo.html"
          style={{
            display: 'inline-block',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            padding: '16px 32px',
            borderRadius: '12px',
            fontSize: '18px',
            fontWeight: '600',
            textDecoration: 'none',
          }}
        >
          Ver Demo →
        </a>
        <a 
          href="/admin"
          style={{
            display: 'inline-block',
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            color: 'white',
            padding: '16px 32px',
            borderRadius: '12px',
            fontSize: '18px',
            fontWeight: '600',
            textDecoration: 'none',
            marginLeft: '16px',
          }}
        >
          Admin Panel 🔐
        </a>
      </div>
    </div>
  );
}
