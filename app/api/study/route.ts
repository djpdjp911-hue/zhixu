import { z } from 'zod';
import { documentSchema } from '@/lib/storage';
import { chunkDocuments, citationWarnings, extractiveAnswer, retrieve } from '@/lib/retrieval';
import { groundingReport } from '@/lib/safety';
import { errorMessage, llmConfig, llmReady } from '@/lib/server/llm';
import { runAgent } from '@/lib/server/agent';
import type { StudyAnswer, TraceStep } from '@/lib/types';

const schema = z.object({
  question: z.string().trim().min(2).max(1200),
  documents: z.array(documentSchema).min(1).max(40),
  useModel: z.boolean().default(false),
  threadId: z.string().max(200).optional(),
  history: z
    .array(z.object({ question: z.string().max(1200), answer: z.string().max(6000) }))
    .max(3)
    .default([]),
});
export async function POST(request: Request) {
  // Same-origin writes only; Site access controls protect hosted model usage.
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin)
    return Response.json({ error: '请求来源不受支持' }, { status: 403 });
  let input: z.infer<typeof schema>;
  try {
    const raw = await request.text();
    if (raw.length > 650000)
      return Response.json({ error: '所选资料过大，请减少资料范围（上限约 60 万字符）' }, { status: 413 });
    input = schema.parse(JSON.parse(raw));
  } catch {
    return Response.json({ error: '请提供有效问题和至少一份资料' }, { status: 400 });
  }
  const config = llmConfig();
  if (input.useModel && !llmReady(config))
    return Response.json({ error: errorMessage(new Error('MODEL_NOT_CONFIGURED')) }, { status: 503 });
  const encoder = new TextEncoder();
  const start = Date.now();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const emit = (event: object) => {
        if (!closed)
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          } catch {
            closed = true;
          }
      };
      try {
        const chunks = chunkDocuments(input.documents);
        const trace: TraceStep[] = [
          {
            tool: 'chunk_documents',
            label: '解析与分块',
            detail: `${input.documents.length} 份资料 · ${chunks.length} 个可回溯片段`,
            ms: Date.now() - start,
          },
        ];
        emit({ type: 'trace', step: trace[0] });
        let result: Pick<StudyAnswer, 'text' | 'evidence' | 'trace' | 'retrieval'> & {
          safety?: string[];
          model?: string;
        };
        if (input.useModel) {
          // Previous answers are context only; their citation numbers refer to old evidence lists.
          const history = input.history.flatMap(turn => [
            { role: 'user' as const, content: turn.question },
            { role: 'assistant' as const, content: turn.answer.replace(/\[\d+\]/g, '').slice(0, 1500) },
          ]);
          if (history.length) {
            const step = {
              tool: 'conversation',
              label: '关联追问上下文',
              detail: `携带前 ${input.history.length} 轮问答，用于理解指代；事实仍以本轮检索为准`,
              ms: 0,
            };
            trace.push(step);
            emit({ type: 'trace', step });
          }
          result = await runAgent({
            question: input.question,
            history,
            documents: input.documents,
            config,
            emit,
            signal: request.signal,
          });
        } else {
          emit({ type: 'phase', label: '查找相关原文' });
          const localStart = Date.now();
          const evidence = retrieve(input.question, chunks);
          const step = {
            tool: 'bm25_search',
            label: '检索课程资料',
            detail: `BM25 · 返回 ${evidence.length} 个相关片段 · 未调用大模型`,
            ms: Date.now() - localStart,
          };
          trace.push(step);
          emit({ type: 'trace', step });
          result = { text: extractiveAnswer(evidence), evidence, trace: [], retrieval: 'bm25' };
        }
        const refused = result.evidence.length === 0;
        if (refused) result.text = extractiveAnswer([]);
        const answer: StudyAnswer = {
          id: crypto.randomUUID(),
          question: input.question,
          ...result,
          trace: [...trace, ...result.trace],
          mode: input.useModel ? 'model' : 'extractive',
          refused,
          elapsedMs: Date.now() - start,
          createdAt: new Date().toISOString(),
          citationWarnings: input.useModel && !refused ? citationWarnings(result.text, result.evidence) : [],
          ...(input.useModel && !refused ? { grounding: groundingReport(result.text, result.evidence) } : {}),
          ...(input.useModel ? { threadId: input.threadId } : {}),
        };
        emit({ type: 'answer', answer });
      } catch (error) {
        if (!request.signal.aborted) emit({ type: 'error', message: errorMessage(error) });
      } finally {
        if (!closed) {
          closed = true;
          controller.close();
        }
      }
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
