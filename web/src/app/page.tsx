import { Metadata } from "next";
import Home from "~/components/Home";

const appUrl = process.env.APP_URL;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}): Promise<Metadata> {
  const address = typeof searchParams.a === 'string' ? searchParams.a : 'opengraph-image';
  
  const frame = {
    version: "next",
    imageUrl: `${appUrl}/frames/hello/${address}`,
    button: {
      title: "Launch Frame",
      action: {
        type: "launch_frame",
        name: "Base Wrapped 2024",
        url: `${appUrl}/`,
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