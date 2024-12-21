'use server';

import { isAddress, zeroAddress, isAddressEqual } from "viem";
import { getAddressFromName } from "~/lib/getAddressFromName";
import { headers } from 'next/headers';

export async function analyzeWrapped(address: string, pollAttempts: number = 0) {
  // Validate address
  if (!address) throw new Error('Address is required')

  if (!isAddress(address)) {
    const resolvedAddress = await getAddressFromName(address);
    address = !resolvedAddress ? address : resolvedAddress as `0x${string}`;
  }

  // Add zero address check
  if (isAddressEqual(address as `0x${string}`, zeroAddress)) {
    throw new Error('Cannot analyze zero address')
  }

  try {
    const analyzeUrl = new URL('/api/process-wrapped', process.env.APP_URL!).toString();
    const response = await fetch(analyzeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.API_ROUTE_SECRET!
      },
      body: JSON.stringify({ address, pollAttempts })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || 'Failed to analyze address');
    }

    const data = await response.json();
    console.log('Received response:', data);

    return data;
  } catch (error) {
    console.error('Analysis error:', error);
    throw error instanceof Error ? error : new Error('Failed to analyze address');
  }
}

export async function getJobStatus(address: string) {
  console.log('Fetching job status from:', `${process.env.NEXT_PUBLIC_APP_URL}/api/job-status?address=${address}`);
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL}/api/job-status?address=${address}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch job status');
  }

  return response.json();
} 