# RECORRENTE — Dockerfile multi-stage.
#
# Targets:
#   dev     → hot-reload com npm run dev / worker:dev (docker compose)
#   builder → instala deps + roda next build (standalone)
#   runner  → imagem final do Next em produção (Coolify) — roda migrate + server
#
# Para o processo de workers em produção, use Dockerfile.worker (mais enxuto).

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# ---- DEV ----
FROM base AS dev
ENV NODE_ENV=development
COPY package.json package-lock.json ./
RUN npm ci
EXPOSE 3000

# ---- BUILDER ----
# NÃO setamos NODE_ENV=production aqui: precisamos das devDeps (tailwind,
# postcss, typescript) durante o build. NODE_ENV=production só no runner.
FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY . .
RUN npm run build

# ---- RUNNER (produção web) ----
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --chown=nextjs:nodejs scripts/migrate-prod.cjs ./scripts/migrate-prod.cjs

# `pg` é externo (não bundled pelo Next standalone). Garantimos instalação
# defensiva por cima do package.json do standalone.
RUN npm install --omit=dev --no-audit --no-fund --prefix /app pg@^8 \
 && chown -R nextjs:nodejs /app/node_modules

USER nextjs
EXPOSE 3000
CMD ["sh", "-c", "node scripts/migrate-prod.cjs && node server.js"]
