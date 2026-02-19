import { Annotation } from '@langchain/langgraph';

export const GenerationState = Annotation.Root({
  // Input
  runId: Annotation<string>,
  userId: Annotation<string>,
  topic: Annotation<string>,
  inputUrl: Annotation<string | null>,
  companyLinks: Annotation<string[]>,
  targetKeywords: Annotation<string[]>,
  enableReview: Annotation<boolean>,
  contentType: Annotation<string>,

  // Research results
  researchResults: Annotation<string>,
  sources: Annotation<string[]>,

  // RAG context
  ragContext: Annotation<string>,
  ragChunkCount: Annotation<number>,

  // Outline
  outline: Annotation<string>,

  // Written content
  sections: Annotation<string[]>,
  fullDraft: Annotation<string>,

  // Edited content
  editedContent: Annotation<string>,

  // Images
  imagePrompts: Annotation<string[]>,
  imageUrls: Annotation<string[]>,

  // Final
  finalArticle: Annotation<string>,
  articleId: Annotation<string | null>,

  // Tracking
  totalTokens: Annotation<number>,
  totalCost: Annotation<number>,
  currentStage: Annotation<string>,
  error: Annotation<string | null>,
});

export type GenerationStateType = typeof GenerationState.State;
