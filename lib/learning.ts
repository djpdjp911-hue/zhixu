import { z } from 'zod';
import type { Attempt, Chunk, FeedbackPoint, FeynmanFeedback, QuizQuestion, ReviewTask } from './types';
import { tokenize } from './retrieval.ts';

const DAY = 24 * 60 * 60 * 1000;
const body = (c: Chunk) => c.text.replace(/^#{1,3}\s+.+\n?/gm, '').trim();

export function makeQuiz(chunks: Chunk[], count = 5): QuizQuestion[] {
  const usable = chunks.filter(c => body(c).length > 45);
  const unique = usable.filter((c, i) => usable.findIndex(x => x.section === c.section) === i);
  return unique
    .slice(0, count)
    .map((chunk, index) => {
      const correctText = body(chunk).split(/(?<=[。！？])/u)[0];
      const distractors = unique
        .filter(c => c.id !== chunk.id)
        .slice(index % Math.max(1, unique.length - 3))
        .concat(unique)
        .filter(c => c.id !== chunk.id);
      const candidates = [...new Set(distractors.map(c => body(c).split(/(?<=[。！？])/u)[0]))].slice(0, 3);
      if (candidates.length < 3) return null;
      const correct = (index + 1) % 4;
      candidates.splice(correct, 0, correctText);
      return {
        id: `q:${chunk.id}`,
        section: chunk.section,
        prompt: `根据资料，哪一项是「${chunk.section}」对应的准确描述？`,
        options: candidates,
        correct,
        explanation: correctText,
        evidence: chunk,
        origin: 'rules' as const,
      };
    })
    .filter((q): q is NonNullable<typeof q> => q !== null);
}

/** Weak topics first, then one chunk per remaining section in random order. */
export function pickQuizChunks(chunks: Chunk[], focus: string[], count: number, random = Math.random): Chunk[] {
  const usable = chunks.filter(c => body(c).length > 45);
  const sections = usable.filter(
    (c, i) => usable.findIndex(x => x.section === c.section && x.documentId === c.documentId) === i,
  );
  const wanted = new Set(focus);
  const rest = sections
    .filter(c => !wanted.has(c.section))
    .map(c => ({ c, k: random() }))
    .sort((a, b) => a.k - b.k)
    .map(x => x.c);
  return [...sections.filter(c => wanted.has(c.section)), ...rest].slice(0, count);
}

const normalize = (text: string) =>
  text.replace(/[\s，,。.、；;：:“”"'‘’（）()「」《》【】!！?？\-—_*`]/g, '').toLowerCase();
/** True when the quote appears verbatim (ignoring spacing and punctuation) in the source text. */
export function quoteIn(quote: string | undefined, text: string) {
  const q = normalize(quote ?? '');
  return q.length >= 6 && normalize(text).includes(q);
}

const answerIndex = z
  .union([z.number(), z.string()])
  .transform(v => (typeof v === 'number' ? v : /^[A-Da-d]$/.test(v.trim()) ? v.trim().toUpperCase().charCodeAt(0) - 65 : Number(v)))
  .pipe(z.number().int().min(0).max(3));
const quizItem = z.object({
  ref: z.string(),
  skill: z.string().max(16).optional(),
  prompt: z.string().trim().min(6).max(240),
  options: z.array(z.string().trim().min(1).max(160)).length(4),
  answer: answerIndex,
  explanation: z.string().trim().min(4).max(500),
  quote: z.string().trim().min(6).max(400),
});

/**
 * Model-generated questions are untrusted: each must reference a provided excerpt, have four
 * distinct options and quote the excerpt verbatim, otherwise it is dropped.
 */
export function validateQuiz(raw: unknown, refs: Map<string, Chunk>, random = Math.random) {
  const list =
    raw && typeof raw === 'object' && Array.isArray((raw as { questions?: unknown }).questions)
      ? ((raw as { questions: unknown[] }).questions as unknown[]).slice(0, 12)
      : [];
  const questions: QuizQuestion[] = [];
  let dropped = 0;
  for (const item of list) {
    const parsed = quizItem.safeParse(item);
    const chunk = parsed.success ? refs.get(parsed.data.ref.trim()) : undefined;
    if (
      !parsed.success ||
      !chunk ||
      new Set(parsed.data.options.map(normalize)).size !== 4 ||
      !quoteIn(parsed.data.quote, chunk.text)
    ) {
      dropped++;
      continue;
    }
    const q = parsed.data;
    const order = [0, 1, 2, 3].map(i => ({ i, k: random() })).sort((a, b) => a.k - b.k).map(x => x.i);
    questions.push({
      id: `q:ai:${chunk.id}:${questions.length}:${crypto.randomUUID().slice(0, 8)}`,
      section: chunk.section,
      prompt: q.prompt,
      options: order.map(i => q.options[i]),
      correct: order.indexOf(q.answer),
      explanation: q.explanation,
      evidence: chunk,
      origin: 'model',
      skill: q.skill,
      quote: q.quote,
    });
  }
  return { questions, dropped };
}

export function reviewTasks(attempts: Attempt[], existing: ReviewTask[], now = new Date()): ReviewTask[] {
  const tasks = [...existing];
  const wrong = attempts.filter(a => !a.correct);
  for (const item of wrong) {
    // One pending task per topic; repeat mistakes do not flood the learner.
    if (tasks.some(t => t.section === item.section && !t.done)) continue;
    tasks.push({
      id: `review:${item.id}`,
      title: `回顾「${item.section}」，再用自己的话复述`,
      section: item.section,
      due: new Date(now.getTime() + DAY).toISOString(),
      minutes: 8,
      documentId: item.evidence.documentId,
      page: item.evidence.page,
      done: false,
      stage: 0,
    });
  }
  return tasks;
}

/** Expanding review intervals in days, applied after successful explain-back reviews. */
export const REVIEW_INTERVALS = [1, 3, 7, 14, 30];

/**
 * Applies an explain-back score to the review plan. >=80 completes the task and schedules the
 * next, longer interval; 60-79 retries tomorrow; <60 retries tomorrow and restarts the ladder.
 */
export function applyExplainBack(
  tasks: ReviewTask[],
  topic: { section: string; documentId: string; page: number },
  score: number,
  now = new Date(),
): ReviewTask[] {
  const task = tasks.find(t => t.section === topic.section && !t.done);
  const tomorrow = new Date(now.getTime() + DAY).toISOString();
  if (!task) {
    if (score >= 80) return tasks;
    return [
      ...tasks,
      {
        id: `review:explain:${topic.section}:${now.getTime()}`,
        title: `回顾「${topic.section}」，再用自己的话复述`,
        section: topic.section,
        due: tomorrow,
        minutes: 8,
        documentId: topic.documentId,
        page: topic.page,
        done: false,
        stage: 0,
        lastScore: score,
      },
    ];
  }
  const stage = task.stage ?? 0;
  if (score < 80)
    return tasks.map(t =>
      t.id === task.id ? { ...t, stage: score < 60 ? 0 : stage, lastScore: score, due: tomorrow } : t,
    );
  const completed = tasks.map(t => (t.id === task.id ? { ...t, done: true, lastScore: score } : t));
  if (stage >= REVIEW_INTERVALS.length - 1) return completed;
  const next = stage + 1;
  return [
    ...completed,
    {
      ...task,
      id: `review:${task.section}:${next}:${now.getTime()}`,
      title: `巩固「${task.section}」：间隔 ${REVIEW_INTERVALS[next]} 天再复述一次`,
      due: new Date(now.getTime() + REVIEW_INTERVALS[next] * DAY).toISOString(),
      stage: next,
      done: false,
      lastScore: score,
    },
  ];
}

const verdictFor = (score: number) => (score >= 80 ? '基本掌握' : score >= 60 ? '部分掌握' : '需要再复习');

/** Rule-based explain-back estimate: coverage of the source's key sentences by the learner's wording. */
// Exact bigrams only: crediting loose character matches lets a generic paragraph on the same topic pass as covered.
const COVERED = 0.25;
export function localFeynman(explanation: string, sources: Chunk[]): FeynmanFeedback {
  const learner = new Set(tokenize(explanation));
  const sentences = sources.flatMap(s =>
    body(s)
      .split(/(?<=[。！？!?；;])|\n+/)
      .map(t => t.trim())
      .filter(t => new Set(tokenize(t)).size >= 4)
      .map(t => ({ text: t, chunkId: s.id })),
  );
  if (!sentences.length)
    return { origin: 'rules', score: 0, verdict: '无法评估', summary: '原文片段过短，无法提取要点。', covered: [], missing: [], misconceptions: [] };
  const scored = sentences.map(s => {
    const words = new Set(tokenize(s.text));
    let hit = 0;
    for (const w of words) if (learner.has(w)) hit++;
    return { ...s, coverage: hit / words.size };
  });
  const covered = scored.filter(s => s.coverage >= COVERED);
  const average = scored.reduce((n, s) => n + s.coverage, 0) / scored.length;
  let score = Math.round(100 * (0.75 * (covered.length / scored.length) + 0.25 * Math.min(1, average * 2)));
  if (learner.size < 8) score = Math.min(score, 40);
  const short = (t: string) => (t.length > 64 ? t.slice(0, 62) + '…' : t);
  const missing: FeedbackPoint[] = scored
    .filter(s => s.coverage < COVERED)
    .slice(0, 5)
    .map(s => ({ point: short(s.text), quote: s.text, chunkId: s.chunkId }));
  return {
    origin: 'rules',
    score,
    verdict: verdictFor(score),
    summary: `规则估算：你的解释覆盖了 ${covered.length}/${scored.length} 个原文要点。规则只比较用词覆盖，不能判断表述是否准确；配置模型后可获得语义评价。`,
    covered: covered.slice(0, 5).map(s => ({ point: short(s.text), quote: s.text, chunkId: s.chunkId })),
    missing,
    misconceptions: [],
    followUp: missing[0] ? `不看资料，试着解释：${missing[0].point}` : undefined,
  };
}

const point = z.object({ point: z.string().trim().min(2).max(200), ref: z.string().optional(), quote: z.string().max(400).optional() });
const feynmanSchema = z.object({
  score: z.coerce.number().catch(0),
  verdict: z.string().max(20).catch(''),
  summary: z.string().max(400).catch(''),
  covered: z.array(point).max(8).catch([]),
  missing: z.array(point).max(8).catch([]),
  misconceptions: z
    .array(
      z.object({
        claim: z.string().trim().min(2).max(240),
        correction: z.string().trim().min(2).max(300),
        ref: z.string().optional(),
        quote: z.string().max(400).optional(),
      }),
    )
    .max(6)
    .catch([]),
  followUp: z.string().max(240).optional().catch(undefined),
});

/** Keeps the model's judgement but only shows quotes that can be found in the referenced excerpt. */
export function validateFeynman(raw: unknown, refs: Map<string, Chunk>): FeynmanFeedback {
  const data = feynmanSchema.parse(raw ?? {});
  const locate = (ref?: string, quote?: string): { quote?: string; chunkId?: string } => {
    const scoped = ref ? refs.get(ref.trim()) : undefined;
    const chunk = [scoped, ...refs.values()].find(c => c && quoteIn(quote, c.text));
    return chunk && quote ? { quote, chunkId: chunk.id } : scoped ? { chunkId: scoped.id } : {};
  };
  const score = Math.max(0, Math.min(100, Math.round(data.score)));
  const misconceptions = data.misconceptions
    .slice(0, 4)
    .map(m => ({ claim: m.claim, correction: m.correction, ...locate(m.ref, m.quote) }));
  // A point the learner got wrong is already shown with its correction; repeating it as "missing" is noise.
  const corrected = new Set(misconceptions.flatMap(m => [m.correction, m.quote ?? '']).map(normalize).filter(Boolean));
  return {
    origin: 'model',
    score,
    verdict: data.verdict || verdictFor(score),
    summary: data.summary,
    covered: data.covered.slice(0, 5).map(p => ({ point: p.point, ...locate(p.ref, p.quote) })),
    missing: data.missing
      .map(p => ({ point: p.point, ...locate(p.ref, p.quote) }))
      .filter(p => !corrected.has(normalize(p.point)) && !(p.quote && corrected.has(normalize(p.quote))))
      .slice(0, 5),
    misconceptions,
    followUp: data.followUp || undefined,
  };
}

export function topicStats(attempts: Attempt[]) {
  const map = new Map<string, { total: number; correct: number }>();
  for (const a of attempts) {
    const row = map.get(a.section) ?? { total: 0, correct: 0 };
    row.total++;
    if (a.correct) row.correct++;
    map.set(a.section, row);
  }
  return [...map].map(([section, row]) => ({
    section,
    ...row,
    accuracy: Math.round((row.correct / row.total) * 100),
  }));
}
