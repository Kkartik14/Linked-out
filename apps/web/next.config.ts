import { fileURLToPath } from "node:url";
import path from "node:path";
import type { NextConfig } from "next";

// This app is its own pnpm workspace but consumes @linkedout/contracts from the
// monorepo's packages/. Pin the Turbopack root to the repo root so module
// resolution and the multi-lockfile root inference are unambiguous.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const nextConfig: NextConfig = {
  turbopack: { root: repoRoot },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cdn.linkedout.app" },
      { protocol: "https", hostname: "**.googleusercontent.com" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
    ],
  },
};

export default nextConfig;
