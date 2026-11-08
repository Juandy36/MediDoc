import type { NextConfig } from "next";

// URL privada del backend. Solo la lee el servidor de Next.js (sin prefijo NEXT_PUBLIC_),
// así que nunca llega al navegador.
const backendUrl = process.env.BACKEND_URL ?? "http://localhost:4000";

const csp = [
  "default-src 'self'",
  // TODO: migrar a nonces cuando la UI esté estable.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https://*.r2.cloudflarestorage.com",
  "connect-src 'self' https://*.r2.cloudflarestorage.com",
  "frame-src 'self' https://*.r2.cloudflarestorage.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return {
      // Todo /api/* va al backend; el frontend no tiene rutas de API propias.
      beforeFiles: [{ source: "/api/:path*", destination: `${backendUrl}/api/:path*` }],
      afterFiles: [],
      fallback: [],
    };
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
};

export default nextConfig;
