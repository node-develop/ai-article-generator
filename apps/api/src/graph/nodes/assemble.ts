import { db } from '../../db/index.js';
import { articles, generatedImages } from '../../db/schema.js';
import { getProgress } from '../progress.js';
import type { GenerationStateType } from '../state.js';
import type { RunnableConfig } from '@langchain/core/runnables';

export const assembleNode = async (
  state: GenerationStateType,
  config?: RunnableConfig,
): Promise<Partial<GenerationStateType>> => {
  const progress = getProgress(config);
  await progress.stageStarted('assemble');
  const startTime = Date.now();

  try {
    // Build final markdown article
    let finalArticle = state.editedContent || state.fullDraft;

    // Insert images if available
    if (state.imageUrls.length > 0) {
      for (let i = 0; i < state.imageUrls.length; i++) {
        const imgMd = `\n\n![Illustration ${i + 1}](${state.imageUrls[i]})\n\n`;
        // Insert after the (i+1)th H2 heading
        const h2Regex = /\n##\s/g;
        let match;
        let count = 0;
        while ((match = h2Regex.exec(finalArticle)) !== null) {
          count++;
          if (count === i + 1) {
            const insertPos = finalArticle.indexOf('\n', match.index + 1);
            if (insertPos > 0) {
              finalArticle = finalArticle.slice(0, insertPos) + imgMd + finalArticle.slice(insertPos);
            }
            break;
          }
        }
      }
    }

    await progress.stageProgress('assemble', 'Saving article to database...');

    // Store as generated article
    const [article] = await db.insert(articles).values({
      title: state.topic,
      rawText: finalArticle,
      cleanText: finalArticle,
      charCount: finalArticle.length,
      contentType: 'longread',
      isReference: false,
      createdBy: state.userId,
      metadata: {
        sources: state.sources,
        ragChunkCount: state.ragChunkCount,
        totalTokens: state.totalTokens,
      },
    }).returning();

    // Store image prompts
    if (state.imagePrompts.length > 0) {
      const imageValues = state.imagePrompts.map((prompt, i) => ({
        runId: state.runId,
        promptUsed: prompt,
        imageUrl: state.imageUrls[i] || '',
        position: `section_${i + 1}`,
      }));

      await db.insert(generatedImages).values(imageValues);
    }

    await progress.stageCompleted('assemble', Date.now() - startTime);

    return {
      finalArticle,
      articleId: article.id,
      currentStage: 'assembling',
    };
  } catch (err) {
    await progress.stageFailed('assemble', (err as Error).message);
    throw err;
  }
};
