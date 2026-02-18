import { createResearchModel } from '../../lib/openrouter.js';
import { getPromptTemplate } from '../prompts.js';
import { getProgress } from '../progress.js';
import type { GenerationStateType } from '../state.js';
import type { RunnableConfig } from '@langchain/core/runnables';

export const researchNode = async (
  state: GenerationStateType,
  config?: RunnableConfig,
): Promise<Partial<GenerationStateType>> => {
  const progress = getProgress(config);
  await progress.stageStarted('research');
  const startTime = Date.now();

  try {
    const template = await getPromptTemplate('research');

    const prompt = template
      .replace('{topic}', state.topic)
      .replace('{inputUrl}', state.inputUrl || '')
      .replace('{keywords}', state.targetKeywords.join(', '));

    const model = createResearchModel({ maxTokens: 4000 });

    const response = await model.invoke([
      { role: 'user', content: prompt },
    ]);

    const content = String(response.content);
    const tokensUsed = (response.usage_metadata?.input_tokens || 0) + (response.usage_metadata?.output_tokens || 0);

    await progress.stageCompleted('research', Date.now() - startTime, tokensUsed);

    return {
      researchResults: content,
      sources: [],
      totalTokens: state.totalTokens + tokensUsed,
      currentStage: 'research',
    };
  } catch (err) {
    await progress.stageFailed('research', (err as Error).message);
    throw err;
  }
};
