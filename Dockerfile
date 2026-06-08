FROM oven/bun:1.2.21-alpine AS build

WORKDIR /app

COPY package.json bun.lock ./
COPY nodejs-app/package.json nodejs-app/package.json
COPY nodejs-app/client/package.json nodejs-app/client/package.json

RUN bun install --frozen-lockfile

COPY . .

RUN bun run build

FROM oven/bun:1.2.21-alpine AS runtime

WORKDIR /app/nodejs-app/client

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001
ENV NITRO_HOST=0.0.0.0
ENV NITRO_PORT=3001

COPY --from=build /app /app

RUN mkdir -p /app/nodejs-app/data/uploads /app/nodejs-app/data/cache /app/nodejs-app/data/articles /app/nodejs-app/data/reports

EXPOSE 3001

CMD ["bun", ".output/server/index.mjs"]
