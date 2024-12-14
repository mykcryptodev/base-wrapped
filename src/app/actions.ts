'use server';

export async function analyzeWrapped(address: string) {
  // Always ensure we have a protocol in the URL
  const baseUrl = process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}` 
    : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  // Ensure baseUrl has protocol
  const apiUrl = new URL('/api/analyze-wrapped', baseUrl).toString();

  try {
    const response = await fetch(apiUrl, {
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
  } catch (error) {
    console.error('Error in analyzeWrapped:', error);
    throw new Error('Failed to analyze address. Please try again.');
  }
} 