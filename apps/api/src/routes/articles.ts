import { Hono } from 'hono';
import { toSnakeKeys } from '../utils/serialize.js';
import { db } from '../db/index.js';
import { articles, articleChunks, generationRuns } from '../db/schema.js';
import { eq, and, or, desc, count } from 'drizzle-orm';

type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
};

export const articlesRoutes = new Hono();

articlesRoutes.get('/', async (c) => {
  const user = c.get('user' as never) as AuthUser;
  const page = Number(c.req.query('page') || '1');
  const perPage = Math.min(Number(c.req.query('per_page') || '20'), 100);
  const contentType = c.req.query('content_type');
  const isRef = c.req.query('is_reference');
  const offset = (page - 1) * perPage;

  const conditions = [];

  // Scope: editors see their own generated articles + all reference articles, admins see all
  if (user.role !== 'admin') {
    conditions.push(
      or(eq(articles.isReference, true), eq(articles.createdBy, user.id))
    );
  }

  if (contentType) {
    conditions.push(eq(articles.contentType, contentType as 'review' | 'tutorial' | 'longread' | 'news'));
  }
  if (isRef !== undefined) {
    conditions.push(eq(articles.isReference, isRef === 'true'));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [data, totalResult] = await Promise.all([
    db.select().from(articles).where(where).orderBy(desc(articles.createdAt)).limit(perPage).offset(offset),
    db.select({ count: count() }).from(articles).where(where),
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

articlesRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const article = await db.select().from(articles).where(eq(articles.id, id)).limit(1);

  if (!article.length) {
    return c.json({ error: 'Article not found' }, 404);
  }

  const chunksCount = await db.select({ count: count() }).from(articleChunks).where(eq(articleChunks.articleId, id));

  return c.json(toSnakeKeys({ ...article[0], chunks_count: chunksCount[0]?.count || 0 }));
});

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

articlesRoutes.delete('/:id', async (c) => {
  const user = c.get('user' as never) as AuthUser;

  if (user.role === 'viewer') {
    return c.json({ error: 'Viewers cannot delete articles' }, 403);
  }

  const id = c.req.param('id');

  const [article] = await db.select().from(articles).where(eq(articles.id, id)).limit(1);
  if (!article) {
    return c.json({ error: 'Article not found' }, 404);
  }

  // Only owner or admin can delete
  if (user.role !== 'admin' && article.createdBy !== user.id) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  // Clear resultArticleId in any generation runs pointing to this article
  await db.update(generationRuns)
    .set({ resultArticleId: null })
    .where(eq(generationRuns.resultArticleId, id));

  // Delete the article (chunks and style profiles cascade-delete via FK)
  await db.delete(articles).where(eq(articles.id, id));

  return c.json({ success: true });
});

articlesRoutes.post('/search', async (c) => {
  return c.json({ error: 'Vector search not implemented yet. Will be added in Phase 2.' }, 501);
});
