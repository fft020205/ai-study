import type { NextConfig } from 'next';
import path from 'node:path';
const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../..'),
  poweredByHeader: false,
  async rewrites() { return [{ source: '/api/:path*', destination: `${process.env.API_INTERNAL_URL || 'http://127.0.0.1:18000'}/api/:path*` }]; },
  async headers() { return [{ source: '/:path*', headers: [
    { key: 'Permissions-Policy', value: 'camera=(self), microphone=()' },
    { key: 'Referrer-Policy', value: 'same-origin' },
    { key: 'X-Content-Type-Options', value: 'nosniff' }
  ] }]; }
};
export default config;
