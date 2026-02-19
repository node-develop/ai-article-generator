import { generateImage } from '../../lib/image-gen.js';
import { getPromptTemplate } from '../prompts.js';
import { getProgress } from '../progress.js';
import { createFastModel } from '../../lib/openrouter.js';
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
    // Generate a single hero image prompt
    const template = await getPromptTemplate('image_prompt', state.contentType);

    // Build a short summary from the outline (first 500 chars)
    const summary = state.outline.slice(0, 500);

    const prompt = template
      .replace('{title}', state.topic)
      .replace('{summary}', summary);

    console.log(`[ImageGenerate] Calling OpenRouter (openai/gpt-4o-mini) for hero image prompt...`);
    const model = createFastModel({ temperature: 0.7, maxTokens: 300 });

    const response = await model.invoke([
      { role: 'user', content: prompt },
    ]);
    console.log(`[ImageGenerate] Got prompt response (${String(response.content).length} chars)`);

    // Extract the single prompt (take the first meaningful line)
    const heroPrompt = String(response.content)
      .split('\n')
      .map((line) => line.replace(/^\d+[\.\)]\s*/, '').trim())
      .filter((line) => line.length > 10)
      [0] || 'Minimalist tech illustration, clean geometric shapes, bright colors on dark background, 16:9';

    // Generate the hero image
    const imagePrompts = [heroPrompt];
    const imageUrls: string[] = [];

    await progress.stageProgress('image_generate', 'Generating hero image...', 50);

    try {
      console.log(`[ImageGenerate] Generating hero image...`);
      const result = await generateImage(heroPrompt);
      imageUrls.push(result.urlPath);
      console.log(`[ImageGenerate] Hero image saved: ${result.urlPath}`);
    } catch (err) {
      console.error(`[ImageGenerate] Hero image failed:`, (err as Error).message);
    }

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
