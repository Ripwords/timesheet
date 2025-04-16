FROM oven/bun:1 AS base
WORKDIR /usr/src/app

FROM base AS install
RUN mkdir -p /temp/prod
COPY package.json bun.lock /temp/prod/
WORKDIR /temp/prod
COPY apps/dashboard/package.json apps/dashboard/
COPY apps/desktop/package.json apps/desktop/
COPY apps/server/package.json apps/server/

COPY apps/dashboard/ apps/dashboard/
COPY apps/server/ apps/server/
RUN bun install --frozen-lockfile --production

FROM base AS prerelease
COPY --from=install /temp/prod/node_modules /usr/src/app/node_modules
COPY --from=install /temp/prod/apps/dashboard /usr/src/app/apps/dashboard
COPY --from=install /temp/prod/apps/server /usr/src/app/apps/server
WORKDIR /usr/src/app/apps/dashboard
RUN bun run build

FROM base AS release
COPY --from=prerelease /usr/src/app/apps/dashboard /usr/src/app/apps/dashboard
COPY --from=prerelease /usr/src/app/node_modules /usr/src/app/node_modules
COPY --from=prerelease /usr/src/app/apps/dashboard/.output ./.output
WORKDIR /usr/src/app/apps/dashboard

EXPOSE 3000/tcp
ENTRYPOINT ["node", ".output/server/index.mjs"]