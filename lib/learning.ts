import type { Attempt, Chunk, QuizQuestion, ReviewTask } from './types';

export function makeQuiz(chunks: Chunk[], count = 5): QuizQuestion[] {
  const usable = chunks.filter(c => c.text.replace(/^#{1,3}.+$/gm, '').trim().length > 45);
  const unique = usable.filter((c, i) => usable.findIndex(x => x.section === c.section) === i);
  return unique.slice(0, count).map((chunk, index) => {
    const correctText = chunk.text.replace(/^#{1,3}\s+.+\n?/gm, '').trim().split(/(?<=[。！？])/u)[0];
    const distractors = unique.filter(c => c.id !== chunk.id).slice(index % Math.max(1, unique.length - 3)).concat(unique).filter(c => c.id !== chunk.id);
    const candidates = [...new Set(distractors.map(c => c.text.replace(/^#{1,3}\s+.+\n?/gm, '').trim().split(/(?<=[。！？])/u)[0]))].slice(0, 3);
    if (candidates.length < 3) return null;
    const correct = (index + 1) % 4;
    candidates.splice(correct, 0, correctText);
    return { id: `q:${chunk.id}`, section: chunk.section, prompt: `根据资料，哪一项是「${chunk.section}」对应的准确描述？`, options: candidates, correct, explanation: correctText, evidence: chunk };
  }).filter((q): q is QuizQuestion => q !== null);
}

export function reviewTasks(attempts: Attempt[], existing: ReviewTask[], now = new Date()): ReviewTask[] {
  const tasks = [...existing];
  const wrong = attempts.filter(a => !a.correct);
  for (const item of wrong) {
    // One pending task per topic; repeat mistakes do not flood the learner.
    if (tasks.some(t => t.section === item.section && !t.done)) continue;
    tasks.push({ id: `review:${item.id}`, title: `回顾「${item.section}」，再用自己的话复述`, section: item.section,
      due: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(), minutes: 8,
      documentId: item.evidence.documentId, page: item.evidence.page, done: false });
  }
  return tasks;
}

export function topicStats(attempts: Attempt[]) {
  const map = new Map<string, { total: number; correct: number }>();
  for (const a of attempts) { const row = map.get(a.section) ?? { total: 0, correct: 0 }; row.total++; if (a.correct) row.correct++; map.set(a.section, row); }
  return [...map].map(([section, row]) => ({ section, ...row, accuracy: Math.round(row.correct / row.total * 100) }));
}
