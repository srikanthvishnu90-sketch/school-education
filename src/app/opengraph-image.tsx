import { ImageResponse } from "next/og";

/**
 * The default social-share card for every page — so a link pasted into a district
 * email or Slack renders a real preview, not a blank box. Generated in plumb's dark
 * shell palette with the sage accent.
 */
export const alt = "plumb — honest classroom reflection";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          backgroundColor: "#121212",
          color: "#ececec",
          padding: "80px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{ height: "18px", width: "18px", borderRadius: "9999px", backgroundColor: "#8fbc9f" }} />
          <div style={{ fontSize: 34, letterSpacing: "0.24em", color: "#8e8ea0", textTransform: "uppercase" }}>
            plumb · classroom reflection
          </div>
        </div>
        <div style={{ marginTop: "36px", fontSize: 92, fontWeight: 600, lineHeight: 1.05, maxWidth: "900px" }}>
          See how the class really went.
        </div>
        <div style={{ marginTop: "28px", fontSize: 34, color: "#8e8ea0", maxWidth: "860px", lineHeight: 1.35 }}>
          Honest reflection for K-12 — private by default, task-focused, never a ranking.
        </div>
      </div>
    ),
    size,
  );
}
