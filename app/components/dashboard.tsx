'use client';
import {
  ArrowRight,
  CheckCheck,
  ChevronRight,
  FolderOpen,
  Layers3,
  MessageSquareText,
  Plus,
  ShieldCheck,
  Sparkles,
  Target,
} from 'lucide-react';
import { useWorkspace } from './workspace';
import { DocCard, Empty, Heading, LearningArt, QuestionBox, shortDate, suggestions, Tag } from './primitives';
export function Dashboard() {
  const s = useWorkspace(),
    w = s.workspace;
  return (
    <>
      <Heading
        eyebrow="YOUR LEARNING, CONNECTED"
        title="学习，从一个好问题开始。"
        description="把散落的资料，连成属于你的知识脉络。"
        action={
          <button className="primary-btn" onClick={() => s.setModal('upload')}>
            <Plus size={17} />
            导入学习资料
          </button>
        }
      />
      <div className="dashboard-grid">
        <div className="dashboard-main">
          <section className="welcome-card">
            <div className="welcome-copy">
              <Tag tone="green">
                <span className="tiny-dot" />
                你的专属学习工作台
              </Tag>
              <h2>
                读过的知识，
                <br />
                也能成为掌握的知识。
              </h2>
              <p>
                带着问题探索，在证据中理解。
                <br />
                让每一份资料，都成为下一步的起点。
              </p>
              <button className="text-link" onClick={() => s.changeTab('graph')}>
                探索我的知识脉络
                <ArrowRight size={15} />
              </button>
            </div>
            <LearningArt />
          </section>
          <section className="ask-starter">
            <div className="section-title">
              <h2>
                <Sparkles size={18} />
                向资料提问
              </h2>
              <Tag>有据可循</Tag>
            </div>
            <QuestionBox large />
            <div className="suggestion-row">
              <span>试着问问</span>
              {suggestions.slice(1).map(q => (
                <button key={q} onClick={() => void s.ask(q)}>
                  {q}
                  <ArrowRight size={12} />
                </button>
              ))}
            </div>
          </section>
          <section className="materials-section">
            <div className="section-title">
              <h2>
                我的资料<span className="count-pill">{w.documents.length}</span>
              </h2>
              <button className="text-link muted" onClick={() => s.changeTab('library')}>
                查看全部
                <ArrowRight size={14} />
              </button>
            </div>
            {w.documents.length ? (
              <div className="doc-grid">
                {w.documents.slice(0, 3).map((doc, i) => (
                  <DocCard key={doc.id} doc={doc} index={i} />
                ))}
              </div>
            ) : (
              <Empty
                icon={<FolderOpen />}
                title="给知识一个开始"
                text="导入你的第一份课程资料，再从问题出发。"
                action={
                  <button className="secondary-btn" onClick={() => s.setModal('upload')}>
                    导入资料
                  </button>
                }
              />
            )}
          </section>
          <section className="recent-section">
            <div className="section-title">
              <h2>最近的探索</h2>
              <button className="text-link muted" onClick={() => s.changeTab('ask')}>
                全部记录
                <ArrowRight size={14} />
              </button>
            </div>
            {w.answers.length ? (
              w.answers.slice(0, 3).map(a => (
                <button
                  className="recent-row"
                  key={a.id}
                  onClick={() => {
                    s.setActiveAnswer(a);
                    s.changeTab('ask');
                  }}
                >
                  <span className="recent-icon">
                    <MessageSquareText size={16} />
                  </span>
                  <span>
                    <strong>{a.question}</strong>
                    <small>
                      {a.evidence.length} 处资料证据 · {a.mode === 'extractive' ? '原文检索' : 'AI 回答'}
                    </small>
                  </span>
                  <time>{shortDate(a.createdAt)}</time>
                  <ChevronRight size={15} />
                </button>
              ))
            ) : (
              <div className="quiet-empty">
                <MessageSquareText size={20} />
                <span>第一个问题，就是探索的起点。</span>
              </div>
            )}
          </section>
        </div>
        <aside className="dashboard-rail">
          <section className="overview-card">
            <div className="section-title">
              <h2>学习足迹</h2>
              <span className="leaf-mark">↗</span>
            </div>
            <div className="stats-pair">
              <div>
                <strong>
                  {w.answers.length}
                  <small>次</small>
                </strong>
                <span>有据探索</span>
              </div>
              <div>
                <strong>
                  {w.attempts.length}
                  <small>题</small>
                </strong>
                <span>完成练习</span>
              </div>
            </div>
            <div className="stats-divider" />
            <div className="mini-stat">
              <span>
                <Layers3 size={15} />
                已连接的知识片段
              </span>
              <strong>{s.chunks.length}</strong>
            </div>
            <div className="mini-stat">
              <span>
                <CheckCheck size={15} />
                已完成复习任务
              </span>
              <strong>{w.tasks.filter(t => t.done).length}</strong>
            </div>
            <div className="insight-note">
              <ShieldCheck size={15} />
              <span>每一项记录，都来自真实学习。</span>
            </div>
          </section>
          <section className="review-card">
            <div className="section-title">
              <h2>
                <Target size={17} />
                下一步，学什么？
              </h2>
            </div>
            {s.pending.length ? (
              <>
                <span className="rail-kicker">根据错题安排</span>
                {s.pending.slice(0, 2).map(t => (
                  <button key={t.id} className="rail-task" onClick={() => s.changeTab('plan')}>
                    <span className="task-square" />
                    <span>
                      {t.title}
                      <small>
                        {t.minutes} 分钟 · {shortDate(t.due)}
                      </small>
                    </span>
                  </button>
                ))}
                <button className="rail-action" onClick={() => s.changeTab('plan')}>
                  查看复习计划
                  <ArrowRight size={14} />
                </button>
              </>
            ) : (
              <>
                <div className="review-orbit">
                  <Target size={32} strokeWidth={1.2} />
                  <span />
                  <span />
                </div>
                <h3>先发现你的薄弱点</h3>
                <p>
                  做一组资料诊断练习，
                  <br />
                  找到值得再看一遍的知识。
                </p>
                <button className="secondary-btn full" onClick={s.startQuiz}>
                  开始学习诊断
                  <ArrowRight size={15} />
                </button>
              </>
            )}
          </section>
          <section className="thought-card">
            <span className="quote-mark">“</span>
            <p>
              学习的目的，
              <br />
              是让知识发生连接。
            </p>
            <span>从一份资料，到自己的理解。</span>
            <div className="thought-line" />
          </section>
        </aside>
      </div>
      <footer className="page-footer">
        <span>知序 ZHIXU</span>让知识有据可循，让学习循序向前。
        <span>
          <ShieldCheck size={13} />
          资料由你掌控
        </span>
      </footer>
    </>
  );
}
