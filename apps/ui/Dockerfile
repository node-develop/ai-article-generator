FROM node:22-alpine AS base

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
COPY apps/ui/package.json ./apps/ui/
COPY packages/shared/package.json ./packages/shared/

RUN npm install --workspace=apps/ui --workspace=packages/shared

# Copy source
COPY packages/shared/ ./packages/shared/
COPY apps/ui/ ./apps/ui/

# Build
WORKDIR /app/apps/ui
RUN npm run build

FROM nginx:alpine AS runner

COPY --from=base /app/apps/ui/dist /usr/share/nginx/html
COPY apps/ui/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
