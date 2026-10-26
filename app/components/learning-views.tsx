'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Clock3,
  ListChecks,
  Loader2,
  PenLine,
  Plus,
  Search,
  ShieldCheck,
  Target,
} from 'lucide-react';
import type { Chunk, ReviewTask, StudyDocument } from '@/lib/types';
import { REVIEW_INTERVALS } from '@/lib/learning';
import { downloadFile } from '@/lib/ingest';
import { useWorkspace } from './workspace';
import { DocCard, Empty, Heading, shortDate, Tag } from './primitives';

export function Library() {
  const s = useWorkspace();
  return (
    <>
      <Heading
        eyebrow="YOUR KNOWLEDGE COLLECTION"
        title="每一份资料，都是起点。"
        description="本机解析 PDF 与文本，保留页码和原文位置。"
        action={
          <button className="primary-btn" onClick={() => s.setModal('upload')}>
            <Plus size={17} />
            导入资料
          </button>
        }
      />
      <div className="library-toolbar">
        <div className="inline-search">
          <Search size={16} />
          <input
            aria-label="筛选资料"
            placeholder="搜索资料名称或内容…"
            value={s.filter}
            onChange={e => s.setFilter(e.target.value)}
          />
        </div>
        <span>
          {s.workspace.documents.length} 份资料 · {s.chunks.length} 个片段
        </span>
      </div>
      <div className="doc-grid library-grid">
        {s.workspace.documents
          .filter(d => d.title.includes(s.filter) || d.pages.some(p => p.text.includes(s.filter)))
          .map((doc, i) => (
            <DocCard key={doc.id} doc={doc} index={i} />
          ))}
        <button className="add-document" onClick={() => s.setModal('upload')}>
          <Plus size={25} />
          <strong>添加你的学习资料</strong>
          <span>PDF / Markdown / TXT</span>
        </button>
      </div>
      <div className="privacy-banner">
        <ShieldCheck size={20} />
        <p>
          <strong>资料默认留在当前浏览器</strong>
          <span>
            原文检索时，所选资料发送到本站服务端处理且不持久保存。开启 AI 学习助手并确认后，相关片段才会发送到服务端配置的模型服务
            {s.status.configured ? `（${s.status.provider}）` : ''}。清理浏览器数据会移除本地记录，建议定期备份。
          </span>
        </p>
        <button className="secondary-btn" onClick={s.exportBackup}>
          导出备份
        </button>
      </div>
    </>
  );
}
export function Diagnosis() {
  const s = useWorkspace();
  return (
    <>
      <Heading
        eyebrow="UNDERSTANDING, VERIFIED"
        title="读懂之后，检验一下。"
        description={
          s.aiReady
            ? 'AI 依据原文出理解题，每道题都核对原文引用；薄弱主题优先，答错的主题进入复习计划。'
            : '根据资料原文生成对应关系练习，答错的主题会加入复习计划。开启 AI 学习助手可获得理解型题目。'
        }
        action={
          <button className="primary-btn" onClick={s.startQuiz} disabled={s.quizBusy}>
            {s.quizBusy ? <Loader2 size={17} className="spin" /> : <Plus size={17} />}
            开始一组练习
          </button>
        }
      />
      <div className="quiz-layout">
        <section className="quiz-main">
          {s.quizBusy ? (
            <div className="panel quiz-loading" aria-live="polite" aria-busy="true">
              <Loader2 size={22} className="spin" />
              <div>
                <strong>AI 正在阅读资料并出题</strong>
                <p>优先考查你的薄弱主题；每道题都要逐字引用原文，引用对不上的题会被自动淘汰并由规则题补足。</p>
              </div>
              <div className="skeleton-line" />
              <div className="skeleton-line short" />
            </div>
          ) : s.quiz.length ? (
            <>
              <div className="quiz-progress">
                <span>
                  {s.submitted
                    ? '本组练习已完成'
                    : `已作答 ${Object.keys(s.answers).length} / ${s.quiz.length}`}
                </span>
                <Tag tone={s.quizMeta?.origin === 'model' ? 'green' : ''}>
                  {s.submitted
                    ? `答对 ${s.quiz.filter(q => s.answers[q.id] === q.correct).length} / ${s.quiz.length}`
                    : s.quizMeta?.origin === 'model'
                      ? `AI 出题 ${s.quizMeta.generated} 道${s.quizMeta.filled ? ` · 规则补充 ${s.quizMeta.filled} 道` : ''}${s.quizMeta.dropped ? ` · 引用校验淘汰 ${s.quizMeta.dropped} 道` : ''}`
                      : '资料对应诊断 · 规则生成'}
                </Tag>
                <div>
                  <i style={{ width: `${(Object.keys(s.answers).length / s.quiz.length) * 100}%` }} />
                </div>
              </div>
              {s.quiz.map((q, i) => (
                <article className="quiz-card" key={q.id}>
                  <div className="quiz-card-top">
                    <span>QUESTION {String(i + 1).padStart(2, '0')}</span>
                    {q.origin === 'model' && <Tag tone="green">{q.skill ?? 'AI 出题'}</Tag>}
                    <Tag>{q.section}</Tag>
                  </div>
                  <h3>{q.prompt}</h3>
                  <div className="quiz-options">
                    {q.options.map((option, n) => (
                      <button
                        key={n}
                        disabled={s.submitted}
                        aria-pressed={s.answers[q.id] === n}
                        className={
                          'quiz-option ' +
                          (s.answers[q.id] === n ? 'picked ' : '') +
                          (s.submitted && q.correct === n ? 'correct ' : '') +
                          (s.submitted && s.answers[q.id] === n && q.correct !== n ? 'incorrect' : '')
                        }
                        onClick={() => s.setAnswers(a => ({ ...a, [q.id]: n }))}
                      >
                        <span>{String.fromCharCode(65 + n)}</span>
                        {option}
                        {s.submitted && q.correct === n && <Check size={17} />}
                      </button>
                    ))}
                  </div>
                  {s.submitted && (
                    <div className="quiz-explanation">
                      <strong>{s.answers[q.id] === q.correct ? '理解正确' : '值得再看一遍'}</strong>
                      <p>{q.explanation}</p>
                      {q.quote && <blockquote className="quiz-quote">原文：{q.quote}</blockquote>}
                      <div className="quiz-explanation-actions">
                        <button className="text-link" onClick={() => s.setSource(q.evidence)}>
                          查看原文依据
                          <ArrowRight size={13} />
                        </button>
                        {s.answers[q.id] !== q.correct && (
                          <button className="text-link" onClick={() => s.openFeynman(q.evidence)}>
                            <PenLine size={13} />
                            用自己的话讲一遍
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </article>
              ))}
              <div className="quiz-submit">
                {s.submitted ? (
                  <>
                    <button className="secondary-btn" onClick={s.startQuiz}>
                      再练一组
                    </button>
                    <button className="primary-btn" onClick={() => s.changeTab('plan')}>
                      查看复习计划
                      <ArrowRight size={15} />
                    </button>
                  </>
                ) : (
                  <button className="primary-btn" onClick={s.submitQuiz}>
                    提交并生成复习任务
                    <ArrowRight size={15} />
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="panel">
              <Empty
                icon={<ListChecks size={30} />}
                title="把熟悉，变成真正的理解"
                text={
                  s.aiReady
                    ? '每组 5 题，由 AI 依据原文出题并逐题核对引用，答案都能回溯到原文。'
                    : '每组最多 5 题，答案可回溯到原文。当前练习采用规则生成，检测资料与主题的对应关系。'
                }
                action={
                  <button className="primary-btn" onClick={s.startQuiz}>
                    开始第一组练习
                    <ArrowRight size={16} />
                  </button>
                }
              />
            </div>
          )}
        </section>
        <aside className="diagnosis-rail">
          <div className="panel">
            <h3>我的学习诊断</h3>
            <p className="muted small">基于已提交的练习记录</p>
            {s.stats.length ? (
              s.stats.map(t => (
                <div className="topic-stat" key={t.section}>
                  <div>
                    <span>{t.section}</span>
                    <strong>{t.accuracy}%</strong>
                  </div>
                  <div className="stat-track">
                    <i style={{ width: `${t.accuracy}%` }} />
                  </div>
                  <small>
                    {t.correct} / {t.total} 题回答正确
                  </small>
                </div>
              ))
            ) : (
              <Empty
                icon={<Target size={22} />}
                title="还没有诊断记录"
                text="完成练习后，这里会呈现每个主题的答题情况。"
              />
            )}
          </div>
          <div className="rail-tip">
            <BookOpen size={17} />
            <strong>分数是线索，理解才是目标。</strong>
            <p>正确率只反映本应用的练习记录，不代表对知识的全面掌握程度。</p>
          </div>
        </aside>
      </div>
    </>
  );
}
function taskMeta(t: ReviewTask) {
  const from = t.id.startsWith('review:explain:') ? '来自复述检验' : t.stage ? '间隔巩固' : '来自答题诊断';
  return [
    `${t.minutes} 分钟`,
    from,
    `第 ${(t.stage ?? 0) + 1}/${REVIEW_INTERVALS.length} 轮`,
    ...(t.lastScore !== undefined ? [`上次复述 ${t.lastScore} 分`] : []),
  ].join(' · ');
}
export function Plan() {
  const s = useWorkspace(),
    w = s.workspace;
  return (
    <>
      <Heading
        eyebrow="ONE STEP AT A TIME"
        title="把下一步，安排得刚刚好。"
        description={`错题次日复习；用自己的话复述达标（≥80 分）后，按 ${REVIEW_INTERVALS.join(' → ')} 天的间隔逐步巩固。`}
        action={
          <button
            className="secondary-btn"
            disabled={!w.tasks.length}
            onClick={() =>
              downloadFile(
                '知序-复习计划.md',
                '# 我的复习计划\n\n' +
                  w.tasks
                    .map(t => `- [${t.done ? 'x' : ' '}] ${t.title} · ${shortDate(t.due)} · ${t.minutes}分钟`)
                    .join('\n'),
              )
            }
          >
            <ArrowDownToLine size={16} />
            导出计划
          </button>
        }
      />
      <div className="plan-summary">
        <div>
          <span>待复习</span>
          <strong>
            {s.pending.length}
            <small>个主题</small>
          </strong>
        </div>
        <div>
          <span>预计用时</span>
          <strong>
            {s.pending.reduce((n, t) => n + t.minutes, 0)}
            <small>分钟</small>
          </strong>
        </div>
        <div>
          <span>已经完成</span>
          <strong>
            {w.tasks.filter(t => t.done).length}
            <small>个任务</small>
          </strong>
        </div>
        <div className="plan-summary-art">
          <Target size={50} strokeWidth={1} />
        </div>
      </div>
      <section className="panel plan-list">
        <div className="section-title">
          <h2>我的复习任务</h2>
          <Tag>可调整 · 可回溯</Tag>
        </div>
        {w.tasks.length ? (
          w.tasks.map(t => (
            <div key={t.id} className={'plan-task ' + (t.done ? 'done' : '')}>
              <button
                className="task-check"
                onClick={() =>
                  s.setWorkspace(w => ({
                    ...w,
                    tasks: w.tasks.map(x => (x.id === t.id ? { ...x, done: !x.done } : x)),
                  }))
                }
                aria-label={t.done ? `重新打开${t.section}` : `完成${t.section}`}
                aria-pressed={t.done}
              >
                {t.done && <Check size={15} />}
              </button>
              <div>
                <strong>{t.title}</strong>
                <span>
                  <Clock3 size={13} />
                  {taskMeta(t)}
                </span>
              </div>
              {!t.done && (
                <button className="task-explain" onClick={() => s.openFeynman(t)}>
                  <PenLine size={13} />
                  复述检验
                </button>
              )}
              <label className="task-date">
                <span className="sr-only">复习日期</span>
                <input
                  type="date"
                  value={t.due.slice(0, 10)}
                  onChange={e => {
                    const value = e.target.value;
                    if (value)
                      s.setWorkspace(w => ({
                        ...w,
                        tasks: w.tasks.map(x =>
                          x.id === t.id ? { ...x, due: new Date(value + 'T12:00:00').toISOString() } : x,
                        ),
                      }));
                  }}
                />
              </label>
              <button
                className="text-link"
                onClick={() => {
                  const c =
                    s.chunks.find(c => c.documentId === t.documentId && c.section === t.section) ??
                    s.chunks.find(c => c.documentId === t.documentId && c.page === t.page);
                  if (c) s.setSource(c);
                  else s.setNotice('原始资料已移除，请重新导入后复习。');
                }}
              >
                回到资料
                <ArrowRight size={14} />
              </button>
            </div>
          ))
        ) : (
          <Empty
            icon={<Target size={32} />}
            title="好的计划，从了解自己开始"
            text="完成一次学习诊断，知序会把答错的知识整理为复习任务。"
            action={
              <button className="primary-btn" onClick={s.startQuiz}>
                去做一次诊断
                <ArrowRight size={15} />
              </button>
            }
          />
        )}
      </section>
    </>
  );
}
export function Graph() {
  const s = useWorkspace();
  const [docId, setDocId] = useState('');
  return (
    <>
      <Heading
        eyebrow="SEE THE CONNECTIONS"
        title="让知识，连成一片。"
        description="根据资料标题与章节建立结构图。点击节点，回到对应原文。"
        action={<Tag>文档结构图 · 规则提取</Tag>}
      />
      <div className="graph-tabs">
        <button className={!docId ? 'selected' : ''} onClick={() => setDocId('')}>
          全部资料
        </button>
        {s.workspace.documents.map(d => (
          <button key={d.id} className={docId === d.id ? 'selected' : ''} onClick={() => setDocId(d.id)}>
            {d.title.split(' · ')[0]}
          </button>
        ))}
      </div>
      <section className="graph-panel">
        <div className="graph-top">
          <span className="tiny-dot" />
          {docId
            ? '章节与资料的归属关系'
            : `${s.workspace.documents.length} 份资料 · ${s.chunks.length} 个片段`}
          <span>节点可点击查看证据</span>
        </div>
        <KnowledgeGraph
          docs={docId ? s.workspace.documents.filter(d => d.id === docId) : s.workspace.documents}
          chunks={s.chunks}
          open={s.setSource}
        />
        <p className="graph-swipe">左右滑动查看完整图谱，点击节点查看原文</p>
      </section>
      <div className="graph-legend">
        <span>
          <i />
          课程资料
        </span>
        <span>
          <i />
          资料章节
        </span>
        <p>连线表示章节归属，不表示自动推断的因果或先修关系。</p>
      </div>
      <div className="section-title section-space">
        <h2>按章节探索</h2>
      </div>
      <div className="topic-grid">
        {s.chunks
          .filter(c => !docId || c.documentId === docId)
          .map(c => (
            <button className="topic-card" key={c.id} onClick={() => s.setSource(c)}>
              <BookOpen size={16} />
              <span>
                <strong>{c.section}</strong>
                <small>
                  {c.title.split(' · ')[0]} · 第 {c.page} 页
                </small>
              </span>
              <ChevronRight size={14} />
            </button>
          ))}
      </div>
    </>
  );
}
const ROOT = { w: 146, h: 44 };
const LEAF = { w: 120, h: 30 };
/** SVG text does not wrap; truncate by estimated advance (CJK ≈ 1em, Latin ≈ 0.58em). */
function fitLabel(text: string, size: number, max: number) {
  let width = 0;
  for (let i = 0; i < text.length; i++) {
    width += /[\u2e80-\uffff]/.test(text[i]) ? size : size * 0.58;
    if (width > max) return text.slice(0, Math.max(1, i - 1)) + '…';
  }
  return text;
}
function KnowledgeGraph({
  docs,
  chunks,
  open,
}: {
  docs: StudyDocument[];
  chunks: Chunk[];
  open: (c: Chunk) => void;
}) {
  const width = 940,
    height = 440,
    cx = 470,
    cy = 220;
  const roots = docs.slice(0, 6).map((d, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, Math.min(docs.length, 6));
    return { d, x: cx + Math.cos(angle) * 225, y: cy + Math.sin(angle) * 133, angle };
  });
  // Leaves of neighbouring roots collide when more than four roots each show three.
  const perRoot = roots.length > 4 ? 2 : 3;
  const leaf = (x: number, y: number, angle: number, n: number, count: number) => {
    const step = n - (count - 1) / 2;
    if (Math.abs(Math.cos(angle)) >= Math.abs(Math.sin(angle)))
      return { x: x + Math.sign(Math.cos(angle)) * (ROOT.w / 2 + 20 + LEAF.w / 2), y: y + step * (LEAF.h + 10) };
    return { x: x + step * (LEAF.w + 12), y: y + Math.sign(Math.sin(angle)) * (ROOT.h / 2 + 22 + LEAF.h / 2) };
  };
  const scroller = useRef<HTMLDivElement>(null);
  // On narrow screens the graph scrolls sideways; start at the hub instead of the left edge.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, [docs.length]);
  return (
    <div className="graph-scroll" ref={scroller}>
      <svg
        className="knowledge-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="group"
        aria-label="课程资料和章节关系图"
      >
        <defs>
          <pattern id="graph-dots" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="#dfe4dd" />
          </pattern>
        </defs>
        <rect width={width} height={height} fill="url(#graph-dots)" />
        {roots.map(({ d, x, y, angle }) => (
          <g key={d.id}>
            <path d={`M${cx} ${cy} Q${cx} ${y} ${x} ${y}`} stroke="#b5cdbd" strokeWidth="1.5" fill="none" />
            {chunks
              .filter(c => c.documentId === d.id)
              .slice(0, perRoot)
              .map((c, n, shown) => {
                const { x: sx, y: sy } = leaf(x, y, angle, n, shown.length);
                return (
                  <g key={c.id}>
                    <path d={`M${x} ${y} L${sx} ${sy}`} stroke="#d1dcd1" fill="none" />
                    <g
                      className="svg-node"
                      role="button"
                      tabIndex={0}
                      aria-label={`查看${c.section}`}
                      onClick={() => open(c)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          open(c);
                        }
                      }}
                    >
                      <title>{c.section}</title>
                      <rect
                        x={sx - LEAF.w / 2}
                        y={sy - LEAF.h / 2}
                        width={LEAF.w}
                        height={LEAF.h}
                        rx={LEAF.h / 2}
                        fill="#fff"
                        stroke="#d5dfd3"
                      />
                      <text x={sx} y={sy + 4} textAnchor="middle" fontSize="12" fill="#637162">
                        {fitLabel(c.section, 12, LEAF.w - 20)}
                      </text>
                    </g>
                  </g>
                );
              })}
            <g
              className="svg-node"
              role="button"
              tabIndex={0}
              aria-label={`查看${d.title}`}
              onClick={() => {
                const c = chunks.find(c => c.documentId === d.id);
                if (c) open(c);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  const c = chunks.find(c => c.documentId === d.id);
                  if (c) open(c);
                }
              }}
            >
              <title>{d.title}</title>
              <rect
                x={x - ROOT.w / 2}
                y={y - ROOT.h / 2}
                width={ROOT.w}
                height={ROOT.h}
                rx={10}
                fill="#edf3e8"
                stroke="#afc4a5"
              />
              <text x={x} y={y + 5} textAnchor="middle" fontSize="14" fill="#355d43">
                {fitLabel(d.title.split(' · ')[0], 14, ROOT.w - 20)}
              </text>
            </g>
          </g>
        ))}
        <circle cx={cx} cy={cy} r="42" fill="#2e6546" />
        <text x={cx} y={cy - 2} textAnchor="middle" fontSize="16" fill="#fff">
          我的知识
        </text>
        <text x={cx} y={cy + 16} textAnchor="middle" fontSize="10" fill="#c4d9c6" letterSpacing="2">
          CONNECTED
        </text>
      </svg>
      {docs.length > 6 && <p className="muted small">概览展示前 6 份资料，请用上方标签查看其他资料。</p>}
    </div>
  );
}
