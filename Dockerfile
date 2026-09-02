# syntax=docker/dockerfile:1
FROM node:24-slim

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.25.0 --activate

# Copy the workspace and install from the frozen lockfile.
COPY . .
RUN corepack pnpm install --frozen-lockfile

# Build all workspace packages.
RUN corepack pnpm -r --workspace-concurrency=1 run build

EXPOSE 8080

CMD ["node", "packages/host-local/dist/src/hosted.js"]
