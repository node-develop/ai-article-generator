import { Hono } from 'hono';
import { db } from '../db/index.js';
import { userStatsCache, generationRuns, articles, users } from '../db/schema.js';
import { toSnakeKeys } from '../utils/serialize.js';
import { eq, count, sum, sql } from 'drizzle-orm';

type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
};

export const statsRoutes = new Hono();

statsRoutes.get('/me', async (c) => {
  const user = c.get('user' as never) as AuthUser;

  // Try cache first
  const [cached] = await db.select().from(userStatsCache).where(eq(userStatsCache.userId, user.id)).limit(1);

  if (cached) {
    return c.json({
      total_generations: cached.totalGenerations,
      completed_generations: cached.completedGenerations,
      failed_generations: cached.failedGenerations,
      total_articles: cached.totalArticles,
      total_tokens_used: cached.totalTokensUsed,
      total_cost_usd: cached.totalCostUsd,
      last_generation_at: cached.lastGenerationAt,
    });
  }

  // Compute from source tables
  const [genStats] = await db.select({
    total: count(),
    completed: count(sql`CASE WHEN ${generationRuns.status} = 'completed' THEN 1 END`),
    failed: count(sql`CASE WHEN ${generationRuns.status} = 'failed' THEN 1 END`),
    tokens: sum(generationRuns.totalTokens),
    cost: sum(generationRuns.totalCostUsd),
  }).from(generationRuns).where(eq(generationRuns.userId, user.id));

  const [artStats] = await db.select({ total: count() }).from(articles).where(eq(articles.createdBy, user.id));

  return c.json({
    total_generations: genStats?.total || 0,
    completed_generations: genStats?.completed || 0,
    failed_generations: genStats?.failed || 0,
    total_articles: artStats?.total || 0,
    total_tokens_used: Number(genStats?.tokens || 0),
    total_cost_usd: String(genStats?.cost || '0'),
    last_generation_at: null,
  });
});

statsRoutes.get('/all', async (c) => {
  const user = c.get('user' as never) as AuthUser;
  if (user.role !== 'admin') {
    return c.json({ error: 'Admin only' }, 403);
  }

  const [genStats] = await db.select({
    total: count(),
    completed: count(sql`CASE WHEN ${generationRuns.status} = 'completed' THEN 1 END`),
    failed: count(sql`CASE WHEN ${generationRuns.status} = 'failed' THEN 1 END`),
    tokens: sum(generationRuns.totalTokens),
    cost: sum(generationRuns.totalCostUsd),
  }).from(generationRuns);

  const [artStats] = await db.select({ total: count() }).from(articles);
  const [refStats] = await db.select({ total: count() }).from(articles).where(eq(articles.isReference, true));

  return c.json({
    total_generations: genStats?.total || 0,
    completed_generations: genStats?.completed || 0,
    failed_generations: genStats?.failed || 0,
    total_articles: artStats?.total || 0,
    reference_articles: refStats?.total || 0,
    total_tokens_used: Number(genStats?.tokens || 0),
    total_cost_usd: String(genStats?.cost || '0'),
  });
});

statsRoutes.get('/users', async (c) => {
  const user = c.get('user' as never) as AuthUser;
  if (user.role !== 'admin') {
    return c.json({ error: 'Admin only' }, 403);
  }

  const data = await db
    .select({
      userId: userStatsCache.userId,
      userName: users.name,
      totalGenerations: userStatsCache.totalGenerations,
      completedGenerations: userStatsCache.completedGenerations,
      failedGenerations: userStatsCache.failedGenerations,
      totalArticles: userStatsCache.totalArticles,
      totalTokensUsed: userStatsCache.totalTokensUsed,
      totalCostUsd: userStatsCache.totalCostUsd,
      lastGenerationAt: userStatsCache.lastGenerationAt,
    })
    .from(userStatsCache)
    .innerJoin(users, eq(userStatsCache.userId, users.id));
  return c.json({ data: data.map(d => toSnakeKeys(d)) });
});
