import { StateGraph } from '@langchain/langgraph';
import { GenerationState } from './state.js';
import { researchNode } from './nodes/research.js';
import { ragContextNode } from './nodes/rag-context.js';
import { buildStyleGuideNode } from './nodes/build-style-guide.js';
import { outlineNode } from './nodes/outline.js';
import { outlineReviewNode } from './nodes/outline-review.js';
import { writeSectionsNode } from './nodes/write-sections.js';
import { editPolishNode } from './nodes/edit-polish.js';
import { editReviewNode } from './nodes/edit-review.js';
import { imageGenerateNode } from './nodes/image-generate.js';
import { assembleNode } from './nodes/assemble.js';
import type { GenerationStateType } from './state.js';

export const createGenerationGraph = () => {
  const graph = new StateGraph(GenerationState)
    .addNode('research', researchNode)
    .addNode('rag_context', ragContextNode)
    .addNode('build_style_guide', buildStyleGuideNode)
    .addNode('create_outline', outlineNode)
    .addNode('outline_review', outlineReviewNode)
    .addNode('write_sections', writeSectionsNode)
    .addNode('edit_polish', editPolishNode)
    .addNode('edit_review', editReviewNode)
    .addNode('image_generate', imageGenerateNode)
    .addNode('assemble', assembleNode)
    .addEdge('__start__', 'research')
    // Fan-out: research → rag_context + build_style_guide in parallel
    .addEdge('research', 'rag_context')
    .addEdge('research', 'build_style_guide')
    // Fan-in: both converge at create_outline
    .addEdge('rag_context', 'create_outline')
    .addEdge('build_style_guide', 'create_outline')
    .addConditionalEdges('create_outline', (state: GenerationStateType) =>
      state.enableOutlineReview ? 'outline_review' : 'write_sections',
    )
    .addEdge('outline_review', 'write_sections')
    .addEdge('write_sections', 'edit_polish')
    .addConditionalEdges('edit_polish', (state: GenerationStateType) =>
      state.enableEditReview ? 'edit_review' : 'image_generate',
    )
    .addEdge('edit_review', 'image_generate')
    .addEdge('image_generate', 'assemble')
    .addEdge('assemble', '__end__');

  return graph.compile();
};
