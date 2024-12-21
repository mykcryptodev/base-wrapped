/* eslint-disable @typescript-eslint/no-explicit-any */
import { Metadata } from "next";
import Home from "~/components/Home";

const appUrl = process.env.APP_URL;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<any>;
}): Promise<Metadata> {
  const sParams = await searchParams;
  const address = typeof sParams?.a === 'string' ? sParams.a : 'opengraph-image';
  
  const frame = {
    version: "next",
    imageUrl: `${appUrl}/frames/hello/${address}/opengraph-image`,
    button: {
      title: "Launch Frame",
      action: {
        type: "launch_frame",
        name: "Base Wrapped 2024",
        url: `${appUrl}?a=${typeof sParams?.a === 'string' ? sParams.a : ""}`,
        splashImageUrl: `${appUrl}/splash.png`,
        splashBackgroundColor: "#f7f7f7",
      },
    },
  };

  return {
    title: `Base Wrapped 2024`,
    description: `Discover your onchain activity in 2024!`,
    openGraph: {
      title: `Base Wrapped 2024`,
      description: `Discover your onchain activity in 2024!`,
    },
    other: {
      "fc:frame": JSON.stringify(frame),
    },
  };
}

export default function Page() {
  return <Home />;
}
