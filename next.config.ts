import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: `${process.env.VERCEL_BLOB_STORE}.public.blob.vercel-storage.com`,
        port: '',
      },
    ],
  },
};

export default nextConfig;
