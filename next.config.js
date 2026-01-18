/** @type {import('next').NextConfig} */
const nextConfig = {
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
