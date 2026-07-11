import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Photo uploads to /api/generate pass through middleware; the default 10MB
  // cap truncates the multipart body and breaks req.formData().
  experimental: {
    middlewareClientMaxBodySize: 50 * 1024 * 1024,
  },
};

export default nextConfig;
