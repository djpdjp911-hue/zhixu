import type { Chunk, Evidence, StudyDocument } from './types';

/** Heading-aware, page-preserving chunking. Offsets refer to the original page text. */
export function chunkDocuments(documents: StudyDocument[], size = 520): Chunk[] {
  const chunks: Chunk[] = [];
  for (const doc of documents)
    for (const page of doc.pages) {
      const text = page.text;
      const headings = [...text.matchAll(/^#{1,3}\s+(.+)$/gm)];
      const boundaries = [0, ...headings.map(h => h.index!).filter(n => n > 0), text.length];
      let section = doc.title;
      for (let i = 0; i < boundaries.length - 1; i++) {
        const start = boundaries[i],
          end = boundaries[i + 1];
        const heading = text.slice(start, end).match(/^#{1,3}\s+(.+)/);
        if (heading) section = heading[1].trim();
        for (let offset = start; offset < end;) {
          let stop = Math.min(offset + size, end);
          if (stop < end) {
            const sentence = text.lastIndexOf('。', stop);
            if (sentence > offset + size / 2) stop = sentence + 1;
          }
          const raw = text.slice(offset, stop);
          if (raw.replace(/^#{1,3}.+$/gm, '').trim().length > 20)
            chunks.push({
              id: `${doc.id}:p${page.page}:${offset}`,
              documentId: doc.id,
              title: doc.title,
              section,
              page: page.page,
              text: raw.trim(),
              start: offset,
              end: stop,
            });
          if (stop >= end) break;
          offset = Math.max(offset + 1, stop - 60);
        }
      }
    }
  return chunks;
}

const ignored = new Set([
  '什么',
  '如何',
  '为什么',
  '哪些',
  '怎么',
  '一个',
  '这个',
  '可以',
  '需要',
  '进行',
  '以及',
  '是否',
  '的',
  '了',
  '是',
  '与',
  '和',
  '在',
  '请',
  '解释',
  '说明',
  '区别',
  'the',
  'a',
  'is',
  'to',
  'and',
  'of',
]);
export function tokenize(text: string): string[] {
  const result: string[] = [];
  for (const match of text.toLowerCase().matchAll(/[a-z][a-z0-9_-]*|[\p{Script=Han}]+/gu)) {
    const value = match[0];
    if (/^[a-z]/.test(value)) {
      if (!ignored.has(value)) result.push(value);
      continue;
    }
    if (value.length === 1 && !ignored.has(value)) result.push(value);
    for (let i = 0; i < value.length - 1; i++) {
      const token = value.slice(i, i + 2);
      if (!ignored.has(token) && !/[的了是与和在请]/.test(token)) result.push(token);
    }
  }
  return result;
}

export function retrieve(question: string, chunks: Chunk[], limit = 5): Evidence[] {
  const query = [...new Set(tokenize(question))];
  if (!query.length || !chunks.length) return [];
  const tokens = chunks.map(c => tokenize(c.text + ' ' + c.section));
  const avg = tokens.reduce((n, t) => n + t.length, 0) / tokens.length || 1;
  const df = new Map<string, number>();
  for (const row of tokens) for (const token of new Set(row)) df.set(token, (df.get(token) ?? 0) + 1);
  // In a corpus of a few chunks every IDF is small, so a fixed floor would reject even exact matches.
  // Scale it to the IDF of a term found in a single chunk; from about 22 chunks up it stays at 1.2.
  const floor = Math.min(1.2, 0.45 * Math.log(1 + (chunks.length - 0.5) / 1.5));
  const scored = chunks.map((chunk, index) => {
    const row = tokens[index];
    const freq = new Map<string, number>();
    for (const token of row) freq.set(token, (freq.get(token) ?? 0) + 1);
    let score = 0;
    let matched = 0;
    for (const token of query) {
      const f = freq.get(token) ?? 0;
      if (!f) continue;
      matched++;
      const idf = Math.log(1 + (chunks.length - (df.get(token) ?? 0) + 0.5) / ((df.get(token) ?? 0) + 0.5));
      score += (idf * f * 2.2) / (f + 1.2 * (0.25 + (0.75 * row.length) / avg));
      if (chunk.section.toLowerCase().includes(token)) score += idf * 0.7;
    }
    // A generic two-character overlap in a long question is not sufficient evidence.
    const exactTerm = query.some(t => /^[a-z]/.test(t) && freq.has(t));
    const supported =
      query.length <= 2 ? matched > 0 : exactTerm || (matched >= 2 && matched / query.length >= 0.12);
    return { ...chunk, score: supported && score > floor ? score : 0, rank: 0 };
  });
  return scored
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((c, i) => ({ ...c, rank: i + 1 }));
}

/** Reciprocal rank fusion: lexical + optional true embedding ranking. */
export function fuseRanks(lexical: Evidence[], dense: Evidence[], limit = 5): Evidence[] {
  const scores = new Map<string, { chunk: Evidence; score: number }>();
  for (const list of [lexical, dense])
    list.forEach((chunk, i) => {
      const prev = scores.get(chunk.id);
      scores.set(chunk.id, { chunk, score: (prev?.score ?? 0) + 1 / (60 + i + 1) });
    });
  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((c, i) => ({ ...c.chunk, score: c.score, rank: i + 1 }));
}

export function cosine(a: number[], b: number[]) {
  if (a.length !== b.length || !a.length) return 0;
  let dot = 0,
    x = 0,
    y = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    x += a[i] ** 2;
    y += b[i] ** 2;
  }
  return x && y ? dot / Math.sqrt(x * y) : 0;
}

export function extractiveAnswer(evidence: Evidence[]) {
  if (!evidence.length)
    return '当前所选资料中没有检索到足够的相关证据。我暂时无法依据资料回答。请换一种表述，或导入包含这个主题的资料。';
  return (
    '以下是资料中与问题相关的原文摘录，尚未经过大模型归纳：\n\n' +
    evidence
      .slice(0, 3)
      .map((e, i) => `### ${e.section}\n${e.text.replace(/^#{1,3}\s+.+\n?/gm, '').trim()} [${i + 1}]`)
      .join('\n\n')
  );
}

/** Invalid/missing citations are reported, never silently relabelled. */
export function citationWarnings(text: string, evidence: Evidence[]): string[] {
  const ids = [...text.matchAll(/\[(\d+)\]/g)].map(m => Number(m[1]));
  const warnings: string[] = [];
  if (evidence.length && !ids.length) warnings.push('模型未返回资料引用；请对照原文核验回答。');
  if (ids.some(n => n < 1 || n > evidence.length)) warnings.push('回答包含无效引用编号；相关结论尚未验证。');
  return warnings;
}
