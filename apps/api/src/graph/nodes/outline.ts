import { createChatModel } from '../../lib/openrouter.js';
import { getPromptTemplate } from '../prompts.js';
import { getFormatConfig } from '../format-config.js';
import { getProgress } from '../progress.js';
import type { GenerationStateType } from '../state.js';
import type { RunnableConfig } from '@langchain/core/runnables';

export const outlineNode = async (
  state: GenerationStateType,
  config?: RunnableConfig,
): Promise<Partial<GenerationStateType>> => {
  const progress = getProgress(config);
  await progress.stageStarted('create_outline');
  const startTime = Date.now();

  try {
    const template = await getPromptTemplate('outline', state.contentType);
    const formatConfig = getFormatConfig(state.contentType);

    const prompt = template
      .replace('{topic}', state.topic)
      .replace('{research}', state.researchResults)
      .replace('{ragContext}', state.ragContext.slice(0, 2000))
      .replace('{formatInstructions}', formatConfig.outlineInstructions);

    console.log(`[Outline] Calling OpenRouter (google/gemini-3-pro-preview) for ${state.contentType}...`);
    const model = createChatModel({ temperature: 0.5, maxTokens: 3000 });

    const response = await model.invoke([
      { role: 'user', content: prompt },
    ]);
    console.log(`[Outline] Got response (${String(response.content).length} chars)`);

    const content = String(response.content);
    const tokensUsed = (response.usage_metadata?.input_tokens || 0) + (response.usage_metadata?.output_tokens || 0);

    await progress.stageCompleted('create_outline', Date.now() - startTime, tokensUsed);

    return {
      outline: content,
      totalTokens: state.totalTokens + tokensUsed,
      currentStage: 'outline',
    };
  } catch (err) {
    await progress.stageFailed('create_outline', (err as Error).message);
    throw err;
  }
};
