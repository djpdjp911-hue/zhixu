import { modelConfig, modelReady } from '@/lib/server/gemini';
export async function GET() {
  return Response.json({ configured: modelReady(), provider: 'Gemini', embeddings: Boolean(modelConfig().embeddingModel), storage: 'browser', version: '0.1.0' }, { headers: { 'Cache-Control': 'no-store' } });
}
