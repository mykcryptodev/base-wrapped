import { createThirdwebClient } from 'thirdweb';
import { base, mainnet } from 'thirdweb/chains';
import {
  resolveAddress,
  BASENAME_RESOLVER_ADDRESS,
} from "thirdweb/extensions/ens";
import { isAddressEqual, zeroAddress } from 'viem';

const thirdwebClient = createThirdwebClient({
  clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID!,
});

export async function getAddressFromName(name: string) {
  let resolvedAddress = null;
  // lowercase the name
  name = name.toLowerCase();
  try {
    resolvedAddress = await resolveAddressOnBase(name);
  } catch (error) {
    console.error('Error resolving address on Base:', error);
  }
  if (isAddressEqual(resolvedAddress as `0x${string}`, zeroAddress)) {
    try {
      resolvedAddress = await resolveAddressOnEthereum(name);
    } catch (error) {
      console.error('Error resolving address on Ethereum:', error);
    }
  }
  if (isAddressEqual(resolvedAddress as `0x${string}`, zeroAddress)) {
    throw new Error('Failed to resolve address');
  }
  return resolvedAddress;
}

async function resolveAddressOnBase(name: string) {
  const resolved = await resolveAddress({
    name,
    client: thirdwebClient,
    resolverChain: base,
    resolverAddress: BASENAME_RESOLVER_ADDRESS,
  });
  return resolved;
}

async function resolveAddressOnEthereum(name: string) {
  const resolved = await resolveAddress({
    name,
    client: thirdwebClient,
    resolverChain: mainnet,
  });
  return resolved;
}