import { db } from '../db/index.js';
import { articleChunks, articles } from '../db/schema.js';
import { cosineDistance, sql, desc, eq, and } from 'drizzle-orm';
import { embedQuery } from '../ingestion/embed.js';
import type { ContentType } from '@articleforge/shared';

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
