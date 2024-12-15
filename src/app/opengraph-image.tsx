import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "Base Wrapped 2024";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(to right, #2563eb, #7c3aed)",
          fontFamily: "system-ui"
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center"
          }}
        >
          <h1
            style={{
              fontSize: 80,
              fontWeight: 900,
              color: "white",
              marginBottom: 20,
              lineHeight: 1.1
            }}
          >
            Base Wrapped 2024
          </h1>
          <p
            style={{
              fontSize: 40,
              color: "rgba(255, 255, 255, 0.9)",
              marginTop: 0
            }}
          >
            Discover what you did onchain in 2024!
          </p>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
