import { ChatOpenAI } from '@langchain/openai';
import { OpenAIEmbeddings } from '@langchain/openai';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

const getApiKey = (): string => {
  const key = process.env.OPEN_ROUTER_API_KEY;
  if (!key) throw new Error('OPEN_ROUTER_API_KEY is not set');
  console.log(`[OpenRouter] API key present (${key.slice(0, 8)}...)`);
  return key;
};

const openRouterConfig = {
  baseURL: OPENROUTER_BASE_URL,
};

// Default models
export const MODELS = {
  // Perplexity for web research with citations
  research: 'perplexity/sonar-pro',
  // Gemini for article writing (outline, sections, editing)
  writer: 'google/gemini-3-pro-preview',
  // Fast/cheap model for classification and image prompts
  fast: 'openai/gpt-4o-mini',
  // Embeddings
  embedding: 'openai/text-embedding-3-small',
} as const;

export const createResearchModel = (options?: {
  temperature?: number;
  maxTokens?: number;
}) => {
  return new ChatOpenAI({
    model: MODELS.research,
    temperature: options?.temperature ?? 0.3,
    maxTokens: options?.maxTokens,
    apiKey: getApiKey(),
    configuration: openRouterConfig,
  });
};

export const createChatModel = (options?: {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}) => {
  return new ChatOpenAI({
    model: options?.model ?? MODELS.writer,
    temperature: options?.temperature ?? 0.7,
    maxTokens: options?.maxTokens,
    apiKey: getApiKey(),
    configuration: openRouterConfig,
  });
};

export const createFastModel = (options?: {
  temperature?: number;
  maxTokens?: number;
}) => {
  return new ChatOpenAI({
    model: MODELS.fast,
    temperature: options?.temperature ?? 0,
    maxTokens: options?.maxTokens,
    apiKey: getApiKey(),
    configuration: openRouterConfig,
  });
};

let embeddingsInstance: OpenAIEmbeddings | null = null;

export const getEmbeddingsModel = (): OpenAIEmbeddings => {
  if (!embeddingsInstance) {
    embeddingsInstance = new OpenAIEmbeddings({
      model: MODELS.embedding,
      dimensions: 1536,
      apiKey: getApiKey(),
      configuration: openRouterConfig,
    });
  }
  return embeddingsInstance;
};
