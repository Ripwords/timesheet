FROM oven/bun:1 AS base
WORKDIR /usr/src/app

FROM base AS install
RUN mkdir -p /temp/prod
COPY package.json bun.lock /temp/prod/
WORKDIR /temp/prod
COPY apps/dashboard/package.json apps/dashboard/
COPY apps/desktop/package.json apps/desktop/
COPY apps/server/package.json apps/server/

COPY apps/server/ apps/server/
RUN bun install --frozen-lockfile --production

FROM base AS prerelease
COPY --from=install /temp/prod/node_modules /usr/src/app/node_modules
COPY --from=install /temp/prod/apps/server /usr/src/app/apps/server
WORKDIR /usr/src/app/apps/server
RUN bun run build
# Migration will run at startup via entrypoint.sh
# RUN bun run db:migrate

FROM base AS release
COPY --from=prerelease /usr/src/app/apps/server /usr/src/app/apps/server
ENV NODE_ENV=production
WORKDIR /usr/src/app/apps/server

# Copy and set executable permissions for the entrypoint script
COPY --chmod=755 ./apps/server/entrypoint.sh /usr/src/app/apps/server/entrypoint.sh

USER bun
EXPOSE 3000/tcp

# Set the entrypoint script
ENTRYPOINT ["/usr/src/app/apps/server/entrypoint.sh"]

# The command that the entrypoint script will execute after migrations
CMD ["./server"]
