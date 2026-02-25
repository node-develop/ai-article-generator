import { Hono } from 'hono';
import { toSnakeKeys } from '../utils/serialize.js';
import { db } from '../db/index.js';
import { settings } from '../db/schema.js';
import { eq } from 'drizzle-orm';

type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
};

export const settingsRoutes = new Hono();

settingsRoutes.get('/', async (c) => {
  const data = await db.select().from(settings);
  return c.json({ data: data.map(d => toSnakeKeys(d)) });
});

settingsRoutes.put('/:key', async (c) => {
  const user = c.get('user' as never) as AuthUser;
  if (user.role !== 'admin') {
    return c.json({ error: 'Only admins can update settings' }, 403);
  }

  const key = c.req.param('key');
  const body = await c.req.json();

  // Upsert
  const existing = await db.select().from(settings).where(eq(settings.key, key)).limit(1);

  if (existing.length) {
    const [updated] = await db.update(settings)
      .set({ value: body.value, updatedBy: user.id, updatedAt: new Date() })
      .where(eq(settings.key, key))
      .returning();
    return c.json(toSnakeKeys(updated));
  } else {
    const [created] = await db.insert(settings)
      .values({ key, value: body.value, updatedBy: user.id })
      .returning();
    return c.json(toSnakeKeys(created), 201);
  }
});
