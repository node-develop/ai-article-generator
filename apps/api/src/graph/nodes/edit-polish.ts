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

    console.log(`[EditPolish] Calling OpenRouter (google/gemini-3-pro-preview)...`);
    const model = createChatModel({ temperature: 0.3, maxTokens: 8000 });

    const response = await model.invoke([
      { role: 'user', content: prompt },
    ]);
    console.log(`[EditPolish] Got response (${String(response.content).length} chars)`);

    const rawContent = String(response.content);

    // Strip LLM preamble and meta-commentary
    const stripPreamble = (text: string): string => {
      let cleaned = text;

      // Remove everything before the first markdown heading (# or ##)
      const headingMatch = cleaned.match(/^([\s\S]*?)(^#\s)/m);
      if (headingMatch && headingMatch.index !== undefined) {
        const before = headingMatch[1];
        // Only strip if the preamble is short (< 500 chars) to avoid cutting real content
        if (before.length > 0 && before.length < 500) {
          cleaned = cleaned.slice(headingMatch.index + headingMatch[1].length);
        }
      }

      // Remove "Meta Description:" lines
      cleaned = cleaned.replace(/^Meta\s*Description\s*[:：].*$/gim, '');

      // Remove common Russian LLM preamble lines
      const preamblePatterns = [
        /^Вот\s+(отредактированн|исправленн|доработанн|обновлённ|переработанн).+?[:.]?\s*$/gim,
        /^Ниже\s+(приведён|представлен).+?[:.]?\s*$/gim,
        /^Я\s+(сохранил|переписал|отредактировал|изменил|доработал|убрал|добавил).+?[:.]?\s*$/gim,
      ];
      for (const pattern of preamblePatterns) {
        cleaned = cleaned.replace(pattern, '');
      }

      // Collapse multiple blank lines into max 2
      cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

      return cleaned.trim();
    };

    const content = stripPreamble(rawContent);
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
