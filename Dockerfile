FROM oven/bun:1.1.38 AS builder

WORKDIR /app

COPY package.json bun.lock tsconfig.json ./
COPY src ./src

RUN bun install --frozen-lockfile
RUN bun run --filter @yousim/frontend build

FROM oven/bun:1.1.38

WORKDIR /app
ENV NODE_ENV=production

COPY package.json bun.lock tsconfig.json ./
COPY src ./src
COPY --from=builder /app/src/frontend/dist ./src/frontend/dist

RUN bun install --frozen-lockfile --production

EXPOSE 3000

CMD ["bun", "run", "--filter", "@yousim/api", "start"]
