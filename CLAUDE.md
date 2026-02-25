# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ArticleForge — internal AI article generation service for a tech blog. Ingests 1000+ reference articles for tone-of-voice matching (RAG), researches topics via multiple AI providers, generates SEO articles with images, and provides human-in-the-loop review. Russian-language PRD and UI copy; code/comments in English.

## Commands

```bash
# Infrastructure (must be running for dev)
docker compose -f docker-compose.dev.yml up -d

# API development (port 4000)
npm run dev:api

# UI development (port 3000)
npm run dev:ui

# BullMQ worker (separate process)
npm run worker:dev -w apps/api

# Database
npm run db:generate          # Generate Drizzle migrations after schema changes
npm run db:migrate           # Run migrations
npm run db:studio            # Drizzle Studio GUI
npm run db:seed -w apps/api  # Seed admin user

# Ingestion CLI (reference articles into pgvector)
npm run ingest -- --file articles.json     # Full load
npm run ingest:add -- --file new.json      # Incremental
npm run ingest:reindex                      # Rebuild chunks/embeddings
npm run ingest:stats                        # Show ingestion stats

# Build
npm run build:api
npm run build:ui
```

## Architecture

**Monorepo** with npm workspaces: `apps/api`, `apps/ui`, `packages/shared`.

### Three Runtime Processes

1. **API Server** (`apps/api/src/server.ts`) — Hono on port 4000. REST routes, SSE streams, WebSocket handlers. All `/api/*` routes require auth via `requireAuth` middleware.
2. **Worker** (`apps/api/src/worker.ts`) — BullMQ worker consuming `article-generation` queue. Runs the LangGraph pipeline. Communicates with clients indirectly through Redis PubSub → API Server → SSE/WS.
3. **UI** (`apps/ui/`) — React 19 SPA served by Vite (dev) or nginx (prod) on port 3000.

### Data Flow: Article Generation

```
UI → POST /api/generations → enqueueGeneration() → BullMQ queue
Worker picks up job → LangGraph StateGraph executes 7 nodes sequentially:
  research → rag_context → create_outline → write_sections → edit_polish → image_generate → assemble
Each node publishes progress → Redis PubSub channel `generation:{runId}`
API Server subscribes to PubSub → pushes SSE events to connected clients
Human-in-the-loop (optional): interrupt at outline/edit stages → WebSocket bidirectional
```

### Real-time: Dual Channel Design

- **SSE** (`/api/sse/generation/:runId`) — server-to-client progress updates, stage changes, completion/failure events
- **WebSocket** (`/api/ws/generation`) — bidirectional, only for human-in-the-loop review (approve/reject/edit outline or draft)

The worker never talks to clients directly. All events flow: Worker → Redis PubSub → API Server → SSE/WS → Client.

### Key Packages & Patterns

- **Drizzle ORM** with native `vector(1536)` for pgvector. Schema in `apps/api/src/db/schema.ts`. HNSW index on embeddings.
- **better-auth** for authentication. Session-based with httpOnly cookies. Roles: `admin`, `editor`, `viewer`. Config in `apps/api/src/auth/index.ts`, middleware in `apps/api/src/auth/middleware.ts`.
- **LangGraph.js** `StateGraph` for the generation pipeline. State defined via `Annotation.Root` in `apps/api/src/graph/state.ts`. Each node is a separate file in `apps/api/src/graph/nodes/`.
- **BullMQ** queue named `article-generation`. Queue config in `apps/api/src/queue/index.ts`.
- **Shared types** in `packages/shared/src/` — `types.ts` (API request/response types, enums), `events.ts` (SSE/WS event schemas, Redis channel helpers).

### UI Architecture

- **Zustand v5** stores: `auth.ts`, `generation.ts` (more planned)
- **TanStack Query v5** hooks in `apps/ui/src/api/hooks.ts`
- **Custom hooks**: `useSSE`, `useWebSocket`, `useAuth` in `apps/ui/src/hooks/`
- **shadcn/ui** components in `apps/ui/src/components/ui/`
- **React Router v7** with `AuthGuard` wrapper and `AppLayout`
- Path alias `@/` maps to `apps/ui/src/`

## Code Style

- **Functional style throughout** — no classes, no OOP
- All packages use ESM (`"type": "module"`) with `.js` extensions in imports (even for `.ts` files)
- TypeScript strict mode, target ES2022, module ESNext, bundler resolution
- Drizzle schema uses `$type<>()` for type-narrowing enum-like columns
- API routes are Hono route modules exported and mounted in `server.ts`
- Auth middleware uses `c.get('user')` / `c.get('session')` Hono variables pattern

## Environment

Requires Node.js >= 22. Copy `.env.example` to `.env`. Services: PostgreSQL 16 with pgvector, Redis 7. Uses OpenAI, Anthropic, Perplexity, Google Cloud (Imagen), and LangSmith APIs.

## Deployment (Dokploy)

Docker Compose-based deployment on Dokploy. Single domain — UI serves everything, nginx proxies `/api/*` to the API.

```bash
# Production compose (used by Dokploy)
docker-compose.yml         # Full stack with Traefik labels

# Dev compose (local only — postgres + redis)
docker-compose.dev.yml

# Post-deploy ingestion (fill RAG database with reference articles)
docker-compose.ingest.yml
```

### Dokploy Setup
1. Create a Compose project in Dokploy, connect this Git repo
2. Set environment variables in Dokploy UI (see `.env.example`)
3. Key vars: `APP_DOMAIN`, `BETTER_AUTH_SECRET`, `OPEN_ROUTER_API_KEY`, `POSTGRES_PASSWORD`
4. Deploy — Dokploy builds images, runs `migrate` init service, starts API/Worker/UI
5. The `migrate` service auto-runs DB migrations + seeds admin user on every deploy

### Post-Deploy Ingestion
```bash
# SSH into Dokploy server, cd to project dir, then:
# Place articles JSONL file somewhere accessible

# Full ingestion (1000+ articles for RAG):
ARTICLES_PATH=/path/to/articles docker compose -f docker-compose.yml -f docker-compose.ingest.yml run --rm ingest

# Check stats:
docker compose -f docker-compose.yml -f docker-compose.ingest.yml run --rm ingest \
  node dist/ingestion/cli.js --mode=stats
```
