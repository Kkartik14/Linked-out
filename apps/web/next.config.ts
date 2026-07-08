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
      { protocol: "https", hostname: "cdn.linkedout.app" }, // prod CDN (custom domain)
      { protocol: "https", hostname: "**.r2.dev" }, // R2 public dev URL (pub-<hash>.r2.dev)
      { protocol: "https", hostname: "**.googleusercontent.com" }, // Google avatars
      { protocol: "https", hostname: "avatars.githubusercontent.com" }, // GitHub avatars
    ],
  },
};

export default nextConfig;
