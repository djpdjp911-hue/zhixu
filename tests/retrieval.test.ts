import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chunkDocuments,
  citationWarnings,
  cosine,
  extractiveAnswer,
  fuseRanks,
  retrieve,
} from '../lib/retrieval.ts';
import { sampleDocuments } from '../lib/samples.ts';
import { makeQuiz, reviewTasks } from '../lib/learning.ts';
import { parseBackup } from '../lib/storage.ts';

const chunks = chunkDocuments(sampleDocuments);
test('every citation preserves a real page and exact original substring', () => {
  assert.ok(chunks.length > 20);
  for (const chunk of chunks) {
    const doc = sampleDocuments.find(d => d.id === chunk.documentId)!;
    const page = doc.pages.find(p => p.page === chunk.page)!;
    assert.equal(page.text.slice(chunk.start, chunk.end).trim(), chunk.text);
  }
  assert.equal(new Set(chunks.map(c => c.id)).size, chunks.length);
});
test('heading boundaries and long-page splitting do not lose the ending', () => {
  const text = '# 资料\n## 主题\n' + '长段落用于验证分块和重叠行为。'.repeat(120) + '最后一句不能丢失。';
  const c = chunkDocuments([{ ...sampleDocuments[0], id: 'long', pages: [{ page: 7, text }] }]);
  assert.ok(c.length > 2);
  assert.ok(c.at(-1)!.text.endsWith('最后一句不能丢失。'));
  assert.ok(c.every(x => x.page === 7 && x.section === '主题' && x.text.length <= 520));
});
test('exact technical names retrieve the appropriate reference', () => {
  assert.equal(retrieve('no-cache 和 no-store 有什么区别？', chunks)[0].section, 'no-cache 与 no-store');
  assert.equal(retrieve('React 状态快照', chunks)[0].section, '状态快照');
  assert.equal(retrieve('Promise 微任务 定时器 执行顺序', chunks)[0].documentId, 'sample-browser');
});
test('empty, unrelated and punctuation-only questions refuse without fabricating evidence', () => {
  for (const q of ['', '!!!', '明朝郑和下西洋的舰船有多大？', '火星地表矿物的同位素测定方法'])
    assert.deepEqual(retrieve(q, chunks), []);
  assert.match(extractiveAnswer([]), /资料.*证据/);
});
test('a single short note is searchable while unrelated questions still refuse', () => {
  const text = '# 笔记\n\n## 闭包\n闭包是函数与其词法环境的组合，内部函数可以访问外层函数的变量。闭包常用于封装私有状态。';
  const note = chunkDocuments([{ ...sampleDocuments[0], id: 'note', pages: [{ page: 1, text }] }]);
  assert.equal(retrieve('什么是闭包？', note)[0]?.section, '闭包');
  assert.equal(retrieve('内部函数为什么能访问外层变量', note).length, 1);
  for (const q of ['明朝郑和下西洋的舰船有多大？', '火星地表矿物的同位素测定方法', 'React 状态快照'])
    assert.deepEqual(retrieve(q, note), [], q);
});
test('citations report missing and out-of-range references', () => {
  const e = retrieve('状态快照', chunks);
  assert.equal(citationWarnings('回答 [99]', e).length, 1);
  assert.equal(citationWarnings('未给出处', e).length, 1);
  assert.equal(citationWarnings('回答 [1]', e).length, 0);
});
test('RRF merges ranks without duplicating chunks and cosine handles zero vectors', () => {
  const a = retrieve('React 状态', chunks),
    b = [...a].reverse();
  const fused = fuseRanks(a, b);
  assert.equal(new Set(fused.map(x => x.id)).size, fused.length);
  assert.equal(cosine([1, 0], [1, 0]), 1);
  assert.equal(cosine([0, 0], [1, 0]), 0);
});
test('generated exercises have four distinct choices and a source-supported answer', () => {
  const questions = makeQuiz(chunks, 5);
  assert.equal(questions.length, 5);
  for (const q of questions) {
    assert.equal(new Set(q.options).size, 4);
    assert.ok(q.evidence.text.includes(q.options[q.correct]));
  }
});
test('wrong answers generate one next-day task, correct answers do not', () => {
  const q = makeQuiz(chunks, 1)[0],
    now = new Date('2026-10-21T01:00:00Z');
  const a = {
    id: 'a',
    questionId: q.id,
    section: q.section,
    correct: false,
    selected: 0,
    at: now.toISOString(),
    evidence: q.evidence,
  };
  const tasks = reviewTasks([a], [], now);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].due, '2026-10-22T01:00:00.000Z');
  assert.equal(reviewTasks([a], tasks, now).length, 1);
  assert.equal(reviewTasks([{ ...a, correct: true }], [], now).length, 0);
});
test('backup validation rejects malformed documents and keeps a valid workspace', () => {
  assert.throws(() => parseBackup({ version: 1, documents: [{ title: 'bad' }] }));
  const data = { version: 1, documents: sampleDocuments, answers: [], attempts: [], tasks: [] };
  assert.equal(parseBackup(data).documents.length, 4);
});
