# Article Display Fixes & Image Generation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 4 issues: implement image generation via Nano Banana Pro on OpenRouter, strip LLM preamble from articles, force light theme, and add "Save to Library" button.

**Architecture:** Image generation calls OpenRouter's chat completions API with `modalities: ["image","text"]` using `google/gemini-3-pro-image-preview`. Base64 responses are decoded and saved to local filesystem, served via Hono static route. LLM preamble is stripped via prompt hardening + post-processing regex. Light theme is forced by switching Tailwind v4 dark variant to class-based. Library promotion is a simple PATCH endpoint flipping `isReference`.

**Tech Stack:** Hono, OpenRouter API (direct fetch), Tailwind CSS v4, React, Drizzle ORM

---

### Task 1: Create image generation helper

**Files:**
- Create: `apps/api/src/lib/image-gen.ts`

**Step 1: Create the helper module**

```typescript
import { randomUUID } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = join(__dirname, '..', '..', 'uploads', 'images');

const getApiKey = (): string => {
  const key = process.env.OPEN_ROUTER_API_KEY;
  if (!key) throw new Error('OPEN_ROUTER_API_KEY is not set');
  return key;
};

export interface GeneratedImage {
  filePath: string;
  urlPath: string;
}

export const generateImage = async (prompt: string): Promise<GeneratedImage> => {
  await mkdir(UPLOADS_DIR, { recursive: true });

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-3-pro-image-preview',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      modalities: ['image', 'text'],
      image_config: {
        aspect_ratio: '16:9',
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Image generation failed (${response.status}): ${text}`);
  }

  const result = await response.json() as {
    choices: Array<{
      message: {
        images?: Array<{
          image_url: { url: string };
        }>;
      };
    }>;
  };

  const imageData = result.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!imageData) {
    throw new Error('No image returned from model');
  }

  // Parse base64 data URL: "data:image/png;base64,..."
  const match = imageData.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!match) {
    throw new Error('Unexpected image format (not base64 data URL)');
  }

  const ext = match[1]; // png, jpeg, webp etc.
  const base64 = match[2];
  const buffer = Buffer.from(base64, 'base64');

  const filename = `${randomUUID()}.${ext}`;
  const filePath = join(UPLOADS_DIR, filename);
  await writeFile(filePath, buffer);

  return {
    filePath,
    urlPath: `/api/uploads/images/${filename}`,
  };
};
```

**Step 2: Commit**
```bash
git add apps/api/src/lib/image-gen.ts
git commit -m "feat: add image generation helper using Nano Banana Pro via OpenRouter"
```

---

### Task 2: Serve uploaded images via Hono static route

**Files:**
- Modify: `apps/api/src/server.ts`

**Step 1: Add static file serving**

After the health check route (line 38), add:

```typescript
import { serveStatic } from '@hono/node-server/static';
```

And after the health check handler, add the route:

```typescript
// Serve uploaded images (no auth required for image assets)
app.use('/api/uploads/*', serveStatic({ root: './' }));
```

This works because Hono's `serveStatic` with `root: './'` maps `/api/uploads/images/foo.png` to `./api/uploads/images/foo.png` relative to CWD. But our files are in `uploads/images/`, so we need to strip the `/api` prefix. Use the `rewriteRequestPath` option:

```typescript
app.use('/api/uploads/*', serveStatic({
  root: './uploads',
  rewriteRequestPath: (path) => path.replace(/^\/api\/uploads/, ''),
}));
```

**Step 2: Create the uploads directory**
```bash
mkdir -p apps/api/uploads/images
echo "uploads/" >> apps/api/.gitignore
```

**Step 3: Commit**
```bash
git add apps/api/src/server.ts apps/api/.gitignore
git commit -m "feat: serve uploaded images via static route"
```

---

### Task 3: Wire image generation into the pipeline node

**Files:**
- Modify: `apps/api/src/graph/nodes/image-generate.ts`

**Step 1: Replace the stub with actual generation**

Replace the entire file content:

```typescript
import { generateImage } from '../../lib/image-gen.js';
import { getPromptTemplate } from '../prompts.js';
import { getProgress } from '../progress.js';
import { createFastModel } from '../../lib/openrouter.js';
import type { GenerationStateType } from '../state.js';
import type { RunnableConfig } from '@langchain/core/runnables';

export const imageGenerateNode = async (
  state: GenerationStateType,
  config?: RunnableConfig,
): Promise<Partial<GenerationStateType>> => {
  const progress = getProgress(config);
  await progress.stageStarted('image_generate');
  const startTime = Date.now();

  try {
    // Generate image prompts using LLM
    const template = await getPromptTemplate('image_prompt');
    const prompt = template
      .replace('{title}', state.topic)
      .replace('{sections}', state.sections.map((_, i) => `Section ${i + 1}`).join(', '))
      .replace('{count}', '3');

    console.log(`[ImageGenerate] Calling OpenRouter (openai/gpt-4o-mini) for prompts...`);
    const model = createFastModel({ temperature: 0.7, maxTokens: 500 });

    const response = await model.invoke([
      { role: 'user', content: prompt },
    ]);
    console.log(`[ImageGenerate] Got prompt response (${String(response.content).length} chars)`);

    const imagePrompts = String(response.content)
      .split('\n')
      .map((line) => line.replace(/^\d+[\.\)]\s*/, '').trim())
      .filter((line) => line.length > 10)
      .slice(0, 3);

    // Generate actual images via Nano Banana Pro
    const imageUrls: string[] = [];
    for (let i = 0; i < imagePrompts.length; i++) {
      const pct = Math.round(((i + 1) / imagePrompts.length) * 100);
      await progress.stageProgress(
        'image_generate',
        `Generating image ${i + 1}/${imagePrompts.length}...`,
        pct,
      );

      try {
        console.log(`[ImageGenerate] Generating image ${i + 1}/${imagePrompts.length}...`);
        const result = await generateImage(imagePrompts[i]);
        imageUrls.push(result.urlPath);
        console.log(`[ImageGenerate] Image ${i + 1} saved: ${result.urlPath}`);
      } catch (err) {
        console.error(`[ImageGenerate] Image ${i + 1} failed:`, (err as Error).message);
        // Continue with remaining images; don't fail the whole pipeline
      }
    }

    const tokensUsed = (response.usage_metadata?.input_tokens || 0) + (response.usage_metadata?.output_tokens || 0);
    await progress.stageCompleted('image_generate', Date.now() - startTime, tokensUsed);

    return {
      imagePrompts,
      imageUrls,
      currentStage: 'images',
    };
  } catch (err) {
    await progress.stageFailed('image_generate', (err as Error).message);
    throw err;
  }
};
```

**Step 2: Commit**
```bash
git add apps/api/src/graph/nodes/image-generate.ts
git commit -m "feat: implement actual image generation via Nano Banana Pro"
```

---

### Task 4: Strip LLM preamble — harden prompt + post-processing

**Files:**
- Modify: `apps/api/src/graph/prompts.ts` (edit_polish prompt)
- Modify: `apps/api/src/graph/nodes/edit-polish.ts` (add post-processing)

**Step 1: Harden the edit_polish prompt**

In `apps/api/src/graph/prompts.ts`, replace the `edit_polish` prompt value (lines 60-79) with:

```typescript
  edit_polish: `Отредактируй и доработай черновик статьи для технологического блога на русском языке.

Черновик:
{draft}

Контекст стиля (из эталонных статей):
{ragContext}

Целевые ключевые слова для SEO: {keywords}

Задачи редактуры:
1. Проверь логику изложения и связность между секциями
2. Оптимизируй для SEO: ключевые слова в заголовках и первых абзацах
3. Выровняй тон: профессиональный, живой, без канцелярита — как в эталонных статьях
4. Проверь техническую точность формулировок
5. Добавь плавные переходы между секциями
6. Убери повторы, длинноты, общие фразы
7. Убедись, что введение цепляет, а заключение содержит конкретный вывод

ВАЖНО: Выведи ТОЛЬКО текст статьи в формате markdown. БЕЗ вступительных фраз, БЕЗ комментариев от себя, БЕЗ строк "Meta Description", БЕЗ пояснений что ты изменил. Начни сразу с заголовка H1 статьи (# Заголовок). Сохрани всю структуру H1/H2.`,
```

**Step 2: Add post-processing in edit-polish node**

In `apps/api/src/graph/nodes/edit-polish.ts`, after `const content = String(response.content);` (line 31), add a `stripPreamble` function and apply it:

```typescript
const stripPreamble = (text: string): string => {
  let cleaned = text;

  // Remove everything before the first markdown heading (# or ##)
  const headingMatch = cleaned.match(/^([\s\S]*?)(^#\s)/m);
  if (headingMatch && headingMatch.index !== undefined) {
    const before = headingMatch[1];
    // Only strip if the preamble is short (< 500 chars) to avoid cutting real content
    if (before.length > 0 && before.length < 500) {
      cleaned = cleaned.slice(headingMatch.index + headingMatch[1].length);
    }
  }

  // Remove "Meta Description:" lines
  cleaned = cleaned.replace(/^Meta\s*Description\s*[:：].*$/gim, '');

  // Remove common Russian LLM preamble lines
  const preamblePatterns = [
    /^Вот\s+(отредактированн|исправленн|доработанн|обновлённ|переработанн).+?[:.]?\s*$/gim,
    /^Ниже\s+(приведён|представлен).+?[:.]?\s*$/gim,
    /^Я\s+(сохранил|переписал|отредактировал|изменил|доработал|убрал|добавил).+?[:.]?\s*$/gim,
  ];
  for (const pattern of preamblePatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  // Collapse multiple blank lines into max 2
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned.trim();
};

const content = stripPreamble(String(response.content));
```

Note: this replaces the existing `const content = String(response.content);` line.

**Step 3: Commit**
```bash
git add apps/api/src/graph/prompts.ts apps/api/src/graph/nodes/edit-polish.ts
git commit -m "fix: strip LLM preamble and meta-commentary from article output"
```

---

### Task 5: Force light theme in Tailwind v4

**Files:**
- Modify: `apps/ui/src/app.css`
- Modify: `apps/ui/src/pages/ArticleDetailPage.tsx`
- Modify: `apps/ui/src/pages/ArticlesPage.tsx` (if it has dark: classes)
- Modify: `apps/ui/src/pages/LibraryPage.tsx` (if it has dark: classes)

**Step 1: Override dark variant in Tailwind v4 CSS**

In `apps/ui/src/app.css`, add after line 2 (`@plugin "@tailwindcss/typography";`):

```css
@custom-variant dark (&:is(.dark *));
```

This switches Tailwind v4 from the default `prefers-color-scheme` media query to class-based. Since no `.dark` class is applied to `<html>`, all `dark:` variants become inert.

**Step 2: Remove dead dark: classes from ArticleDetailPage.tsx**

In `apps/ui/src/pages/ArticleDetailPage.tsx`, change the CONTENT_TYPE_COLORS map (lines 27-31):

```typescript
const CONTENT_TYPE_COLORS: Record<string, string> = {
  review: 'bg-blue-100 text-blue-800',
  tutorial: 'bg-green-100 text-green-800',
  longread: 'bg-purple-100 text-purple-800',
  news: 'bg-orange-100 text-orange-800',
};
```

And change the prose wrapper (line 157):
```
<div className="prose prose-sm max-w-none">
```

**Step 3: Remove dead dark: classes from LibraryPage.tsx**

In `apps/ui/src/pages/LibraryPage.tsx`, change the CONTENT_TYPE_COLORS map (lines 30-35):

```typescript
const CONTENT_TYPE_COLORS: Record<string, string> = {
  review: 'bg-blue-100 text-blue-800',
  tutorial: 'bg-green-100 text-green-800',
  longread: 'bg-purple-100 text-purple-800',
  news: 'bg-orange-100 text-orange-800',
};
```

**Step 4: Remove dark: classes from ArticlesPage.tsx**

Check `apps/ui/src/pages/ArticlesPage.tsx` for the same `CONTENT_TYPE_COLORS` pattern and apply the same fix.

**Step 5: Commit**
```bash
git add apps/ui/src/app.css apps/ui/src/pages/ArticleDetailPage.tsx apps/ui/src/pages/LibraryPage.tsx apps/ui/src/pages/ArticlesPage.tsx
git commit -m "fix: force light theme by disabling dark variant in Tailwind v4"
```

---

### Task 6: Add "Save to Library" API endpoint

**Files:**
- Modify: `apps/api/src/routes/articles.ts`

**Step 1: Add the PATCH endpoint**

After the `GET /:id` route in `apps/api/src/routes/articles.ts`, add:

```typescript
articlesRoutes.patch('/:id/library', async (c) => {
  const user = c.get('user' as never) as AuthUser;
  const id = c.req.param('id');

  const [article] = await db.select().from(articles).where(eq(articles.id, id)).limit(1);
  if (!article) {
    return c.json({ error: 'Article not found' }, 404);
  }

  // Only owner or admin can promote to library
  if (user.role !== 'admin' && article.createdBy !== user.id) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const [updated] = await db.update(articles)
    .set({ isReference: true, updatedAt: new Date() })
    .where(eq(articles.id, id))
    .returning();

  return c.json(toSnakeKeys(updated));
});
```

**Step 2: Commit**
```bash
git add apps/api/src/routes/articles.ts
git commit -m "feat: add PATCH /api/articles/:id/library endpoint to promote to library"
```

---

### Task 7: Add "Save to Library" button in ArticleDetailPage

**Files:**
- Modify: `apps/ui/src/api/hooks.ts` (add mutation hook)
- Modify: `apps/ui/src/pages/ArticleDetailPage.tsx`

**Step 1: Add the mutation hook**

In `apps/ui/src/api/hooks.ts`, add a `useSaveToLibrary` mutation hook. Find the existing hooks and add:

```typescript
export const useSaveToLibrary = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (articleId: string) => {
      const res = await fetch(`/api/articles/${articleId}/library`, {
        method: 'PATCH',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to save to library');
      return res.json();
    },
    onSuccess: (_data, articleId) => {
      queryClient.invalidateQueries({ queryKey: ['article', articleId] });
      queryClient.invalidateQueries({ queryKey: ['articles'] });
    },
  });
};
```

Note: check if `useMutation` and `useQueryClient` are already imported from `@tanstack/react-query`. If not, add them to the import.

**Step 2: Add the button to ArticleDetailPage**

In `apps/ui/src/pages/ArticleDetailPage.tsx`:

1. Import the hook and BookOpen icon:
```typescript
import { useSaveToLibrary } from '@/api/hooks';
// Add BookOpen to the lucide-react import if not already there
```

2. Inside the component, after the `useArticle` hook call, add:
```typescript
const saveToLibrary = useSaveToLibrary();
```

3. In the header area (after the back button section, before the `<div>` with the title), add a "Save to Library" button that only shows for non-reference articles:

```tsx
{/* Actions for generated articles */}
{!article.is_reference && (
  <div className="flex justify-end">
    <Button
      variant="outline"
      size="sm"
      disabled={saveToLibrary.isPending}
      onClick={() => saveToLibrary.mutate(article.id)}
    >
      <BookOpen className="mr-1.5 h-4 w-4" />
      {saveToLibrary.isPending ? 'Saving...' : 'Save to Library'}
    </Button>
  </div>
)}
```

If the mutation succeeds, TanStack Query will refetch the article data, and `article.is_reference` will become `true`, hiding the button and changing the back link to "Back to library".

**Step 3: Commit**
```bash
git add apps/ui/src/api/hooks.ts apps/ui/src/pages/ArticleDetailPage.tsx
git commit -m "feat: add Save to Library button on generated article detail page"
```

---

### Task 8: Verify all changes work together

**Step 1: Start infrastructure**
```bash
docker compose up -d postgres redis
```

**Step 2: Start API + worker + UI**
```bash
npm run dev:api    # terminal 1
npm run worker:dev -w apps/api  # terminal 2
npm run dev:ui     # terminal 3
```

**Step 3: Manual verification checklist**
- [ ] UI loads in light theme regardless of OS dark mode
- [ ] No gray-white font on any page
- [ ] Generate a new article — images appear inline after H2 headings
- [ ] Article text has no LLM preamble/commentary
- [ ] "Save to Library" button appears on generated article detail
- [ ] After saving, article appears in the Library page
- [ ] Back link changes to "Back to library" after saving

**Step 4: Final commit if any tweaks needed**
