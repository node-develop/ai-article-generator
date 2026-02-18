import 'dotenv/config';
import { Worker } from 'bullmq';
import { createRedisConnection } from './queue/index.js';
import { createGenerationGraph } from './graph/graph.js';
import { createProgressReporter } from './graph/progress.js';
import { db } from './db/index.js';
import { generationRuns } from './db/schema.js';
import { eq } from 'drizzle-orm';
import { createPublisher, publishEvent } from './realtime/pubsub.js';
import { getGenerationChannel } from '@articleforge/shared';

const publisher = createPublisher();

const updateRunStatus = async (runId: string, status: string, extra: Record<string, any> = {}) => {
  await db.update(generationRuns)
    .set({ status: status as any, currentStage: status, ...extra })
    .where(eq(generationRuns.id, runId));
};

const worker = new Worker('article-generation', async (job) => {
  const { runId, topic, userId, inputUrl, companyLinks, targetKeywords, enableReview } = job.data;
  const channel = getGenerationChannel(runId);

  console.log(`[Worker] Starting generation: ${runId} - "${topic}"`);

  // Create progress reporter for this run
  const progress = createProgressReporter(publisher, channel);

  try {
    await updateRunStatus(runId, 'research');

    const graph = createGenerationGraph();

    const result = await graph.invoke({
      runId,
      userId,
      topic,
      inputUrl: inputUrl || null,
      companyLinks: companyLinks || [],
      targetKeywords: targetKeywords || [],
      enableReview: enableReview || false,
      researchResults: '',
      sources: [],
      ragContext: '',
      ragChunkCount: 0,
      outline: '',
      sections: [],
      fullDraft: '',
      editedContent: '',
      imagePrompts: [],
      imageUrls: [],
      finalArticle: '',
      articleId: null,
      totalTokens: 0,
      totalCost: 0,
      currentStage: 'pending',
      error: null,
    }, {
      configurable: { progress },
    });

    // Update run as completed
    await updateRunStatus(runId, 'completed', {
      resultArticleId: result.articleId,
      totalTokens: result.totalTokens,
      totalCostUsd: String(result.totalCost || 0),
      completedAt: new Date(),
    });

    await publishEvent(publisher, channel, {
      type: 'generation:completed',
      article_id: result.articleId || '',
    });

    console.log(`[Worker] Generation completed: ${runId}`);
  } catch (err: any) {
    console.error(`[Worker] Generation failed: ${runId}`, err);

    await updateRunStatus(runId, 'failed', {
      errorMessage: err.message,
    });

    await publishEvent(publisher, channel, {
      type: 'generation:failed',
      error: err.message,
    });
  }
}, {
  connection: createRedisConnection(),
  concurrency: 2,
});

worker.on('error', (err) => {
  console.error('[Worker] Error:', err);
});

console.log('[Worker] Article generation worker started');

// Graceful shutdown
const shutdown = async () => {
  console.log('[Worker] Shutting down...');
  await worker.close();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
