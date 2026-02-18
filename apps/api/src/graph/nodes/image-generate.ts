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
    // Generate image prompts using LLM
    const template = await getPromptTemplate('image_prompt');
    const prompt = template
      .replace('{title}', state.topic)
      .replace('{sections}', state.sections.map((_, i) => `Section ${i + 1}`).join(', '))
      .replace('{count}', '3');

    console.log(`[ImageGenerate] Calling OpenRouter (openai/gpt-4o-mini) for prompts...`);
    const model = createFastModel({ temperature: 0.7, maxTokens: 500 });

    const response = await model.invoke([
      { role: 'user', content: prompt },
    ]);
    console.log(`[ImageGenerate] Got prompt response (${String(response.content).length} chars)`);

    const imagePrompts = String(response.content)
      .split('\n')
      .map((line) => line.replace(/^\d+[\.\)]\s*/, '').trim())
      .filter((line) => line.length > 10)
      .slice(0, 3);

    // Generate actual images via Nano Banana Pro
    const imageUrls: string[] = [];
    for (let i = 0; i < imagePrompts.length; i++) {
      const pct = Math.round(((i + 1) / imagePrompts.length) * 100);
      await progress.stageProgress(
        'image_generate',
        `Generating image ${i + 1}/${imagePrompts.length}...`,
        pct,
      );

      try {
        console.log(`[ImageGenerate] Generating image ${i + 1}/${imagePrompts.length}...`);
        const result = await generateImage(imagePrompts[i]);
        imageUrls.push(result.urlPath);
        console.log(`[ImageGenerate] Image ${i + 1} saved: ${result.urlPath}`);
      } catch (err) {
        console.error(`[ImageGenerate] Image ${i + 1} failed:`, (err as Error).message);
        // Continue with remaining images; don't fail the whole pipeline
      }
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
