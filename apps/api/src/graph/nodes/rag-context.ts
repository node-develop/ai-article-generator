import { getProgress } from '../progress.js';
import type { GenerationStateType } from '../state.js';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { ContentType } from '@articleforge/shared';

export const ragContextNode = async (
  state: GenerationStateType,
  config?: RunnableConfig,
): Promise<Partial<GenerationStateType>> => {
  const progress = getProgress(config);
  await progress.stageStarted('rag_context');
  const startTime = Date.now();

  try {
    const { retrieveRelevantChunks } = await import('../../rag/retrieval.js');

    await progress.stageProgress('rag_context', 'Searching factual context in reference articles...');

    // Retrieve topically relevant chunks for factual grounding (not style)
    let chunks = await retrieveRelevantChunks(state.topic, {
      topK: 5,
      minSimilarity: 0.3,
      contentType: state.contentType as ContentType,
    });

    // Fallback to all types if not enough format-specific chunks
    if (chunks.length < 3) {
      chunks = await retrieveRelevantChunks(state.topic, {
        topK: 5,
        minSimilarity: 0.3,
      });
    }

    const ragContext = chunks
      .map((c) => `[${c.articleTitle}] ${c.chunkText}`)
      .join('\n\n---\n\n');

    await progress.stageProgress('rag_context', `Found ${chunks.length} factual context chunks`);
    await progress.stageCompleted('rag_context', Date.now() - startTime);

    return {
      ragContext: ragContext || 'No relevant context found in reference articles.',
      ragChunkCount: chunks.length,
    };
  } catch (err) {
    console.warn('RAG retrieval failed:', (err as Error).message);
    await progress.stageCompleted('rag_context', Date.now() - startTime);

    return {
      ragContext: 'RAG context unavailable.',
      ragChunkCount: 0,
    };
  }
};
