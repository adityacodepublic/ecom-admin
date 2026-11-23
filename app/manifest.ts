import type { MetadataRoute } from "next";

/**
 * The admin as an app (Install / Add to Home Screen). Installed, it opens like an app and can get web push about new
 * orders; on iPhone, push works only from the Home Screen app. Icons: app/app-icon/[file].
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Store Admin",
    short_name: "Admin",
    description: "Run your store: orders, products, quotes and insights.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0f172a",
    theme_color: "#0f172a",
    icons: [192, 512].flatMap((s) => [
      { src: `/app-icon/${s}.png`, sizes: `${s}x${s}`, type: "image/png", purpose: "any" as const },
      { src: `/app-icon/${s}.png`, sizes: `${s}x${s}`, type: "image/png", purpose: "maskable" as const },
    ]),
  };
}
