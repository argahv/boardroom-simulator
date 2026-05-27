import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['100.85.91.39'],
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
