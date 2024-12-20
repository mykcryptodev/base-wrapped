import { Metadata } from "next";
import App from "~/app/app";

const appUrl = process.env.APP_URL;

const frame = {
  version: "next",
  imageUrl: `${appUrl}/frames/hello/opengraph-image`,
  button: {
    title: "Launch Frame",
    action: {
      type: "launch_frame",
      name: "Base Wrapped 2024",
      url: `${appUrl}`,
      splashImageUrl: `${appUrl}/splash.png`,
      splashBackgroundColor: "#f7f7f7",
    },
  },
};

export const metadata: Metadata = {
  title: "Base Wrapped 2024",
  description: "Discover your onchain activity in 2024!",
  openGraph: {
    title: "Base Wrapped 2024",
    description: "Discover your onchain activity in 2024!",
  },
  other: {
    "fc:frame": JSON.stringify(frame),
  },
};

export default function HelloFrame() {
  return <App title={"Base Wrapped 2024"} />;
}
