import { ImageResponse } from "next/og";

export const alt = "iRatePilot app icon";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
          border: "4px solid rgba(255,255,255,0.92)",
          borderRadius: 42,
          display: "flex",
          flexDirection: "column",
          height: 118,
          justifyContent: "center",
          width: 118,
        }}
      >
        <div style={{ display: "flex", fontSize: 56, fontWeight: 700, letterSpacing: -7, lineHeight: 1 }}>iR</div>
        <div style={{ display: "flex", fontSize: 13, fontWeight: 700, letterSpacing: 4, marginLeft: 4 }}>PILOT</div>
      </div>
    </div>,
    size,
  );
}
