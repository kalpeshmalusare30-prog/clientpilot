import { ImageResponse } from "next/og";
import { iconSize } from "@/lib/pwa-icon";

export function GET(req: Request) {
  // Fixed sizes only (other query params are ignored): an outsider cannot force a new render per ?size= value.
  const size = iconSize(new URL(req.url).searchParams.get("size"));
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0f1c" }}>
        <div style={{ display: "flex", fontSize: Math.round(size * 0.34), fontWeight: 800, color: "#38bdf8", letterSpacing: -2 }}>CP</div>
      </div>
    ),
    { width: size, height: size },
  );
}
