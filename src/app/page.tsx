'use client';

import { useState } from 'react';
import { analyzeWrapped } from './actions';

export default function Home() {
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState<unknown[]>([]);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const data = await analyzeWrapped(address);
      setTransactions(data.transactions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-8">Base Wrapped 2023</h1>
        
        <form onSubmit={handleSubmit} className="mb-8">
          <div className="flex gap-4">
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Enter Ethereum address"
              className="flex-1 p-3 border rounded-lg"
            />
            <button
              type="submit"
              disabled={loading || !address}
              className="px-6 py-3 bg-blue-500 text-white rounded-lg disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Analyze'}
            </button>
          </div>
        </form>

        {error && (
          <div className="text-red-500 mb-4">
            {error}
          </div>
        )}

        {transactions.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold mb-4">Your 2024 Transactions</h2>
            <code>{JSON.stringify(transactions, null, 2)}</code>
          </div>
        )}
      </div>
    </main>
  );
}
