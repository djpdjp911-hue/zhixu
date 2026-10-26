'use client';
import {
  ArrowDownToLine,
  ArrowRight,
  Brain,
  Check,
  ChevronDown,
  GitBranch,
  Layers3,
  ListChecks,
  Loader2,
  MessageSquareText,
  Network,
  PenLine,
  Plus,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
  Volume2,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { Chunk, Evidence, GroundingReport, GroundingStatus, TraceStep } from '@/lib/types';
import { downloadFile } from '@/lib/ingest';
import { useWorkspace } from './workspace';
import { Heading, QuestionBox, shortDate, suggestions, Tag } from './primitives';

export function Questions() {
  const s = useWorkspace(),
    a = s.activeAnswer;
  return (
    <>
      <Heading
        eyebrow="ASK WITH EVIDENCE"
        title="每一个回答，都有来处。"
        description="从问题出发，回到原文，建立自己的理解。"
        action={
          <button
            className="secondary-btn"
            onClick={() => {
              s.setActiveAnswer(null);
              s.setFailure(null);
              s.setQuery('');
            }}
          >
            <Plus size={16} />
            新的探索
          </button>
        }
      />
      <div className="qa-layout">
        <div className="qa-main">
          {s.busy ? (
            <LivePanel />
          ) : a ? (
            <article className="answer-panel">
              {s.thread && s.thread.turns.length > 1 && (
                <div className="thread-strip" aria-label="同一话题的问答">
                  <span>
                    <GitBranch size={13} />
                    同一话题 · {s.thread.turns.length} 轮
                  </span>
                  {s.thread.turns.map((t, i) => (
                    <button
                      key={t.id}
                      className={t.id === a.id ? 'current' : ''}
                      aria-current={t.id === a.id}
                      onClick={() => s.setActiveAnswer(t)}
                    >
                      {i + 1}. {t.question}
                    </button>
                  ))}
                </div>
              )}
              <div className="question-title">
                <span>你的问题</span>
                <h2>{a.question}</h2>
              </div>
              <div className="answer-heading">
                <span className="assistant-icon">
                  <Layers3 size={21} />
                </span>
                <div>
                  <h3>知序{a.mode === 'extractive' ? ' · 原文检索' : ' · AI 学习助手'}</h3>
                  <p>
                    {a.mode === 'extractive'
                      ? '未调用大模型，以下内容为相关原文摘录'
                      : `${a.model ?? 'AI 模型'} · 基于所选资料生成，请结合证据核验`}
                  </p>
                </div>
                <Tag tone={a.refused ? 'amber' : 'green'}>
                  {a.refused ? '证据不足' : `${a.evidence.length} 处证据`}
                </Tag>
              </div>
              {a.safety && a.safety.length > 0 && (
                <p className="safety-note">
                  <ShieldAlert size={15} />
                  <span>
                    检索到的资料中含有疑似指令性文字（{a.safety.join('、')}）。这些片段已被标注为不可信内容，只作为资料引用，未被执行。
                  </span>
                </p>
              )}
              <div className="answer-text">
                <AnswerText text={a.text} evidence={a.evidence} open={s.setSource} />
              </div>
              {a.citationWarnings?.map(w => (
                <p className="warning" key={w}>
                  {w}
                </p>
              ))}
              {a.grounding && <Grounding report={a.grounding} evidence={a.evidence} open={s.setSource} />}
              {a.evidence.length > 0 && <CitationGrid evidence={a.evidence} open={s.setSource} />}
              <details className="trace-details">
                <summary>
                  <Network size={14} />
                  查看执行记录
                  <span>
                    {a.elapsedMs} ms · {a.retrieval === 'hybrid' ? '混合检索' : 'BM25 检索'} · {a.trace.length} 步
                  </span>
                  <ChevronDown size={14} />
                </summary>
                <Trace steps={a.trace} />
              </details>
              <div className="answer-actions">
                <button onClick={() => s.speak(a.text)}>
                  <Volume2 size={15} />
                  朗读
                </button>
                <button
                  onClick={() =>
                    downloadFile(
                      '知序-证据笔记.md',
                      `# ${a.question}\n\n${a.text}\n\n## 证据出处\n${a.evidence.map((e, i) => `[${i + 1}] ${e.title}，第${e.page}页，${e.section}\n> ${e.text}\n`).join('\n')}`,
                    )
                  }
                >
                  <ArrowDownToLine size={15} />
                  导出笔记
                </button>
                <button onClick={s.startQuiz}>
                  <ListChecks size={15} />
                  用练习检验理解
                </button>
                {a.evidence[0] && (
                  <button onClick={() => s.openFeynman(a.evidence[0])}>
                    <PenLine size={15} />
                    用自己的话讲一遍
                  </button>
                )}
              </div>
            </article>
          ) : s.failure ? (
            <div className="answer-panel failure-panel" role="alert">
              <div className="answer-heading">
                <span className="assistant-icon warn">
                  <TriangleAlert size={20} />
                </span>
                <div>
                  <h3>这次没有完成回答</h3>
                  <p>{s.failure.question}</p>
                </div>
              </div>
              <p className="failure-message">{s.failure.message}</p>
              <p className="muted small">未完成的回答不会保存，也不会计入学习记录。你可以重试，或先改用不依赖模型的原文检索。</p>
              <div className="button-row">
                <button className="primary-btn" onClick={() => void s.ask(s.failure!.question)}>
                  <RotateCcw size={15} />
                  重试
                </button>
                {s.useModel && (
                  <button className="secondary-btn" onClick={() => void s.ask(s.failure!.question, { local: true })}>
                    改用原文检索
                  </button>
                )}
                <button className="text-link" onClick={() => s.setModal('settings')}>
                  检查模型设置
                  <ArrowRight size={13} />
                </button>
              </div>
            </div>
          ) : (
            <div className="ask-empty">
              <span className="ask-empty-logo">
                <Layers3 size={35} strokeWidth={1.5} />
              </span>
              <h2>
                把问题交给资料，
                <br />
                把理解留给自己。
              </h2>
              <p>选择一个好奇的问题，开始有证据的探索。</p>
              <div className="question-prompts">
                {suggestions.map(q => (
                  <button key={q} onClick={() => void s.ask(q)}>
                    <MessageSquareText size={16} />
                    {q}
                    <ArrowRight size={15} />
                  </button>
                ))}
              </div>
            </div>
          )}
          <QuestionBox />
          <p className="composer-disclaimer">检索命中与引用编号不代表结论正确。点击证据卡片核对原文。</p>
        </div>
        <aside className="qa-rail">
          <div className="section-title">
            <h2>探索记录</h2>
            <span>{s.workspace.answers.length}</span>
          </div>
          {s.workspace.answers.length ? (
            s.workspace.answers.map(a => (
              <button
                key={a.id}
                className={'history-item ' + (s.activeAnswer?.id === a.id ? 'selected' : '')}
                onClick={() => s.setActiveAnswer(a)}
              >
                <MessageSquareText size={15} />
                <span>
                  {a.question}
                  <small>
                    {shortDate(a.createdAt)} · {a.mode === 'extractive' ? '原文检索' : 'AI 回答'}
                    {a.grounding?.checked ? ` · 核验 ${a.grounding.supported}/${a.grounding.checked}` : ''}
                  </small>
                </span>
              </button>
            ))
          ) : (
            <p className="muted small">你的提问将保存在这里。</p>
          )}
          <div className="rail-tip">
            <ShieldCheck size={17} />
            <strong>证据不足时，坦诚说不知道。</strong>
            <p>没有找到相关资料时，知序会提示补充资料。</p>
          </div>
        </aside>
      </div>
    </>
  );
}

const STAGES = ['解析资料', '规划检索', '核对证据', '组织回答'];
function LivePanel() {
  const s = useWorkspace();
  const searched = s.liveTrace.some(t => t.tool !== 'chunk_documents' && t.tool !== 'conversation');
  const stage = s.streamText ? 3 : s.liveEvidence.length || searched ? 2 : s.liveTrace.length ? 1 : 0;
  return (
    <div className="answer-panel live-panel" aria-live="polite" aria-busy="true">
      <div className="question-title">
        <span>你的问题</span>
        <h2>{s.pendingQuestion}</h2>
      </div>
      <div className="answer-heading">
        <span className="assistant-icon">
          <Loader2 className="spin" size={20} />
        </span>
        <div>
          <h3>{s.phase}</h3>
          <p>{s.liveModel ? 'AI 正在自主决定检索什么、读取哪些原文' : '正在检索所选资料'}</p>
        </div>
        <button className="secondary-btn" onClick={() => s.controller.current?.abort()}>
          停止
        </button>
      </div>
      <ol className="stage-steps" aria-label="处理进度">
        {STAGES.map((label, i) => (
          <li key={label} className={i < stage ? 'done' : i === stage ? 'active' : ''}>
            <span>{i < stage ? <Check size={11} /> : i + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      <Trace steps={s.liveTrace} />
      {s.liveEvidence.length > 0 && (
        <div className="live-evidence">
          <span>已找到的证据</span>
          {s.liveEvidence.map((e, i) => (
            <button key={e.id} onClick={() => s.setSource(e)}>
              <b>{i + 1}</b>
              {e.section}
            </button>
          ))}
        </div>
      )}
      {s.thinking && (
        <details className="thinking-panel" open={!s.streamText}>
          <summary>
            <Brain size={14} />
            模型推理过程
            <small>{s.thinking.length} 字</small>
          </summary>
          <p>{s.thinking}</p>
        </details>
      )}
      {s.streamText ? (
        <div className="answer-text streaming">
          <AnswerText text={s.streamText} evidence={s.liveEvidence} open={s.setSource} />
        </div>
      ) : (
        <>
          <div className="skeleton-line" />
          <div className="skeleton-line short" />
        </>
      )}
    </div>
  );
}

function CitationGrid({ evidence, open }: { evidence: Evidence[]; open: (c: Chunk) => void }) {
  return (
    <div className="citation-grid">
      {evidence.map((e, i) => (
        <button key={e.id} className="citation-card" onClick={() => open(e)}>
          <span className="citation-number">{i + 1}</span>
          <span>
            <strong>{e.section}</strong>
            <small>
              {e.title.split(' · ')[0]} · 第 {e.page} 页
            </small>
          </span>
          <ArrowRight size={13} />
        </button>
      ))}
    </div>
  );
}

const GROUNDING_LABEL: Record<GroundingStatus, string> = {
  supported: '有支持',
  weak: '待核对',
  uncited: '无引用',
  supplement: '补充',
};
function Grounding({
  report,
  evidence,
  open,
}: {
  report: GroundingReport;
  evidence: Evidence[];
  open: (c: Chunk) => void;
}) {
  if (!report.checked && !report.supplement) return null;
  return (
    <details className="grounding-panel">
      <summary>
        <ShieldCheck size={14} />
        <span>逐句引用核验</span>
        <span className="grounding-bar" aria-hidden="true">
          <i className="supported" style={{ flexGrow: report.supported }} />
          <i className="weak" style={{ flexGrow: report.weak }} />
          <i className="uncited" style={{ flexGrow: report.uncited }} />
        </span>
        <span className="grounding-summary">
          {report.supported}/{report.checked} 句有原文支持
          {report.weak ? ` · ${report.weak} 句待核对` : ''}
          {report.uncited ? ` · ${report.uncited} 句无引用` : ''}
        </span>
        <span className="grounding-compact">
          {report.supported}/{report.checked}
        </span>
        <ChevronDown size={14} />
      </summary>
      <p className="grounding-note">
        在本地逐句比对回答与它引用的原文的用词重合度，不调用模型。重合度低不一定是错误，但值得优先核对；「补充」是资料以外的举例，不计入核验。
      </p>
      <ul>
        {report.sentences.map((item, i) => (
          <li key={i} className={'g-' + item.status}>
            <span className="g-badge">{GROUNDING_LABEL[item.status]}</span>
            <div>
              <p>{item.text}</p>
              <small>
                {item.status === 'supplement' ? '资料外补充' : `重合度 ${Math.round(item.support * 100)}%`}
                {item.citations.length ? ` · 引用 ${item.citations.map(n => `[${n}]`).join('')}` : ''}
                {item.suggested && evidence[item.suggested - 1] && (
                  <button onClick={() => open(evidence[item.suggested! - 1])}>可能出自 [{item.suggested}]</button>
                )}
              </small>
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function Trace({ steps }: { steps: TraceStep[] }) {
  return (
    <ol className="trace-list">
      {steps.map((step, i) => (
        <li key={i} className={step.label.startsWith('拦截') || step.detail.includes('疑似注入') ? 'flagged' : ''}>
          <span className="trace-check">
            {step.label.startsWith('拦截') ? <ShieldAlert size={12} /> : <Check size={12} />}
          </span>
          <div>
            <strong>{step.label}</strong>
            <p>{step.detail}</p>
          </div>
          <time>{step.ms} ms</time>
        </li>
      ))}
    </ol>
  );
}

function Inline({ text, evidence, open }: { text: string; evidence: Evidence[]; open: (c: Chunk) => void }) {
  return (
    <>
      {text.split(/(\[\d+\]|\*\*[^*]+\*\*|`[^`]+`)/g).map((part, n) => {
        if (!part) return null;
        const cite = part.match(/^\[(\d+)\]$/);
        if (cite) {
          const e = evidence[Number(cite[1]) - 1];
          return e ? (
            <button
              className="inline-citation"
              key={n}
              onClick={() => open(e)}
              aria-label={`查看引用${cite[1]}：${e.section}`}
              title={`${e.section} · 第 ${e.page} 页`}
            >
              {cite[1]}
            </button>
          ) : (
            <span className="invalid-citation" key={n}>
              {part}
            </span>
          );
        }
        if (part.length > 4 && part.startsWith('**') && part.endsWith('**'))
          return <strong key={n}>{part.slice(2, -2)}</strong>;
        if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) return <code key={n}>{part.slice(1, -1)}</code>;
        return <span key={n}>{part}</span>;
      })}
    </>
  );
}

/** Renders the Markdown subset the assistant is asked to produce; partial text renders safely while streaming. */
function AnswerText({ text, evidence, open }: { text: string; evidence: Evidence[]; open: (c: Chunk) => void }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const inline = (value: string) => <Inline text={value} evidence={evidence} open={open} />;
  const flush = () => {
    if (!list) return;
    const items = list.items.map((item, i) => <li key={i}>{inline(item)}</li>);
    blocks.push(list.ordered ? <ol key={blocks.length}>{items}</ol> : <ul key={blocks.length}>{items}</ul>);
    list = null;
  };
  let code: { lang: string; lines: string[] } | null = null;
  const closeCode = () => {
    if (!code) return;
    blocks.push(
      <pre key={blocks.length} className="answer-code" data-lang={code.lang || undefined}>
        <code>{code.lines.join('\n')}</code>
      </pre>,
    );
    code = null;
  };
  for (const line of text.split('\n')) {
    const fence = line.match(/^\s*```\s*([\w+-]*)\s*$/);
    if (fence) {
      if (code) closeCode();
      else {
        flush();
        code = { lang: fence[1], lines: [] };
      }
      continue;
    }
    if (code) {
      code.lines.push(line);
      continue;
    }
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.、)]\s*(.*)$/);
    const item = bullet ?? numbered;
    if (item) {
      if (list && list.ordered !== !bullet) flush();
      list ??= { ordered: !bullet, items: [] };
      list.items.push(item[1]);
      continue;
    }
    flush();
    if (!line.trim()) continue;
    const heading = line.match(/^#{1,4}\s+(.*)$/);
    const callout = line.match(/^\s*(?:\*\*)?(补充示例|自检问题)(?:\*\*)?[:：]\s*(.*)$/);
    if (heading) blocks.push(<h3 key={blocks.length}>{heading[1].replace(/\*\*/g, '')}</h3>);
    else if (callout)
      blocks.push(
        <p key={blocks.length} className={'answer-callout ' + (callout[1] === '自检问题' ? 'check' : 'extra')}>
          <span>{callout[1]}</span>
          <span>{inline(callout[2])}</span>
        </p>,
      );
    else if (/^\s*>/.test(line)) blocks.push(<blockquote key={blocks.length}>{inline(line.replace(/^\s*>\s?/, ''))}</blockquote>);
    else blocks.push(<p key={blocks.length}>{inline(line)}</p>);
  }
  flush();
  closeCode();
  return <>{blocks}</>;
}
