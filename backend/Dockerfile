# Build from backend/:
#   docker build -t telemetry-api .
#   docker run --rm -p 3000:3000 telemetry-api
#
# The default database is in-memory. To keep data on a volume:
#   docker run --rm -p 3000:3000 \
#     -e SQLITE_PATH=/data/telemetry.sqlite \
#     -v telemetry-data:/data \
#     telemetry-api

FROM node:22-bookworm-slim AS build

WORKDIR /app

# better-sqlite3 compiles a native addon when a prebuild is unavailable.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build:ts

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

COPY package.json package-lock.json ./
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && npm ci --omit=dev \
  && apt-get purge -y --auto-remove python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/dist ./dist

# Writable location for an optional file-backed database (SQLITE_PATH).
RUN mkdir -p /data && chown node:node /data

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# npm start rebuilds with tsc, which is a devDependency and is not installed here.
# Bind to 0.0.0.0 so the port published by Docker is reachable from the host.
CMD ["node", "node_modules/fastify-cli/cli.js", "start", "-l", "info", "-a", "0.0.0.0", "-p", "3000", "dist/app.js"]
