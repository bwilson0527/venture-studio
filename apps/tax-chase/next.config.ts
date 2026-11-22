import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@studio/core"],
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Vendor lists are uploaded through a server action.
    serverActions: { bodySizeLimit: "3mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
