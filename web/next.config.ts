import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    '192.168.1.20',
    'desktop-jb2ntpf.tail961410.ts.net',
  ],
  async rewrites() {
    const apiBase = process.env.INTERNAL_API_URL || "http://localhost:8000";
    return [
      {
        source: "/api/:path*",
        destination: `${apiBase}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
