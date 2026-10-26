'use client';
import {
  ChevronRight,
  CircleHelp,
  FolderOpen,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  MessageSquareText,
  Network,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  ArrowRight,
} from 'lucide-react';
import { WorkspaceProvider, useWorkspace } from './components/workspace';
import { Logo } from './components/primitives';
import { Dashboard } from './components/dashboard';
import { Diagnosis, Graph, Library, Plan } from './components/learning-views';
import { Questions } from './components/question-view';
import { Overlays } from './components/overlays';
const nav = [
  { id: 'home', name: '学习工作台', icon: LayoutDashboard },
  { id: 'library', name: '我的资料', icon: FolderOpen },
  { id: 'ask', name: '证据问答', icon: MessageSquareText },
  { id: 'graph', name: '知识脉络', icon: Network },
  { id: 'quiz', name: '学习诊断', icon: ListChecks },
  { id: 'plan', name: '复习计划', icon: Target },
] as const;
export default function Page() {
  return (
    <WorkspaceProvider>
      <App />
    </WorkspaceProvider>
  );
}
function App() {
  const s = useWorkspace();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="logo-button" onClick={() => s.changeTab('home')} aria-label="返回学习工作台">
          <Logo />
        </button>
        <div className="workspace-switch">
          <span className="space-icon">
            <GraduationCap size={20} />
          </span>
          <span>
            <strong>我的学习空间</strong>
            <small>让每一次学习，都有迹可循</small>
          </span>
        </div>
        <span className="nav-caption">学习空间</span>
        <nav aria-label="主要导航">
          {nav.map(item => (
            <button
              key={item.id}
              className={'nav-item ' + (s.tab === item.id ? 'active' : '')}
              onClick={() => s.changeTab(item.id)}
              aria-current={s.tab === item.id ? 'page' : undefined}
            >
              <item.icon size={18} />
              <span>{item.name}</span>
              {item.id === 'library' && <small>{s.workspace.documents.length}</small>}
              {item.id === 'plan' && s.pending.length > 0 && <small>{s.pending.length}</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="note-spark">
            <Sparkles size={17} />
          </span>
          <strong>知识有出处，理解有路径。</strong>
          <p>
            少一点信息堆积，
            <br />
            多一点真正理解。
          </p>
          <button onClick={() => s.setModal('help')}>
            认识知序
            <ArrowRight size={14} />
          </button>
        </div>
        <div className="sidebar-bottom">
          <button onClick={() => s.setModal('help')}>
            <CircleHelp size={17} />
            使用指南
          </button>
          <button onClick={() => s.setModal('settings')}>
            <Settings2 size={17} />
            偏好设置
          </button>
          <div className="local-indicator">
            <span className="tiny-dot" />
            个人资料 · 本机存储
            <ShieldCheck size={13} />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <span className="mobile-brand">知序</span>
            <span>我的学习空间</span>
            <ChevronRight size={13} />
            <strong>{nav.find(n => n.id === s.tab)?.name}</strong>
          </div>
          <div className="top-actions">
            <button className="search-button" onClick={() => s.setModal('search')}>
              <Search size={15} />
              <span>搜索资料与知识</span>
              <kbd>Ctrl K</kbd>
            </button>
            <span className="top-separator" />
            <button className="user-avatar" onClick={() => s.setModal('settings')} aria-label="个人空间设置">
              研
            </button>
          </div>
        </header>
        <main className="main-content">
          {s.tab === 'home' ? (
            <Dashboard />
          ) : s.tab === 'library' ? (
            <Library />
          ) : s.tab === 'ask' ? (
            <Questions />
          ) : s.tab === 'graph' ? (
            <Graph />
          ) : s.tab === 'quiz' ? (
            <Diagnosis />
          ) : (
            <Plan />
          )}
        </main>
      </div>
      <Overlays />
    </div>
  );
}
