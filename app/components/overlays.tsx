'use client';
import { Fragment, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  AudioLines,
  BookOpen,
  CalendarClock,
  Check,
  CircleHelp,
  FileText,
  Loader2,
  Mic,
  PenLine,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import type { FeedbackPoint } from '@/lib/types';
import { REVIEW_INTERVALS } from '@/lib/learning';
import { useWorkspace } from './workspace';
import { Logo, shortDate, Tag } from './primitives';

function SourceText({ text }: { text: string }) {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    const heading = /^#{1,6}\s+(.+)$/.exec(line);
    const end = i < lines.length - 1 ? '\n' : '';
    return (
      <Fragment key={i}>
        {heading ? <strong className="source-heading">{heading[1]}</strong> : line}
        {end}
      </Fragment>
    );
  });
}

function FileInputs() {
  const { uploadRef, imageRef, backupRef, uploadFiles, recognizeImage, restore } = useWorkspace();
  return (
    <>
      <input
        className="hidden"
        type="file"
        ref={uploadRef}
        multiple
        accept=".pdf,.md,.markdown,.txt"
        onChange={e => void uploadFiles(e.target.files)}
      />
      <input
        className="hidden"
        type="file"
        ref={imageRef}
        accept="image/png,image/jpeg,image/webp"
        onChange={e => void recognizeImage(e.target.files?.[0])}
      />
      <input
        className="hidden"
        type="file"
        ref={backupRef}
        accept=".json"
        onChange={e => void restore(e.target.files?.[0])}
      />
    </>
  );
}

function FeynmanPanel() {
  const s = useWorkspace();
  const target = s.feynman!;
  const result = s.feynmanResult;
  const open = (chunkId?: string) => {
    s.setModal(null);
    s.setSource(target.sources.find(c => c.id === chunkId) ?? target.sources[0]);
  };
  const quoted = (p: FeedbackPoint) =>
    p.quote && !p.quote.startsWith(p.point.replace(/…$/, '')) ? (
      <button className="feedback-quote" onClick={() => open(p.chunkId)}>
        原文：{p.quote}
      </button>
    ) : null;
  if (!result)
    return (
      <>
        <div className="feynman-topic">
          <Tag>
            {target.title.split(' · ')[0]} · 第 {target.page} 页
          </Tag>
          <h3>{target.section}</h3>
          <p>
            费曼学习法：先不看资料，像给同学讲解一样，用自己的话说清楚它是什么、为什么、怎么用。讲不清的地方，就是需要复习的地方。
          </p>
        </div>
        <textarea
          className="paste-area"
          aria-label="你的解释"
          placeholder="例如：它指的是……；之所以这样，是因为……；举个例子……"
          rows={7}
          maxLength={3000}
          value={s.explanation}
          disabled={s.feynmanBusy}
          onChange={e => s.setExplanation(e.target.value)}
        />
        <div className="feynman-tools">
          <button
            className="secondary-btn"
            type="button"
            disabled={s.feynmanBusy}
            onClick={() => s.dictate(t => s.setExplanation(x => (x ? x + ' ' : '') + t))}
          >
            <Mic size={15} />
            语音讲解
          </button>
          <span>{s.explanation.trim().length} / 3000 字</span>
        </div>
        <button className="primary-btn full" disabled={s.feynmanBusy} onClick={() => void s.submitFeynman()}>
          {s.feynmanBusy ? (
            <>
              <Loader2 size={16} className="spin" />
              {s.aiReady ? 'AI 正在对照原文评估…' : '正在估算…'}
            </>
          ) : (
            <>
              提交并获得反馈
              <ArrowRight size={15} />
            </>
          )}
        </button>
        <p className="modal-footnote">
          <ShieldCheck size={13} />
          {s.aiReady
            ? `由 ${s.status.provider} · ${s.status.model} 对照原文评估，反馈中引用的原文都经过逐字核对。`
            : '未开启 AI 学习助手：按原文要点的用词覆盖度估算，只比较用词，不判断表述对错。'}
        </p>
      </>
    );
  const f = result.feedback,
    next = result.next;
  const schedule =
    f.score >= 80
      ? next
        ? `复述达标！已安排在 ${shortDate(next.due)} 再巩固一次（间隔 ${REVIEW_INTERVALS[next.stage ?? 0]} 天）。`
        : '复述达标，这个主题目前没有待复习的任务。'
      : next
        ? `已安排在 ${shortDate(next.due)} 再复述一次${f.score < 60 ? '，间隔复习从第一轮重新开始' : ''}。`
        : '';
  return (
    <>
      <div className="feynman-score">
        <div
          className={'score-ring ' + (f.score >= 80 ? 'good' : f.score >= 60 ? 'mid' : 'low')}
          style={{ '--score': f.score } as CSSProperties}
          role="img"
          aria-label={`得分 ${f.score}`}
        >
          <strong>{f.score}</strong>
        </div>
        <div>
          <Tag tone={f.origin === 'model' ? 'green' : ''}>{f.origin === 'model' ? 'AI 对照原文评估' : '规则估算'}</Tag>
          <h3>
            {f.verdict} · {target.section}
          </h3>
          <p>{f.summary}</p>
        </div>
      </div>
      {result.safety.length > 0 && (
        <p className="safety-note">
          <ShieldAlert size={15} />
          <span>你的解释中含有疑似指令性文字（{result.safety.join('、')}），评估时已按普通文本处理。</span>
        </p>
      )}
      {f.misconceptions.length > 0 && (
        <section className="feedback-group wrong">
          <h4>需要纠正</h4>
          {f.misconceptions.map((m, i) => (
            <div key={i}>
              <p>
                <b>你的说法</b>
                {m.claim}
              </p>
              <p>
                <b>依据资料</b>
                {m.correction}
              </p>
              {m.quote && (
                <button className="feedback-quote" onClick={() => open(m.chunkId)}>
                  原文：{m.quote}
                </button>
              )}
            </div>
          ))}
        </section>
      )}
      {f.missing.length > 0 && (
        <section className="feedback-group missing">
          <h4>还没讲到</h4>
          <ul>
            {f.missing.map((p, i) => (
              <li key={i}>
                {p.point}
                {quoted(p)}
              </li>
            ))}
          </ul>
        </section>
      )}
      {f.covered.length > 0 && (
        <section className="feedback-group covered">
          <h4>讲清楚了</h4>
          <ul>
            {f.covered.map((p, i) => (
              <li key={i}>{p.point}</li>
            ))}
          </ul>
        </section>
      )}
      {f.followUp && (
        <p className="answer-callout check">
          <span>追问</span>
          {f.followUp}
        </p>
      )}
      {schedule && (
        <p className="feynman-schedule">
          <CalendarClock size={15} />
          {schedule}
        </p>
      )}
      <div className="button-row">
        <button className="secondary-btn" onClick={() => s.setFeynmanResult(null)}>
          <RotateCcw size={15} />
          再讲一遍
        </button>
        <button className="secondary-btn" onClick={() => open()}>
          对照原文
        </button>
        <button className="primary-btn" onClick={() => s.setModal(null)}>
          完成
        </button>
      </div>
    </>
  );
}

export function Overlays() {
  const s = useWorkspace();
  const [search, setSearch] = useState('');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null),
    drawerRef = useRef<HTMLElement>(null),
    deleteRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = s.deleteId
      ? deleteRef.current
      : s.modal
        ? dialogRef.current
        : s.source
          ? drawerRef.current
          : null;
    if (!root) return;
    const previous = document.activeElement as HTMLElement;
    const focusables = () =>
      Array.from(
        root.querySelectorAll<HTMLElement>('button,input,textarea,select,a[href],[tabindex="0"]'),
      ).filter(el => !el.hasAttribute('disabled'));
    focusables()[0]?.focus();
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = focusables(),
        first = items[0],
        last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', trap);
    return () => {
      document.removeEventListener('keydown', trap);
      document.body.style.overflow = oldOverflow;
      previous?.focus();
    };
  }, [s.modal, s.source, s.deleteId]);
  function savePaste() {
    if (text.trim().length < 25) {
      s.setNotice('请至少粘贴 25 个字符的资料内容。');
      return;
    }
    if (
      s.addDocs([
        {
          id: crypto.randomUUID(),
          title: title.trim() || '我的学习笔记',
          kind: 'Text',
          createdAt: new Date().toISOString(),
          pages: [{ page: 1, text: text.trim() }],
        },
      ])
    ) {
      setText('');
      setTitle('');
    }
  }
  return (
    <>
      <FileInputs />
      {s.modal && (
        <div
          className="modal-backdrop"
          onMouseDown={e => {
            if (e.target === e.currentTarget && !s.uploading && !s.feynmanBusy) s.setModal(null);
          }}
        >
          <div
            className={
              'modal ' + (s.modal === 'settings' ? 'settings-modal' : s.modal === 'feynman' ? 'feynman-modal' : '')
            }
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            ref={dialogRef}
          >
            <div className="modal-header">
              <h2 id="modal-title">
                {s.modal === 'upload'
                  ? '让学习资料，开始连接。'
                  : s.modal === 'search'
                    ? '搜索你的知识空间'
                    : s.modal === 'settings'
                      ? '你的学习偏好'
                      : s.modal === 'feynman'
                        ? '用自己的话讲一遍'
                        : '认识知序'}
              </h2>
              <button
                className="icon-btn"
                onClick={() => s.setModal(null)}
                aria-label="关闭弹窗"
                disabled={s.uploading || s.feynmanBusy}
              >
                <X size={20} />
              </button>
            </div>
            {s.modal === 'upload' && (
              <>
                {s.imageDraft ? (
                  <>
                    <p className="muted">请核对图片识别结果，确认无误后再加入资料库。</p>
                    <input
                      className="text-input"
                      aria-label="识别资料名称"
                      value={s.imageDraft.title}
                      maxLength={180}
                      onChange={e => s.setImageDraft({ ...s.imageDraft!, title: e.target.value })}
                    />
                    <textarea
                      className="paste-area"
                      aria-label="识别结果"
                      rows={9}
                      maxLength={150000}
                      value={s.imageDraft.text}
                      onChange={e => s.setImageDraft({ ...s.imageDraft!, text: e.target.value })}
                    />
                    <button
                      className="primary-btn full"
                      onClick={() => {
                        if (s.imageDraft!.text.trim().length < 25) {
                          s.setNotice('请至少保留 25 个字符');
                          return;
                        }
                        if (
                          s.addDocs([
                            {
                              id: crypto.randomUUID(),
                              title: s.imageDraft!.title.trim() || '图片资料',
                              kind: 'Image',
                              createdAt: new Date().toISOString(),
                              pages: [{ page: 1, text: s.imageDraft!.text }],
                            },
                          ])
                        )
                          s.setImageDraft(null);
                      }}
                    >
                      确认并保存资料
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className={'upload-drop ' + (s.uploading ? 'disabled' : '')}
                      disabled={s.uploading}
                      onClick={() => s.uploadRef.current?.click()}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => {
                        e.preventDefault();
                        if (!s.uploading) void s.uploadFiles(e.dataTransfer.files);
                      }}
                    >
                      {s.uploading ? (
                        <Loader2 size={30} className="spin" />
                      ) : (
                        <Upload size={30} strokeWidth={1.5} />
                      )}
                      <strong>{s.uploading ? '正在解析资料，请稍候…' : '点击选择文件，或拖放到这里'}</strong>
                      <span>PDF、Markdown、TXT · 单份不超过 8MB</span>
                      <small>PDF 最多 100 页，仅支持可提取文本的文件</small>
                    </button>
                    <div className="or-divider">
                      <span>也可以直接粘贴</span>
                    </div>
                    <input
                      className="text-input"
                      placeholder="给这份资料起个名字"
                      aria-label="资料名称"
                      value={title}
                      maxLength={180}
                      onChange={e => setTitle(e.target.value)}
                    />
                    <textarea
                      className="paste-area"
                      placeholder="粘贴笔记、课程讲义或阅读摘录…"
                      aria-label="粘贴资料内容"
                      value={text}
                      maxLength={150000}
                      rows={5}
                      onChange={e => setText(e.target.value)}
                    />
                    <div className="upload-actions">
                      <button
                        className="secondary-btn"
                        disabled={s.uploading}
                        onClick={() => s.imageRef.current?.click()}
                      >
                        <AudioLines size={16} />
                        图片文字识别
                      </button>
                      <button className="primary-btn" disabled={s.uploading} onClick={savePaste}>
                        添加到资料库
                        <ArrowRight size={15} />
                      </button>
                    </div>
                    <p className="modal-footnote">
                      <ShieldCheck size={13} />
                      文件在本机解析；图片识别需要视觉模型和你的确认。
                    </p>
                  </>
                )}
              </>
            )}
            {s.modal === 'search' && (
              <>
                <div className="inline-search modal-search">
                  <Search size={18} />
                  <input
                    placeholder="搜索资料标题、章节或原文内容…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    aria-label="全局搜索"
                  />
                </div>
                <div className="search-results">
                  {s.chunks
                    .filter(
                      c => search.trim() && (c.text + c.title).toLowerCase().includes(search.toLowerCase()),
                    )
                    .slice(0, 12)
                    .map(c => (
                      <button
                        key={c.id}
                        onClick={() => {
                          s.setModal(null);
                          s.setSource(c);
                        }}
                      >
                        <FileText size={17} />
                        <span>
                          <strong>{c.section}</strong>
                          <small>
                            {c.title} · 第 {c.page} 页
                          </small>
                          <p>{c.text.replace(/^#+.+\n/gm, '').slice(0, 100)}…</p>
                        </span>
                        <ArrowRight size={14} />
                      </button>
                    ))}
                  {!search.trim() ? (
                    <p className="search-hint">输入关键词，找到值得重新理解的那一页。</p>
                  ) : (
                    !s.chunks.some(c => (c.text + c.title).toLowerCase().includes(search.toLowerCase())) && (
                      <p className="search-hint">没有找到相关片段。换个关键词试试。</p>
                    )
                  )}
                </div>
              </>
            )}
            {s.modal === 'settings' && (
              <>
                <div className="settings-section">
                  <h3>回答方式</h3>
                  <div className="mode-options">
                    <button className={!s.useModel ? 'chosen' : ''} onClick={() => s.setUseModel(false)}>
                      <BookOpen size={20} />
                      <strong>原文检索</strong>
                      <small>无需密钥 · 返回资料摘录</small>
                      {!s.useModel && <Check size={16} />}
                    </button>
                    <button
                      className={s.useModel ? 'chosen' : ''}
                      disabled={!s.status.configured}
                      onClick={() => s.setUseModel(true)}
                    >
                      <Sparkles size={20} />
                      <strong>AI 学习助手</strong>
                      <small>
                        {s.status.configured ? `${s.status.provider} · ${s.status.model}` : '尚未配置模型服务'}
                      </small>
                      {s.useModel && <Check size={16} />}
                    </button>
                  </div>
                  {s.status.configured ? (
                    <div className="capability-row" aria-label="当前模型能力">
                      {(
                        [
                          ['工具调用 Agent', true],
                          ['流式输出', true],
                          ['AI 出题与复述评估', true],
                          ['图片文字识别', s.status.vision],
                          ['语义向量检索', s.status.embeddings],
                        ] as const
                      ).map(([label, on]) => (
                        <span key={label} className={on ? 'on' : ''}>
                          {on ? <Check size={11} /> : <X size={11} />}
                          {label}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="settings-info">
                      请在服务端配置 LLM_API_KEY 与 LLM_MODEL（推荐智谱 glm-4.7-flash，免费且支持工具调用），可用
                      LLM_BASE_URL 切换 DeepSeek、通义千问等 OpenAI 兼容服务，重启本地服务或重新部署后生效。密钥只放在服务端环境变量中，不要填进页面或公开仓库。
                    </p>
                  )}
                  <label className="consent-row">
                    <input
                      type="checkbox"
                      checked={s.consent}
                      onChange={e => {
                        s.setConsent(e.target.checked);
                        if (!e.target.checked) s.setUseModel(false);
                      }}
                    />
                    <span>
                      使用 AI 功能时，我同意将所选资料片段、问题、复述内容或图片发送至服务端配置的模型服务
                      {s.status.configured ? `（${s.status.provider}）` : ''}处理；我会避免上传个人敏感信息。
                    </span>
                  </label>
                </div>
                <div className="settings-section">
                  <h3>问答与练习的资料范围</h3>
                  <label className="source-check">
                    <input
                      type="checkbox"
                      checked={s.selectedIds === null}
                      onChange={e => s.setSelectedIds(e.target.checked ? null : [])}
                    />
                    <strong>全部资料</strong>
                    <span>{s.workspace.documents.length} 份</span>
                  </label>
                  {s.workspace.documents.map(d => (
                    <label className="source-check" key={d.id}>
                      <input
                        type="checkbox"
                        checked={s.selectedIds === null || s.selectedIds.includes(d.id)}
                        onChange={e => {
                          const current = s.selectedIds ?? s.workspace.documents.map(x => x.id);
                          s.setSelectedIds(
                            e.target.checked ? [...current, d.id] : current.filter(id => id !== d.id),
                          );
                        }}
                      />
                      <span>{d.title}</span>
                    </label>
                  ))}
                </div>
                <div className="settings-section">
                  <h3>学习数据由你掌控</h3>
                  <p className="muted small">
                    数据保存在此浏览器中，不跨设备同步。导入备份将替换当前学习空间。
                  </p>
                  <div className="button-row">
                    <button className="secondary-btn" onClick={s.exportBackup}>
                      <ArrowDownToLine size={15} />
                      导出备份
                    </button>
                    <button className="secondary-btn" onClick={() => s.backupRef.current?.click()}>
                      <Upload size={15} />
                      导入备份
                    </button>
                  </div>
                </div>
                <button className="primary-btn full" onClick={() => s.setModal(null)}>
                  完成设置
                  <Check size={16} />
                </button>
              </>
            )}
            {s.modal === 'feynman' && s.feynman && <FeynmanPanel />}
            {s.modal === 'help' && (
              <>
                <div className="help-intro">
                  <Logo />
                  <p>把散落的资料，变成有出处的理解。</p>
                </div>
                <div className="help-steps">
                  {[
                    [
                      '01',
                      '放入资料',
                      '导入 PDF、Markdown、TXT 或粘贴笔记。示例讲义是项目原创内容，可以直接体验。',
                    ],
                    [
                      '02',
                      '带着问题探索',
                      '检索保留页码。未配置模型时提供原文摘录；开启 AI 学习助手后，Agent 自主检索、流式作答、逐句核验引用，并支持连续追问。',
                    ],
                    [
                      '03',
                      '验证自己的理解',
                      'AI 依据原文出题并核对引用；再用自己的话讲一遍，AI 对照原文指出遗漏与误解。',
                    ],
                    [
                      '04',
                      '让学习留下足迹',
                      '错题与复述结果形成间隔复习计划（1→3→7→14→30 天）。导出笔记与备份，保留你的进步。',
                    ],
                  ].map(([n, t, p]) => (
                    <div key={n}>
                      <span>{n}</span>
                      <section>
                        <h3>{t}</h3>
                        <p>{p}</p>
                      </section>
                    </div>
                  ))}
                </div>
                <div className="help-note">
                  知识脉络基于文档结构。AI 功能需要在服务端配置 OpenAI 兼容模型服务（如智谱 GLM）或 Gemini；未配置时，问答、出题与复述评估都有本地规则兜底。语音输入依赖浏览器及其服务，使用前请确认浏览器权限。
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {s.source && (
        <div
          className="drawer-backdrop"
          onMouseDown={e => {
            if (e.target === e.currentTarget) s.setSource(null);
          }}
        >
          <aside
            className="source-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="source-title"
            ref={drawerRef}
          >
            <div className="drawer-heading">
              <span>
                <ShieldCheck size={16} />
                原文证据
              </span>
              <button className="icon-btn" onClick={() => s.setSource(null)} aria-label="关闭原文">
                <X size={20} />
              </button>
            </div>
            <Tag>{s.source.title}</Tag>
            <h2 id="source-title">{s.source.section}</h2>
            <div className="source-location">
              <FileText size={14} />第 {s.source.page} 页 · 字符位置 {s.source.start}—{s.source.end}
            </div>
            <blockquote className="source-excerpt">
              <SourceText text={s.source.text} />
            </blockquote>
            <h3 className="page-context-title">这一页的完整上下文</h3>
            <div className="page-context">
              <SourceText
                text={
                  s.workspace.documents
                    .find(d => d.id === s.source!.documentId)
                    ?.pages.find(p => p.page === s.source!.page)?.text ??
                  '原始资料已移除。上方仍保留提问时的证据快照。'
                }
              />
            </div>
            <div className="drawer-actions">
              <button className="primary-btn" onClick={() => s.openFeynman(s.source!)}>
                <PenLine size={15} />
                用自己的话讲一遍
              </button>
              <button
                className="secondary-btn"
                onClick={() => {
                  s.setQuery(`请解释${s.source!.section}`);
                  s.setSource(null);
                  s.changeTab('ask');
                }}
              >
                围绕这一节提问
                <ArrowRight size={15} />
              </button>
            </div>
          </aside>
        </div>
      )}
      {s.deleteId && (
        <div className="modal-backdrop">
          <div
            className="modal confirm-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            ref={deleteRef}
          >
            <h2 id="delete-title">移除这份资料？</h2>
            <p>原文将从当前资料库移除。历史问答中的证据快照会保留，相关任务可以手动完成。</p>
            <div className="button-row">
              <button className="secondary-btn" onClick={() => s.setDeleteId(null)}>
                保留资料
              </button>
              <button
                className="danger-btn"
                onClick={() => {
                  s.setWorkspace(w => ({ ...w, documents: w.documents.filter(d => d.id !== s.deleteId) }));
                  s.setSelectedIds(null);
                  s.setDeleteId(null);
                }}
              >
                确认移除
              </button>
            </div>
          </div>
        </div>
      )}
      {s.notice && (
        <div className="toast" role="status">
          <CircleHelp size={18} />
          <span>{s.notice}</span>
          <button onClick={() => s.setNotice('')} aria-label="关闭提示">
            <X size={15} />
          </button>
        </div>
      )}
    </>
  );
}
