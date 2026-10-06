import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Run Next's helper workers (e.g. the dev-server check for dynamic routes like /chats/[id])
    // as worker threads instead of forked child processes. Some Windows setups (IDE terminals,
    // sandboxes) put the dev server in a job object that forbids spawning children, which made
    // opening a chat fail with "Jest worker encountered 2 child process exceptions".
    workerThreads: true,
  },
};

export default nextConfig;
