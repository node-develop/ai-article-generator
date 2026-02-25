import 'dotenv/config';
import { auth } from '../auth/index.js';
import { db } from './index.js';
import { users, prompts } from './schema.js';
import { eq, and, count, isNull } from 'drizzle-orm';

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

Контекст из эталонных статей:
{ragContext}
{styleBlock}

Требования к формату:
{formatInstructions}

Общие требования к плану:
1. Заголовок H1 — цепляющий, информативный, содержит ключевые слова
2. Каждая секция обозначена через ## заголовок, после которого идёт описание (2-3 предложения)
3. Для каждой секции укажи ключевые тезисы и данные из исследования
4. Обозначь места для вставки иллюстраций (после какой секции)

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
Контекст из эталонных статей: {ragContext}
{styleBlock}
Ссылки компании для органичной интеграции: {companyLinks}

Требования к формату:
{sectionInstructions}

Общие требования:
- Профессиональный, но доступный тон — как для опытного IT-специалиста
- Конкретика: цифры, характеристики, сравнения, примеры
- Активная форма глаголов, без канцелярита
- Логичные переходы между абзацами
- Технические термины с пояснениями, где это нужно
- Если релевантно, органично вставь ссылки компании в текст

Выведи только текст секции в формате markdown (без повторения заголовка H2).`,
  },
  {
    stage: 'edit_polish',
    name: 'Редактура и полировка',
    template: `Отредактируй и доработай черновик статьи для технологического блога на русском языке.

Черновик:
{draft}
{styleBlock}

Целевые ключевые слова для SEO: {keywords}

Требования к формату:
{editInstructions}

Задачи редактуры:
1. Проверь логику изложения и связность между секциями
2. Оптимизируй для SEO: ключевые слова в заголовках и первых абзацах
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
    template: `Сгенерируй один промпт для создания hero-иллюстрации к технологической статье.

Заголовок статьи: {title}
Краткое содержание: {summary}

Создай один промпт на английском языке для генерации hero-изображения.
Промпт должен описывать чистую, профессиональную иллюстрацию в tech-стиле.
Формат: минималистичный flat design, яркие цвета, без текста на изображении, 16:9.
Выведи только промпт, без нумерации и пояснений.`,
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
  if (Number(promptCount.count) === 0) {
    // Fresh database — insert all seeds
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
  } else {
    // Existing database — update universal prompts that are missing required placeholders
    console.log(`Prompts exist (${promptCount.count} found), checking for stale universal prompts...`);
    const requiredPlaceholders: Record<string, string[]> = {
      outline: ['{styleBlock}', '{formatInstructions}'],
      write_section: ['{styleBlock}', '{sectionInstructions}'],
      edit_polish: ['{styleBlock}', '{editInstructions}'],
      image_prompt: ['{summary}'],
    };

    for (const p of PROMPT_SEEDS) {
      const checks = requiredPlaceholders[p.stage];
      if (!checks) continue;

      // Find the active universal prompt for this stage
      const [existing] = await db.select().from(prompts).where(
        and(eq(prompts.stage, p.stage), isNull(prompts.contentType), eq(prompts.isActive, true)),
      ).limit(1);
      if (!existing) continue;

      // Check if it's missing any required placeholders
      const missing = checks.filter((ph) => !existing.template.includes(ph));
      if (missing.length > 0) {
        // Deactivate old and insert updated version
        await db.update(prompts).set({ isActive: false }).where(eq(prompts.id, existing.id));
        await db.insert(prompts).values({
          stage: p.stage,
          name: p.name,
          template: p.template,
          version: (existing.version || 1) + 1,
          isActive: true,
        });
        console.log(`  Updated stale prompt: ${p.stage} (was missing: ${missing.join(', ')})`);
      }
    }
  }

  process.exit(0);
};

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
