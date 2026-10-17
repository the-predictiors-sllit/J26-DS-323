import type { NextConfig } from "next";

// The FastAPI Backend (Application/Backend). The browser calls /api/v1/... on this site and Next.js
// forwards those calls to the Backend, so the Backend needs no CORS settings.
// Change the address with BACKEND_URL in .env.local (it is read when `npm run dev` starts).
const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${BACKEND_URL}/api/v1/:path*` }];
  },
};

export default nextConfig;
