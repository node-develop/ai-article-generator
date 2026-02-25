import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const createRedisConnection = () =>
  new IORedis(redisUrl, { maxRetriesPerRequest: null }) as any;

export const generationQueue = new Queue('article-generation', {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { age: 86400 },
    removeOnFail: { age: 604800 },
  },
});

export const enqueueGeneration = async (runId: string, data: {
  topic: string;
  userId: string;
  contentType?: string;
  inputUrls?: string[];
  companyLinks?: string[];
  targetKeywords?: string[];
  enableOutlineReview?: boolean;
  enableEditReview?: boolean;
}) => {
  return generationQueue.add('generate', {
    runId,
    ...data,
  }, {
    jobId: runId,
  });
};
