import { createChatModel } from '../../lib/openrouter.js';
import { getPromptTemplate } from '../prompts.js';
import { getProgress } from '../progress.js';
import type { GenerationStateType } from '../state.js';
import type { RunnableConfig } from '@langchain/core/runnables';

export const editPolishNode = async (
  state: GenerationStateType,
  config?: RunnableConfig,
): Promise<Partial<GenerationStateType>> => {
  const progress = getProgress(config);
  await progress.stageStarted('edit_polish');
  const startTime = Date.now();

  try {
    const template = await getPromptTemplate('edit_polish');

    const prompt = template
      .replace('{draft}', state.fullDraft)
      .replace('{ragContext}', state.ragContext.slice(0, 2000))
      .replace('{keywords}', state.targetKeywords.join(', '));

    const model = createChatModel({ temperature: 0.3, maxTokens: 8000 });

    const response = await model.invoke([
      { role: 'user', content: prompt },
    ]);

    const content = String(response.content);
    const tokensUsed = (response.usage_metadata?.input_tokens || 0) + (response.usage_metadata?.output_tokens || 0);

    await progress.stageCompleted('edit_polish', Date.now() - startTime, tokensUsed);

    return {
      editedContent: content,
      totalTokens: state.totalTokens + tokensUsed,
      currentStage: 'editing',
    };
  } catch (err) {
    await progress.stageFailed('edit_polish', (err as Error).message);
    throw err;
  }
};
