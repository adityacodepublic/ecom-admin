/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: true,
  },
  images: {
    domains: [
      "res.cloudinary.com",
      "m.media-amazon.com",
      "rukmini1.flixcart.com",
    ],
  },
};

module.exports = nextConfig;
