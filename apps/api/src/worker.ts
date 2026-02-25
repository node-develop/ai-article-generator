import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load .env from project root (handles running from any working directory)
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../../../.env');
dotenv.config({ path: envPath });
console.log(`[Worker] Loading .env from: ${envPath}`);
import { Worker } from 'bullmq';
import { createRedisConnection } from './queue/index.js';
import { createGenerationGraph } from './graph/graph.js';
import { createProgressReporter } from './graph/progress.js';
import { createInterruptHandler } from './graph/interrupt.js';
import { db } from './db/index.js';
import { generationRuns } from './db/schema.js';
import { eq } from 'drizzle-orm';
import { createPublisher, publishEvent } from './realtime/pubsub.js';
import { getGenerationChannel } from '@articleforge/shared';

// Validate required env vars at startup
if (!process.env.OPEN_ROUTER_API_KEY) {
  console.error('[Worker] FATAL: OPEN_ROUTER_API_KEY is not set!');
  console.error('[Worker] Available env vars:', Object.keys(process.env).filter(k => k.includes('KEY') || k.includes('URL') || k.includes('PORT')).join(', '));
  process.exit(1);
}
console.log(`[Worker] OPEN_ROUTER_API_KEY loaded (${process.env.OPEN_ROUTER_API_KEY.slice(0, 12)}...)`);

const publisher = createPublisher();

const updateRunStatus = async (runId: string, status: string, extra: Record<string, any> = {}) => {
  await db.update(generationRuns)
    .set({ status: status as any, currentStage: status, ...extra })
    .where(eq(generationRuns.id, runId));
};

const worker = new Worker('article-generation', async (job) => {
  const { runId, topic, userId, inputUrls, companyLinks, targetKeywords, enableOutlineReview, enableEditReview, contentType } = job.data;
  const channel = getGenerationChannel(runId);

  console.log(`[Worker] ====================================`);
  console.log(`[Worker] Job picked up: ${runId}`);
  console.log(`[Worker] Topic: "${topic}"`);
  console.log(`[Worker] Channel: ${channel}`);
  console.log(`[Worker] ====================================`);

  // Create progress reporter and interrupt handler for this run
  const progress = createProgressReporter(publisher, channel);
  const interruptHandler = createInterruptHandler(channel);

  try {
    await updateRunStatus(runId, 'research');
    console.log(`[Worker] DB status updated to 'research', invoking graph...`);

    const graph = createGenerationGraph();

    const result = await graph.invoke({
      runId,
      userId,
      topic,
      inputUrls: inputUrls || [],
      companyLinks: companyLinks || [],
      targetKeywords: targetKeywords || [],
      enableOutlineReview: enableOutlineReview || false,
      enableEditReview: enableEditReview || false,
      contentType: contentType || 'longread',
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
      configurable: { progress, interruptHandler },
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
