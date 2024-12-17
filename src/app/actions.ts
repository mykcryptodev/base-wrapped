'use server';

import { isAddress, zeroAddress, isAddressEqual } from "viem";
import { getAddressFromName } from "~/lib/getAddressFromName";

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
    const statusUrl = new URL(`/api/job-status/${jobId}`, process.env.APP_URL!).toString();
    console.log('Fetching job status from:', statusUrl);
    
    const response = await fetch(statusUrl, {
      headers: {
        'x-api-key': process.env.API_ROUTE_SECRET!
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to get job status');
    }
    return await response.json();
  } catch (error) {
    console.error('Error getting job status:', error);
    throw error instanceof Error ? error : new Error('Failed to get job status');
  }
} 