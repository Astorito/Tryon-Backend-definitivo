'use client';

import React, { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_KEY || 'admin_secret_key_2024';

export default function MetricsDashboard() {
  const [clients, setClients] = useState<any[]>([]);
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [showNewClientForm, setShowNewClientForm] = useState(false);
  const [adminKey, setAdminKey] = useState(ADMIN_KEY);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      loadClients();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (selectedClient && isAuthenticated) {
      loadMetrics(selectedClient);
    }
  }, [selectedClient]);

  async function loadClients() {
    setLoading(true);
    try {
      const res = await fetch('/api/clients', {
        headers: { 'x-admin-key': adminKey }
      });
      const data = await res.json();
      
      if (res.ok) {
        setClients(data.clients || []);
        if (data.clients?.length > 0 && !selectedClient) {
          setSelectedClient(data.clients[0].id);
        }
      } else {
        alert('Error al cargar clientes: ' + (data.error || 'Unknown'));
      }
    } catch (err) {
      console.error('Error loading clients:', err);
      alert('Error de conexión');
    }
    setLoading(false);
  }

  async function loadMetrics(clientId: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/metrics?client_id=${clientId}`, {
        headers: { 'x-admin-key': adminKey }
      });
      const data = await res.json();
      
      if (res.ok) {
        setMetrics(data.metrics);
      }
    } catch (err) {
      console.error('Error loading metrics:', err);
    }
    setLoading(false);
  }

  async function createClient() {
    if (!newClientName.trim()) return;
    
    setLoading(true);
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: {
          'x-admin-key': adminKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: newClientName })
      });
      const data = await res.json();
      
      if (data.client) {
        const snippet = `<script src="${window.location.origin}/api/widget" data-tryon-key="${data.client.api_key}"></script>`;
        
        // Copiar al clipboard
        navigator.clipboard.writeText(snippet);
        
        alert(`✅ Cliente creado!\n\n📋 Snippet copiado al clipboard\n\nAPI Key: ${data.client.api_key}`);
        setNewClientName('');
        setShowNewClientForm(false);
        await loadClients();
      }
    } catch (err) {
      console.error('Error creating client:', err);
      alert('Error al crear cliente');
    }
    setLoading(false);
  }

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setIsAuthenticated(true);
  }

  // Login Screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-8">
        <div className="bg-slate-800 rounded-xl p-8 border border-slate-700 max-w-md w-full">
          <h1 className="text-3xl font-bold text-white mb-2">🔐 Admin Login</h1>
          <p className="text-slate-400 mb-6">Ingresa la admin key para acceder</p>
          
          <form onSubmit={handleLogin}>
            <input
              type="password"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              placeholder="Admin Key"
              className="w-full px-4 py-3 bg-slate-700 text-white rounded-lg border border-slate-600 focus:outline-none focus:border-purple-500 mb-4"
            />
            <button
              type="submit"
              className="w-full px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg font-semibold hover:scale-105 transition-transform"
            >
              Entrar
            </button>
          </form>
          
          <p className="text-slate-500 text-sm mt-4 text-center">
            Default: admin_secret_key_2024
          </p>
        </div>
      </div>
    );
  }

  const currentClient = clients.find(c => c.id === selectedClient);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              📊 TryOn Analytics
            </h1>
            <p className="text-slate-400 mt-2">Dashboard de métricas y gestión de empresas</p>
          </div>
          <button
            onClick={() => setShowNewClientForm(!showNewClientForm)}
            className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg font-semibold hover:scale-105 transition-transform"
          >
            + Nueva Empresa
          </button>
        </div>

        {/* New Client Form */}
        {showNewClientForm && (
          <div className="bg-slate-800 rounded-xl p-6 mb-6 border border-slate-700">
            <h3 className="text-xl font-bold mb-4">Crear Nueva Empresa</h3>
            <div className="flex gap-4">
              <input
                type="text"
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                placeholder="Nombre de la empresa"
                className="flex-1 px-4 py-2 bg-slate-700 rounded-lg border border-slate-600 focus:outline-none focus:border-purple-500 text-white"
              />
              <button
                onClick={createClient}
                disabled={loading || !newClientName.trim()}
                className="px-6 py-2 bg-purple-500 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-purple-600 transition-colors"
              >
                Crear
              </button>
              <button
                onClick={() => setShowNewClientForm(false)}
                className="px-6 py-2 bg-slate-600 rounded-lg font-semibold hover:bg-slate-500 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Client Selector */}
        {clients.length > 0 && (
          <div className="bg-slate-800 rounded-xl p-6 mb-6 border border-slate-700">
            <label className="block text-sm font-semibold mb-2 text-slate-300">
              Seleccionar Empresa
            </label>
            <select
              value={selectedClient || ''}
              onChange={(e) => setSelectedClient(e.target.value)}
              className="w-full px-4 py-3 bg-slate-700 text-white rounded-lg border border-slate-600 focus:outline-none focus:border-purple-500"
            >
              {clients.map(client => (
                <option key={client.id} value={client.id}>
                  {client.name} ({client.api_key})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="text-center py-12">
            <div className="inline-block w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}

        {/* No Clients */}
        {!loading && clients.length === 0 && (
          <div className="bg-slate-800 rounded-xl p-12 text-center border border-slate-700">
            <p className="text-slate-400 text-lg mb-4">No hay empresas registradas</p>
            <button
              onClick={() => setShowNewClientForm(true)}
              className="px-6 py-3 bg-purple-500 rounded-lg font-semibold hover:bg-purple-600"
            >
              Crear primera empresa
            </button>
          </div>
        )}

        {/* Metrics Display */}
        {metrics && !loading && currentClient && (
          <>
            {/* Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <MetricCard
                title="Total Requests"
                value={metrics.totalGenerations?.toLocaleString() || '0'}
                icon="📊"
                color="purple"
              />
              <MetricCard
                title="Última generación"
                value={metrics.lastGeneration ? 'Hace poco' : 'Nunca'}
                icon="⏰"
                color="green"
              />
              <MetricCard
                title="Estado"
                value="Activo"
                icon="✅"
                color="blue"
              />
              <MetricCard
                title="API Key"
                value={currentClient.api_key.slice(0, 8) + '...'}
                icon="🔑"
                color="pink"
              />
            </div>

            {/* Client Info & Snippet */}
            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
              <h3 className="text-xl font-bold mb-4">📋 Snippet de Integración</h3>
              <div className="bg-slate-900 rounded-lg p-4 border border-slate-600 relative">
                <code className="text-green-400 text-sm break-all block pr-20">
                  {`<script src="${window.location.origin}/api/widget" data-tryon-key="${currentClient.api_key}"></script>`}
                </code>
                <button
                  onClick={() => {
                    const snippet = `<script src="${window.location.origin}/api/widget" data-tryon-key="${currentClient.api_key}"></script>`;
                    navigator.clipboard.writeText(snippet);
                    alert('✅ Snippet copiado al clipboard');
                  }}
                  className="absolute top-2 right-2 px-4 py-2 bg-purple-500 rounded-lg text-sm font-semibold hover:bg-purple-600"
                >
                  Copiar
                </button>
              </div>
              
              <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-400">Nombre:</span>
                  <span className="ml-2 font-semibold">{currentClient.name}</span>
                </div>
                <div>
                  <span className="text-slate-400">API Key:</span>
                  <span className="ml-2 font-mono text-green-400">{currentClient.api_key}</span>
                </div>
                <div>
                  <span className="text-slate-400">Client ID:</span>
                  <span className="ml-2 font-mono">{currentClient.id}</span>
                </div>
                <div>
                  <span className="text-slate-400">Creado:</span>
                  <span className="ml-2">{new Date(currentClient.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MetricCard({ title, value, icon, color }: any) {
  const colorClasses: Record<string, string> = {
    purple: 'from-purple-500 to-purple-600',
    green: 'from-green-500 to-green-600',
    blue: 'from-blue-500 to-blue-600',
    pink: 'from-pink-500 to-pink-600',
  };

  return (
    <div className={`bg-gradient-to-br ${colorClasses[color]} rounded-xl p-6 shadow-lg`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-3xl">{icon}</span>
        <span className="text-sm font-semibold opacity-80">{title}</span>
      </div>
      <div className="text-3xl font-bold">{value}</div>
    </div>
  );
}
