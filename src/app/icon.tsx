import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          // Brand greens: rough → fairway → putting ("The Grounds" palette)
          background: "linear-gradient(135deg, #1A3A1A 0%, #2D5A27 50%, #4A7C59 100%)",
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        {/* Golf flag pole */}
        <div
          style={{
            position: "absolute",
            width: 2,
            height: 18,
            backgroundColor: "white",
            top: 4,
            left: 15,
          }}
        />
        {/* Flag */}
        <div
          style={{
            position: "absolute",
            width: 0,
            height: 0,
            borderLeft: "8px solid #FFD700",
            borderTop: "4px solid transparent",
            borderBottom: "4px solid transparent",
            top: 4,
            left: 17,
          }}
        />
        {/* Golf ball */}
        <div
          style={{
            position: "absolute",
            width: 8,
            height: 8,
            backgroundColor: "white",
            borderRadius: "50%",
            bottom: 5,
            left: 12,
          }}
        />
      </div>
    ),
    { ...size }
  );
}
