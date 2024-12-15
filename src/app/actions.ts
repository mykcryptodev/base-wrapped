'use server';

import { isAddress, zeroAddress, isAddressEqual } from "viem";
import { getAddressFromName } from "~/lib/getAddressFromName";

export async function analyzeWrapped(address: string, pollAttempts: number = 0) {
  // Validate address
  if (!address) throw new Error('Address is required')

  if (!isAddress(address)) {
    const resolvedAddress = await getAddressFromName(address);
    address = resolvedAddress as `0x${string}`;
  }

  // Add zero address check
  if (isAddressEqual(address as `0x${string}`, zeroAddress)) {
    throw new Error('Cannot analyze zero address')
  }

  console.log('pollAttempts', pollAttempts);

  try {
    const analyzeUrl = new URL('/api/analyze-wrapped', process.env.APP_URL!).toString();
    const response = await fetch(analyzeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.API_ROUTE_SECRET!
      },
      body: JSON.stringify({ address, pollAttempts })
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