// Token costs per 1000 tokens (USD) — OpenRouter pricing
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'anthropic/claude-sonnet-4': { input: 0.003, output: 0.015 },
  'openai/gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'openai/text-embedding-3-small': { input: 0.00002, output: 0 },
};

export const calculateCost = (
  model: string,
  inputTokens: number,
  outputTokens: number,
): number => {
  const costs = MODEL_COSTS[model] || { input: 0.001, output: 0.002 };
  return (inputTokens / 1000) * costs.input + (outputTokens / 1000) * costs.output;
};

export const formatCostUsd = (cost: number): string =>
  `$${cost.toFixed(4)}`;
