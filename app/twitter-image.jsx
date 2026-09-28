import { ImageResponse } from "next/og";

export const alt = "MetrixIQ — Fleet & Driver Performance Intelligence";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function TwitterImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: "linear-gradient(135deg,#071827 0%,#0b2740 100%)",
          color: "#fff",
          padding: "72px",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 34, fontWeight: 800 }}>
          Metrix<span style={{ color: "#66e3ce" }}>IQ</span>
        </div>
        <div
          style={{
            marginTop: 42,
            maxWidth: 980,
            fontSize: 70,
            lineHeight: 1.03,
            fontWeight: 800,
            letterSpacing: "-0.05em",
          }}
        >
          Fleet & driver performance intelligence.
        </div>
        <div style={{ marginTop: 28, fontSize: 28, color: "#b6c6d4", maxWidth: 920 }}>
          Turn operational data into clearer decisions, stronger coaching and better fleet performance.
        </div>
      </div>
    ),
    size
  );
}
