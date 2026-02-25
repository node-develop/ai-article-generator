import { db } from '../../db/index.js';
import { generationRuns } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getProgress } from '../progress.js';
import { getInterruptHandler } from '../interrupt.js';
import { createChatModel } from '../../lib/openrouter.js';
import { getPromptTemplate } from '../prompts.js';
import { getFormatConfig } from '../format-config.js';
import type { GenerationStateType } from '../state.js';
import type { RunnableConfig } from '@langchain/core/runnables';

const MAX_REJECT_ROUNDS = 3;

export const editReviewNode = async (
  state: GenerationStateType,
  config?: RunnableConfig,
): Promise<Partial<GenerationStateType>> => {
  const progress = getProgress(config);
  const interruptHandler = getInterruptHandler(config);

  if (!interruptHandler) {
    console.warn('[EditReview] No interrupt handler available, skipping review');
    return {};
  }

  // Update DB status
  await db.update(generationRuns)
    .set({ status: 'edit_review', currentStage: 'edit_review' })
    .where(eq(generationRuns.id, state.runId));

  let currentContent = state.editedContent;
  let round = 0;

  while (round < MAX_REJECT_ROUNDS) {
    // Publish interrupt:waiting with edited content
    await progress.interruptWaiting('edit_review', currentContent);
    console.log(`[EditReview] Waiting for response (round ${round + 1}/${MAX_REJECT_ROUNDS})...`);

    const response = await interruptHandler.waitForResponse('edit_review');
    console.log(`[EditReview] Received response: ${response.action}`);

    if (response.action === 'approve') {
      break;
    }

    if (response.action === 'edit') {
      currentContent = String(response.updated_data);
      break;
    }

    if (response.action === 'reject') {
      round++;
      if (round >= MAX_REJECT_ROUNDS) {
        console.warn(`[EditReview] Max rejection rounds reached, proceeding with last content`);
        break;
      }

      // Regenerate edited content with feedback
      console.log(`[EditReview] Regenerating content with feedback: "${response.feedback}"`);
      await progress.stageProgress('edit_review', `Regenerating content (round ${round + 1})...`);

      const template = await getPromptTemplate('edit_polish', state.contentType);
      const formatConfig = getFormatConfig(state.contentType);

      const prompt = template
        .replace('{draft}', currentContent)
        .replace('{ragContext}', state.ragContext.slice(0, formatConfig.contextSliceLimit))
        .replace('{keywords}', state.targetKeywords.join(', '))
        .replace('{editInstructions}', formatConfig.editInstructions)
        + `\n\nПредыдущий вариант текста был отклонён редактором. Обратная связь:\n${response.feedback}\n\nДоработай текст с учётом обратной связи.`;

      const model = createChatModel({ temperature: 0.3, maxTokens: formatConfig.editMaxTokens });
      const llmResponse = await model.invoke([
        { role: 'user', content: prompt },
      ]);

      currentContent = String(llmResponse.content);
    }
  }

  // Update DB status to images
  await db.update(generationRuns)
    .set({ status: 'images', currentStage: 'images' })
    .where(eq(generationRuns.id, state.runId));

  await progress.interruptResumed('edit_review');

  return {
    editedContent: currentContent,
  };
};
