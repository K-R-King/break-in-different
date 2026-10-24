# One-shot: pushes Convex functions to the self-hosted backend, sets server env vars, seeds data.
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY convex convex
COPY shared shared
COPY scripts/generate-keys.mjs scripts/deploy.sh scripts/
CMD ["sh", "scripts/deploy.sh"]
