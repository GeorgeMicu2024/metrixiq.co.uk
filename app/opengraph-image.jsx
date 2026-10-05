import { ImageResponse } from "next/og";

export const alt = "MetrixIQ — Fleet & Driver Performance Intelligence";
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
          justifyContent: "space-between",
          background: "#071827",
          color: "#ffffff",
          padding: "64px 72px",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 58,
              height: 58,
              borderRadius: 16,
              border: "1px solid rgba(255,255,255,.18)",
              background: "#0b1f33",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#66e3ce",
              fontSize: 30,
              fontWeight: 800,
            }}
          >
            M
          </div>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 800 }}>
            Metrix<span style={{ color: "#66e3ce" }}>IQ</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", maxWidth: 950 }}>
          <div
            style={{
              color: "#66e3ce",
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            Fleet performance intelligence
          </div>
          <div
            style={{
              marginTop: 20,
              fontSize: 66,
              lineHeight: 1.04,
              fontWeight: 800,
              letterSpacing: "-0.045em",
            }}
          >
            Smarter data. Stronger teams. Better results.
          </div>
          <div
            style={{
              marginTop: 24,
              color: "#b6c6d4",
              fontSize: 26,
              lineHeight: 1.4,
            }}
          >
            Driver scorecards, compliance monitoring, coaching and operational intelligence in one workspace.
          </div>
        </div>

        <div style={{ display: "flex", gap: 28, color: "#8fa5b7", fontSize: 20 }}>
          <span>Driver performance</span>
          <span>Compliance</span>
          <span>AI insights</span>
          <span>Executive reporting</span>
        </div>
      </div>
    ),
    size
  );
}
