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

FROM base AS release
COPY --from=prerelease /usr/src/app/apps/server /usr/src/app/apps/server
ENV NODE_ENV=production
WORKDIR /usr/src/app/apps/server

USER bun
EXPOSE 3000/tcp
CMD ["./server"]
