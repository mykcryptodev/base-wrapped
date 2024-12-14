'use server';

export async function analyzeWrapped(address: string) {
  // Validate address
  if (!address) throw new Error('Address is required')

  try {
    const analyzeUrl = new URL('/api/analyze-wrapped', process.env.APP_URL!).toString();
    const response = await fetch(analyzeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.API_ROUTE_SECRET!
      },
      body: JSON.stringify({ address })
    })

    if (!response.ok) {
      throw new Error('Failed to analyze address')
    }

    return await response.json()
  } catch (error) {
    console.error('Analysis error:', error)
    throw new Error('Failed to analyze address')
  }
} 