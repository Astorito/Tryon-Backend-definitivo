# 🚀 TryOn Backend - Widget Embebible

Backend minimalista y robusto para widget TryOn. Sin base de datos, sin estado, diseñado para producción.

## 🎯 Características

- ✅ Widget embebible con **una sola línea de código**
- ✅ **Shadow DOM** para aislamiento completo
- ✅ **Sin frameworks** en el cliente (JS puro)
- ✅ **Sin base de datos** (stateless)
- ✅ Integración con **Banana PRO** para generación IA
- ✅ Métricas externas automáticas
- ✅ Deploy en **Vercel** ready

## 🚀 Quick Start

### 1. Instalación

```bash
npm install
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
```

Edita `.env`:
```env
BANANA_PRO_API_URL=https://api.banana.dev/v4/inference
BANANA_PRO_API_KEY=tu_api_key_aqui
METRICS_ENDPOINT=https://tryon-kappa.vercel.app/api/ingest
```

### 3. Ejecutar en desarrollo

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) y haz click en "Ver Demo".

### 4. Probar el widget

Abre [http://localhost:3000/demo.html](http://localhost:3000/demo.html) para ver el widget en acción.

## 📦 Integración en tu sitio

Pega esta línea antes del cierre del `</body>`:

```html
<script
  src="https://tryon-backend.vercel.app/api/widget"
  data-tryon-key="TU_API_KEY_AQUI">
</script>
```

¡Eso es todo! El widget aparecerá automáticamente como un botón flotante.

## 📡 Endpoints

### GET /api/widget
Devuelve el código JavaScript del widget.

### POST /api/images/generate
Genera imágenes try-on con IA.

**Body:**
```json
{
  "apiKey": "demo_key_12345",
  "userImage": "data:image/jpeg;base64,...",
  "garments": ["data:image/jpeg;base64,..."]
}
```

## 🏗️ Arquitectura

- **Framework**: Next.js 14 (App Router)
- **Deploy**: Vercel
- **Modelo IA**: Banana PRO
- **Métricas**: Endpoint externo
- **Estado**: Sin base de datos, completamente stateless

Ver [ARCHITECTURE.md](./ARCHITECTURE.md) para documentación completa.

## 📁 Estructura

```
app/
├── api/
│   ├── widget/route.ts          # Endpoint del widget
│   └── images/generate/route.ts # Generación IA
├── layout.tsx
└── page.tsx

lib/
├── widget-core.js               # Código del widget (JS puro)
├── auth.ts                      # Validación API keys
├── banana-client.ts             # Cliente Banana PRO
└── metrics.ts                   # Cliente métricas

public/
└── demo.html                    # Demo de integración
```

## ✅ Checklist

- [x] Backend Next.js funcionando
- [x] Endpoint `/api/widget` devuelve JS
- [x] Endpoint `/api/images/generate` funciona
- [x] Widget con Shadow DOM
- [x] Botón flotante "Try look"
- [x] Upload de imágenes (drag & drop)
- [x] 3 boxes para garments
- [x] Result box con zoom
- [x] Onboarding primera vez
- [x] Integración métricas externas
- [x] Sin base de datos
- [x] Sin Prisma
- [x] Ejemplo HTML funcionando

## 🚀 Deploy en Vercel

1. Conecta este repositorio a Vercel
2. Configura las variables de entorno
3. Deploy automático

## 📝 API Keys

Para agregar nuevos clientes, edita `lib/auth.ts`:

```typescript
const CLIENTS = {
  'tu_api_key': {
    id: 'client_id',
    name: 'Nombre Cliente',
    active: true,
  },
};
```

## 🤝 Contribución

Este backend es **minimalista por diseño**. Solo se aceptan cambios que:
- No requieran base de datos
- No agreguen complejidad innecesaria
- Mantengan el widget simple y robusto

## 📄 Licencia

Ver documentación del proyecto principal.

---

**Estado**: ✅ Production Ready  
**Versión**: 1.0.0  
**Última actualización**: Diciembre 2025
2 version de TryOn Backend
# trigger deploy
