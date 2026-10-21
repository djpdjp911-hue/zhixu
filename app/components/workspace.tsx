'use client';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Chunk, QuizQuestion, StudyAnswer, StudyDocument, TraceStep, Workspace } from '@/lib/types';
import { initialWorkspace } from '@/lib/samples';
import { chunkDocuments } from '@/lib/retrieval';
import { makeQuiz, reviewTasks, topicStats } from '@/lib/learning';
import { loadWorkspace, parseBackup, saveWorkspace } from '@/lib/storage';
import { downloadFile, ingestFile } from '@/lib/ingest';

export type Tab = 'home' | 'library' | 'ask' | 'graph' | 'quiz' | 'plan';
export type Modal = 'upload' | 'search' | 'settings' | 'help' | null;
const uid = () => crypto.randomUUID();
function useWorkspaceState() {
  const [tab, setTab] = useState<Tab>('home');
  const [workspace, setWorkspace] = useState<Workspace>(initialWorkspace);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState({ configured: false, embeddings: false });
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
  const [uploading, setUploading] = useState(false);
  const [quiz, setQuiz] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [imageDraft, setImageDraft] = useState<{ text: string; title: string } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const backupRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const chunks = useMemo(() => chunkDocuments(workspace.documents), [workspace.documents]);
  const selectedDocs = useMemo(() => selectedIds ? workspace.documents.filter(d => selectedIds.includes(d.id)) : workspace.documents, [selectedIds, workspace.documents]);
  const selectedChunks = useMemo(() => chunkDocuments(selectedDocs), [selectedDocs]);
  const stats = useMemo(() => topicStats(workspace.attempts), [workspace.attempts]);
  const pending = workspace.tasks.filter(t => !t.done);
  useEffect(() => {
    loadWorkspace().then(saved => { if (saved) setWorkspace(saved); }).catch(() => setNotice('浏览器存储不可用。请及时导出备份，避免丢失学习进度。')).finally(() => setReady(true));
    fetch('/api/status').then(r => r.json() as Promise<{configured:boolean;embeddings:boolean}>).then(setStatus).catch(() => {});
    return () => controller.current?.abort();
  }, []);
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => { saveWorkspace(workspace).catch(() => setNotice('本地保存失败，请导出备份后再关闭页面。')); }, 300);
    return () => clearTimeout(timer);
  }, [workspace, ready]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 6500); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setModal('search'); }
      if (event.key === 'Escape') { setModal(null); setSource(null); setDeleteId(null); }
    }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, []);
  const changeTab = (next: Tab) => { setTab(next); setFilter(''); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const addDocs = (docs: StudyDocument[]) => {
    if (workspace.documents.length + docs.length > 40) { setNotice('最多保存 40 份资料，请先移除不需要的资料。'); return false; }
    setWorkspace(w => ({ ...w, documents: [...w.documents, ...docs] }));
    setSelectedIds(null); setModal(null); setNotice(`已导入 ${docs.length} 份资料，原文保存在当前浏览器。`); return true;
  };
  async function uploadFiles(files: FileList | File[] | null) {
    if (!files?.length) return;
    if (workspace.documents.length + files.length > 40) { setNotice('最多保存 40 份资料，请先移除不需要的资料。'); return; }
    setUploading(true);
    try { const docs: StudyDocument[] = []; for (const file of Array.from(files)) docs.push(await ingestFile(file)); addDocs(docs); }
    catch (e) { setNotice(e instanceof Error ? e.message : '导入失败，请检查文件。'); }
    finally { setUploading(false); if (uploadRef.current) uploadRef.current.value = ''; }
  }
  async function ask(question = query) {
    const clean = question.trim();
    if (busy) return;
    if (clean.length < 2) { setNotice('请输入至少两个字符的问题。'); return; }
    if (!selectedDocs.length) { setNotice('请先导入或选择至少一份资料。'); return; }
    if (useModel && !consent) { setModal('settings'); setNotice('使用云端模型前，请确认资料发送选项。'); return; }
    changeTab('ask'); setQuery(clean); setBusy(true); setActiveAnswer(null); setLiveTrace([]); setPhase('准备检索资料');
    const abort = new AbortController(); controller.current = abort;
    let completed = false;
    try {
      const response = await fetch('/api/study', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: clean, documents: selectedDocs, useModel }), signal: abort.signal });
      if (!response.ok) { const data = await response.json() as {error?:string}; throw new Error(data.error ?? '请求失败'); }
      if (!response.body) throw new Error('浏览器未提供响应流');
      const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '';
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n'); buffer = events.pop() ?? '';
        for (const event of events) {
          if (!event.startsWith('data: ')) continue;
          const data = JSON.parse(event.slice(6));
          if (data.type === 'trace' && data.step) setLiveTrace(t => [...t, data.step]);
          if (data.type === 'phase') setPhase(data.label);
          if (data.type === 'error') throw new Error(data.message);
          if (data.type === 'answer') { completed = true; setActiveAnswer(data.answer); setWorkspace(w => ({ ...w, answers: [data.answer, ...w.answers].slice(0, 100) })); setQuery(''); }
        }
      }
      if (!completed) throw new Error('连接结束但未返回完整结果，请重试。');
    } catch (e) { if (e instanceof Error && e.name !== 'AbortError') setNotice(e.message); }
    finally { setBusy(false); controller.current = null; }
  }
  function startQuiz() {
    const next = makeQuiz([...selectedChunks.slice(workspace.attempts.length % Math.max(1, selectedChunks.length)), ...selectedChunks], 5);
    if (!next.length) { setNotice('至少需要 4 个不同主题的资料片段才能生成练习，请补充资料。'); return; }
    setQuiz(next); setAnswers({}); setSubmitted(false); changeTab('quiz');
  }
  function submitQuiz() {
    if (Object.keys(answers).length !== quiz.length) { setNotice('请完成全部题目后再提交。'); return; }
    const attempts = quiz.map(q => ({ id: uid(), questionId: q.id, section: q.section, correct: answers[q.id] === q.correct, selected: answers[q.id], at: new Date().toISOString(), evidence: q.evidence }));
    setWorkspace(w => ({ ...w, attempts: [...w.attempts, ...attempts].slice(-2000), tasks: reviewTasks(attempts, w.tasks).slice(-1000) })); setSubmitted(true);
  }
  function showDoc(doc: StudyDocument) {
    const chunk = chunks.find(c => c.documentId === doc.id);
    setSource(chunk ?? { id: doc.id, documentId: doc.id, title: doc.title, section: doc.title, page: 1, text: doc.pages[0].text, start: 0, end: doc.pages[0].text.length });
  }
  function speak(text: string) {
    if (!('speechSynthesis' in window)) { setNotice('当前浏览器不支持语音朗读。'); return; }
    speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text.replace(/[#*\[\]]/g, '')); utterance.lang = 'zh-CN'; speechSynthesis.speak(utterance);
  }
  function dictate() {
    type Recognizer = { lang: string; onresult: (event: { results: { [n: number]: { [n: number]: { transcript: string } } } }) => void; onerror: () => void; start: () => void };
    const browser = window as unknown as { SpeechRecognition?: new () => Recognizer; webkitSpeechRecognition?: new () => Recognizer };
    const Recognition = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!Recognition) { setNotice('当前浏览器不支持语音输入，请使用键盘输入。'); return; }
    const recognition = new Recognition(); recognition.lang = 'zh-CN';
    recognition.onresult = e => setQuery(e.results[0][0].transcript);
    recognition.onerror = () => setNotice('语音输入不可用，请检查麦克风权限。'); recognition.start();
  }
  async function recognizeImage(file?: File) {
    if (!file) return;
    if (!status.configured || !consent) { setModal('settings'); setNotice('图片识别需要配置模型，并确认将图片发送到 Gemini。'); return; }
    if (file.size > 2 * 1024 * 1024) { setNotice('请选择 2MB 以内的 PNG、JPEG 或 WebP 图片。'); return; }
    setUploading(true);
    try {
      const data = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1]); r.onerror = reject; r.readAsDataURL(file); });
      const response = await fetch('/api/image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data, mimeType: file.type }) });
      const result = await response.json() as {text:string;error?:string}; if (!response.ok) throw new Error(result.error);
      setImageDraft({ text: result.text, title: file.name }); setModal('upload');
    } catch (e) { setNotice(e instanceof Error ? e.message : '图片识别失败'); } finally { setUploading(false); if(imageRef.current)imageRef.current.value=''; }
  }
  function exportBackup() { downloadFile('知序-学习备份.json', JSON.stringify(workspace, null, 2), 'application/json'); }
  async function restore(file?: File) {
    if (!file) return;
    try {
      if (file.size > 12 * 1024 * 1024) throw new Error();
      const data = parseBackup(JSON.parse(await file.text())); setWorkspace(data); setSelectedIds(null); setActiveAnswer(null); setQuiz([]); setNotice('已恢复备份，当前学习空间已替换。'); setModal(null);
    } catch { setNotice('备份文件无效或过大，当前资料未更改。'); }
    if (backupRef.current) backupRef.current.value = '';
  }
  return { tab, workspace, setWorkspace, ready, status, useModel, setUseModel, consent, setConsent, modal, setModal, notice, setNotice, query, setQuery, filter, setFilter, selectedIds, setSelectedIds, activeAnswer, setActiveAnswer, source, setSource, busy, phase, liveTrace, uploading, quiz, answers, setAnswers, submitted, imageDraft, setImageDraft, deleteId, setDeleteId, controller, uploadRef, backupRef, imageRef, chunks, selectedDocs, stats, pending, changeTab, addDocs, uploadFiles, ask, startQuiz, submitQuiz, showDoc, speak, dictate, recognizeImage, exportBackup, restore };
}
type Context = ReturnType<typeof useWorkspaceState>;
const WorkspaceContext = createContext<Context | null>(null);
export function WorkspaceProvider({ children }: { children: ReactNode }) { const state=useWorkspaceState(); return <WorkspaceContext.Provider value={state}>{children}</WorkspaceContext.Provider>; }
export function useWorkspace() { const value=useContext(WorkspaceContext); if(!value)throw new Error('WorkspaceProvider required');return value; }
