# Production web image: the built React app served by Caddy, which is also
# the deployment's reverse proxy (deploy/docker/Caddyfile).
#
#   docker build -f deploy/docker/web.Dockerfile -t tersect-web .
FROM node:26-bookworm-slim AS build
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
# vite.config.ts reads the base path from ../tbconfig.json and writes the
# build to ../dist/frontend.
COPY tbconfig.example.json /src/tbconfig.json
COPY web /src/web
RUN npm run build

FROM caddy:2.10-alpine
COPY deploy/docker/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /src/dist/frontend /srv/app
RUN mkdir -p /etc/caddy/site.d && caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
EXPOSE 80 443
