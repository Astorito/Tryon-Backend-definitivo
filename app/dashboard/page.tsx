'use client';

import { useEffect, useState } from 'react';
import MetricCard from '@/components/dashboard/MetricCard';
import CompanyTable from '@/components/dashboard/CompanyTable';
import CompanyForm from '@/components/dashboard/CompanyForm';

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<any>(null);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [metricsRes, clientsRes] = await Promise.all([
        fetch('/api/metrics'),
        fetch('/api/clients')
      ]);

      const metricsData = await metricsRes.json();
      const clientsData = await clientsRes.json();

      setMetrics(metricsData);
      setClients(clientsData.clients || []);
    } catch (error) {
      console.error('Error loading data:', error);
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const totalClients = clients.length;
  const totalGenerations = clients.reduce((sum, c) => sum + (c.usage_count || 0), 0);
  const avgPerClient = totalClients > 0 ? Math.round(totalGenerations / totalClients) : 0;
  const nearLimit = clients.filter(c => {
    const used = c.usage_count || 0;
    const limit = c.limit || 5000;
    const remaining = limit - used;
    return remaining < limit * 0.1; // menos del 10%
  }).length;

  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <MetricCard
          title="Total Empresas"
          value={totalClients}
          icon="🏢"
          color="blue"
        />
        <MetricCard
          title="Generaciones Totales"
          value={totalGenerations.toLocaleString()}
          icon="📈"
          color="green"
        />
        <MetricCard
          title="Promedio por Empresa"
          value={avgPerClient.toLocaleString()}
          icon="⚡"
          color="purple"
        />
        <MetricCard
          title="Cerca del Límite"
          value={nearLimit}
          icon="⏰"
          color="orange"
        />
      </div>

      {/* Company Form */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">
          Generar Nueva Empresa
        </h2>
        <CompanyForm onSuccess={loadData} />
      </div>

      {/* Company Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <CompanyTable clients={clients} onUpdate={loadData} />
      </div>
    </div>
  );
}
