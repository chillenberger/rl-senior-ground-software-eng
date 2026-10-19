# Build from frontend/:
#   docker build -t telemetry-dashboard .
#   docker run --rm -p 5173:5173 telemetry-dashboard
#
# API calls are proxied to the backend. The default reaches a backend
# published on the host at port 3000. On a shared Docker network:
#   docker run --rm -p 5173:5173 \
#     -e API_UPSTREAM=http://telemetry-api:3000 \
#     --network telemetry \
#     telemetry-dashboard

FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM nginx:1.28-bookworm

COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

ENV API_UPSTREAM=http://host.docker.internal:3000

EXPOSE 5173
