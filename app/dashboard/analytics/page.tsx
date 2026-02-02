'use client';

import { useEffect, useState } from 'react';
import { LineChart, Line, PieChart, Pie, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';

const COLORS = ['#8b5cf6', '#f97316', '#3b82f6', '#10b981'];

export default function AnalyticsPage() {
  const [clients, setClients] = useState<any[]>([]);
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [period, setPeriod] = useState('6M');
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadClients();
  }, []);

  useEffect(() => {
    if (selectedClients.length > 0) {
      loadAnalytics();
    }
  }, [selectedClients, period]);

  async function loadClients() {
    try {
      const res = await fetch('/api/clients');
      const data = await res.json();
      const clientList = data.clients || [];
      setClients(clientList);
      
      // Select first 2 clients by default
      if (clientList.length > 0) {
        setSelectedClients(clientList.slice(0, 2).map((c: any) => c.id));
      }
    } catch (error) {
      console.error('Error loading clients:', error);
    }
    setLoading(false);
  }

  async function loadAnalytics() {
    try {
      const res = await fetch(`/api/admin/analytics?clients=${selectedClients.join(',')}&period=${period}`);
      const data = await res.json();
      setAnalytics(data);
    } catch (error) {
      console.error('Error loading analytics:', error);
    }
  }

  function toggleClient(clientId: string) {
    setSelectedClients(prev =>
      prev.includes(clientId)
        ? prev.filter(id => id !== clientId)
        : [...prev, clientId]
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const totalGenerations = analytics?.totalGenerations || 0;
  const avgDaily = analytics?.avgDaily || 0;
  const avgRevenue = analytics?.avgRevenue || 0;
  const growthRate = analytics?.growthRate || 0;

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Seleccionar Empresas
            </label>
            <div className="flex flex-wrap gap-2">
              {clients.map(client => (
                <button
                  key={client.id}
                  onClick={() => toggleClient(client.id)}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                    selectedClients.includes(client.id)
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {client.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Período
            </label>
            <div className="flex gap-2">
              {['1M', '3M', '6M', '1 Año', 'All Time'].map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                    period === p
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-6 border border-green-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-green-700">Crecimiento Mensual</span>
            <span className="text-2xl">📈</span>
          </div>
          <div className="text-3xl font-bold text-green-900">+{growthRate}%</div>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-6 border border-blue-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-blue-700">Promedio Diario</span>
            <span className="text-2xl">📅</span>
          </div>
          <div className="text-3xl font-bold text-blue-900">{avgDaily}</div>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-6 border border-purple-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-purple-700">Ingreso Estimado</span>
            <span className="text-2xl">💰</span>
          </div>
          <div className="text-3xl font-bold text-purple-900">${avgRevenue}</div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Time Series Chart */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">
            Generaciones por Mes
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={analytics?.timeSeries || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              {selectedClients.map((clientId, idx) => {
                const client = clients.find(c => c.id === clientId);
                return (
                  <Line
                    key={clientId}
                    type="monotone"
                    dataKey={clientId}
                    stroke={COLORS[idx % COLORS.length]}
                    name={client?.name || clientId}
                    strokeWidth={2}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Pie Chart */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">
            Distribución por Empresa
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={analytics?.distribution || []}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label
              >
                {(analytics?.distribution || []).map((entry: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Hourly Distribution */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">
            Distribución por Hora del Día
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={analytics?.hourly || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="hour" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Ranking Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">
            Ranking de Empresas (Total Generaciones)
          </h3>
          <div className="space-y-3">
            {(analytics?.ranking || []).map((item: any, idx: number) => (
              <div key={idx} className="flex items-center gap-3">
                <span className="text-lg font-bold text-gray-400 w-6">{idx + 1}</span>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-gray-800">{item.name}</span>
                    <span className="text-sm text-gray-600">{item.count} generaciones</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${item.percentage}%`,
                        backgroundColor: COLORS[idx % COLORS.length]
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
