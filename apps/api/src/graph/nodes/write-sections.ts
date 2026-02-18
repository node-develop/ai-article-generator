import { createChatModel } from '../../lib/openrouter.js';
import { getPromptTemplate } from '../prompts.js';
import { getProgress } from '../progress.js';
import type { GenerationStateType } from '../state.js';
import type { RunnableConfig } from '@langchain/core/runnables';

const parseSections = (outline: string): Array<{ title: string; description: string }> => {
  const sections: Array<{ title: string; description: string }> = [];
  const lines = outline.split('\n');
  let currentTitle = '';
  let currentDesc = '';

  for (const line of lines) {
    if (line.match(/^##\s+/) || line.match(/^H2[:\s]/i)) {
      if (currentTitle) {
        sections.push({ title: currentTitle, description: currentDesc.trim() });
      }
      currentTitle = line.replace(/^##\s+/, '').replace(/^H2[:\s]*/i, '').trim();
      currentDesc = '';
    } else if (currentTitle) {
      currentDesc += line + '\n';
    }
  }
  if (currentTitle) {
    sections.push({ title: currentTitle, description: currentDesc.trim() });
  }

  // Fallback if no sections found
  if (sections.length === 0) {
    sections.push({ title: 'Main Content', description: outline });
  }

  return sections;
};

export const writeSectionsNode = async (
  state: GenerationStateType,
  config?: RunnableConfig,
): Promise<Partial<GenerationStateType>> => {
  const progress = getProgress(config);
  await progress.stageStarted('write_sections');
  const startTime = Date.now();

  try {
    const template = await getPromptTemplate('write_section');
    const sectionDefs = parseSections(state.outline);

    const model = createChatModel({ temperature: 0.7, maxTokens: 2000 });

    const sections: string[] = [];
    let totalNewTokens = 0;

    for (let i = 0; i < sectionDefs.length; i++) {
      const section = sectionDefs[i];
      const percent = Math.round(((i) / sectionDefs.length) * 100);
      await progress.stageProgress(
        'write_sections',
        `Writing section ${i + 1}/${sectionDefs.length}: ${section.title}`,
        percent,
      );

      const prompt = template
        .replace('{sectionTitle}', section.title)
        .replace('{sectionDescription}', section.description)
        .replace('{outline}', state.outline)
        .replace('{research}', state.researchResults.slice(0, 2000))
        .replace('{ragContext}', state.ragContext.slice(0, 2000))
        .replace('{companyLinks}', state.companyLinks.join(', '));

      const response = await model.invoke([
        { role: 'user', content: prompt },
      ]);

      sections.push(String(response.content));
      totalNewTokens += (response.usage_metadata?.input_tokens || 0) + (response.usage_metadata?.output_tokens || 0);
    }

    const fullDraft = sections.join('\n\n');

    await progress.stageCompleted('write_sections', Date.now() - startTime, totalNewTokens);

    return {
      sections,
      fullDraft,
      totalTokens: state.totalTokens + totalNewTokens,
      currentStage: 'writing',
    };
  } catch (err) {
    await progress.stageFailed('write_sections', (err as Error).message);
    throw err;
  }
};
