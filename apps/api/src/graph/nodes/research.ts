import { createResearchModel } from '../../lib/openrouter.js';
import { getPromptTemplate } from '../prompts.js';
import { getFormatConfig } from '../format-config.js';
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
    const template = await getPromptTemplate('research', state.contentType);
    const formatConfig = getFormatConfig(state.contentType);
    console.log(`[Research] Got prompt template, building prompt for topic: "${state.topic}" (format: ${state.contentType})`);

    const prompt = template
      .replace('{topic}', state.topic)
      .replace('{inputUrl}', state.inputUrls.join('\n'))
      .replace('{inputUrls}', state.inputUrls.join('\n'))
      .replace('{keywords}', state.targetKeywords.join(', '));

    console.log(`[Research] Creating model: perplexity/sonar-pro via OpenRouter (maxTokens: ${formatConfig.researchMaxTokens})`);
    const model = createResearchModel({ maxTokens: formatConfig.researchMaxTokens });

    console.log(`[Research] Calling OpenRouter API...`);
    const response = await model.invoke([
      { role: 'user', content: prompt },
    ]);
    console.log(`[Research] Got response from OpenRouter (${String(response.content).length} chars)`);

    const content = String(response.content);
    const tokensUsed = (response.usage_metadata?.input_tokens || 0) + (response.usage_metadata?.output_tokens || 0);
    console.log(`[Research] Tokens used: ${tokensUsed}`);

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
