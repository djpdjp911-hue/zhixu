import { z } from 'zod';
import { documentSchema } from '@/lib/storage';
import { chunkDocuments, citationWarnings, extractiveAnswer, retrieve } from '@/lib/retrieval';
import { modelConfig, modelReady, runAgent } from '@/lib/server/gemini';
import type { StudyAnswer, TraceStep } from '@/lib/types';

const schema = z.object({ question: z.string().trim().min(2).max(1200), documents: z.array(documentSchema).min(1).max(40), useModel: z.boolean().default(false) });
export async function POST(request: Request) {
  // Same-origin writes only; Site access controls protect hosted model usage.
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: '请求来源不受支持' }, { status: 403 });
  let input: z.infer<typeof schema>;
  try {
    const raw = await request.text();
    if (raw.length > 650000) return Response.json({ error: '所选资料过大，请减少资料范围（上限约 60 万字符）' }, { status: 413 });
    input = schema.parse(JSON.parse(raw));
  } catch { return Response.json({ error: '请提供有效问题和至少一份资料' }, { status: 400 }); }
  if (input.useModel && !modelReady()) return Response.json({ error: '尚未配置模型服务，请使用本地证据检索或先配置 Gemini API' }, { status: 503 });
  const encoder = new TextEncoder(); const start = Date.now();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const emit = (event: Record<string, unknown>) => { if (!closed) try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)); } catch { closed = true; } };
      try {
        const chunks = chunkDocuments(input.documents);
        const trace: TraceStep[] = [{ tool: 'chunk_documents', label: '解析与分块', detail: `${input.documents.length} 份资料 · ${chunks.length} 个可回溯片段`, ms: Date.now() - start }];
        emit({ type: 'trace', step: trace[0] });
        const localStart = Date.now();
        const localEvidence = retrieve(input.question, chunks);
        let result;
        if (input.useModel) {
          result = await runAgent(input.question, chunks, modelConfig(), emit, request.signal);
        } else {
          emit({ type: 'phase', label: '查找相关原文' });
          const step = { tool: 'bm25_search', label: '检索课程资料', detail: `BM25 · 返回 ${localEvidence.length} 个相关片段 · 未调用大模型`, ms: Date.now() - localStart };
          trace.push(step); emit({ type: 'trace', step });
          result = { text: extractiveAnswer(localEvidence), evidence: localEvidence, trace: [], retrieval: 'bm25' as const };
        }
        if (!result.evidence.length) result.text = extractiveAnswer([]);
        const answer: StudyAnswer = { id: crypto.randomUUID(), question: input.question, ...result,
          trace: [...trace, ...result.trace], mode: input.useModel ? 'gemini' : 'extractive',
          refused: result.evidence.length === 0, elapsedMs: Date.now() - start,
          createdAt: new Date().toISOString(), citationWarnings: input.useModel ? citationWarnings(result.text, result.evidence) : [],
        };
        emit({ type: 'answer', answer });
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        emit({ type: 'error', message: message === 'MODEL_RATE_LIMIT' ? '模型服务暂时限流，请稍后重试，或切换为本地证据检索。' : '本次处理未完成。请检查模型配置与网络，或切换本地检索；未生成的回答不会保存。' });
      } finally { if (!closed) { closed = true; controller.close(); } }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Content-Type-Options': 'nosniff' } });
}
