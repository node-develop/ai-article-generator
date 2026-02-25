import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

export interface TextChunk {
  text: string;
  index: number;
  sectionTitle: string | null;
  tokenCount: number;
}

// Approximate token count (1 token ~ 4 chars for English, ~2 chars for Russian)
const estimateTokens = (text: string): number => {
  const hasRussian = /[а-яА-ЯёЁ]/.test(text);
  return Math.ceil(text.length / (hasRussian ? 2 : 4));
};

const extractSectionTitle = (text: string): string | null => {
  const firstLine = text.split('\n')[0]?.trim();
  if (firstLine && firstLine.length < 100 && !firstLine.endsWith('.')) {
    return firstLine;
  }
  return null;
};

export const chunkText = async (text: string): Promise<TextChunk[]> => {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1024,  // ~512 tokens for Russian text
    chunkOverlap: 100, // ~50 tokens overlap
    separators: ['\n\n', '\n', '. ', ' ', ''],
  });

  const docs = await splitter.createDocuments([text]);

  return docs.map((doc, index) => ({
    text: doc.pageContent,
    index,
    sectionTitle: extractSectionTitle(doc.pageContent),
    tokenCount: estimateTokens(doc.pageContent),
  }));
};
