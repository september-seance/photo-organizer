import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the sandbox's proxied browser preview to load Next's dev assets and HMR.
  allowedDevOrigins: ["*.e2b.app"],
};

export default nextConfig;
