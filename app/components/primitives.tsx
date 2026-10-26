'use client';
import {
  ArrowUp,
  BookOpen,
  ChevronDown,
  FileText,
  GitBranch,
  Layers3,
  Loader2,
  Mic,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { StudyDocument } from '@/lib/types';
import { useWorkspace } from './workspace';

export const suggestions = [
  '事件循环中，微任务与定时器的执行顺序是什么？',
  'no-cache 和 no-store 有什么区别？',
  'React 的状态快照是什么意思？',
];
export const shortDate = (s: string) =>
  new Date(s).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
export function Logo() {
  return (
    <div className="brand">
      <span className="brand-symbol">
        <Layers3 size={23} strokeWidth={2.1} />
      </span>
      <span>
        知序<span className="brand-english">ZHIXU</span>
      </span>
    </div>
  );
}
export function Tag({ children, tone = '' }: { children: ReactNode; tone?: string }) {
  return <span className={'tag ' + tone}>{children}</span>;
}
export function Empty({
  icon,
  title,
  text,
  action,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
export function Heading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
export function QuestionBox({ large = false }: { large?: boolean }) {
  const s = useWorkspace();
  const followUp = !large && s.useModel && s.thread && !s.busy;
  return (
    <form
      className={'question-box ' + (large ? 'large' : '')}
      onSubmit={e => {
        e.preventDefault();
        void s.ask();
      }}
    >
      {followUp && (
        <div className="follow-up-bar">
          <GitBranch size={13} />
          <span>追问模式 · 将携带本话题最近 {Math.min(3, s.thread!.turns.length)} 轮问答理解指代，事实仍以本轮检索为准</span>
          <button type="button" onClick={() => s.setActiveAnswer(null)}>
            开启新话题
          </button>
        </div>
      )}
      <textarea
        aria-label="输入学习问题"
        placeholder={
          large ? '试着问一个问题，让理解更进一步…' : followUp ? '继续追问，比如“那它和……有什么区别？”' : '提出一个新问题…'
        }
        value={s.query}
        onChange={e => s.setQuery(e.target.value)}
        maxLength={1200}
        rows={large ? 2 : 1}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void s.ask();
          }
        }}
      />
      <div className="composer-bottom">
        <button className="source-select" type="button" onClick={() => s.setModal('settings')}>
          <BookOpen size={14} />
          {s.selectedDocs.length} 份资料
          <ChevronDown size={13} />
        </button>
        {s.status.configured && !s.useModel ? (
          <button className="composer-mode offer" type="button" onClick={() => s.setModal('settings')}>
            <Sparkles size={12} />
            开启 AI 学习助手
          </button>
        ) : (
          <span className="composer-mode">
            {s.useModel && s.status.configured ? `AI 学习助手 · ${s.status.model}` : '本地证据检索'}
          </span>
        )}
        <button className="icon-btn mic" type="button" onClick={() => s.dictate()} aria-label="语音输入">
          <Mic size={17} />
        </button>
        <button className="send-button" type="submit" aria-label="发送问题" disabled={s.busy || !s.ready}>
          {s.busy ? <Loader2 size={18} className="spin" /> : <ArrowUp size={18} />}
        </button>
      </div>
    </form>
  );
}
export function DocCard({ doc, index }: { doc: StudyDocument; index: number }) {
  const s = useWorkspace();
  return (
    <article className="doc-card">
      <button className="doc-main" onClick={() => s.showDoc(doc)}>
        <div className="doc-art" data-color={index % 4}>
          <FileText size={25} strokeWidth={1.4} />
          <span>
            {doc.kind === 'Markdown' ? 'MD' : doc.kind === 'Image' ? 'IMG' : doc.kind.toUpperCase()}
          </span>
          <i />
          <i />
        </div>
        <div className="doc-info">
          <h3>{doc.title.split(' · ')[0]}</h3>
          <p>{doc.title.split(' · ')[1] || `${doc.pages.length} 页学习资料`}</p>
          <div className="doc-meta">
            <span>{doc.pages.length} 页</span>
            <span>{s.chunks.filter(c => c.documentId === doc.id).length} 个知识片段</span>
          </div>
        </div>
      </button>
      <div className="doc-footer">
        <span>
          <span className="tiny-dot" />
          {doc.sample ? '原创示例资料' : '已保存在本机'}
        </span>
        <button className="icon-btn" onClick={() => s.setDeleteId(doc.id)} aria-label={`删除${doc.title}`}>
          <Trash2 size={14} />
        </button>
      </div>
    </article>
  );
}
export function LearningArt() {
  return (
    <svg
      className="learning-art"
      viewBox="0 0 360 230"
      role="img"
      aria-label="把资料、问题和理解连接起来的知识网络"
    >
      <defs>
        <pattern id="grid" width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="#a6b6a8" opacity=".35" />
        </pattern>
      </defs>
      <rect width="360" height="230" fill="url(#grid)" />
      <ellipse cx="190" cy="122" rx="139" ry="82" fill="none" stroke="#b9cbbb" strokeDasharray="4 6" />
      <path
        d="M88 72 L185 118 L286 65 M185 118 L290 172 M185 118 L85 184"
        fill="none"
        stroke="#91b69a"
        strokeWidth="1.5"
      />
      <rect
        x="42"
        y="40"
        width="84"
        height="64"
        rx="12"
        fill="white"
        stroke="#dbe3d7"
        transform="rotate(-8 84 72)"
      />
      <path d="M64 61h39M64 71h30M64 81h36" stroke="#a1aca4" strokeWidth="3" strokeLinecap="round" />
      <rect
        x="251"
        y="39"
        width="66"
        height="50"
        rx="12"
        fill="#f8fbf2"
        stroke="#c2d6b8"
        transform="rotate(9 284 64)"
      />
      <path d="m268 66 10-11 10 11 12-17" fill="none" stroke="#5b8966" strokeWidth="2" />
      <rect x="247" y="149" width="82" height="48" rx="12" fill="white" stroke="#dbe3d7" />
      <circle cx="266" cy="173" r="9" fill="#e5efd7" />
      <path d="m262 173 3 3 5-6" fill="none" stroke="#527b48" strokeWidth="2" />
      <path d="M284 168h28M284 177h19" stroke="#a1aca4" strokeWidth="3" strokeLinecap="round" />
      <rect x="51" y="162" width="70" height="43" rx="11" fill="#f2ecd8" stroke="#e0d8bc" />
      <text x="86" y="188" textAnchor="middle" fontSize="13" fill="#8a7953">
        为什么？
      </text>
      <circle cx="185" cy="118" r="46" fill="#f9fbf2" stroke="#c2d6b8" />
      <circle cx="185" cy="118" r="34" fill="#2e6546" />
      <path
        d="M167 105q10-4 18 2 8-6 18-2v27q-10-4-18 2-8-6-18-2zM185 107v27"
        fill="none"
        stroke="#eff8e9"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="147" cy="36" r="5" fill="#a2b987" />
      <path d="M323 112h10m-5-5v10M32 127h8m-4-4v8" stroke="#8fa784" strokeWidth="2" />
      <text x="181" y="220" fontSize="9" letterSpacing="2.5" fill="#6e8a72" textAnchor="middle">
        CONNECT · UNDERSTAND · GROW
      </text>
    </svg>
  );
}
