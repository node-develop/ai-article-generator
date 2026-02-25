import { createChatModel } from '../../lib/openrouter.js';
import { getPromptTemplate } from '../prompts.js';
import { getFormatConfig } from '../format-config.js';
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

  // Fallback: try splitting by numbered items (1. 2. 3.) or bold markers
  if (sections.length === 0) {
    const numberedItems = outline.match(/(?:^|\n)\d+[\.\)]\s*.+/g);
    if (numberedItems && numberedItems.length >= 2) {
      for (const item of numberedItems) {
        const title = item.replace(/^\n?\d+[\.\)]\s*/, '').trim();
        if (title) sections.push({ title, description: title });
      }
    }
  }

  // Last resort fallback
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
    const template = await getPromptTemplate('write_section', state.contentType);
    const formatConfig = getFormatConfig(state.contentType);
    const sectionDefs = parseSections(state.outline);

    const model = createChatModel({ temperature: 0.7, maxTokens: formatConfig.sectionMaxTokens });

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
        .replace('{research}', state.researchResults.slice(0, formatConfig.contextSliceLimit))
        .replace('{ragContext}', state.ragContext.slice(0, formatConfig.contextSliceLimit))
        .replace('{companyLinks}', state.companyLinks.join(', '))
        .replace('{sectionInstructions}', formatConfig.sectionInstructions);

      console.log(`[WriteSections] Calling OpenRouter for section ${i + 1}/${sectionDefs.length}: "${section.title}"...`);
      const response = await model.invoke([
        { role: 'user', content: prompt },
      ]);
      console.log(`[WriteSections] Section ${i + 1} done (${String(response.content).length} chars)`);

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
