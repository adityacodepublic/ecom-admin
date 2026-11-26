import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicPageOrAsset = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/app-icon(.*)",
  "/world-map-v1.svg",
  "/manifest.webmanifest",
  "/favicon.ico",
]);

const isPublicApiRoute = createRouteMatcher([
  "/api/agent/(.*)",
  "/api/webhook(.*)",
  "/api/stores/by-slug/(.*)",
  // The storefront's custom-domain lookups (its build and its proxy): read-only, public data.
  "/api/stores/domains",
  "/api/stores/slugs",
  "/api/stores/by-domain",
  "/api/:storeId/customer/(.*)",
]);

const isPublicStorefrontGet = createRouteMatcher([
  "/api/:storeId/categories",
  "/api/:storeId/categories/(.*)",
  "/api/:storeId/products",
  "/api/:storeId/products/(.*)",
  "/api/:storeId/filters",
  "/api/:storeId/filters/(.*)",
  "/api/:storeId/page-layouts",
  "/api/:storeId/page-layouts/(.*)",
  "/api/:storeId/order-settings",
]);

const isApiRoute = createRouteMatcher(["/api", "/api/(.*)", "/trpc", "/trpc/(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (req.method === "OPTIONS") return;
  if (isPublicPageOrAsset(req)) return;
  if (isPublicApiRoute(req)) return;
  if (req.method === "GET" && isPublicStorefrontGet(req)) return;

  if (isApiRoute(req)) {
    const { userId, sessionStatus } = await auth();
    if (!userId || sessionStatus === "pending") {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    return;
  }

  await auth.protect();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
