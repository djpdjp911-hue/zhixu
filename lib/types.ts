export type SourcePage = { page: number; text: string };
export type StudyDocument = {
  id: string; title: string; kind: 'PDF' | 'Markdown' | 'Text' | 'Image';
  pages: SourcePage[]; createdAt: string; sample?: boolean;
};
export type Chunk = {
  id: string; documentId: string; title: string; section: string;
  page: number; text: string; start: number; end: number;
};
export type Evidence = Chunk & { score: number; rank: number };
export type TraceStep = { tool: string; label: string; detail: string; ms: number };
export type StudyAnswer = {
  id: string; question: string; text: string; evidence: Evidence[];
  mode: 'extractive' | 'gemini'; refused: boolean; trace: TraceStep[];
  createdAt: string; elapsedMs: number; retrieval: 'bm25' | 'hybrid';
  citationWarnings?: string[];
};
export type QuizQuestion = {
  id: string; section: string; prompt: string; options: string[];
  correct: number; explanation: string; evidence: Chunk;
};
export type Attempt = {
  id: string; questionId: string; section: string; correct: boolean;
  selected: number; at: string; evidence: Chunk;
};
export type ReviewTask = {
  id: string; title: string; section: string; due: string; minutes: number;
  documentId: string; page: number; done: boolean;
};
export type Workspace = {
  version: 1; documents: StudyDocument[]; answers: StudyAnswer[];
  attempts: Attempt[]; tasks: ReviewTask[];
};
