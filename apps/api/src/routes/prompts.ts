import { Hono } from 'hono';
import { toSnakeKeys } from '../utils/serialize.js';
import { db } from '../db/index.js';
import { prompts } from '../db/schema.js';
import { eq, and, desc, isNull } from 'drizzle-orm';

type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
};

export const promptsRoutes = new Hono();

promptsRoutes.get('/', async (c) => {
  const contentType = c.req.query('content_type') || undefined;

  const conditions = [eq(prompts.isActive, true)];
  if (contentType) {
    conditions.push(eq(prompts.contentType, contentType as any));
  }

  const data = await db.select().from(prompts)
    .where(and(...conditions))
    .orderBy(prompts.stage, desc(prompts.version));
  return c.json({ data: data.map(d => toSnakeKeys(d)) });
});

promptsRoutes.get('/:stage/history', async (c) => {
  const stage = c.req.param('stage');
  const contentType = c.req.query('content_type') || undefined;

  const conditions = [eq(prompts.stage, stage)];
  if (contentType) {
    conditions.push(eq(prompts.contentType, contentType as any));
  } else {
    conditions.push(isNull(prompts.contentType));
  }

  const data = await db.select().from(prompts)
    .where(and(...conditions))
    .orderBy(desc(prompts.version));
  return c.json({ data: data.map(d => toSnakeKeys(d)) });
});

promptsRoutes.get('/:stage', async (c) => {
  const stage = c.req.param('stage');
  const contentType = c.req.query('content_type') || undefined;

  const conditions = [eq(prompts.stage, stage), eq(prompts.isActive, true)];
  if (contentType) {
    conditions.push(eq(prompts.contentType, contentType as any));
  } else {
    conditions.push(isNull(prompts.contentType));
  }

  const data = await db.select().from(prompts)
    .where(and(...conditions))
    .orderBy(desc(prompts.version))
    .limit(1);

  if (!data.length) {
    return c.json({ error: 'Prompt not found for this stage' }, 404);
  }
  return c.json(toSnakeKeys(data[0]));
});

promptsRoutes.put('/:id', async (c) => {
  const user = c.get('user' as never) as AuthUser;
  if (user.role === 'viewer') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const id = c.req.param('id');
  const body = await c.req.json();
  const { template, name } = body;

  const current = await db.select().from(prompts).where(eq(prompts.id, id)).limit(1);
  if (!current.length) {
    return c.json({ error: 'Prompt not found' }, 404);
  }

  // Deactivate the old one
  await db.update(prompts).set({ isActive: false }).where(eq(prompts.id, id));

  // Create new version (preserving contentType)
  const [newPrompt] = await db.insert(prompts).values({
    stage: current[0].stage,
    contentType: current[0].contentType,
    name: name || current[0].name,
    template: template || current[0].template,
    version: current[0].version + 1,
    isActive: true,
    createdBy: user.id,
  }).returning();

  return c.json(toSnakeKeys(newPrompt));
});

// Create a new prompt for a specific stage + contentType combination
promptsRoutes.post('/', async (c) => {
  const user = c.get('user' as never) as AuthUser;
  if (user.role === 'viewer') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const body = await c.req.json();
  const { stage, content_type, name, template } = body;

  if (!stage || !template) {
    return c.json({ error: 'stage and template are required' }, 400);
  }

  const [newPrompt] = await db.insert(prompts).values({
    stage,
    contentType: content_type || null,
    name: name || `${stage} prompt`,
    template,
    version: 1,
    isActive: true,
    createdBy: user.id,
  }).returning();

  return c.json(toSnakeKeys(newPrompt), 201);
});
