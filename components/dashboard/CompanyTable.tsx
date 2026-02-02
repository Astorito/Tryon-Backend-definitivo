'use client';

import { useState } from 'react';

export default function CompanyTable({ 
  clients, 
  onUpdate 
}: { 
  clients: any[]; 
  onUpdate: () => void;
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'near-limit'>('all');

  const filteredClients = clients.filter(client => {
    // Search filter
    const matchesSearch = 
      client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (client.email && client.email.toLowerCase().includes(searchTerm.toLowerCase()));

    if (!matchesSearch) return false;

    // Status filter
    if (filter === 'active') {
      return (client.usage_count || 0) > 0;
    } else if (filter === 'near-limit') {
      const used = client.usage_count || 0;
      const limit = client.limit || 5000;
      const remaining = limit - used;
      return remaining < limit * 0.1;
    }

    return true;
  });

  function getProgressColor(used: number, limit: number): string {
    const percentage = (used / limit) * 100;
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 70) return 'bg-orange-500';
    return 'bg-green-500';
  }

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <div className="flex gap-4 items-center">
        <div className="flex-1 relative">
          <input
            type="text"
            placeholder="🔍 Buscar por nombre o email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === 'all'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Todas
          </button>
          <button
            onClick={() => setFilter('active')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === 'active'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Activas
          </button>
          <button
            onClick={() => setFilter('near-limit')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === 'near-limit'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Cerca del Límite
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 text-left">
              <th className="pb-3 text-sm font-semibold text-gray-600 uppercase">Empresa</th>
              <th className="pb-3 text-sm font-semibold text-gray-600 uppercase">Email</th>
              <th className="pb-3 text-sm font-semibold text-gray-600 uppercase text-right">Usadas</th>
              <th className="pb-3 text-sm font-semibold text-gray-600 uppercase text-right">Límite</th>
              <th className="pb-3 text-sm font-semibold text-gray-600 uppercase">Disponibles</th>
              <th className="pb-3 text-sm font-semibold text-gray-600 uppercase text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredClients.map((client) => {
              const used = client.usage_count || 0;
              const limit = client.limit || 5000;
              const remaining = limit - used;
              const percentage = (used / limit) * 100;

              return (
                <tr key={client.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-4 font-medium text-gray-900">{client.name}</td>
                  <td className="py-4 text-gray-600">{client.email || '-'}</td>
                  <td className="py-4 text-right text-gray-900">{used.toLocaleString()}</td>
                  <td className="py-4 text-right text-gray-600">{limit.toLocaleString()}</td>
                  <td className="py-4">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-gray-900 min-w-[60px]">
                        {remaining.toLocaleString()}
                      </span>
                      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden min-w-[100px]">
                        <div
                          className={`h-full ${getProgressColor(used, limit)} transition-all`}
                          style={{ width: `${Math.min(percentage, 100)}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="py-4 text-center">
                    <button
                      onClick={() => {
                        // TODO: Implementar configuración
                        alert(`Configurar: ${client.name}`);
                      }}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      ⚙️
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filteredClients.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No se encontraron empresas
          </div>
        )}
      </div>

      <div className="text-sm text-gray-600">
        Mostrando {filteredClients.length} de {clients.length} empresas
      </div>
    </div>
  );
}
