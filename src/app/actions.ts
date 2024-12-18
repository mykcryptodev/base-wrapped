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
    const analyzeUrl = new URL('/api/analyze-wrapped', process.env.APP_URL!).toString();
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

    // If we get a job ID back, store it in localStorage
    if (data.jobId && typeof window !== 'undefined') {
      localStorage.setItem(`analysis_job_${address?.toLowerCase() ?? ''}`, data.jobId);
    }

    return data;
  } catch (error) {
    console.error('Analysis error:', error);
    throw error instanceof Error ? error : new Error('Failed to analyze address');
  }
}

export async function getJobStatus(jobId: string) {
  try {
    // Get the host from headers
    const headersList = await headers();
    const host = headersList.get('host');
    const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
    const baseUrl = `${protocol}://${host}`;
    
    console.log('Fetching job status from:', `${baseUrl}/api/job-status/${jobId}`);

    const response = await fetch(`${baseUrl}/api/job-status/${jobId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      // Add next config to handle server-side fetch
      next: { revalidate: 0 }
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to get job status');
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting job status:', error);
    throw error;
  }
} 