import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.ENTREUS_NEXT_DIST_DIR || '.next',
  async headers() {
    const isolationHeaders = [
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
    ]
    return [
      { source: '/editor', headers: isolationHeaders },
      { source: '/lab/video-editor', headers: isolationHeaders },
      // Dedicated workers must inherit the editor's COEP policy on their response.
      { source: '/_next/static/chunks/:path*', headers: [
        { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
      ] },
    ]
  },
};

export default nextConfig;
