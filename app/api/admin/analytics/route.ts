import { NextResponse } from 'next/server';
import { getTimeSeriesData, getHourlyDistribution, getRanking, getDistribution } from '@/lib/metrics-store';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const clientsParam = searchParams.get('clients');
  const period = searchParams.get('period') || '6M';

  if (!clientsParam) {
    return NextResponse.json({ error: 'Missing clients parameter' }, { status: 400 });
  }

  const clientKeys = clientsParam.split(',');
  
  // Convertir período a meses
  const periodMap: Record<string, number> = {
    '1M': 1,
    '3M': 3,
    '6M': 6,
    '1 Año': 12,
    'All Time': 24,
  };
  const months = periodMap[period] || 6;

  // Obtener datos
  const timeSeries = getTimeSeriesData(clientKeys, months);
  const hourly = getHourlyDistribution(clientKeys);
  const ranking = getRanking();
  const distribution = getDistribution(clientKeys);

  // Calcular métricas agregadas
  const totalGenerations = ranking.reduce((sum, r) => sum + r.count, 0);
  const avgDaily = Math.round(totalGenerations / (months * 30));
  const avgRevenue = Math.round(totalGenerations * 0.04); // $0.04 por generación estimado
  
  // Calcular crecimiento (último mes vs anterior)
  const lastMonthData = timeSeries[timeSeries.length - 1] || {};
  const prevMonthData = timeSeries[timeSeries.length - 2] || {};
  const lastMonthTotal = Object.values(lastMonthData).reduce((sum: number, val) => 
    typeof val === 'number' ? sum + val : sum, 0);
  const prevMonthTotal = Object.values(prevMonthData).reduce((sum: number, val) => 
    typeof val === 'number' ? sum + val : sum, 0);
  const growthRate = prevMonthTotal > 0 
    ? ((lastMonthTotal - prevMonthTotal) / prevMonthTotal * 100).toFixed(1)
    : '0.0';

  return NextResponse.json({
    timeSeries,
    hourly,
    ranking,
    distribution,
    totalGenerations,
    avgDaily,
    avgRevenue,
    growthRate: parseFloat(growthRate as string),
  });
}
