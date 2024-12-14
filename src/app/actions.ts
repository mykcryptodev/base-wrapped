'use server';

export async function analyzeWrapped(address: string) {
  const response = await fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/analyze-wrapped`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.API_ROUTE_SECRET!,
    },
    body: JSON.stringify({ address }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch data');
  }

  return response.json();
} 