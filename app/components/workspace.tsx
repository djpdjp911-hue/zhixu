'use client';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type {
  Chunk,
  Evidence,
  FeynmanFeedback,
  ModelStatus,
  QuizQuestion,
  ReviewTask,
  StudyAnswer,
  StudyDocument,
  TraceStep,
  Workspace,
} from '@/lib/types';
import { initialWorkspace } from '@/lib/samples';
import { chunkDocuments } from '@/lib/retrieval';
import { applyExplainBack, localFeynman, makeQuiz, pickQuizChunks, reviewTasks, topicStats } from '@/lib/learning';
import { loadWorkspace, parseBackup, readAiPreference, saveWorkspace, writeAiPreference } from '@/lib/storage';
import { downloadFile, ingestFile } from '@/lib/ingest';

export type Tab = 'home' | 'library' | 'ask' | 'graph' | 'quiz' | 'plan';
export type Modal = 'upload' | 'search' | 'settings' | 'help' | 'feynman' | null;
export type QuizMeta = { origin: 'model' | 'rules'; generated: number; filled: number; dropped: number };
export type FeynmanTarget = { section: string; documentId: string; page: number; title: string; sources: Chunk[] };
export type FeynmanResult = { feedback: FeynmanFeedback; safety: string[]; next?: ReviewTask };
type Topic = { section: string; documentId: string; page: number };
const uid = () => crypto.randomUUID();

async function readError(response: Response, fallback: string) {
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  return data.error ?? fallback;
}

function useWorkspaceState() {
  const [tab, setTab] = useState<Tab>('home');
  const [workspace, setWorkspace] = useState<Workspace>(initialWorkspace);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<ModelStatus>({
    configured: false,
    provider: '',
    model: '',
    vision: false,
    embeddings: false,
  });
  const [useModel, setUseModel] = useState(false);
  const [consent, setConsent] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[] | null>(null);
  const [activeAnswer, setActiveAnswer] = useState<StudyAnswer | null>(null);
  const [source, setSource] = useState<Chunk | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('');
  const [liveTrace, setLiveTrace] = useState<TraceStep[]>([]);
  const [liveEvidence, setLiveEvidence] = useState<Evidence[]>([]);
  const [streamText, setStreamText] = useState('');
  const [thinking, setThinking] = useState('');
  const [pendingQuestion, setPendingQuestion] = useState('');
  const [liveModel, setLiveModel] = useState(false);
  const [failure, setFailure] = useState<{ question: string; message: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [quiz, setQuiz] = useState<QuizQuestion[]>([]);
  const [quizMeta, setQuizMeta] = useState<QuizMeta | null>(null);
  const [quizBusy, setQuizBusy] = useState(false);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [feynman, setFeynman] = useState<FeynmanTarget | null>(null);
  const [explanation, setExplanation] = useState('');
  const [feynmanBusy, setFeynmanBusy] = useState(false);
  const [feynmanResult, setFeynmanResult] = useState<FeynmanResult | null>(null);
  const [imageDraft, setImageDraft] = useState<{ text: string; title: string } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const live = useRef({ text: '', thinking: '' });
  const frame = useRef(0);
  const uploadRef = useRef<HTMLInputElement>(null);
  const backupRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const chunks = useMemo(() => chunkDocuments(workspace.documents), [workspace.documents]);
  const selectedDocs = useMemo(
    () => (selectedIds ? workspace.documents.filter(d => selectedIds.includes(d.id)) : workspace.documents),
    [selectedIds, workspace.documents],
  );
  const selectedChunks = useMemo(() => chunkDocuments(selectedDocs), [selectedDocs]);
  const stats = useMemo(() => topicStats(workspace.attempts), [workspace.attempts]);
  const pending = workspace.tasks.filter(t => !t.done);
  const aiReady = useModel && consent && status.configured;
  // A model answer on screen makes the next question a follow-up in the same thread.
  const thread = useMemo(() => {
    const a = activeAnswer;
    if (!a || a.mode !== 'model' || a.refused) return null;
    const id = a.threadId ?? a.id;
    const turns = workspace.answers.filter(x => x.mode === 'model' && (x.threadId ?? x.id) === id).reverse();
    return { id, turns: turns.length ? turns : [a] };
  }, [activeAnswer, workspace.answers]);
  useEffect(() => {
    loadWorkspace()
      .then(saved => {
        if (saved) setWorkspace(saved);
      })
      .catch(() => setNotice('浏览器存储不可用。请及时导出备份，避免丢失学习进度。'))
      .finally(() => setReady(true));
    const aiChosen = readAiPreference();
    fetch('/api/status')
      .then(r => r.json() as Promise<ModelStatus>)
      .then(next => {
        setStatus(next);
        if (next.configured && aiChosen) {
          setConsent(true);
          setUseModel(true);
        }
      })
      .catch(() => {});
    return () => {
      controller.current?.abort();
      cancelAnimationFrame(frame.current);
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      saveWorkspace(workspace).catch(() => setNotice('本地保存失败，请导出备份后再关闭页面。'));
    }, 300);
    return () => clearTimeout(timer);
  }, [workspace, ready]);
  useEffect(() => {
    // Until the server reports a model, the defaults would overwrite the saved choice.
    if (status.configured) writeAiPreference(useModel && consent);
  }, [useModel, consent, status.configured]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 6500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setModal('search');
      }
      if (event.key === 'Escape') {
        setModal(null);
        setSource(null);
        setDeleteId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const changeTab = (next: Tab) => {
    setTab(next);
    setFilter('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const addDocs = (docs: StudyDocument[]) => {
    if (workspace.documents.length + docs.length > 40) {
      setNotice('最多保存 40 份资料，请先移除不需要的资料。');
      return false;
    }
    setWorkspace(w => ({ ...w, documents: [...w.documents, ...docs] }));
    setSelectedIds(null);
    setModal(null);
    setNotice(`已导入 ${docs.length} 份资料，原文保存在当前浏览器。`);
    return true;
  };
  async function uploadFiles(files: FileList | File[] | null) {
    if (!files?.length) return;
    if (workspace.documents.length + files.length > 40) {
      setNotice('最多保存 40 份资料，请先移除不需要的资料。');
      return;
    }
    setUploading(true);
    try {
      const docs: StudyDocument[] = [];
      for (const file of Array.from(files)) docs.push(await ingestFile(file));
      addDocs(docs);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : '导入失败，请检查文件。');
    } finally {
      setUploading(false);
      if (uploadRef.current) uploadRef.current.value = '';
    }
  }
  /** Token deltas arrive faster than the screen refreshes; render at most once per frame. */
  function flushLive() {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      setStreamText(live.current.text);
      setThinking(live.current.thinking);
    });
  }
  async function ask(question = query, options: { local?: boolean } = {}) {
    const clean = question.trim();
    if (busy) return;
    if (clean.length < 2) {
      setNotice('请输入至少两个字符的问题。');
      return;
    }
    if (!selectedDocs.length) {
      setNotice('请先导入或选择至少一份资料。');
      return;
    }
    const model = useModel && !options.local;
    if (model && !consent) {
      setModal('settings');
      setNotice('使用云端模型前，请确认资料发送选项。');
      return;
    }
    const followUp = model ? thread : null;
    const upTo = followUp ? followUp.turns.findIndex(t => t.id === activeAnswer?.id) : -1;
    const history = followUp
      ? followUp.turns
          .slice(0, upTo >= 0 ? upTo + 1 : undefined)
          .slice(-3)
          .map(t => ({ question: t.question, answer: t.text.slice(0, 6000) }))
      : [];
    changeTab('ask');
    setQuery(clean);
    setPendingQuestion(clean);
    setLiveModel(model);
    setBusy(true);
    setFailure(null);
    setActiveAnswer(null);
    setLiveTrace([]);
    setLiveEvidence([]);
    live.current = { text: '', thinking: '' };
    setStreamText('');
    setThinking('');
    setPhase('准备检索资料');
    const abort = new AbortController();
    controller.current = abort;
    let completed = false;
    try {
      const response = await fetch('/api/study', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: clean,
          documents: selectedDocs,
          useModel: model,
          ...(model ? { threadId: followUp?.id ?? uid(), history } : {}),
        }),
        signal: abort.signal,
      });
      if (!response.ok) throw new Error(await readError(response, '请求失败'));
      if (!response.body) throw new Error('浏览器未提供响应流');
      const reader = response.body.getReader(),
        decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';
        for (const event of events) {
          if (!event.startsWith('data: ')) continue;
          const data = JSON.parse(event.slice(6));
          if (data.type === 'trace' && data.step) setLiveTrace(t => [...t, data.step]);
          else if (data.type === 'phase') setPhase(data.label);
          else if (data.type === 'evidence') setLiveEvidence(data.evidence);
          else if (data.type === 'delta') {
            live.current.text += data.text;
            flushLive();
          } else if (data.type === 'reset') {
            live.current.text = '';
            flushLive();
          } else if (data.type === 'thinking') {
            live.current.thinking = (live.current.thinking + data.text).slice(-6000);
            flushLive();
          } else if (data.type === 'error') throw new Error(data.message);
          else if (data.type === 'answer') {
            completed = true;
            setActiveAnswer(data.answer);
            setWorkspace(w => ({ ...w, answers: [data.answer, ...w.answers].slice(0, 100) }));
            setQuery('');
          }
        }
      }
      if (!completed) throw new Error('连接结束但未返回完整结果，请重试。');
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') setNotice('已停止生成，本次结果未保存。');
      else setFailure({ question: clean, message: e instanceof Error ? e.message : '请求失败' });
    } finally {
      setBusy(false);
      controller.current = null;
    }
  }
  /** Sections the learner got wrong or still has to review come first. */
  function weakSections() {
    return [
      ...new Set([...pending.map(t => t.section), ...stats.filter(t => t.accuracy < 70).map(t => t.section)]),
    ].slice(0, 10);
  }
  function resetQuiz(questions: QuizQuestion[], meta: QuizMeta) {
    setQuiz(questions);
    setQuizMeta(meta);
    setAnswers({});
    setSubmitted(false);
  }
  async function startQuiz() {
    if (quizBusy) return;
    const focus = weakSections();
    const local = () => makeQuiz(pickQuizChunks(selectedChunks, focus, 40), 5);
    changeTab('quiz');
    if (!aiReady) {
      const next = local();
      if (!next.length) {
        setNotice('至少需要 4 个不同主题的资料片段才能生成练习，请补充资料。');
        return;
      }
      resetQuiz(next, { origin: 'rules', generated: 0, filled: next.length, dropped: 0 });
      return;
    }
    setQuizBusy(true);
    setQuiz([]);
    try {
      const response = await fetch('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documents: selectedDocs, focus, count: 5 }),
      });
      if (!response.ok) throw new Error(await readError(response, 'AI 出题失败'));
      const data = (await response.json()) as {
        questions: QuizQuestion[];
        generated: number;
        filled: number;
        dropped: number;
      };
      if (!data.questions.length) throw new Error('没有生成可用的题目');
      resetQuiz(data.questions, { origin: 'model', generated: data.generated, filled: data.filled, dropped: data.dropped });
    } catch (e) {
      const next = local();
      setNotice(`${e instanceof Error ? e.message : 'AI 出题失败'}${next.length ? ' 已改用规则练习。' : ''}`);
      if (next.length) resetQuiz(next, { origin: 'rules', generated: 0, filled: next.length, dropped: 0 });
    } finally {
      setQuizBusy(false);
    }
  }
  function submitQuiz() {
    if (Object.keys(answers).length !== quiz.length) {
      setNotice('请完成全部题目后再提交。');
      return;
    }
    const attempts = quiz.map(q => ({
      id: uid(),
      questionId: q.id,
      section: q.section,
      correct: answers[q.id] === q.correct,
      selected: answers[q.id],
      at: new Date().toISOString(),
      evidence: q.evidence,
    }));
    setWorkspace(w => ({
      ...w,
      attempts: [...w.attempts, ...attempts].slice(-2000),
      tasks: reviewTasks(attempts, w.tasks).slice(-1000),
    }));
    setSubmitted(true);
  }
  function openFeynman(topic: Topic) {
    const same = chunks.filter(c => c.documentId === topic.documentId && c.section === topic.section);
    const sources = same.length ? same : chunks.filter(c => c.documentId === topic.documentId && c.page === topic.page);
    if (!sources.length) {
      setNotice('原始资料已移除，请重新导入后再复述。');
      return;
    }
    setFeynman({ ...topic, title: sources[0].title, sources: sources.slice(0, 4) });
    setExplanation('');
    setFeynmanResult(null);
    setSource(null);
    setModal('feynman');
  }
  async function evaluateExplanation(target: FeynmanTarget, text: string) {
    if (!aiReady) return { feedback: localFeynman(text, target.sources), safety: [] };
    try {
      const response = await fetch('/api/feynman', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section: target.section, explanation: text, sources: target.sources }),
      });
      if (!response.ok) throw new Error(await readError(response, 'AI 评估失败'));
      return (await response.json()) as { feedback: FeynmanFeedback; safety: string[] };
    } catch (e) {
      setNotice(`${e instanceof Error ? e.message : 'AI 评估失败'} 已改用规则估算。`);
      return { feedback: localFeynman(text, target.sources), safety: [] };
    }
  }
  async function submitFeynman() {
    if (!feynman || feynmanBusy) return;
    const text = explanation.trim();
    if (text.length < 15) {
      setNotice('请至少用 15 个字解释这个知识点。');
      return;
    }
    setFeynmanBusy(true);
    try {
      const { feedback, safety } = await evaluateExplanation(feynman, text);
      const tasks = applyExplainBack(workspace.tasks, feynman, feedback.score).slice(-1000);
      setWorkspace(w => ({ ...w, tasks }));
      setFeynmanResult({ feedback, safety, next: tasks.filter(t => t.section === feynman.section && !t.done).at(-1) });
    } finally {
      setFeynmanBusy(false);
    }
  }
  function showDoc(doc: StudyDocument) {
    const chunk = chunks.find(c => c.documentId === doc.id);
    setSource(
      chunk ?? {
        id: doc.id,
        documentId: doc.id,
        title: doc.title,
        section: doc.title,
        page: 1,
        text: doc.pages[0].text,
        start: 0,
        end: doc.pages[0].text.length,
      },
    );
  }
  function speak(text: string) {
    if (!('speechSynthesis' in window)) {
      setNotice('当前浏览器不支持语音朗读。');
      return;
    }
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replace(/[#*\[\]`]/g, ''));
    utterance.lang = 'zh-CN';
    speechSynthesis.speak(utterance);
  }
  function dictate(onText: (text: string) => void = setQuery) {
    type Recognizer = {
      lang: string;
      onresult: (event: { results: { [n: number]: { [n: number]: { transcript: string } } } }) => void;
      onerror: () => void;
      start: () => void;
    };
    const browser = window as unknown as {
      SpeechRecognition?: new () => Recognizer;
      webkitSpeechRecognition?: new () => Recognizer;
    };
    const Recognition = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!Recognition) {
      setNotice('当前浏览器不支持语音输入，请使用键盘输入。');
      return;
    }
    const recognition = new Recognition();
    recognition.lang = 'zh-CN';
    recognition.onresult = e => onText(e.results[0][0].transcript);
    recognition.onerror = () => setNotice('语音输入不可用，请检查麦克风权限。');
    recognition.start();
  }
  async function recognizeImage(file?: File) {
    if (!file) return;
    if (!status.configured || !consent) {
      setModal('settings');
      setNotice('图片识别需要配置模型，并确认将图片发送到模型服务。');
      return;
    }
    if (!status.vision) {
      setNotice('当前模型服务未配置视觉模型（LLM_VISION_MODEL），暂不能识别图片。');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setNotice('请选择 2MB 以内的 PNG、JPEG 或 WebP 图片。');
      return;
    }
    setUploading(true);
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(',')[1]);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const response = await fetch('/api/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, mimeType: file.type }),
      });
      if (!response.ok) throw new Error(await readError(response, '图片识别失败'));
      const result = (await response.json()) as { text: string };
      setImageDraft({ text: result.text, title: file.name });
      setModal('upload');
    } catch (e) {
      setNotice(e instanceof Error ? e.message : '图片识别失败');
    } finally {
      setUploading(false);
      if (imageRef.current) imageRef.current.value = '';
    }
  }
  function exportBackup() {
    downloadFile('知序-学习备份.json', JSON.stringify(workspace, null, 2), 'application/json');
  }
  async function restore(file?: File) {
    if (!file) return;
    try {
      if (file.size > 12 * 1024 * 1024) throw new Error();
      const data = parseBackup(JSON.parse(await file.text()));
      setWorkspace(data);
      setSelectedIds(null);
      setActiveAnswer(null);
      setQuiz([]);
      setNotice('已恢复备份，当前学习空间已替换。');
      setModal(null);
    } catch {
      setNotice('备份文件无效或过大，当前资料未更改。');
    }
    if (backupRef.current) backupRef.current.value = '';
  }
  return {
    tab,
    workspace,
    setWorkspace,
    ready,
    status,
    useModel,
    setUseModel,
    consent,
    setConsent,
    aiReady,
    modal,
    setModal,
    notice,
    setNotice,
    query,
    setQuery,
    filter,
    setFilter,
    selectedIds,
    setSelectedIds,
    activeAnswer,
    setActiveAnswer,
    thread,
    source,
    setSource,
    busy,
    phase,
    liveTrace,
    liveEvidence,
    streamText,
    thinking,
    pendingQuestion,
    liveModel,
    failure,
    setFailure,
    uploading,
    quiz,
    quizMeta,
    quizBusy,
    answers,
    setAnswers,
    submitted,
    feynman,
    explanation,
    setExplanation,
    feynmanBusy,
    feynmanResult,
    setFeynmanResult,
    imageDraft,
    setImageDraft,
    deleteId,
    setDeleteId,
    controller,
    uploadRef,
    backupRef,
    imageRef,
    chunks,
    selectedDocs,
    stats,
    pending,
    changeTab,
    addDocs,
    uploadFiles,
    ask,
    startQuiz,
    submitQuiz,
    openFeynman,
    submitFeynman,
    showDoc,
    speak,
    dictate,
    recognizeImage,
    exportBackup,
    restore,
  };
}
type Context = ReturnType<typeof useWorkspaceState>;
const WorkspaceContext = createContext<Context | null>(null);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const state = useWorkspaceState();
  return <WorkspaceContext.Provider value={state}>{children}</WorkspaceContext.Provider>;
}
export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('WorkspaceProvider required');
  return value;
}
