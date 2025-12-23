# 🔑 Guía de Configuración y Empresas

## 📋 Configuración Inicial

### 1. Variables de Entorno

Crea un archivo `.env` con:

```env
# API Key de Banana PRO (proveedor de IA)
BANANA_PRO_API_KEY=tu_api_key_de_banana_aqui

# Endpoint de métricas (ya configurado)
METRICS_ENDPOINT=https://tryon-kappa.vercel.app/api/ingest
```

Para obtener tu Banana PRO API Key:
1. Regístrate en https://banana.dev
2. Ve a Dashboard → API Keys
3. Copia tu API Key
4. Pégala en el `.env`

---

## 🏢 Agregar Nuevas Empresas

### Paso 1: Crear empresa en el dashboard

Ve a https://tryon-kappa.vercel.app/dashboard y crea la empresa:
- Nombre de la empresa
- El sistema genera automáticamente una **Client Key única**

Ejemplo: `client_key_abc123xyz`

### Paso 2: Agregar empresa a este backend

Edita `lib/auth.ts`:

```typescript
const CLIENTS: Record<string, ClientInfo> = {
  // Empresa existente
  'demo_key_12345': {
    id: 'client_001',
    name: 'Demo Company',
    apiKey: 'demo_key_12345',
    active: true,
  },
  
  // Nueva empresa
  'client_key_abc123xyz': {
    id: 'tienda_ropa_online',        // ID único interno
    name: 'Tienda Ropa Online',       // Nombre descriptivo
    apiKey: 'client_key_abc123xyz',   // La Client Key del dashboard
    active: true,                      // Activa/desactiva empresa
  },
};
```

### Paso 3: Entregar código al cliente

El cliente debe pegar esto en su sitio web:

```html
<script
  src="https://tryon-backend.vercel.app/api/widget"
  data-tryon-key="client_key_abc123xyz">
</script>
```

---

## 🔄 Flujo Completo de Métricas

### 1. Cliente usa el widget

```html
<!-- Sitio web del cliente -->
<script 
  src="https://tryon-backend.vercel.app/api/widget"
  data-tryon-key="client_key_abc123xyz">
</script>
```

### 2. Usuario genera una imagen

- Usuario sube foto + ropa
- Click en "Try look"
- Widget llama a tu backend

### 3. Backend procesa

```typescript
// POST /api/images/generate
{
  apiKey: "client_key_abc123xyz",  // ← Identifica la empresa
  userImage: "...",
  garments: ["..."]
}
```

**Tu backend:**
1. Valida `apiKey` en `lib/auth.ts`
2. Identifica que es "Tienda Ropa Online"
3. Genera imagen con Banana PRO
4. Envía métrica a sistema externo

### 4. Métrica enviada

```typescript
// POST https://tryon-kappa.vercel.app/api/ingest
// Header: x-client-key: client_key_abc123xyz

{
  type: "generation",
  timestamp: "2025-12-23T10:30:00Z",
  model: "banana-pro",
  clientId: "tienda_ropa_online",
  clientName: "Tienda Ropa Online"
}
```

### 5. Dashboard muestra datos

El dashboard en https://tryon-kappa.vercel.app/dashboard:
- Lee todas las métricas (usa `x-admin-key`)
- Muestra generaciones por empresa:
  - Tienda Ropa Online: 45 generaciones
  - Fashion Store: 23 generaciones
  - Etc.

---

## 🎯 Identificación por Empresa

### ¿Cómo se identifica cada empresa?

**Por su Client Key única:**

1. **En el widget:**
   ```html
   data-tryon-key="client_key_abc123xyz"
   ```

2. **En la llamada al backend:**
   ```json
   { "apiKey": "client_key_abc123xyz" }
   ```

3. **En el envío de métricas:**
   ```
   Header: x-client-key: client_key_abc123xyz
   ```

4. **En el sistema de métricas:**
   - Recibe el evento con `x-client-key`
   - Lo asocia a esa empresa
   - El dashboard lo muestra agrupado

### ¿Qué datos se rastrean por empresa?

- Total de generaciones
- Timestamp de cada generación
- Modelo usado (banana-pro)
- Costos asociados (calculados por generación)

---

## 🔐 Seguridad

### Client Key vs Admin Key

**Client Key** (`x-client-key`):
- Una por empresa
- Se usa para enviar métricas
- Se incluye en el widget embebible
- Solo puede escribir datos (POST)

**Admin Key** (`x-admin-key`):
- Una sola para todo el sistema
- Se usa en el dashboard
- Puede leer todas las métricas
- **NUNCA** se comparte con clientes

### Validación

```typescript
// En lib/auth.ts
export function validateApiKey(apiKey: string): ClientInfo | null {
  const client = CLIENTS[apiKey];
  
  if (!client) return null;        // Key no existe
  if (!client.active) return null; // Empresa desactivada
  
  return client;
}
```

---

## 📊 Ejemplo Real

### Empresa: Fashion Boutique

**1. Creada en dashboard:**
- Nombre: Fashion Boutique
- Client Key: `client_key_fashion_2025`

**2. Agregada en `lib/auth.ts`:**
```typescript
'client_key_fashion_2025': {
  id: 'fashion_boutique',
  name: 'Fashion Boutique',
  apiKey: 'client_key_fashion_2025',
  active: true,
}
```

**3. Widget en su sitio:**
```html
<script
  src="https://tryon-backend.vercel.app/api/widget"
  data-tryon-key="client_key_fashion_2025">
</script>
```

**4. Generan 10 imágenes:**
- Cada generación envía evento con `x-client-key: client_key_fashion_2025`
- Dashboard muestra: "Fashion Boutique: 10 generaciones"

**5. Si quieres desactivarlos:**
```typescript
'client_key_fashion_2025': {
  // ...
  active: false, // ← Ahora no pueden generar imágenes
}
```

---

## 🚀 Deploy en Vercel

### Variables de entorno en Vercel

1. Ve a tu proyecto en Vercel
2. Settings → Environment Variables
3. Agrega:
   ```
   BANANA_PRO_API_KEY=tu_api_key_real
   METRICS_ENDPOINT=https://tryon-kappa.vercel.app/api/ingest
   ```
4. Deploy

### Actualizar empresas sin deploy

**Opción 1: Variables de entorno** (recomendado para producción)
```env
CLIENTS_JSON='{"client_key_1":{"id":"c1","name":"Empresa 1","active":true}}'
```

**Opción 2: Editar código** (actual)
- Editar `lib/auth.ts`
- Push a git
- Auto-deploy en Vercel

---

## ❓ FAQ

**¿Puedo usar la misma Client Key en múltiples sitios?**
Sí, una empresa puede usar su Client Key en varios dominios.

**¿Cómo sé cuánto consumió cada empresa?**
El dashboard en https://tryon-kappa.vercel.app/dashboard muestra generaciones por empresa.

**¿Qué pasa si un cliente intenta usar una key inválida?**
El backend responde 401 Unauthorized y no genera la imagen.

**¿Se guardan las imágenes generadas?**
No. Este backend es stateless, no guarda nada.

**¿Cómo calculo costos?**
- Cada generación = 1 llamada a Banana PRO
- Precio por llamada según tu plan Banana PRO
- Total = generaciones × precio_unitario

**¿Puedo limitar generaciones por empresa?**
Sí, necesitarías agregar un sistema de quotas en `lib/auth.ts` o en el sistema de métricas.

---

## 📞 Resumen

1. **Creas empresa** en https://tryon-kappa.vercel.app/dashboard
2. **Obtienes Client Key** única
3. **Agregas en `lib/auth.ts`** de este backend
4. **Entregas código** al cliente con su Client Key
5. **Métricas llegan automáticamente** al dashboard
6. **Ves consumo** por empresa en tiempo real

Todo centralizado, sin base de datos, completamente stateless.
