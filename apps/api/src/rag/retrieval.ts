import { db } from '../db/index.js';
import { articleChunks, articles, articleStyleProfiles } from '../db/schema.js';
import { cosineDistance, sql, desc, eq, and, between } from 'drizzle-orm';
import { embedQuery } from '../ingestion/embed.js';
import type { ContentType } from '@articleforge/shared';
import type { StyleMetrics, StyleQualitative, StyleStructural } from '../ingestion/style-types.js';

export interface RetrievedChunk {
  chunkText: string;
  sectionTitle: string | null;
  articleTitle: string;
  articleId: string;
  contentType: string;
  similarity: number;
}

export const retrieveRelevantChunks = async (
  query: string,
  options: {
    topK?: number;
    contentType?: ContentType;
    minSimilarity?: number;
  } = {}
): Promise<RetrievedChunk[]> => {
  const { topK = 10, contentType, minSimilarity = 0.3 } = options;

  const queryEmbedding = await embedQuery(query);
  const similarity = sql<number>`1 - (${cosineDistance(articleChunks.embedding, queryEmbedding)})`;

  const conditions = [
    sql`${articleChunks.embedding} IS NOT NULL`,
    eq(articles.isReference, true),
  ];
  if (contentType) {
    conditions.push(eq(articles.contentType, contentType));
  }

  const results = await db
    .select({
      chunkText: articleChunks.chunkText,
      sectionTitle: articleChunks.sectionTitle,
      articleTitle: articles.title,
      articleId: articles.id,
      contentType: articles.contentType,
      similarity,
    })
    .from(articleChunks)
    .innerJoin(articles, eq(articleChunks.articleId, articles.id))
    .where(and(...conditions))
    .orderBy(desc(similarity))
    .limit(topK);

  return results.filter((r) => r.similarity >= minSimilarity);
};

export interface StyleProfile {
  metrics: StyleMetrics;
  qualitative: StyleQualitative;
  structural: StyleStructural;
}

export const retrieveStyleProfiles = async (
  contentType: ContentType,
  limit: number = 5,
): Promise<StyleProfile[]> => {
  const results = await db
    .select({
      metrics: articleStyleProfiles.metrics,
      qualitative: articleStyleProfiles.qualitative,
      structural: articleStyleProfiles.structural,
    })
    .from(articleStyleProfiles)
    .where(and(
      eq(articleStyleProfiles.contentType, contentType),
      sql`${articleStyleProfiles.qualitative} IS NOT NULL`,
    ))
    .limit(limit);

  return results.filter(
    (r): r is StyleProfile => r.qualitative !== null && r.structural !== null,
  );
};

export const retrieveExemplarParagraphs = async (
  contentType: ContentType,
  count: number = 3,
): Promise<string[]> => {
  // Get opening paragraphs (chunk_index = 0) from reference articles of this type
  const openings = await db
    .select({
      chunkText: articleChunks.chunkText,
      articleTitle: articles.title,
    })
    .from(articleChunks)
    .innerJoin(articles, eq(articleChunks.articleId, articles.id))
    .where(and(
      eq(articles.contentType, contentType),
      eq(articles.isReference, true),
      eq(articleChunks.chunkIndex, 0),
    ))
    .limit(Math.ceil(count / 2));

  // Get mid-article paragraphs (chunk_index 2-5) for body style
  const bodyChunks = await db
    .select({
      chunkText: articleChunks.chunkText,
      articleTitle: articles.title,
    })
    .from(articleChunks)
    .innerJoin(articles, eq(articleChunks.articleId, articles.id))
    .where(and(
      eq(articles.contentType, contentType),
      eq(articles.isReference, true),
      between(articleChunks.chunkIndex, 2, 5),
    ))
    .limit(Math.floor(count / 2) + 1);

  const exemplars = [
    ...openings.map((c) => `[Вступление — ${c.articleTitle}]\n${c.chunkText.slice(0, 500)}`),
    ...bodyChunks.map((c) => `[Основная часть — ${c.articleTitle}]\n${c.chunkText.slice(0, 500)}`),
  ];

  return exemplars.slice(0, count);
};
