export type SourcePage = { page: number; text: string };
export type StudyDocument = {
  id: string;
  title: string;
  kind: 'PDF' | 'Markdown' | 'Text' | 'Image';
  pages: SourcePage[];
  createdAt: string;
  sample?: boolean;
};
export type Chunk = {
  id: string;
  documentId: string;
  title: string;
  section: string;
  page: number;
  text: string;
  start: number;
  end: number;
};
export type Evidence = Chunk & { score: number; rank: number };
export type TraceStep = { tool: string; label: string; detail: string; ms: number };
export type GroundingStatus = 'supported' | 'weak' | 'uncited' | 'supplement';
export type GroundingSentence = {
  text: string;
  citations: number[];
  support: number;
  status: GroundingStatus;
  /** Another evidence item that supports the sentence better than the cited one. */
  suggested?: number;
};
export type GroundingReport = {
  checked: number;
  supported: number;
  weak: number;
  uncited: number;
  supplement: number;
  sentences: GroundingSentence[];
};
export type StudyAnswer = {
  id: string;
  question: string;
  text: string;
  evidence: Evidence[];
  mode: 'extractive' | 'model';
  /** Provider and model label shown to the learner, e.g. "智谱 GLM · glm-4.7-flash". */
  model?: string;
  refused: boolean;
  trace: TraceStep[];
  createdAt: string;
  elapsedMs: number;
  retrieval: 'bm25' | 'hybrid';
  citationWarnings?: string[];
  threadId?: string;
  grounding?: GroundingReport;
  safety?: string[];
};
export type QuizQuestion = {
  id: string;
  section: string;
  prompt: string;
  options: string[];
  correct: number;
  explanation: string;
  evidence: Chunk;
  origin?: 'rules' | 'model';
  skill?: string;
  /** Verbatim sentence from the evidence that supports the answer. */
  quote?: string;
};
export type Attempt = {
  id: string;
  questionId: string;
  section: string;
  correct: boolean;
  selected: number;
  at: string;
  evidence: Chunk;
};
export type ReviewTask = {
  id: string;
  title: string;
  section: string;
  due: string;
  minutes: number;
  documentId: string;
  page: number;
  done: boolean;
  /** Index into REVIEW_INTERVALS; grows after successful explain-back reviews. */
  stage?: number;
  lastScore?: number;
};
export type FeedbackPoint = { point: string; quote?: string; chunkId?: string };
export type FeynmanFeedback = {
  origin: 'model' | 'rules';
  score: number;
  verdict: string;
  summary: string;
  covered: FeedbackPoint[];
  missing: FeedbackPoint[];
  misconceptions: { claim: string; correction: string; quote?: string; chunkId?: string }[];
  followUp?: string;
};
export type ModelStatus = {
  configured: boolean;
  provider: string;
  model: string;
  vision: boolean;
  embeddings: boolean;
};
export type Workspace = {
  version: 1;
  documents: StudyDocument[];
  answers: StudyAnswer[];
  attempts: Attempt[];
  tasks: ReviewTask[];
};
