import type { NextConfig } from "next";
import { configHeaders } from "./lib/security-headers";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  typedRoutes: true,
  poweredByHeader: false,
  // no floating dev badge (it overlaps the mobile CTA and the design screenshots)
  devIndicators: false,
  // the old "link to WhatsApp" step is part of /start/ready now (round plan §3 row 6); old links in chat keep working
  // the security headers on every path, as a backup to proxy.ts (which sets the same values — lib/security-headers.ts)
  async headers() {
    return configHeaders(process.env.NODE_ENV === "production");
  },
  async redirects() {
    return [{ source: "/start/link", destination: "/start/ready", permanent: false }];
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
