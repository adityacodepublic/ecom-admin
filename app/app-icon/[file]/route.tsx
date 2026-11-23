import { ImageResponse } from "next/og";

/** The admin's app icon (Install / Add to Home Screen, notifications): a shop on a dark square. 180.png, 192.png or 512.png. */
const SIZES = [180, 192, 512];

export const dynamic = "force-static";
export const generateStaticParams = () => SIZES.map((s) => ({ file: `${s}.png` }));

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const size = Number((await params).file.replace(/\.png$/, ""));
  if (!SIZES.includes(size)) return new Response("Not found", { status: 404 });
  const glyph = Math.round(size * 0.56); // a margin, so a round (maskable) cut keeps the whole shop
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f172a" }}>
        <svg width={glyph} height={glyph} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7" />
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
          <path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4" />
          <path d="M2 7h20" />
          <path d="M22 7v3a2 2 0 0 1-2 2a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7" />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
