#!/usr/bin/env npx ts-node

/**
 * Latency Analysis Script
 * 
 * Analiza logs de latencia y genera reportes de performance.
 * 
 * USO:
 *   npx ts-node scripts/analyze-latency.ts < logs.json
 *   cat vercel-logs.json | npx ts-node scripts/analyze-latency.ts
 * 
 * INPUT: Líneas JSON con logs de timing (uno por línea)
 * OUTPUT: Tabla de latencias por tramo + diagnóstico
 */

import * as readline from 'readline';

// === TIPOS ===

interface TimingLog {
  level: string;
  type: string;
  request_id: string;
  source: 'frontend' | 'backend' | 'fal';
  phase: string;
  timestamp_iso: string;
  timestamp_ms: number;
  duration_ms?: number;
  metadata?: Record<string, unknown>;
}

interface RequestTrace {
  request_id: string;
  events: TimingLog[];
  computed?: ComputedTimings;
}

interface ComputedTimings {
  // Frontend timings
  fe_preupload_ms?: number;
  fe_network_roundtrip_ms?: number;
  fe_render_ms?: number;
  
  // Backend timings (from response metadata)
  be_total_ms?: number;
  be_fal_ms?: number;
  be_overhead_ms?: number;
  cold_start?: boolean;
  
  // End-to-end
  total_e2e_ms?: number;
}

interface AggregatedStats {
  count: number;
  avg: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
  stddev: number;
}

// === HELPERS ===

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stddev(arr: number[]): number {
  if (arr.length === 0) return 0;
  const mean = avg(arr);
  const squareDiffs = arr.map(v => Math.pow(v - mean, 2));
  return Math.sqrt(avg(squareDiffs));
}

function computeStats(values: number[]): AggregatedStats {
  if (values.length === 0) {
    return { count: 0, avg: 0, min: 0, max: 0, p50: 0, p95: 0, p99: 0, stddev: 0 };
  }
  return {
    count: values.length,
    avg: Math.round(avg(values)),
    min: Math.min(...values),
    max: Math.max(...values),
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    p99: percentile(values, 99),
    stddev: Math.round(stddev(values)),
  };
}

// === PARSING ===

function parseLogLine(line: string): TimingLog | null {
  try {
    // Handle console.log prefix from widget
    let jsonStr = line;
    if (line.includes('[TryOn Timing]')) {
      jsonStr = line.split('[TryOn Timing]')[1].trim();
    }
    
    const parsed = JSON.parse(jsonStr);
    
    // Validate it's a timing log
    if (parsed.type === 'timing' || parsed.type === 'latency') {
      return parsed as TimingLog;
    }
    return null;
  } catch {
    return null;
  }
}

// === ANALYSIS ===

function computeRequestTimings(trace: RequestTrace): ComputedTimings {
  const events = trace.events;
  const computed: ComputedTimings = {};
  
  // Find key events
  const click = events.find(e => e.phase === 'click');
  const preuploadEnd = events.find(e => e.phase === 'preupload_end');
  const requestSent = events.find(e => e.phase === 'request_sent');
  const responseReceived = events.find(e => e.phase === 'response_received');
  const renderDone = events.find(e => e.phase === 'render_done');
  const e2eComplete = events.find(e => e.phase === 'e2e_complete');
  
  // Backend events
  const beReceived = events.find(e => e.phase === 'be_request_received');
  const beFalEnd = events.find(e => e.phase === 'be_fal_response_received');
  const beResponseSent = events.find(e => e.phase === 'be_response_sent');
  
  // Compute FE timings
  if (preuploadEnd?.metadata?.duration_ms) {
    computed.fe_preupload_ms = preuploadEnd.metadata.duration_ms as number;
  }
  
  if (requestSent && responseReceived) {
    computed.fe_network_roundtrip_ms = responseReceived.timestamp_ms - requestSent.timestamp_ms;
  }
  
  if (renderDone?.metadata?.render_duration_ms) {
    computed.fe_render_ms = renderDone.metadata.render_duration_ms as number;
  }
  
  // Get backend timings from e2e_complete or backend logs
  if (e2eComplete?.metadata?.backend_timings) {
    const bt = e2eComplete.metadata.backend_timings as Record<string, unknown>;
    computed.be_total_ms = bt.total_backend_ms as number;
    computed.be_fal_ms = bt.fal_duration_ms as number;
    computed.be_overhead_ms = bt.backend_overhead_ms as number;
    computed.cold_start = bt.cold_start as boolean;
  } else if (beResponseSent?.metadata) {
    computed.be_total_ms = beResponseSent.duration_ms;
    computed.be_fal_ms = beResponseSent.metadata.fal_duration_ms as number;
    computed.be_overhead_ms = beResponseSent.metadata.backend_overhead_ms as number;
    computed.cold_start = beResponseSent.metadata.cold_start as boolean;
  }
  
  // Total E2E
  if (e2eComplete?.metadata?.total_duration_ms) {
    computed.total_e2e_ms = e2eComplete.metadata.total_duration_ms as number;
  } else if (click && renderDone) {
    computed.total_e2e_ms = renderDone.timestamp_ms - click.timestamp_ms;
  }
  
  return computed;
}

function identifyBottleneck(timings: ComputedTimings): { segment: string; percentage: number; value: number } {
  const segments: Record<string, number> = {};
  
  if (timings.fe_preupload_ms) segments['fe_preupload'] = timings.fe_preupload_ms;
  if (timings.be_fal_ms) segments['fal_inference'] = timings.be_fal_ms;
  if (timings.be_overhead_ms) segments['be_overhead'] = timings.be_overhead_ms;
  if (timings.fe_render_ms) segments['fe_render'] = timings.fe_render_ms;
  
  // Network = roundtrip - backend total
  if (timings.fe_network_roundtrip_ms && timings.be_total_ms) {
    segments['network'] = timings.fe_network_roundtrip_ms - timings.be_total_ms;
  }
  
  const total = Object.values(segments).reduce((a, b) => a + b, 0);
  const [bottleneck, value] = Object.entries(segments).sort((a, b) => b[1] - a[1])[0] || ['unknown', 0];
  
  return {
    segment: bottleneck,
    value: Math.round(value),
    percentage: total > 0 ? Math.round((value / total) * 100) : 0,
  };
}

function generateDecisions(
  allStats: Record<string, AggregatedStats>,
  coldVsWarm: { cold: AggregatedStats; warm: AggregatedStats }
): string[] {
  const decisions: string[] = [];
  
  // REGLA 1: FAL es cuello de botella
  if (allStats.be_fal_ms?.avg > 4000) {
    if (allStats.be_fal_ms.stddev > 1000) {
      decisions.push(`⚡ IMPLEMENT FAL WARMUP: FAL avg=${allStats.be_fal_ms.avg}ms, stddev=${allStats.be_fal_ms.stddev}ms (alta variabilidad)`);
    } else {
      decisions.push(`ℹ️ FAL inference es consistente (${allStats.be_fal_ms.avg}ms) - es el tiempo de modelo, no se puede optimizar`);
    }
  }
  
  // REGLA 2: Cold start significativo
  if (coldVsWarm.cold.count > 0 && coldVsWarm.warm.count > 0) {
    const diff = coldVsWarm.cold.avg - coldVsWarm.warm.avg;
    if (diff > 500) {
      decisions.push(`⚡ IMPLEMENT SERVERLESS WARMUP: Cold=${coldVsWarm.cold.avg}ms vs Warm=${coldVsWarm.warm.avg}ms (diff=${diff}ms)`);
    }
  }
  
  // REGLA 3: Preupload
  if (allStats.fe_preupload_ms?.avg > 500) {
    decisions.push(`⚡ OPTIMIZE PRE-UPLOAD: ${allStats.fe_preupload_ms.avg}ms promedio en pre-upload`);
  }
  
  // REGLA 4: Backend overhead
  if (allStats.be_overhead_ms?.avg > 100) {
    decisions.push(`⚡ OPTIMIZE BACKEND: ${allStats.be_overhead_ms.avg}ms de overhead (auth, parsing, etc)`);
  }
  
  // REGLA 5: Network
  if (allStats.network?.avg > 300) {
    decisions.push(`⚡ CHECK NETWORK/CDN: ${allStats.network.avg}ms de latencia de red`);
  }
  
  if (decisions.length === 0) {
    decisions.push('✅ Sistema optimizado - no se detectan cuellos de botella significativos');
  }
  
  return decisions;
}

// === MAIN ===

async function main() {
  const traces: Map<string, RequestTrace> = new Map();
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });
  
  // Parse all logs
  for await (const line of rl) {
    const log = parseLogLine(line);
    if (!log) continue;
    
    if (!traces.has(log.request_id)) {
      traces.set(log.request_id, { request_id: log.request_id, events: [] });
    }
    traces.get(log.request_id)!.events.push(log);
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('                    LATENCY ANALYSIS REPORT');
  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log(`Total requests analyzed: ${traces.size}\n`);
  
  if (traces.size === 0) {
    console.log('No timing logs found. Make sure to pipe valid JSON logs.');
    process.exit(1);
  }
  
  // Compute timings for each request
  const allTimings: ComputedTimings[] = [];
  for (const trace of traces.values()) {
    trace.computed = computeRequestTimings(trace);
    allTimings.push(trace.computed);
  }
  
  // Aggregate stats by metric
  const metrics: Record<string, number[]> = {
    fe_preupload_ms: [],
    fe_network_roundtrip_ms: [],
    fe_render_ms: [],
    be_total_ms: [],
    be_fal_ms: [],
    be_overhead_ms: [],
    total_e2e_ms: [],
    network: [],
  };
  
  for (const t of allTimings) {
    if (t.fe_preupload_ms) metrics.fe_preupload_ms.push(t.fe_preupload_ms);
    if (t.fe_network_roundtrip_ms) metrics.fe_network_roundtrip_ms.push(t.fe_network_roundtrip_ms);
    if (t.fe_render_ms) metrics.fe_render_ms.push(t.fe_render_ms);
    if (t.be_total_ms) metrics.be_total_ms.push(t.be_total_ms);
    if (t.be_fal_ms) metrics.be_fal_ms.push(t.be_fal_ms);
    if (t.be_overhead_ms) metrics.be_overhead_ms.push(t.be_overhead_ms);
    if (t.total_e2e_ms) metrics.total_e2e_ms.push(t.total_e2e_ms);
    if (t.fe_network_roundtrip_ms && t.be_total_ms) {
      metrics.network.push(t.fe_network_roundtrip_ms - t.be_total_ms);
    }
  }
  
  const allStats: Record<string, AggregatedStats> = {};
  for (const [key, values] of Object.entries(metrics)) {
    allStats[key] = computeStats(values);
  }
  
  // Print stats table
  console.log('┌─────────────────────────┬───────┬───────┬───────┬───────┬───────┬───────┬───────┐');
  console.log('│ Metric                  │ Count │  Avg  │  Min  │  Max  │  P50  │  P95  │StdDev │');
  console.log('├─────────────────────────┼───────┼───────┼───────┼───────┼───────┼───────┼───────┤');
  
  const metricLabels: Record<string, string> = {
    fe_preupload_ms: 'FE Pre-upload',
    fe_network_roundtrip_ms: 'FE Network (roundtrip)',
    fe_render_ms: 'FE Render',
    be_total_ms: 'BE Total',
    be_fal_ms: 'BE → FAL Inference',
    be_overhead_ms: 'BE Overhead',
    network: 'Network (estimated)',
    total_e2e_ms: 'TOTAL E2E',
  };
  
  for (const [key, label] of Object.entries(metricLabels)) {
    const s = allStats[key];
    if (s.count === 0) continue;
    console.log(
      `│ ${label.padEnd(23)} │ ${String(s.count).padStart(5)} │ ${String(s.avg).padStart(5)} │ ${String(s.min).padStart(5)} │ ${String(s.max).padStart(5)} │ ${String(s.p50).padStart(5)} │ ${String(s.p95).padStart(5)} │ ${String(s.stddev).padStart(5)} │`
    );
  }
  console.log('└─────────────────────────┴───────┴───────┴───────┴───────┴───────┴───────┴───────┘');
  console.log('                                                        (all values in ms)\n');
  
  // Cold vs Warm analysis
  const coldTimings = allTimings.filter(t => t.cold_start === true);
  const warmTimings = allTimings.filter(t => t.cold_start === false);
  
  const coldVsWarm = {
    cold: computeStats(coldTimings.map(t => t.total_e2e_ms || 0).filter(v => v > 0)),
    warm: computeStats(warmTimings.map(t => t.total_e2e_ms || 0).filter(v => v > 0)),
  };
  
  console.log('COLD START vs WARM:');
  console.log(`  Cold starts: ${coldVsWarm.cold.count} requests, avg=${coldVsWarm.cold.avg}ms, p95=${coldVsWarm.cold.p95}ms`);
  console.log(`  Warm:        ${coldVsWarm.warm.count} requests, avg=${coldVsWarm.warm.avg}ms, p95=${coldVsWarm.warm.p95}ms`);
  if (coldVsWarm.cold.count > 0 && coldVsWarm.warm.count > 0) {
    console.log(`  Difference:  ${coldVsWarm.cold.avg - coldVsWarm.warm.avg}ms\n`);
  } else {
    console.log('');
  }
  
  // Bottleneck analysis
  console.log('BOTTLENECK ANALYSIS (per request):');
  const bottlenecks: Record<string, number> = {};
  for (const t of allTimings) {
    const b = identifyBottleneck(t);
    bottlenecks[b.segment] = (bottlenecks[b.segment] || 0) + 1;
  }
  for (const [segment, count] of Object.entries(bottlenecks).sort((a, b) => b[1] - a[1])) {
    const pct = Math.round((count / allTimings.length) * 100);
    console.log(`  ${segment}: ${count} requests (${pct}%)`);
  }
  console.log('');
  
  // Decisions
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('                    RECOMMENDED ACTIONS');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  const decisions = generateDecisions(allStats, coldVsWarm);
  for (const d of decisions) {
    console.log(`  ${d}`);
  }
  console.log('');
  
  // Validation criteria
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('                    VALIDATION CRITERIA');
  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log('  Para validar que una optimización funcionó:');
  console.log('  1. Correr 20+ requests ANTES');
  console.log('  2. Aplicar optimización');
  console.log('  3. Correr 20+ requests DESPUÉS');
  console.log('');
  console.log('  Éxito = avg_después < avg_antes * 0.9 (>10% mejora)');
  console.log('');
}

main().catch(console.error);
