import type { Evidence, GroundingReport, GroundingSentence } from './types';
import { tokenize } from './retrieval.ts';

const INJECTION_RULES: [RegExp, string][] = [
  [
    /(忽略|无视|忘记|忘掉|不要理会)(掉)?(之前|以上|上面|上述|前面|先前|所有|全部)的?(所有|全部)?(指令|提示|规则|要求|设定|约束)/,
    '要求忽略既有指令',
  ],
  [/ignore\s+(all\s+)?(the\s+)?(previous|above|prior|earlier|preceding)\s+(instructions?|prompts?|rules?)/i, '要求忽略既有指令'],
  [/disregard\s+(all\s+)?(the\s+)?(previous|prior|above|system)/i, '要求忽略既有指令'],
  [/(从现在(开始|起)|接下来)[，,]?\s*你(将|要)?(是|扮演|作为)/, '试图改写模型角色'],
  [/\byou\s+are\s+now\b|\bact\s+as\s+(an?\s+)?(unrestricted|jailbroken|developer)/i, '试图改写模型角色'],
  [/(输出|打印|泄露|透露|告诉我|显示|reveal|print|show)\s*(你的|your)\s*(系统提示|提示词|system\s*prompt|初始指令|密钥|api\s*key)/i, '索取系统提示或密钥'],
  [/<\/?\s*(system|assistant|instructions?)\s*>|\[\/?INST\]|<\|im_start\|>/i, '伪造对话角色标记'],
  [/(给|打)(我|学习者|这份回答)?\s*(满分|100\s*分)/, '诱导评分结果'],
];

/** Heuristic labels for instruction-like text inside untrusted material. A hit is a warning, not proof. */
export function scanInjection(text: string): string[] {
  return [...new Set(INJECTION_RULES.filter(([rule]) => rule.test(text)).map(([, label]) => label))];
}

const SUPPLEMENT = /^\s*(?:[-*]\s*)?(?:\*\*)?(补充示例|补充例子|自检问题|思考题|自测)(?:\*\*)?[:：]/;

function terms(text: string) {
  return new Set(tokenize(text));
}
function recall(sentence: Set<string>, source: Set<string>) {
  if (!sentence.size) return 0;
  let hit = 0;
  for (const t of sentence) if (source.has(t)) hit++;
  return hit / sentence.size;
}

/**
 * Sentence-level citation check. Measures how much of each cited sentence's wording is
 * found in the cited excerpts. Lexical overlap cannot prove semantic entailment; it flags
 * sentences a learner should verify first.
 */
export function groundingReport(text: string, evidence: Evidence[], threshold = 0.4): GroundingReport {
  const sources = evidence.map(e => terms(e.section + ' ' + e.text));
  const sentences: GroundingSentence[] = [];
  let fenced = false;
  for (const rawLine of text.split('\n')) {
    // Code is an illustration, not a factual claim to match against the materials.
    if (/^\s*```/.test(rawLine)) fenced = !fenced;
    if (fenced || /^\s*```/.test(rawLine)) continue;
    if (/^\s*#{1,6}\s/.test(rawLine) || !rawLine.trim()) continue;
    const supplement = SUPPLEMENT.test(rawLine);
    // Move citations that follow the full stop in front of it, so they stay with their sentence.
    const line = rawLine.replace(/([。！？!?；;])((?:\s*\[\d+\])+)/g, '$2$1');
    const clauses = line.split(/(?<=[。！？!?])/).flatMap(sentence => {
      const parts = sentence.split(/(?<=[；;])/).map(piece => ({
        piece,
        citations: [...piece.matchAll(/\[(\d+)\]/g)].map(m => Number(m[1])),
      }));
      // A citation at the end of a sentence covers the uncited clauses before it, not the ones after it.
      for (let i = parts.length - 2; i >= 0; i--)
        if (!parts[i].citations.length) parts[i].citations = parts[i + 1].citations;
      return parts;
    });
    for (const { piece, citations } of clauses) {
      const plain = piece
        .replace(/\[\d+\]/g, '')
        .replace(/[*`]/g, '')
        .replace(/^\s*>\s?/, '')
        .replace(/^\s*(?:[-•]|\d+[.、)])\s*/, '')
        .trim();
      const words = terms(plain);
      if (words.size < 4) continue;
      if (supplement) {
        sentences.push({ text: plain, citations, support: 0, status: 'supplement' });
        continue;
      }
      if (/[？?]$/.test(plain) && !citations.length) continue;
      const scores = sources.map(s => recall(words, s));
      const best = scores.reduce((b, s, i) => (s > scores[b] ? i : b), 0);
      const valid = citations.filter(n => n >= 1 && n <= evidence.length);
      if (!valid.length) {
        sentences.push({
          text: plain,
          citations,
          support: Math.round((scores[best] ?? 0) * 100) / 100,
          status: 'uncited',
          ...(scores[best] >= threshold ? { suggested: best + 1 } : {}),
        });
        continue;
      }
      const cited = new Set<string>();
      for (const n of valid) for (const t of sources[n - 1]) cited.add(t);
      const support = recall(words, cited);
      const sentence: GroundingSentence = {
        text: plain,
        citations: valid,
        support: Math.round(support * 100) / 100,
        status: support >= threshold ? 'supported' : 'weak',
      };
      if (support < threshold && scores[best] >= threshold && !valid.includes(best + 1)) sentence.suggested = best + 1;
      sentences.push(sentence);
    }
  }
  const count = (status: GroundingSentence['status']) => sentences.filter(s => s.status === status).length;
  return {
    checked: sentences.filter(s => s.status !== 'supplement').length,
    supported: count('supported'),
    weak: count('weak'),
    uncited: count('uncited'),
    supplement: count('supplement'),
    sentences: sentences.slice(0, 40),
  };
}
