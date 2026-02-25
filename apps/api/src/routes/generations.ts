import { Hono } from 'hono';
import { toSnakeKeys } from '../utils/serialize.js';
import { db } from '../db/index.js';
import { generationRuns, generatedImages } from '../db/schema.js';
import { eq, desc, count } from 'drizzle-orm';
import { enqueueGeneration } from '../queue/index.js';
import { createPublisher, publishEvent } from '../realtime/pubsub.js';
import { getGenerationChannel } from '@articleforge/shared';

type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
};

export const generationsRoutes = new Hono();

generationsRoutes.post('/', async (c) => {
  const user = c.get('user' as never) as AuthUser;
  if (user.role === 'viewer') {
    return c.json({ error: 'Viewers cannot create generations' }, 403);
  }

  const body = await c.req.json();
  const { topic, content_type, input_urls, input_url, company_links, target_keywords, enable_outline_review, enable_edit_review } = body;

  if (!topic) {
    return c.json({ error: 'Topic is required' }, 400);
  }

  // Accept both input_urls (array) and input_url (string) for backward compat
  const resolvedInputUrls: string[] = input_urls
    ? input_urls
    : input_url
      ? [input_url]
      : [];

  const [run] = await db.insert(generationRuns).values({
    userId: user.id,
    topic,
    contentType: content_type || 'longread',
    inputUrls: resolvedInputUrls,
    companyLinks: company_links || [],
    targetKeywords: target_keywords || [],
    enableReview: enable_outline_review || enable_edit_review || false,
    status: 'pending',
  }).returning();

  // Enqueue BullMQ job
  await enqueueGeneration(run.id, {
    topic,
    userId: user.id,
    contentType: content_type || 'longread',
    inputUrls: resolvedInputUrls,
    companyLinks: company_links,
    targetKeywords: target_keywords,
    enableOutlineReview: enable_outline_review || false,
    enableEditReview: enable_edit_review || false,
  });

  return c.json(toSnakeKeys(run), 201);
});

generationsRoutes.get('/', async (c) => {
  const user = c.get('user' as never) as AuthUser;
  const page = Number(c.req.query('page') || '1');
  const perPage = Math.min(Number(c.req.query('per_page') || '20'), 100);
  const offset = (page - 1) * perPage;

  const where = user.role === 'admin' ? undefined : eq(generationRuns.userId, user.id);

  const [data, totalResult] = await Promise.all([
    db.select().from(generationRuns).where(where).orderBy(desc(generationRuns.createdAt)).limit(perPage).offset(offset),
    db.select({ count: count() }).from(generationRuns).where(where),
  ]);

  const total = totalResult[0]?.count || 0;

  return c.json({
    data: data.map(d => toSnakeKeys(d)),
    total,
    page,
    per_page: perPage,
    total_pages: Math.ceil(total / perPage),
  });
});

generationsRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user' as never) as AuthUser;

  const [run] = await db.select().from(generationRuns).where(eq(generationRuns.id, id)).limit(1);

  if (!run) {
    return c.json({ error: 'Generation not found' }, 404);
  }

  // Check ownership for non-admins
  if (user.role !== 'admin' && run.userId !== user.id) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const images = await db.select().from(generatedImages).where(eq(generatedImages.runId, id));

  return c.json(toSnakeKeys({ ...run, images }));
});

const reviewPublisher = createPublisher();

generationsRoutes.post('/:id/review', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user' as never) as AuthUser;
  const body = await c.req.json();
  const { action, stage, feedback, updated_data } = body;

  if (!action || !stage) {
    return c.json({ error: 'action and stage are required' }, 400);
  }

  if (!['approve', 'reject', 'edit'].includes(action)) {
    return c.json({ error: 'action must be approve, reject, or edit' }, 400);
  }

  if (action === 'reject' && !feedback) {
    return c.json({ error: 'feedback is required for rejection' }, 400);
  }

  if (action === 'edit' && updated_data === undefined) {
    return c.json({ error: 'updated_data is required for edit action' }, 400);
  }

  // Verify run exists and user has access
  const [run] = await db.select().from(generationRuns).where(eq(generationRuns.id, id)).limit(1);

  if (!run) {
    return c.json({ error: 'Generation not found' }, 404);
  }

  if (user.role !== 'admin' && run.userId !== user.id) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  // Publish interrupt:response event to the generation's Redis channel
  const channel = getGenerationChannel(id);
  await publishEvent(reviewPublisher, channel, {
    type: 'interrupt:response',
    stage,
    action,
    feedback,
    updated_data,
  });

  return c.json({ success: true });
});

generationsRoutes.post('/:id/retry/:stage', async (c) => {
  return c.json({ error: 'Retry not implemented yet. Will be added in Phase 3.' }, 501);
});

generationsRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user' as never) as AuthUser;

  const [run] = await db.select().from(generationRuns).where(eq(generationRuns.id, id)).limit(1);

  if (!run) {
    return c.json({ error: 'Generation not found' }, 404);
  }

  if (user.role !== 'admin' && run.userId !== user.id) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  await db.delete(generationRuns).where(eq(generationRuns.id, id));
  return c.json({ success: true });
});
