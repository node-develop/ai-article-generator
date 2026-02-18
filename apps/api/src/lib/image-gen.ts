import { randomUUID } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = join(__dirname, '..', '..', 'uploads', 'images');

const getApiKey = (): string => {
  const key = process.env.OPEN_ROUTER_API_KEY;
  if (!key) throw new Error('OPEN_ROUTER_API_KEY is not set');
  return key;
};

export interface GeneratedImage {
  filePath: string;
  urlPath: string;
}

export const generateImage = async (prompt: string): Promise<GeneratedImage> => {
  await mkdir(UPLOADS_DIR, { recursive: true });

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-3-pro-image-preview',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      modalities: ['image', 'text'],
      image_config: {
        aspect_ratio: '16:9',
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Image generation failed (${response.status}): ${text}`);
  }

  const result = await response.json() as {
    choices: Array<{
      message: {
        images?: Array<{
          image_url: { url: string };
        }>;
      };
    }>;
  };

  const imageData = result.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!imageData) {
    throw new Error('No image returned from model');
  }

  // Parse base64 data URL: "data:image/png;base64,..."
  const match = imageData.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!match) {
    throw new Error('Unexpected image format (not base64 data URL)');
  }

  const ext = match[1];
  const base64 = match[2];
  const buffer = Buffer.from(base64, 'base64');

  const filename = `${randomUUID()}.${ext}`;
  const filePath = join(UPLOADS_DIR, filename);
  await writeFile(filePath, buffer);

  return {
    filePath,
    urlPath: `/api/uploads/images/${filename}`,
  };
};
