# PRD: AI Article Generation Service (MVP) v3

---

## 1. Обзор продукта

Внутренний сервис автоматической генерации SEO-статей и иллюстраций для технологического блога компании. Система выдерживает tone of voice на основе 1000+ существующих статей, проводит исследование темы через несколько AI-провайдеров, генерирует текст и изображения, предоставляет UI для управления промптами на каждом этапе.

**Тип продукта**: Internal tool, мульти-юзер (3-10 пользователей).

---

## 2. Стек технологий

| Компонент | Технология | Версия | Обоснование |
|-----------|-----------|--------|-------------|
| Оркестрация | LangGraph.js | latest | StateGraph, PostgresSaver, human-in-the-loop via interrupt |
| LLM-абстракция | LangChain.js | latest | Unified интерфейс к провайдерам |
| Observability | LangSmith | — | Трейсинг, eval, prompt versioning |
| Runtime | Node.js 22 + TypeScript 5.x | — | |
| Backend API | Hono | latest | Lightweight, WebSocket support из коробки |
| Real-time | **SSE + WebSocket** (Hono built-in) | — | **см. секцию 6** |
| База данных | PostgreSQL 16 + pgvector | — | Единая БД: данные + vectors + auth |
| ORM | Drizzle ORM | latest | Native pgvector support |
| Очереди | BullMQ + Redis 7 | latest | Async pipeline, job progress events |
| Auth | **better-auth** | latest | **см. секцию 5** |
| UI Framework | React 19 + Vite 6 | — | SPA, internal tool |
| UI State | Zustand v5 | — | Minimal boilerplate |
| UI Data | TanStack Query v5 | — | Fetch, cache, polling |
| UI Components | shadcn/ui + Tailwind CSS 4 | — | Быстрая сборка |
| Research | Perplexity API, Claude API, OpenAI API | — | Мульти-провайдер |
| Image Gen | Google Imagen 3 (Vertex AI) | — | Fallback: DALL-E 3 |
| Деплой | Docker → Dokploy | — | Контейнеризация |

### Почему Drizzle, а не Prisma

Для RAG-проекта с pgvector:

**Drizzle** — нативный тип `vector()`, `cosineDistance()`, HNSW-индексы в schema.
**Prisma** — `Unsupported("vector")` + raw SQL для всех vector-операций.

На проекте, где 50%+ запросов — vector search, Drizzle даёт лучший DX.

### Почему Hono, а не Express

- Встроенная поддержка WebSocket (через `hono/ws`)
- SSE helper из коробки (`hono/streaming`)
- Быстрее Express, типобезопасный
- Middleware для auth, CORS, validation — всё есть
- Один фреймворк для REST + SSE + WS

---

## 3. Архитектура системы

### 3.1. Высокоуровневая схема

```
┌──────────────────────────────────────────────────────────────┐
│                     React SPA (Vite)                         │
│                                                              │
│  Zustand stores ←→ TanStack Query ←→ REST API               │
│                         ↕                                    │
│               EventSource (SSE) — progress updates           │
│               WebSocket — human-in-the-loop actions          │
└──────────────────────┬──────┬────────────────────────────────┘
                       │      │
          REST/SSE ────┘      └──── WebSocket
                       │      │
┌──────────────────────▼──────▼────────────────────────────────┐
│                    Hono API Server                            │
│                                                              │
│  REST routes        SSE streams       WebSocket handlers     │
│  /api/*             /api/sse/*        /api/ws/generation     │
│                                                              │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐     │
│  │ better-auth │  │ SSE Manager  │  │   WS Manager    │     │
│  │ (sessions)  │  │ (per-user    │  │ (per-generation  │     │
│  │             │  │  channels)   │  │  rooms)         │     │
│  └─────────────┘  └──────────────┘  └─────────────────┘     │
└──────────────────────────┬───────────────────────────────────┘
                           │
        ┌──────────────────▼──────────────────┐
        │       BullMQ Worker Process          │
        │                                      │
        │  LangGraph StateGraph                │
        │  + PostgresSaver checkpointer        │
        │  + interrupt() for human-in-the-loop │
        │                                      │
        │  Progress → Redis PubSub → SSE       │
        │  Interrupt → Redis PubSub → WS       │
        └──────────────────┬───────────────────┘
                           │
        ┌──────────────────▼──────────────────┐
        │            Data Layer                │
        │  ┌────────────┐  ┌───────────────┐  │
        │  │ PostgreSQL  │  │    Redis      │  │
        │  │ + pgvector  │  │ BullMQ queues │  │
        │  │ + Drizzle   │  │ PubSub events │  │
        │  │ + auth data │  │              │  │
        │  └────────────┘  └───────────────┘  │
        └─────────────────────────────────────┘
```

### 3.2. Деплой — контейнеры

```yaml
services:
  api:
    build: ./apps/api
    ports: ["4000:4000"]
    env_file: .env
    depends_on: [postgres, redis]

  ui:
    build: ./apps/ui
    ports: ["3000:80"]

  worker:
    build: ./apps/api
    command: node dist/worker.js
    env_file: .env
    depends_on: [postgres, redis]

  postgres:
    image: pgvector/pgvector:pg16
    volumes: ["pgdata:/var/lib/postgresql/data"]

  redis:
    image: redis:7-alpine
    volumes: ["redisdata:/data"]
```

### 3.3. Структура монорепо

```
articleforge/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── server.ts           # Hono app entry
│   │   │   ├── worker.ts           # BullMQ worker entry
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts         # better-auth routes
│   │   │   │   ├── articles.ts
│   │   │   │   ├── prompts.ts
│   │   │   │   ├── generations.ts
│   │   │   │   ├── settings.ts
│   │   │   │   └── stats.ts
│   │   │   ├── realtime/
│   │   │   │   ├── sse.ts          # SSE manager + endpoints
│   │   │   │   ├── ws.ts           # WebSocket handlers
│   │   │   │   └── pubsub.ts       # Redis PubSub bridge
│   │   │   ├── graph/
│   │   │   │   ├── state.ts        # GenerationState type
│   │   │   │   ├── graph.ts        # StateGraph definition
│   │   │   │   ├── nodes/          # Один файл на node
│   │   │   │   └── prompts.ts      # Prompt loader from DB
│   │   │   ├── rag/
│   │   │   │   ├── retrieval.ts    # Vector search
│   │   │   │   └── embeddings.ts   # Embedding generation
│   │   │   ├── ingestion/
│   │   │   │   ├── cli.ts          # CLI entry
│   │   │   │   ├── parse.ts
│   │   │   │   ├── clean.ts
│   │   │   │   ├── classify.ts
│   │   │   │   ├── chunk.ts
│   │   │   │   └── embed.ts
│   │   │   ├── auth/
│   │   │   │   └── index.ts        # better-auth config
│   │   │   ├── db/
│   │   │   │   ├── schema.ts       # Drizzle schema (all tables)
│   │   │   │   ├── migrate.ts
│   │   │   │   └── index.ts        # DB client
│   │   │   └── lib/
│   │   │       ├── costs.ts        # Token/cost calculation
│   │   │       └── errors.ts
│   │   ├── drizzle/                # Migration files
│   │   ├── Dockerfile
│   │   └── package.json
│   └── ui/
│       ├── src/
│       │   ├── stores/
│       │   │   ├── auth.ts         # User session
│       │   │   ├── generation.ts   # Generations + SSE state
│       │   │   ├── prompts.ts
│       │   │   ├── settings.ts
│       │   │   └── articles.ts
│       │   ├── hooks/
│       │   │   ├── useSSE.ts       # SSE connection hook
│       │   │   ├── useWebSocket.ts # WS connection hook
│       │   │   └── useAuth.ts      # Auth hook (better-auth client)
│       │   ├── pages/
│       │   ├── components/
│       │   ├── api/                # TanStack Query hooks
│       │   └── App.tsx
│       ├── Dockerfile
│       └── package.json
├── packages/
│   └── shared/                     # Shared types, event schemas
│       ├── types.ts
│       └── events.ts               # SSE/WS event type definitions
├── docker-compose.yml
└── package.json
```

---

## 4. LangGraph — граф генерации

```
                    ┌──────────┐
                    │  START   │
                    └────┬─────┘
                         │
                    ┌────▼─────┐
                    │ RESEARCH │  → SSE: progress, источники найдены
                    └────┬─────┘
                         │
                    ┌────▼─────┐
                    │  RAG     │  → SSE: найдено N релевантных чанков
                    │ CONTEXT  │
                    └────┬─────┘
                         │
                    ┌────▼──────┐
                    │ OUTLINE   │  → SSE: outline ready
                    │           │  → WS: interrupt() — пользователь
                    │ [REVIEW?] │    может одобрить/изменить outline
                    └────┬──────┘
                         │
                    ┌────▼─────┐
                    │  WRITE   │  → SSE: section 1/5 done, 2/5...
                    │ SECTIONS │
                    └────┬─────┘
                         │
                    ┌────▼──────┐
                    │  EDIT     │  → SSE: editing complete
                    │ & POLISH  │  → WS: interrupt() — пользователь
                    │ [REVIEW?] │    может одобрить/запросить правки
                    └────┬──────┘
                         │
                    ┌────▼──────┐
                    │  IMAGE    │  → SSE: image 1/3 generated...
                    │ GENERATE  │
                    └────┬──────┘
                         │
                    ┌────▼─────┐
                    │ ASSEMBLE │  → SSE: complete
                    └────┬─────┘
                         │
                    ┌────▼─────┐
                    │   END    │
                    └──────────┘
```

**Human-in-the-loop** (опционально, настраивается per-generation):

- После OUTLINE: пользователь может просмотреть структуру, одобрить или скорректировать
- После EDIT: пользователь может просмотреть финальный текст перед генерацией картинок
- LangGraph `interrupt()` ставит граф на паузу, PostgresSaver сохраняет state
- Пользователь отвечает через WebSocket → граф продолжает
- Если review выключен — граф идёт без остановок

---

## 5. Аутентификация и мульти-юзер

### 5.1. Почему better-auth

- Self-hosted, PostgreSQL из коробки (та же БД)
- Email/password + invite-only registration
- Session management с cookie/token
- Drizzle adapter доступен
- Простая интеграция: один middleware для Hono
- Для 3-10 юзеров — идеально, без overhead OAuth-провайдеров

### 5.2. Auth Flow

```
1. Admin создаёт invite-ссылку (или seed-скрипт при деплое)
2. Пользователь регистрируется по invite (email + password)
3. Login → session token (httpOnly cookie)
4. Все API routes защищены middleware: req → session → user_id
5. SSE/WS подключения авторизуются тем же session token
```

### 5.3. Роли (MVP — простая модель)

```
admin   — всё: управление юзерами, настройки, промпты, генерация
editor  — генерация статей, просмотр своих статей, редактирование промптов
viewer  — только просмотр статей (read-only)
```

Для MVP достаточно: admin (1) + editor (2-9).

### 5.4. User-scoped данные

Каждый пользователь видит:
- **Свои генерации** — запущенные им
- **Свои статьи** — результаты его генераций
- **Общую библиотеку** — эталонные (reference) статьи видны всем
- **Свою статистику** — сколько статей, токенов, расходов

Admin видит:
- **Все генерации** всех пользователей
- **Общую статистику** по всем пользователям
- **Управление промптами** и настройками (для всех)

---

## 6. Real-time: SSE + WebSocket

### 6.1. Почему два канала, а не один

| | SSE | WebSocket |
|---|---|---|
| Направление | Server → Client (односторонний) | Двусторонний |
| Для чего | Progress updates, логи этапов | Human-in-the-loop actions |
| Когда | Постоянно во время генерации | Только на interrupt-этапах |
| Reconnect | Встроенный (EventSource API) | Ручной (но редко нужен) |
| Нагрузка | Минимальная | Чуть больше, но только по требованию |

**SSE** — основной канал. Прогресс генерации, смена этапов, логи, ошибки.
**WebSocket** — только для interactive stages: одобрение outline, правки текста.

### 6.2. Архитектура real-time

```
                    BullMQ Worker
                         │
                    (LangGraph node завершён)
                         │
                    Redis PubSub
                    channel: generation:{run_id}
                         │
                    ┌────▼─────┐
                    │ API Server│
                    │          │
              ┌─────┤  PubSub  ├─────┐
              │     │ Listener │     │
              │     └──────────┘     │
              ▼                      ▼
         SSE Stream              WebSocket
    (all connected clients   (client in review
     watching this run)       mode on this run)
```

**Worker** не общается с клиентами напрямую. Worker публикует события
в Redis PubSub. API Server подписан на эти каналы и раздаёт клиентам.

### 6.3. SSE Events (Server → Client)

```typescript
// packages/shared/events.ts

type SSEEvent =
  | { type: 'stage:started';    stage: string; timestamp: string }
  | { type: 'stage:progress';   stage: string; message: string; percent?: number }
  | { type: 'stage:completed';  stage: string; duration_ms: number; tokens?: number }
  | { type: 'stage:failed';     stage: string; error: string }
  | { type: 'generation:completed'; article_id: string }
  | { type: 'generation:failed';    error: string }
  | { type: 'interrupt:waiting';    stage: string; data: any }
  // data = outline JSON или draft text для review
```

### 6.4. WebSocket Messages (Bidirectional)

```typescript
// Client → Server
type WSClientMessage =
  | { action: 'approve'; run_id: string; stage: string }
  | { action: 'reject';  run_id: string; stage: string; feedback: string }
  | { action: 'edit';    run_id: string; stage: string; updated_data: any }

// Server → Client
type WSServerMessage =
  | { type: 'interrupt:request'; run_id: string; stage: string; data: any }
  | { type: 'interrupt:resumed'; run_id: string; stage: string }
  | { type: 'error'; message: string }
```

### 6.5. Client-side hooks

```
useSSE(runId)       — подключается к /api/sse/generation/{runId}
                      обновляет Zustand store (stages progress)
                      auto-reconnect через EventSource API

useWebSocket(runId) — подключается к /api/ws/generation
                      слушает interrupt:request
                      отправляет approve/reject/edit
                      активен только когда генерация в interrupt-состоянии
```

---

## 7. Модель данных (Drizzle + PostgreSQL + pgvector)

### 7.1. Schema

```
── users ─────────────────────────────────────────────────
  id              TEXT PK                -- better-auth managed
  name            TEXT NOT NULL
  email           TEXT UNIQUE NOT NULL
  email_verified  BOOLEAN DEFAULT false
  image           TEXT
  role            TEXT DEFAULT 'editor'  -- 'admin' | 'editor' | 'viewer'
  created_at      TIMESTAMPTZ DEFAULT now()
  updated_at      TIMESTAMPTZ DEFAULT now()

── sessions ──────────────────────────────────────────────
  id              TEXT PK                -- better-auth managed
  user_id         TEXT FK → users
  token           TEXT UNIQUE NOT NULL
  expires_at      TIMESTAMPTZ NOT NULL
  ip_address      TEXT
  user_agent      TEXT
  created_at      TIMESTAMPTZ DEFAULT now()
  updated_at      TIMESTAMPTZ DEFAULT now()

── accounts ──────────────────────────────────────────────
  id              TEXT PK                -- better-auth managed
  user_id         TEXT FK → users
  account_id      TEXT NOT NULL
  provider_id     TEXT NOT NULL          -- 'credential' для email/password
  ...                                    -- better-auth standard fields

── articles ──────────────────────────────────────────────
  id              UUID PK DEFAULT gen_random_uuid()
  source_url      TEXT UNIQUE
  title           TEXT NOT NULL
  published_at    TIMESTAMPTZ
  hubs            TEXT[]
  raw_text        TEXT NOT NULL
  clean_text      TEXT NOT NULL
  char_count      INT
  content_type    TEXT NOT NULL          -- 'review'|'tutorial'|'longread'|'news'
  metadata        JSONB DEFAULT '{}'
  is_reference    BOOLEAN DEFAULT true   -- true = эталонная, false = сгенерированная
  created_by      TEXT FK → users        -- NULL для reference, user_id для generated
  created_at      TIMESTAMPTZ DEFAULT now()
  updated_at      TIMESTAMPTZ DEFAULT now()

── article_chunks ────────────────────────────────────────
  id              UUID PK DEFAULT gen_random_uuid()
  article_id      UUID FK → articles ON DELETE CASCADE
  chunk_index     INT NOT NULL
  chunk_text      TEXT NOT NULL
  embedding       VECTOR(1536)
  section_title   TEXT
  token_count     INT
  created_at      TIMESTAMPTZ DEFAULT now()

  INDEX embedding_idx USING hnsw (embedding vector_cosine_ops)
  INDEX article_id_idx ON article_id

── prompts ───────────────────────────────────────────────
  id              UUID PK DEFAULT gen_random_uuid()
  stage           TEXT NOT NULL
  name            TEXT NOT NULL
  template        TEXT NOT NULL
  version         INT DEFAULT 1
  is_active       BOOLEAN DEFAULT true
  created_by      TEXT FK → users        -- кто создал/изменил
  created_at      TIMESTAMPTZ DEFAULT now()

  UNIQUE (stage, version)

── generation_runs ───────────────────────────────────────
  id              UUID PK DEFAULT gen_random_uuid()
  user_id         TEXT FK → users NOT NULL   ← кто запустил
  topic           TEXT NOT NULL
  input_url       TEXT
  company_links   TEXT[]
  target_keywords TEXT[]
  enable_review   BOOLEAN DEFAULT false      ← human-in-the-loop вкл/выкл
  status          TEXT DEFAULT 'pending'
    -- pending | research | outline | outline_review |
    -- writing | editing | edit_review |
    -- images | assembling | completed | failed
  current_stage   TEXT
  result_article_id UUID FK → articles
  langsmith_trace_url TEXT
  stages_log      JSONB DEFAULT '[]'
    -- [{stage, status, started_at, completed_at, tokens_used, cost_usd}]
  error_message   TEXT
  total_tokens    INT DEFAULT 0
  total_cost_usd  DECIMAL(10,4) DEFAULT 0
  created_at      TIMESTAMPTZ DEFAULT now()
  completed_at    TIMESTAMPTZ

  INDEX user_id_idx ON user_id
  INDEX status_idx ON status

── generated_images ──────────────────────────────────────
  id              UUID PK DEFAULT gen_random_uuid()
  run_id          UUID FK → generation_runs ON DELETE CASCADE
  prompt_used     TEXT NOT NULL
  image_url       TEXT NOT NULL
  position        TEXT
  width           INT
  height          INT
  created_at      TIMESTAMPTZ DEFAULT now()

── user_stats_cache ──────────────────────────────────────
  user_id              TEXT FK → users PK
  total_generations    INT DEFAULT 0
  completed_generations INT DEFAULT 0
  failed_generations   INT DEFAULT 0
  total_articles       INT DEFAULT 0
  total_tokens_used    BIGINT DEFAULT 0
  total_cost_usd       DECIMAL(12,4) DEFAULT 0
  last_generation_at   TIMESTAMPTZ
  updated_at           TIMESTAMPTZ DEFAULT now()

  -- Обновляется триггером или при завершении generation_run

── settings ──────────────────────────────────────────────
  id              UUID PK DEFAULT gen_random_uuid()
  key             TEXT UNIQUE NOT NULL
  value           JSONB NOT NULL
  updated_by      TEXT FK → users
  updated_at      TIMESTAMPTZ DEFAULT now()
```

### 7.2. Связи

```
users 1 ←──── N generation_runs     (user_id: кто запустил)
users 1 ←──── N articles            (created_by: кто сгенерировал)
users 1 ←──── 1 user_stats_cache    (агрегированная статистика)
users 1 ←──── N prompts             (created_by: кто изменил)
articles 1 ←──── N article_chunks
generation_runs 1 ←──── N generated_images
generation_runs N ───→ 1 articles    (result_article_id)
```

---

## 8. Ingestion Pipeline

**Отдельный CLI-скрипт**, не часть LangGraph.

### 8.1. Формат входных данных

```json
{
  "url": "https://habr.com/ru/companies/selectel/articles/996934/",
  "title": "Пять мини-ПК начала 2026 года...",
  "date": "2026-02-17T11:30:21.000Z",
  "hubs": [],
  "text": "В этой подборке...",
  "char_count": 7990
}
```

### 8.2. Pipeline

```
JSON file → PARSE → CLEAN → CLASSIFY → CHUNK → EMBED → STORE
```

- **PARSE**: валидация, маппинг, дедупликация по source_url
- **CLEAN**: regex удаление рекламы, артефактов, нормализация
- **CLASSIFY**: Claude Haiku batch → content_type
- **CHUNK**: RecursiveCharacterTextSplitter (512 tokens, overlap 50)
- **EMBED**: OpenAI text-embedding-3-small, batch по 100
- **STORE**: Drizzle INSERT articles + article_chunks

### 8.3. Паттерны очистки

```
Удалить: /Арендуйте .+?→/gs, /Облачная инфраструктура .+?→/gs,
         /Снижаем цены .+?→/gs, /в панели управления Selectel/g,
         /^Источник\.?\s*$/gm, /\n{3,}/g → \n\n
Нормализовать: ®, TM → удалить, trim whitespace
```

### 8.4. CLI-команды

```bash
npm run ingest -- --file articles.json        # полная загрузка
npm run ingest:add -- --file new.json         # инкрементальная
npm run ingest:reindex                        # пересоздание chunks/embeddings
npm run ingest:stats                          # статистика
```

---

## 9. RAG Pipeline

### 9.1. Retrieval

Drizzle query: cosineDistance + content_type filter → top-K chunks.

### 9.2. Использование по этапам

| Stage | RAG |
|-------|-----|
| OUTLINE | Структурные паттерны заголовков |
| WRITE | Стиль, лексика, tone of voice |
| EDIT | Финальная сверка тона |

---

## 10. Этапы генерации

### Stage 1: RESEARCH
- Параллельно: Perplexity (web) + Claude (анализ) + OpenAI (альтернатива)
- → SSE: progress по каждому провайдеру

### Stage 2: RAG CONTEXT
- Vector search + metadata filter
- → SSE: "найдено 7 релевантных фрагментов"

### Stage 3: OUTLINE
- Генерация структуры (H1, H2[], тезисы, ссылки, позиции картинок)
- → SSE: outline ready
- → **WS interrupt (если enable_review=true)**: пользователь видит outline,
  может approve / reject с feedback / edit вручную

### Stage 4: WRITE SECTIONS
- Посекционная генерация (loop по H2)
- → SSE: "section 2/5 completed"

### Stage 5: EDIT & POLISH
- SEO, tone check, вставка ссылок
- → SSE: edit complete
- → **WS interrupt (если enable_review=true)**: пользователь видит
  финальный текст, может approve / request changes

### Stage 6: IMAGE GENERATION
- Google Imagen 3 (fallback DALL-E 3)
- → SSE: "image 2/3 generated"

### Stage 7: ASSEMBLE
- Markdown + images + meta → articles table
- → SSE: generation:completed

---

## 11. UI

### 11.1. Stack

- React 19 + Vite 6 → nginx
- Zustand v5 (auth, generation, prompts, settings, articles stores)
- TanStack Query v5 (data fetching)
- shadcn/ui + Tailwind CSS 4
- React Router v7
- react-markdown (статьи)
- Monaco Editor (промпты)

### 11.2. Экраны

**Login**
- Email + password
- Redirect на dashboard после auth

**Dashboard**
- **Мои генерации**: список запущенных пользователем (статус, тема, дата, cost)
- **Общая лента** (admin): все генерации всех пользователей
- Кнопка "Новая статья"
- **Мини-статистика**: мои статьи / мои токены / мои расходы

**Новая генерация**
- Тема (text)
- URL для анализа (optional)
- Ссылки компании (multi-input)
- Ключевые слова (tags)
- **Toggle: "Ревью outline"** (enable_review для outline)
- **Toggle: "Ревью текста"** (enable_review для edit)
- Кнопка: "Запустить"

**Монитор генерации (real-time)**
- Progress bar по этапам
- **SSE-лента**: real-time лог событий
- При interrupt → **Review panel**:
    - Для outline: JSON tree editor или readonly view + approve/reject
    - Для text: markdown preview + approve/request changes
- Результат каждого этапа (expandable)
- LangSmith trace ссылка
- "Регенерировать этап"

**Prompt Editor**
- Этапы в sidebar
- Monaco editor + placeholders
- Version history
- "Тест промпта"

**Мои статьи**
- Список сгенерированных (фильтр по дате, статусу)
- Rendered markdown + images
- Copy / Export HTML

**Библиотека (reference)**
- Все эталонные статьи (read-only)
- Поиск по тексту, фильтр по content_type

**Статистика**
- **Моя**: генерации, статьи, токены, расходы (chart по дням)
- **Общая** (admin): по всем пользователям, top users, cost breakdown

**Настройки** (admin only)
- Tone of voice, дефолтные ссылки, RAG params
- API keys
- Image style
- **User management**: список, роли, invite-ссылки

---

## 12. API Endpoints

### Auth (better-auth routes)
```
POST   /api/auth/sign-up          — регистрация (по invite)
POST   /api/auth/sign-in          — логин
POST   /api/auth/sign-out         — выход
GET    /api/auth/session           — текущая сессия
```

### Articles
```
GET    /api/articles               — мои + reference (pagination, filters)
GET    /api/articles/:id
POST   /api/articles/search        — vector search (RAG test)
```

### Prompts (admin/editor)
```
GET    /api/prompts
GET    /api/prompts/:stage
PUT    /api/prompts/:id            — новая версия
GET    /api/prompts/:stage/history
```

### Generations
```
POST   /api/generations            — запуск (привязка к user_id)
GET    /api/generations            — мои (admin: все)
GET    /api/generations/:id
POST   /api/generations/:id/retry/:stage
DELETE /api/generations/:id
```

### Real-time
```
GET    /api/sse/generation/:runId  — SSE stream (auth required)
WS     /api/ws/generation          — WebSocket (auth via token query param)
```

### Stats
```
GET    /api/stats/me               — моя статистика
GET    /api/stats/all              — общая (admin only)
GET    /api/stats/users            — по пользователям (admin only)
```

### Settings (admin only)
```
GET    /api/settings
PUT    /api/settings/:key
```

### Users (admin only)
```
GET    /api/users
PUT    /api/users/:id/role
POST   /api/users/invite           — создать invite-ссылку
```

---

## 13. Деплой

### Переменные окружения

```env
DATABASE_URL=postgresql://user:pass@postgres:5432/articleforge
REDIS_URL=redis://redis:6379

OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
PERPLEXITY_API_KEY=pplx-...

GOOGLE_CLOUD_PROJECT=...
GOOGLE_CLOUD_CREDENTIALS=./service-account.json

LANGSMITH_API_KEY=ls-...
LANGSMITH_PROJECT=articleforge
LANGSMITH_TRACING=true

BETTER_AUTH_SECRET=random-32-char-string
BETTER_AUTH_URL=https://articleforge.yourdomain.com

API_PORT=4000
NODE_ENV=production
```

---

## 14. План реализации (задачи)

### Фаза 0: Инфраструктура (3 дня)

- [ ] Монорепо: npm workspaces (apps/api + apps/ui + packages/shared)
- [ ] apps/api: Hono + TypeScript
- [ ] apps/ui: Vite + React 19 + Tailwind 4 + shadcn/ui
- [ ] Docker: docker-compose (pgvector:pg16, redis:7-alpine)
- [ ] Drizzle: schema.ts (все таблицы), первая миграция
- [ ] LangSmith: env vars, test trace
- [ ] Dockerfiles: api (Node), ui (Vite build → nginx)
- [ ] packages/shared: types.ts + events.ts (SSE/WS event types)
- [ ] CI/CD: GitHub Actions → Dokploy

### Фаза 1: Auth + User Management (2 дня)

- [ ] better-auth: конфиг с Drizzle adapter, PostgreSQL
- [ ] Hono middleware: session validation на все /api/* routes
- [ ] Роли: admin / editor / viewer (middleware проверка)
- [ ] Seed скрипт: создание первого admin-пользователя
- [ ] POST /api/users/invite: invite-ссылки
- [ ] UI: Login page, auth store (Zustand), redirect logic

### Фаза 2: Ingestion + RAG (4-5 дней)

- [ ] Парсер JSON статей → Drizzle schema
- [ ] Модуль очистки (regex паттерны)
- [ ] Batch-классификация content_type (Claude Haiku)
- [ ] Чанкинг: RecursiveCharacterTextSplitter
- [ ] Batch-embedding: OpenAI text-embedding-3-small
- [ ] CLI: ingest, ingest:add, ingest:reindex, ingest:stats
- [ ] RAG retrieval: cosineDistance + metadata filter
- [ ] Тестирование: 10 запросов, проверка качества
- [ ] HNSW индекс: бенчмарк на реальных данных

### Фаза 3: LangGraph Pipeline (5-7 дней)

- [ ] GenerationState interface
- [ ] PostgresSaver checkpointer
- [ ] Node: Research (Perplexity + Claude + OpenAI parallel)
- [ ] Node: RAG Context
- [ ] Node: Outline (+ interrupt() для review)
- [ ] Node: Write Sections (loop)
- [ ] Node: Edit & Polish (+ interrupt() для review)
- [ ] Node: Image Gen (Imagen 3 + DALL-E fallback)
- [ ] Node: Assembly
- [ ] Промпты из БД в каждом node
- [ ] BullMQ: Queue + Worker
- [ ] Cost tracking: tokens + USD per stage → stages_log
- [ ] user_stats_cache: обновление при завершении run
- [ ] Error handling + retry

### Фаза 4: Real-time (3 дня)

- [ ] Redis PubSub: worker публикует события по channel generation:{runId}
- [ ] SSE Manager: Hono streaming, подписка на PubSub, per-user auth
- [ ] SSE endpoint: GET /api/sse/generation/:runId
- [ ] WebSocket handler: Hono WS, auth, room per generation
- [ ] WS: interrupt:request → client, approve/reject → server → resume graph
- [ ] UI: useSSE hook → Zustand generation store
- [ ] UI: useWebSocket hook → review panels

### Фаза 5: UI (5-6 дней)

- [ ] React Router: routes + layout
- [ ] Zustand stores: auth, generation, prompts, settings, articles
- [ ] TanStack Query: hooks для всех endpoints
- [ ] Login page
- [ ] Dashboard: мои генерации + мини-статистика
- [ ] Dashboard admin: общая лента + user stats
- [ ] Форма новой генерации (с review toggles)
- [ ] Монитор: progress bar + SSE лента + review panels
- [ ] Prompt Editor: Monaco + versions
- [ ] Мои статьи: список + markdown preview
- [ ] Библиотека: reference articles
- [ ] Статистика: мои + общая (admin)
- [ ] Настройки: tone, links, RAG, API keys, user management

### Фаза 6: Полировка (2-3 дня)

- [ ] E2E тест: тема → статья с картинками (с review и без)
- [ ] LangSmith dashboards
- [ ] Error handling: toasts, error boundaries
- [ ] Экспорт: markdown, HTML
- [ ] README + deploy guide
- [ ] Деплой на Dokploy

---

## 15. Итого

**Общая оценка MVP: 24-32 дня** (1 разработчик)

**Стоимость за статью: ~$0.50-1.70**

**Ключевые риски:**
1. Качество RAG — тюнинг chunks, threshold
2. Latency — 3-7 мин без review, до 30 мин с review
3. Imagen 3 — fallback на DALL-E 3
4. Промпт-инжиниринг — основное время на промпты, не код
5. WebSocket стабильность — reconnect logic на клиенте

**Что НЕ входит в MVP:**
- Автопубликация в CMS
- A/B тестирование промптов
- GraphRAG / Neo4j
- Мультиязычность
- OAuth-провайдеры (Google, GitHub login)
- Cron-расписание генерации
- LLM-as-judge оценка качества
- Collaborative editing (одновременное редактирование)
