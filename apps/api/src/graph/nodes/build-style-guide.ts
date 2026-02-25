import { getProgress } from '../progress.js';
import { formatStyleGuide } from '../style-guide.js';
import type { GenerationStateType } from '../state.js';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { ContentType } from '@articleforge/shared';

export const buildStyleGuideNode = async (
  state: GenerationStateType,
  config?: RunnableConfig,
): Promise<Partial<GenerationStateType>> => {
  const progress = getProgress(config);
  await progress.stageStarted('build_style_guide');
  const startTime = Date.now();

  try {
    const { retrieveStyleProfiles, retrieveExemplarParagraphs } = await import('../../rag/retrieval.js');

    await progress.stageProgress('build_style_guide', 'Loading style profiles...');

    const profiles = await retrieveStyleProfiles(state.contentType as ContentType, 5);

    if (profiles.length === 0) {
      console.log('[BuildStyleGuide] No style profiles found, returning empty guide');
      await progress.stageCompleted('build_style_guide', Date.now() - startTime);
      return {
        styleGuide: '',
        styleExamples: '',
        styleProfileCount: 0,
        };
    }

    await progress.stageProgress('build_style_guide', `Found ${profiles.length} style profiles, building guide...`);

    const styleGuide = formatStyleGuide(profiles, state.contentType);

    // Retrieve exemplar paragraphs
    const exemplars = await retrieveExemplarParagraphs(state.contentType as ContentType, 3);
    const styleExamples = exemplars.length > 0
      ? exemplars.join('\n\n---\n\n')
      : '';

    await progress.stageCompleted('build_style_guide', Date.now() - startTime);

    return {
      styleGuide,
      styleExamples,
      styleProfileCount: profiles.length,
    };
  } catch (err) {
    console.warn('[BuildStyleGuide] Style guide build failed:', (err as Error).message);
    await progress.stageCompleted('build_style_guide', Date.now() - startTime);

    return {
      styleGuide: '',
      styleExamples: '',
      styleProfileCount: 0,
    };
  }
};
