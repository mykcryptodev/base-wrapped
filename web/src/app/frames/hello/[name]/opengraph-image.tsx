import { ImageResponse } from "next/og";
import { getAvatar, getName } from "@paperclip-labs/whisk-sdk/identity/core";
import { isAddress } from "viem";

export const runtime = "edge";

export const alt = "Base Wrapped 2024";
export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

interface Props {
  params: {
    name: string;
  };
}

export default async function Image({ params }: Props) {
  const { name } = params;
  const avatar = await getAvatar("", { 
    address: name, 
    resolvers: ["base", "ens", "farcaster", "uni", "nns"] 
  });

  let resolvedName = await getName("", { 
    address: name, 
    resolvers: ["base", "ens", "farcaster", "uni", "nns"] 
  });

  console.log(resolvedName);
  if (!resolvedName && isAddress(name)) {
    resolvedName = name.slice(0, 6) + '...' + name.slice(-4);
  }
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          padding: '40px',
          background: 'linear-gradient(to bottom, #EFF6FF, #FFFFFF)',
          fontFamily: 'system-ui'
        }}
      >
        <img
          src={`${process.env.APP_URL}/splash.png`}
          alt="Base Wrapped Logo"
          width="128"
          height="128"
          style={{
            marginBottom: '20px'
          }}
        />
        <h1
          style={{
            display: 'flex',
            fontSize: '72px',
            fontWeight: 700,
            background: 'linear-gradient(to right, #2563EB, #7C3AED)',
            backgroundClip: 'text',
            color: 'transparent',
            margin: '0 0 20px 0',
            padding: 0,
            textAlign: 'center',
            letterSpacing: '-0.05em'
          }}
        >
          Base Wrapped 2024
        </h1>
        {avatar && 
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '100%',
            overflow: 'hidden',
          }}
        >
          <img 
            src={avatar} 
            alt="Avatar" 
            width="72px" 
            height="72px" 
            style={{
              borderRadius: '100%',
            }}
          />
        </div>}
        <p
          style={{
            display: 'flex',
            margin: 0,
            fontSize: '36px',
            color: '#4B5563',
            textAlign: 'center',
            fontWeight: 700
          }}
        >
          {resolvedName 
            ? `View ${resolvedName}'s year on Base`
            : 'Discover your onchain activity in 2024!'}
        </p>
      </div>
    ),
    {
      ...size
    }
  );
}
