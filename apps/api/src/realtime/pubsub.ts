import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const createPublisher = () => new Redis(redisUrl);
export const createSubscriber = () => new Redis(redisUrl);

export const publishEvent = async (
  publisher: Redis,
  channel: string,
  event: unknown,
): Promise<void> => {
  await publisher.publish(channel, JSON.stringify(event));
};
