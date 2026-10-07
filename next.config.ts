import path from 'path';
import type { NextConfig } from 'next';

/** This project lives in a sub-directory, so pin the trace root explicitly. */
const projectRoot = path.dirname(new URL(import.meta.url).pathname);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // three.js / drei ship untranspiled ESM helpers in some sub-paths.
  transpilePackages: ['three'],
  outputFileTracingRoot: projectRoot,
};

export default nextConfig;