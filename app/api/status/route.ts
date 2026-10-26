import { llmStatus } from '@/lib/server/llm';
export async function GET() {
  return Response.json(
    { ...llmStatus(), storage: 'browser', version: '0.2.0' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
