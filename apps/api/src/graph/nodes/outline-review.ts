import { db } from '../../db/index.js';
import { generationRuns } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getProgress } from '../progress.js';
import { getInterruptHandler } from '../interrupt.js';
import { createChatModel } from '../../lib/openrouter.js';
import { getPromptTemplate } from '../prompts.js';
import { getFormatConfig } from '../format-config.js';
import { buildStyleBlock } from '../style-block.js';
import type { GenerationStateType } from '../state.js';
import type { RunnableConfig } from '@langchain/core/runnables';

const MAX_REJECT_ROUNDS = 3;

export const outlineReviewNode = async (
  state: GenerationStateType,
  config?: RunnableConfig,
): Promise<Partial<GenerationStateType>> => {
  const progress = getProgress(config);
  const interruptHandler = getInterruptHandler(config);

  if (!interruptHandler) {
    console.warn('[OutlineReview] No interrupt handler available, skipping review');
    return {};
  }

  // Update DB status
  await db.update(generationRuns)
    .set({ status: 'outline_review', currentStage: 'outline_review' })
    .where(eq(generationRuns.id, state.runId));

  let currentOutline = state.outline;
  let round = 0;

  while (round < MAX_REJECT_ROUNDS) {
    // Publish interrupt:waiting with outline content
    await progress.interruptWaiting('outline_review', currentOutline);
    console.log(`[OutlineReview] Waiting for response (round ${round + 1}/${MAX_REJECT_ROUNDS})...`);

    const response = await interruptHandler.waitForResponse('outline_review');
    console.log(`[OutlineReview] Received response: ${response.action}`);

    if (response.action === 'approve') {
      break;
    }

    if (response.action === 'edit') {
      currentOutline = String(response.updated_data);
      break;
    }

    if (response.action === 'reject') {
      round++;
      if (round >= MAX_REJECT_ROUNDS) {
        console.warn(`[OutlineReview] Max rejection rounds reached, proceeding with last outline`);
        break;
      }

      // Regenerate outline with feedback
      console.log(`[OutlineReview] Regenerating outline with feedback: "${response.feedback}"`);
      await progress.stageProgress('outline_review', `Regenerating outline (round ${round + 1})...`);

      const template = await getPromptTemplate('outline', state.contentType);
      const formatConfig = getFormatConfig(state.contentType);

      const prompt = template
        .replace('{topic}', state.topic)
        .replace('{research}', state.researchResults)
        .replace('{ragContext}', state.ragContext.slice(0, formatConfig.contextSliceLimit))
        .replace('{styleBlock}', buildStyleBlock(state.styleGuide, state.styleExamples))
        .replace('{formatInstructions}', formatConfig.outlineInstructions)
        + `\n\nПредыдущий вариант плана был отклонён. Обратная связь от редактора:\n${response.feedback}\n\nПредыдущий план:\n${currentOutline}\n\nСоздай новый план с учётом обратной связи.`;

      const model = createChatModel({ temperature: 0.5, maxTokens: formatConfig.outlineMaxTokens });
      const llmResponse = await model.invoke([
        { role: 'user', content: prompt },
      ]);

      currentOutline = String(llmResponse.content);
    }
  }

  // Update DB status back to writing
  await db.update(generationRuns)
    .set({ status: 'writing', currentStage: 'writing' })
    .where(eq(generationRuns.id, state.runId));

  await progress.interruptResumed('outline_review');

  return {
    outline: currentOutline,
  };
};
