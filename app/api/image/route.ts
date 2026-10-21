import { z } from 'zod';
import { modelReady, transcribeImage } from '@/lib/server/gemini';
export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: '请求来源不受支持' }, { status: 403 });
  if (!modelReady()) return Response.json({ error: '图片文字识别需要先配置 Gemini API。你仍可导入 PDF、Markdown 和文本资料。' }, { status: 503 });
  try {
    const raw = await request.text();
    if (raw.length > 4000000) return Response.json({ error: '图片过大，请选择 2MB 以内的图片' }, { status: 413 });
    const data = z.object({ data: z.string().min(10).max(3000000).regex(/^[A-Za-z0-9+/=]+$/), mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']) }).parse(JSON.parse(raw));
    return Response.json({ text: await transcribeImage(data.data, data.mimeType, request.signal) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: '图片识别未完成，请检查网络、模型额度或换一张清晰图片' }, { status: 502 }); }
}
