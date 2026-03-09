import type { NextConfig } from "next";

const envAllowedDevOrigins = process.env.NEXT_ALLOWED_DEV_ORIGINS
  ?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  allowedDevOrigins: envAllowedDevOrigins?.length
    ? envAllowedDevOrigins
    : [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://192.168.1.251:3000",
      ],
};

export default nextConfig;
