'use server';

import { resolveAddress, BASENAME_RESOLVER_ADDRESS } from "thirdweb/extensions/ens";
import { createThirdwebClient } from "thirdweb";
import { isAddress, zeroAddress, isAddressEqual } from "viem";
import { base } from "thirdweb/chains";

const thirdwebClient = createThirdwebClient({
  clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID!,
});

export async function analyzeWrapped(address: string) {
  // Validate address
  if (!address) throw new Error('Address is required')

  // Add zero address check
  if (isAddressEqual(address as `0x${string}`, zeroAddress)) {
    throw new Error('Cannot analyze zero address')
  }

  if (!isAddress(address)) {
    const resolvedAddress = await resolveAddress({
      name: address,
      client: thirdwebClient,
      resolverChain: base,
      resolverAddress: BASENAME_RESOLVER_ADDRESS,
    });
    address = resolvedAddress as `0x${string}`;
  }

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