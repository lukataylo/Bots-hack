import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // native module — keep it out of the bundler, load at runtime on the server
  serverExternalPackages: ["better-sqlite3"],
  // this project is the workspace root (silence the multi-lockfile warning)
  turbopack: { root: __dirname },
};

export default nextConfig;
