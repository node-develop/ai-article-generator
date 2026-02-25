FROM node:22-alpine AS base

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

RUN npm install --workspace=apps/api --workspace=packages/shared

# Copy source
COPY tsconfig.base.json ./
COPY packages/shared/ ./packages/shared/
COPY apps/api/ ./apps/api/

# Build API (tsc -b handles project references, builds shared first)
WORKDIR /app/apps/api
RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /app

# Copy root package.json for workspace resolution
COPY --from=base /app/package.json ./package.json
COPY --from=base /app/node_modules ./node_modules

# Copy compiled shared package with runtime-compatible package.json
COPY --from=base /app/packages/shared/dist ./packages/shared/dist
RUN printf '{"name":"@articleforge/shared","version":"1.0.0","type":"module","main":"./dist/index.js","exports":{".":"./dist/index.js","./types":"./dist/types.js","./events":"./dist/events.js"}}\n' > ./packages/shared/package.json

# Copy compiled API
COPY --from=base /app/apps/api/dist ./apps/api/dist
COPY --from=base /app/apps/api/drizzle ./apps/api/drizzle
COPY --from=base /app/apps/api/package.json ./apps/api/package.json

WORKDIR /app/apps/api

EXPOSE 4000

CMD ["node", "dist/server.js"]
