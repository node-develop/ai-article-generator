export const buildStyleBlock = (styleGuide: string, styleExamples: string): string => {
  if (!styleGuide) return '';

  const parts = [styleGuide];

  if (styleExamples) {
    parts.push(`\nПримеры из эталонных статей (для понимания тона):\n${styleExamples}`);
  }

  parts.push('\nОБЯЗАТЕЛЬНО: следуй метрикам и конструкциям из стилевого руководства. Избегай паттернов из раздела «ИЗБЕГАТЬ».');

  return '\n' + parts.join('\n');
};
