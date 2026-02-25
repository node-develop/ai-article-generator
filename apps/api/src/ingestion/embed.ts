import { getEmbeddingsModel } from '../lib/openrouter.js';

export const embedTexts = async (texts: string[]): Promise<number[][]> => {
  const embeddings = getEmbeddingsModel();
  const BATCH_SIZE = 100;
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    console.log(`  Embedding batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(texts.length / BATCH_SIZE)} (${batch.length} chunks)`);
    const batchEmbeddings = await embeddings.embedDocuments(batch);
    results.push(...batchEmbeddings);
  }

  return results;
};

export const embedQuery = async (query: string): Promise<number[]> => {
  const embeddings = getEmbeddingsModel();
  return embeddings.embedQuery(query);
};
