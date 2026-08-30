import { ImageResponse } from "next/og";

export const alt = "agentscan — audit agent config before it fails silently";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          backgroundColor: "#1f1e1a",
          backgroundImage:
            "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(240,177,0,0.14), transparent 55%)",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 72,
            fontWeight: 600,
            letterSpacing: "-0.04em",
            color: "#f4f3ef",
          }}
        >
          agentscan
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 24,
            maxWidth: 880,
            fontSize: 32,
            lineHeight: 1.35,
            color: "#c9c6bc",
          }}
        >
          Audit agent config before it fails silently.
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 40,
            fontSize: 22,
            color: "#f0b100",
          }}
        >
          1.0.0 · 59 checks · offline on check
        </div>
      </div>
    ),
    { ...size },
  );
}
