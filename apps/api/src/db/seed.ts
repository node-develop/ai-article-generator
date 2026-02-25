import 'dotenv/config';
import { auth } from '../auth/index.js';
import { db } from './index.js';
import { users, prompts } from './schema.js';
import { eq, and, count } from 'drizzle-orm';

const PROMPT_SEEDS = [
  {
    stage: 'research',
    name: 'Исследование темы',
    template: `Ты — исследовательский ассистент для технологического блога. Проведи глубокое исследование указанной темы.

Тема: {topic}
URL для анализа: {inputUrl}
Ключевые слова: {keywords}

Задачи:
1. Собери ключевые факты, цифры и актуальные данные по теме
2. Определи основные тенденции и экспертные мнения
3. Найди технические детали, спецификации и сравнительные характеристики
4. Выяви потенциальные проблемы и их решения
5. Подбери примеры применения и практические кейсы

Выведи структурированный отчёт на русском языке с подзаголовками для каждого раздела исследования. Используй конкретные цифры и факты, избегай общих фраз.`,
  },
  {
    stage: 'outline',
    name: 'Создание плана статьи',
    template: `Создай детальный план статьи для технологического блога на русском языке.

Тема: {topic}

Результаты исследования:
{research}

Контекст стиля (из эталонных статей):
{ragContext}

Требования к плану:
1. Заголовок H1 — цепляющий, информативный, содержит ключевые слова
2. 4–6 секций H2, каждая с кратким описанием содержания (2-3 предложения)
3. Для каждой секции укажи ключевые тезисы и данные из исследования
4. Обозначь места для вставки иллюстраций (после какой секции)
5. Предусмотри введение и заключение

Формат вывода — markdown, где каждая секция обозначена через ## заголовок, после которого идёт описание.`,
  },
  {
    stage: 'write_section',
    name: 'Написание секции',
    template: `Напиши секцию статьи для технологического блога на русском языке.

Заголовок секции: {sectionTitle}
Описание секции: {sectionDescription}
Полный план статьи: {outline}
Данные исследования: {research}
Контекст стиля (из эталонных статей): {ragContext}
Ссылки компании для органичной интеграции: {companyLinks}

Требования:
- Профессиональный, но доступный тон — как для опытного IT-специалиста
- Конкретика: цифры, характеристики, сравнения, примеры
- Активная форма глаголов, без канцелярита
- Логичные переходы между абзацами
- Технические термины с пояснениями, где это нужно
- Если релевантно, органично вставь ссылки компании в текст
- Объём: 300–500 слов для секции

Выведи только текст секции в формате markdown (без повторения заголовка H2).`,
  },
  {
    stage: 'edit_polish',
    name: 'Редактура и полировка',
    template: `Отредактируй и доработай черновик статьи для технологического блога на русском языке.

Черновик:
{draft}

Контекст стиля (из эталонных статей):
{ragContext}

Целевые ключевые слова для SEO: {keywords}

Задачи редактуры:
1. Проверь логику изложения и связность между секциями
2. Оптимизируй для SEO: ключевые слова в заголовках и первых абзацах, мета-описание
3. Выровняй тон: профессиональный, живой, без канцелярита — как в эталонных статьях
4. Проверь техническую точность формулировок
5. Добавь плавные переходы между секциями
6. Убери повторы, длинноты, общие фразы
7. Убедись, что введение цепляет, а заключение содержит конкретный вывод

Верни полностью отредактированную статью в формате markdown. Сохрани всю структуру H1/H2.`,
  },
  {
    stage: 'image_prompt',
    name: 'Промпты для иллюстраций',
    template: `Сгенерируй промпты для создания иллюстраций к технологической статье.

Заголовок статьи: {title}
Секции: {sections}

Создай {count} промптов для генерации изображений, каждый на отдельной строке.
Каждый промпт должен описывать чистую, профессиональную иллюстрацию в tech-стиле.
Промпты пиши на английском языке (для генератора изображений).
Формат: минималистичный flat design, яркие цвета, без текста на изображении.`,
  },
];

const seed = async () => {
  console.log('Seeding database...');

  // --- Admin user ---
  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.email, 'admin@articleforge.local'))
    .limit(1);

  if (existingUser.length > 0) {
    console.log('Admin user already exists, skipping...');
  } else {
    const result = await auth.api.signUpEmail({
      body: {
        name: 'Admin',
        email: 'admin@articleforge.local',
        password: 'admin123456',
      },
    });

    if (!result) {
      console.error('Failed to create admin user');
      process.exit(1);
    }

    await db
      .update(users)
      .set({ role: 'admin' })
      .where(eq(users.email, 'admin@articleforge.local'));

    console.log('Admin user created: admin@articleforge.local / admin123456');
  }

  // --- Prompts ---
  const [promptCount] = await db.select({ count: count() }).from(prompts);
  if (Number(promptCount.count) > 0) {
    console.log(`Prompts already seeded (${promptCount.count} found), skipping...`);
  } else {
    for (const p of PROMPT_SEEDS) {
      await db.insert(prompts).values({
        stage: p.stage,
        name: p.name,
        template: p.template,
        version: 1,
        isActive: true,
      });
      console.log(`  Prompt seeded: ${p.stage} — ${p.name}`);
    }
    console.log(`Seeded ${PROMPT_SEEDS.length} prompts`);
  }

  process.exit(0);
};

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
