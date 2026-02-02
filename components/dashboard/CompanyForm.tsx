'use client';

import { useState } from 'react';

export default function CompanyForm({ onSuccess }: { onSuccess: () => void }) {
  const [alias, setAlias] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!alias.trim() || !email.trim()) {
      alert('Por favor completa todos los campos');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: alias,
          email: email 
        }),
      });

      const data = await res.json();

      if (res.ok && data.client) {
        alert(`✅ Empresa creada!\n\nAPI Key: ${data.client.api_key}\n\nLa key ha sido copiada al portapapeles.`);
        
        // Copiar API key al clipboard
        navigator.clipboard.writeText(data.client.api_key);
        
        // Reset form
        setAlias('');
        setEmail('');
        onSuccess();
      } else {
        alert('Error: ' + (data.error || 'No se pudo crear la empresa'));
      }
    } catch (error) {
      console.error('Error creating company:', error);
      alert('Error de conexión');
    }
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-4">
      <input
        type="text"
        placeholder="Alias de empresa"
        value={alias}
        onChange={(e) => setAlias(e.target.value)}
        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        disabled={loading}
      />
      <input
        type="email"
        placeholder="Email de empresa"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        disabled={loading}
      />
      <button
        type="submit"
        disabled={loading}
        className="px-6 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? '⏳' : '+'} Generar Token
      </button>
    </form>
  );
}
