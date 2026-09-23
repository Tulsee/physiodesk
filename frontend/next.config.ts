import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Bundles a minimal server into .next/standalone for the Docker image.
  output: "standalone",
  /* config options here */
};

export default nextConfig;
