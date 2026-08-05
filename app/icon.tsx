import { ImageResponse } from "next/og";

export const alt = "iRatePilot app icon";
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "linear-gradient(145deg, #075aaa 0%, #096fd1 58%, #28a7e8 100%)",
        color: "white",
        display: "flex",
        height: "100%",
        justifyContent: "center",
        width: "100%",
      }}
    >
      <div
        style={{
          alignItems: "center",
          border: "12px solid rgba(255,255,255,0.92)",
          borderRadius: 120,
          display: "flex",
          flexDirection: "column",
          height: 330,
          justifyContent: "center",
          width: 330,
        }}
      >
        <div style={{ display: "flex", fontSize: 156, fontWeight: 700, letterSpacing: -18, lineHeight: 1 }}>iR</div>
        <div style={{ display: "flex", fontSize: 38, fontWeight: 700, letterSpacing: 12, marginLeft: 12 }}>PILOT</div>
      </div>
    </div>,
    size,
  );
}
