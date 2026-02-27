ARG NODE_IMAGE=node:22-alpine
FROM ${NODE_IMAGE} AS base
WORKDIR /app

FROM base AS deps
COPY package*.json ./
RUN npm ci

FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
COPY docs ./docs
COPY migrations ./migrations
RUN npm run build

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN if command -v apk >/dev/null 2>&1; then \
      apk add --no-cache curl netcat-openbsd bind-tools iputils docker-cli; \
    elif command -v apt-get >/dev/null 2>&1; then \
      apt-get update && apt-get install -y --no-install-recommends curl netcat-openbsd dnsutils iputils-ping docker.io && rm -rf /var/lib/apt/lists/*; \
    else \
      echo "Unsupported base image package manager" && exit 1; \
    fi

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/docs ./docs
COPY --from=build /app/migrations ./migrations

EXPOSE 3000
CMD ["node", "dist/main.js"]
