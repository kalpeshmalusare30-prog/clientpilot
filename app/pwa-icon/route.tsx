import { ImageResponse } from "next/og";

export function GET(req: Request) {
  // Whole pixels only: a non-numeric or fractional size makes ImageResponse throw (500).
  const n = Math.round(Number(new URL(req.url).searchParams.get("size") ?? 512));
  const size = Math.min(1024, Math.max(48, Number.isFinite(n) ? n : 512));
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0f1c" }}>
        <div style={{ display: "flex", fontSize: Math.round(size * 0.34), fontWeight: 800, color: "#38bdf8", letterSpacing: -2 }}>CP</div>
      </div>
    ),
    { width: size, height: size },
  );
}
