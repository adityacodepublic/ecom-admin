import { authMiddleware } from "@clerk/nextjs";
import { NextFetchEvent, NextRequest, NextResponse } from "next/server";
import { getAllowedDomains } from "@/lib/_allowedDomains/domains";

export default async function combinedMiddleware(
  req: NextRequest,
  ev: NextFetchEvent
) {
  if (process.env.NODE_ENV === "production") {
    const allowedDomains = getAllowedDomains();
    const origin = req.headers.get("origin");
    const storeId = req.nextUrl.pathname.split("/")[2];

    const isAllowed = allowedDomains.some((entry) => {
      return entry.domain === origin && entry.storeId === storeId;
    });

    if (req.url.includes("/api/")) {
      if ((origin && !isAllowed) || !origin) {
        //
        console.log("returned");
        console.log(origin);
        return new NextResponse(null, {
          status: 400,
          statusText: "Bad Request",
          headers: {
            "Content-Type": "text/plain",
          },
        });
      }
    }
  }

  const authResponse = await authMiddleware({
    publicRoutes: ["/api/:path*", "/sign-in", "sign-up"],
  })(req, ev);
  return authResponse;
}

// Middleware configuration
export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
