/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    // tRPC v11 envia algumas classes do server adapter; mantém esses pacotes
    // como server-only para evitar bundling acidental no client.
    serverComponentsExternalPackages: [
      "pg",
      "bullmq",
      "ioredis",
      "@anthropic-ai/sdk",
      "pino",
      "pino-pretty",
    ],
  },
};

export default nextConfig;
