# Pin the runtime patch. Update deliberately alongside the lockfile and CI.
ARG NODE_IMAGE=node:22.23.1-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts/patch-vinext-image-size.mjs ./scripts/
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run check && npm run lint && npm test && npm run test:node && npm run build:node && npm run verify:node
RUN npm prune --omit=dev --no-audit --no-fund

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATA_DIR=/data
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/drizzle ./drizzle
COPY --from=build --chown=node:node /app/package.json ./package.json
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "scripts/start-node.mjs"]

# CI checks the same application and Node binary in Ubuntu 26.04 userspace.
# Production uses the smaller, pinned runtime stage above.
FROM ubuntu:26.04 AS ubuntu-test
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libstdc++6 && rm -rf /var/lib/apt/lists/*
COPY --from=runtime /usr/local /usr/local
WORKDIR /app
COPY --from=runtime /app /app
COPY --from=build /app/tests ./tests
COPY --from=build /app/deploy ./deploy
COPY --from=build /app/docs ./docs
RUN node --version && cat /etc/os-release && npm run test:node && npm run test:deploy

FROM runtime AS final
