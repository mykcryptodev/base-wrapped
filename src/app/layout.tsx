import type { Metadata } from "next";

import "~/app/globals.css";
import { Providers } from "~/app/providers";

export const metadata: Metadata = {
  title: "Base Wrapped 2024",
  description: "Discover what you did onchain in 2024!",
  metadataBase: new URL(process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'),
  openGraph: {
    title: "Base Wrapped 2024",
    description: "Discover what you did onchain in 2024!",
    type: "website",
    siteName: "Base Wrapped 2024",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Base Wrapped 2024"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "Base Wrapped 2024",
    description: "Discover what you did onchain in 2024!",
    images: ["/og-image.png"]
  },
  robots: {
    index: true,
    follow: true
  },
  alternates: {
    canonical: "/"
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
