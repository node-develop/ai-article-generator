import { createFastModel } from '../../lib/openrouter.js';
import { getPromptTemplate } from '../prompts.js';
import { getProgress } from '../progress.js';
import type { GenerationStateType } from '../state.js';
import type { RunnableConfig } from '@langchain/core/runnables';

export const imageGenerateNode = async (
  state: GenerationStateType,
  config?: RunnableConfig,
): Promise<Partial<GenerationStateType>> => {
  const progress = getProgress(config);
  await progress.stageStarted('image_generate');
  const startTime = Date.now();

  try {
    // Generate image prompts using LLM
    const template = await getPromptTemplate('image_prompt');
    const prompt = template
      .replace('{title}', state.topic)
      .replace('{sections}', state.sections.map((_, i) => `Section ${i + 1}`).join(', '))
      .replace('{count}', '3');

    const model = createFastModel({ temperature: 0.7, maxTokens: 500 });

    const response = await model.invoke([
      { role: 'user', content: prompt },
    ]);

    const imagePrompts = String(response.content)
      .split('\n')
      .filter((line) => line.trim().length > 10)
      .slice(0, 3);

    // TODO: Actually generate images via Imagen 3 / DALL-E 3 in a future update
    const imageUrls: string[] = [];

    const tokensUsed = (response.usage_metadata?.input_tokens || 0) + (response.usage_metadata?.output_tokens || 0);
    await progress.stageCompleted('image_generate', Date.now() - startTime, tokensUsed);

    return {
      imagePrompts,
      imageUrls,
      currentStage: 'images',
    };
  } catch (err) {
    await progress.stageFailed('image_generate', (err as Error).message);
    throw err;
  }
};
