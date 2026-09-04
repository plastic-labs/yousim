FROM oven/bun:1.1.38 AS builder

WORKDIR /app

COPY package.json bun.lock tsconfig.json ./
COPY src ./src

RUN bun install --frozen-lockfile
RUN bun run --filter @yousim/web build

FROM oven/bun:1.1.38

WORKDIR /app
ENV NODE_ENV=production
# The server binds loopback by default; a published port cannot reach that from
# outside the container.
ENV HOST=0.0.0.0

COPY package.json bun.lock tsconfig.json ./
COPY src ./src
COPY --from=builder /app/src/web/dist ./src/web/dist

RUN bun install --frozen-lockfile --production

EXPOSE 3000

CMD ["bun", "run", "--filter", "@yousim/api", "start"]
