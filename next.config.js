/** @type {import('next').NextConfig} */
const nextConfig = {
  // The agent skill routes read agent-skills/*.md with fs at runtime.
  outputFileTracingIncludes: {
    "/api/agent/[token]/skill": ["./agent-skills/**/*"],
    "/api/agent/[token]/skill/[name]": ["./agent-skills/**/*"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
      {
        protocol: "https",
        hostname: "m.media-amazon.com",
      },
      {
        protocol: "https",
        hostname: "rukmini1.flixcart.com",
      },
      {
        protocol: "http",
        hostname: "rukmini1.flixcart.com",
      },
    ],
  },
};

module.exports = nextConfig;
