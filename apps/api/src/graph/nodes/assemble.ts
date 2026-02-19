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
    let finalArticle = state.editedContent || state.fullDraft;

    // Insert hero image before H1 heading
    if (state.imageUrls.length > 0) {
      const heroUrl = state.imageUrls[0];
      const heroMd = `![Hero](${heroUrl})\n\n`;

      // Find the first H1 heading and insert image before it
      const h1Match = finalArticle.match(/^(#\s)/m);
      if (h1Match && h1Match.index !== undefined) {
        finalArticle = finalArticle.slice(0, h1Match.index) + heroMd + finalArticle.slice(h1Match.index);
      } else {
        // No H1 found — prepend the image
        finalArticle = heroMd + finalArticle;
      }
    }

    await progress.stageProgress('assemble', 'Saving article to database...');
    console.log(`[Assemble] Inserting article into DB (${finalArticle.length} chars)...`);

    // Store as generated article with the correct content type
    const [article] = await db.insert(articles).values({
      title: state.topic,
      rawText: finalArticle,
      cleanText: finalArticle,
      charCount: finalArticle.length,
      contentType: (state.contentType || 'longread') as any,
      isReference: false,
      createdBy: state.userId,
      metadata: {
        sources: state.sources,
        ragChunkCount: state.ragChunkCount,
        totalTokens: state.totalTokens,
      },
    }).returning();

    // Store hero image metadata
    if (state.imagePrompts.length > 0) {
      const imageValues = state.imagePrompts.map((prompt, i) => ({
        runId: state.runId,
        promptUsed: prompt,
        imageUrl: state.imageUrls[i] || '',
        position: 'hero',
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
