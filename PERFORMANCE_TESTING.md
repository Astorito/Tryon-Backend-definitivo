# 📊 Performance Testing Methodology

## Objetivo

Medir latencia real end-to-end y tomar decisiones de optimización **únicamente basadas en datos medidos**.

---

## 🔧 Checklist de Instrumentación

### Frontend (widget-core.js) ✅

- [x] `FE_click_ts` - Click en "Try Look"
- [x] `FE_preupload_start_ts` - Inicio de pre-upload a CDN
- [x] `FE_preupload_end_ts` - Fin de pre-upload
- [x] `FE_request_sent_ts` - `fetch()` iniciado
- [x] `FE_response_received_ts` - Response recibido
- [x] `FE_render_start_ts` - Inicio de renderizado
- [x] `FE_render_done_ts` - Imagen visible en DOM
- [x] `FE_e2e_complete` - Resumen con todos los tiempos

### Backend (route.ts) ✅

- [x] `BE_request_received_ts` - Inicio del handler
- [x] `BE_body_parsed_ts` - Body JSON parseado
- [x] `BE_auth_done_ts` - API key validada
- [x] `BE_fal_request_sent_ts` - Llamada a FAL iniciada
- [x] `BE_fal_response_received_ts` - Respuesta de FAL recibida
- [x] `BE_response_sent_ts` - Response enviado
- [x] Cold start detection ✅

### Correlación ✅

- [x] `request_id` generado en frontend
- [x] Propagado a backend via `_requestId`
- [x] Timings devueltos en response `metadata.timings`

---

## 📝 Formato de Logs

### Estructura JSON

```json
{
  "level": "info",
  "type": "timing",
  "request_id": "1736512800000-k3m9x2",
  "source": "frontend|backend",
  "phase": "string",
  "timestamp_iso": "2026-01-10T15:30:00.123Z",
  "timestamp_ms": 1736512800123,
  "duration_ms": 150,
  "metadata": { ... }
}
```

### Dónde Ver Logs

| Capa | Dónde |
|------|-------|
| Frontend | DevTools → Console (buscar `[TryOn Timing]`) |
| Backend | Vercel Dashboard → Functions → Logs |

---

## 🧪 Metodología de Prueba

### Cantidad de Ejecuciones

| Tipo | Mínimo | Recomendado |
|------|--------|-------------|
| Total | 20 | 50 |
| Cold Start | 5 | 10 |
| Warm | 15 | 40 |

### Cómo Forzar Cold Start

```bash
# Esperar 5+ minutos entre requests
# O re-deployar la función
```

### Cómo Forzar Warm

```bash
# Ejecutar en ráfagas de 3-5 requests
# Con <30 segundos entre cada una
```

### Script de Prueba Recomendado

```bash
# 1. Cold start (esperar 5 min antes)
curl -X POST https://tu-dominio.vercel.app/api/images/generate \
  -H "Content-Type: application/json" \
  -d '{"apiKey":"xxx", "userImage":"...", "garments":["..."]}'

# 2. Warm requests (inmediatamente después)
for i in {1..5}; do
  curl -X POST https://tu-dominio.vercel.app/api/images/generate \
    -H "Content-Type: application/json" \
    -d '{"apiKey":"xxx", "userImage":"...", "garments":["..."]}' &
  sleep 2
done
wait
```

---

## 📊 Cómo Analizar Resultados

### 1. Recolectar Logs

```bash
# Frontend: Copiar logs del DevTools
# Backend: Exportar desde Vercel

# Combinar en un archivo
cat frontend-logs.txt backend-logs.txt > all-logs.json
```

### 2. Ejecutar Análisis

```bash
npx ts-node scripts/analyze-latency.ts < all-logs.json
```

### 3. Interpretar Output

El script genera:

1. **Tabla de latencias por tramo** (avg, min, max, p50, p95, stddev)
2. **Cold vs Warm comparison**
3. **Bottleneck analysis** (qué segmento domina)
4. **Recommended actions** (qué optimizar)

---

## 🎯 Tabla de Tiempos por Tramo (Target vs Alerta)

| Tramo | Target | Alerta |
|-------|--------|--------|
| FE Pre-upload | <200ms | >500ms |
| Network Up | <150ms | >500ms |
| BE Overhead | <100ms | >300ms |
| FAL Inference | <4000ms | >6000ms |
| Network Down | <150ms | >500ms |
| FE Render | <100ms | >300ms |
| **TOTAL E2E** | **<5000ms** | **>8000ms** |

---

## 🔍 Reglas de Decisión

### IF fal_inference > 4000ms AND stddev > 1000ms
→ **Problema:** FAL cold starts
→ **Acción:** Implementar warmup de FAL

### IF fal_inference > 4000ms AND stddev < 500ms
→ **Problema:** Velocidad del modelo
→ **Acción:** No se puede optimizar (es el tiempo de inferencia puro)

### IF cold_avg - warm_avg > 500ms
→ **Problema:** Serverless cold starts
→ **Acción:** Implementar cron warmup

### IF network > 300ms
→ **Problema:** Payload grande o latencia de red
→ **Acción:** Verificar CDN, comprimir más, usar regiones cercanas

### IF be_overhead > 100ms
→ **Problema:** Código lento en backend
→ **Acción:** Optimizar auth, parsing, etc.

---

## ✅ Validación de Optimizaciones

### Proceso

1. **ANTES:** Correr 20+ requests, calcular avg y p95
2. **APLICAR** la optimización
3. **DESPUÉS:** Correr 20+ requests, calcular avg y p95
4. **COMPARAR:**

```
IF avg_después < avg_antes * 0.9:
    ÉXITO (>10% mejora)
ELSE:
    SIN IMPACTO → REVERTIR
```

### Registro

```markdown
| Optimización | Antes (avg) | Después (avg) | Δ | Resultado |
|--------------|-------------|---------------|---|-----------|
| Pre-upload CDN | 6500ms | 5200ms | -20% | ✅ APLICAR |
| Warmup cron | 5200ms | 5100ms | -2% | ❌ REVERTIR |
```

---

## 🚨 Troubleshooting

### No veo logs de Frontend
- Verificar que el widget carga correctamente
- Buscar `[TryOn Timing]` en DevTools Console
- Los logs solo aparecen después de hacer click en "Try Look"

### No veo logs de Backend
- Verificar que Vercel Function Logs están habilitados
- Buscar `"type":"timing"` o `"type":"latency"`
- Los logs tardan ~30s en aparecer en Vercel Dashboard

### request_id no coincide
- Verificar que el widget envía `_requestId` en el payload
- Verificar que route.ts lee `body._requestId`

### Cold start siempre true
- Normal en desarrollo/staging
- En producción, después de 3+ requests seguidas debería ser `false`
