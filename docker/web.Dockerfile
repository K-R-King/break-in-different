FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY public public
COPY src src
COPY shared shared
COPY convex convex
ARG VITE_CONVEX_URL=http://127.0.0.1:3210
ENV VITE_CONVEX_URL=$VITE_CONVEX_URL
RUN npx vite build

FROM nginx:1.27-alpine
# Rendered to conf.d/default.conf at start; only defined env vars (PUBLIC_HOST) are substituted, so $uri is kept.
ENV PUBLIC_HOST=127.0.0.1
COPY docker/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
