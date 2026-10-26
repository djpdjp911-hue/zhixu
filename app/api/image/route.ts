import { z } from 'zod';
import { errorMessage, llmConfig, llmReady, LLMError } from '@/lib/server/llm';
import { transcribeImage } from '@/lib/server/agent';
export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin)
    return Response.json({ error: '请求来源不受支持' }, { status: 403 });
  const config = llmConfig();
  if (!llmReady(config))
    return Response.json(
      { error: '图片文字识别需要先配置模型服务。你仍可导入 PDF、Markdown 和文本资料。' },
      { status: 503 },
    );
  let data: { data: string; mimeType: 'image/png' | 'image/jpeg' | 'image/webp' };
  try {
    const raw = await request.text();
    if (raw.length > 4000000)
      return Response.json({ error: '图片过大，请选择 2MB 以内的图片' }, { status: 413 });
    data = z
      .object({
        data: z
          .string()
          .min(10)
          .max(3000000)
          .regex(/^[A-Za-z0-9+/=]+$/),
        mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
      })
      .parse(JSON.parse(raw));
  } catch {
    return Response.json({ error: '请选择 PNG、JPEG 或 WebP 图片' }, { status: 400 });
  }
  try {
    return Response.json(
      { text: await transcribeImage(config, data.data, data.mimeType, request.signal) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const noText = error instanceof LLMError && error.code === 'IMAGE_NO_TEXT';
    return Response.json({ error: errorMessage(error) }, { status: noText ? 422 : 502 });
  }
}
