"use client";

import dynamic from "next/dynamic";

const WagmiProvider = dynamic(
  () => import("~/components/providers/WagmiProvider"),
  {
    ssr: false,
  }
);

const WhiskSdkProvider = dynamic(
  () => import("@paperclip-labs/whisk-sdk").then(mod => mod.WhiskSdkProvider),
  {
    ssr: false,
  }
);

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider>
      <WhiskSdkProvider
        config={{
          identity: { 
            resolvers: ["base", "uni", "nns", "ens", "farcaster"],  
            overrides: {} 
          }, 
        }}
      >
        {children}
      </WhiskSdkProvider>
    </WagmiProvider>
  );
}
