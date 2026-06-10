import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_WORKOS_REDIRECT_URI: process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}/callback`
      : process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI,
  },
};

export default nextConfig;
