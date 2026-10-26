import type { ModelStatus } from '../types';
import type { JsonSchema, ToolSpec } from '../tools.ts';

export type Provider = 'openai' | 'gemini';
export type LLMConfig = {
  provider: Provider;
  key?: string;
  model?: string;
  baseUrl: string;
  visionModel?: string;
  embeddingModel?: string;
  /** Vendor-specific thinking switch; only sent when explicitly configured. */
  thinking?: 'enabled' | 'disabled';
  label: string;
};
type Env = Record<string, string | undefined>;

const VENDORS: [RegExp, string][] = [
  [/bigmodel\.cn/, '智谱 GLM'],
  [/deepseek\.com/, 'DeepSeek'],
  [/dashscope/, '通义千问'],
  [/moonshot/, 'Kimi'],
  [/siliconflow/, '硅基流动'],
  [/volces\.com/, '火山方舟'],
  [/openai\.com/, 'OpenAI'],
  [/localhost|127\.0\.0\.1/, '本地模型'],
];
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export function llmConfig(env: Env = process.env): LLMConfig {
  const explicit = env.LLM_PROVIDER?.trim().toLowerCase();
  // The key decides the provider, so a copied template with a pre-filled LLM_MODEL still works for Gemini.
  const gemini = explicit === 'gemini' || (!explicit && !env.LLM_API_KEY && !!env.GEMINI_API_KEY);
  const thinking = env.LLM_THINKING === 'enabled' || env.LLM_THINKING === 'disabled' ? env.LLM_THINKING : undefined;
  if (gemini) {
    const model = env.GEMINI_MODEL || (explicit === 'gemini' ? env.LLM_MODEL : undefined);
    return {
      provider: 'gemini',
      key: env.GEMINI_API_KEY || env.LLM_API_KEY,
      model,
      baseUrl: GEMINI_BASE,
      visionModel: model,
      embeddingModel: env.GEMINI_EMBEDDING_MODEL || env.LLM_EMBEDDING_MODEL,
      label: 'Google Gemini',
    };
  }
  const baseUrl = (env.LLM_BASE_URL?.trim() || 'https://open.bigmodel.cn/api/paas/v4').replace(/\/+$/, '');
  return {
    provider: 'openai',
    key: env.LLM_API_KEY,
    model: env.LLM_MODEL,
    baseUrl,
    visionModel: env.LLM_VISION_MODEL,
    embeddingModel: env.LLM_EMBEDDING_MODEL,
    thinking,
    label: VENDORS.find(([pattern]) => pattern.test(baseUrl))?.[1] ?? 'OpenAI 兼容服务',
  };
}

function isLocal(url: string) {
  try {
    return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}
function safeBaseUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || (parsed.protocol === 'http:' && isLocal(url));
  } catch {
    return false;
  }
}
export function llmReady(config = llmConfig()) {
  if (!config.model || !safeBaseUrl(config.baseUrl)) return false;
  if (config.provider === 'gemini' && !/^(models\/)?[a-z0-9.-]+$/i.test(config.model)) return false;
  return Boolean(config.key) || (config.provider === 'openai' && isLocal(config.baseUrl));
}
export function modelLabel(config: LLMConfig) {
  return `${config.label} · ${config.model ?? '未配置'}`;
}
export function llmStatus(config = llmConfig()): ModelStatus {
  const configured = llmReady(config);
  return {
    configured,
    provider: config.label,
    model: configured ? (config.model ?? '') : '',
    vision: configured && Boolean(config.visionModel),
    embeddings: configured && Boolean(config.embeddingModel),
  };
}

export class LLMError extends Error {
  code: string;
  status: number;
  detail: string;
  constructor(code: string, status = 0, detail = '') {
    super(code);
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}
function httpError(status: number, detail: string) {
  const code =
    status === 429
      ? 'MODEL_RATE_LIMIT'
      : status === 401 || status === 403
        ? 'MODEL_AUTH'
        : status === 404
          ? 'MODEL_NOT_FOUND'
          : status === 400 || status === 422
            ? 'MODEL_BAD_REQUEST'
            : `MODEL_HTTP_${status}`;
  return new LLMError(code, status, detail.slice(0, 300));
}
const MESSAGES: Record<string, string> = {
  MODEL_NOT_CONFIGURED: '尚未配置模型服务。请在服务端配置 LLM_API_KEY 与 LLM_MODEL，或改用本地证据检索。',
  MODEL_RATE_LIMIT: '模型服务暂时限流或额度不足，请稍后重试，或切换为本地证据检索。',
  MODEL_AUTH: '模型服务拒绝访问：请检查密钥是否有效、项目是否受限、账户额度是否可用。',
  MODEL_NOT_FOUND: '找不到配置的模型或接口地址，请检查 LLM_BASE_URL 与 LLM_MODEL。',
  MODEL_BAD_REQUEST: '模型服务不接受本次请求，请确认模型 ID 与接口地址匹配，或缩小资料范围。',
  MODEL_TIMEOUT: '模型响应超时，请稍后重试或缩小资料范围。',
  MODEL_NETWORK: '无法连接模型服务，请检查网络或代理设置。',
  MODEL_EMPTY_RESPONSE: '模型没有返回有效内容，请重试。',
  MODEL_BAD_JSON: '模型返回的结构化结果无法解析，请重试。',
  MODEL_NO_VISION: '当前模型不支持图片输入，请在服务端配置 LLM_VISION_MODEL（如 glm-4.6v-flash）。',
  AGENT_STEP_LIMIT: '模型在限定步数内没有完成回答，请换一个更具体的问题。',
  IMAGE_NO_TEXT: '这张图片中没有识别到文字。请换一张清晰的资料截图，或直接导入 PDF、Markdown 或文本。',
};
export function errorMessage(error: unknown) {
  const code = error instanceof Error ? error.message : '';
  return MESSAGES[code] ?? '本次处理未完成。请检查模型配置与网络，或切换本地检索；未生成的结果不会保存。';
}

async function post(url: string, headers: Record<string, string>, body: unknown, signal?: AbortSignal, ms = 90000) {
  const timeout = AbortSignal.timeout(ms);
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    if (timeout.aborted) throw new LLMError('MODEL_TIMEOUT');
    throw new LLMError('MODEL_NETWORK');
  }
  if (!response.ok) throw httpError(response.status, await response.text().catch(() => ''));
  return response;
}

/** Yields the payload of each `data:` line of a server-sent event stream. */
export async function* readSSE(response: Response): AsyncGenerator<string> {
  if (!response.body) throw new LLMError('MODEL_EMPTY_RESPONSE');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split('\n');
    buffer = done ? '' : (lines.pop() ?? '');
    for (const line of lines) {
      const clean = line.replace(/\r$/, '');
      if (clean.startsWith('data:')) yield clean.slice(5).trim();
    }
    if (done) break;
  }
}

export function parseJSONLoose(text: string): unknown {
  const clean = text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  try {
    return JSON.parse(clean);
  } catch {
    const start = clean.indexOf('{'),
      end = clean.lastIndexOf('}');
    if (start >= 0 && end > start)
      try {
        return JSON.parse(clean.slice(start, end + 1));
      } catch {}
    throw new LLMError('MODEL_BAD_JSON');
  }
}

export type ToolCall = { id: string; name: string; args: Record<string, unknown>; rawId?: string };
export type ChatTurn = { role: 'user' | 'assistant'; content: string };
export type SessionInit = {
  system: string;
  history?: ChatTurn[];
  question: string;
  tools: ToolSpec[];
  temperature?: number;
  maxTokens?: number;
};
export type TurnOptions = {
  toolMode: 'required' | 'auto' | 'none';
  allowed?: string[];
  onText?: (delta: string) => void;
  onThinking?: (delta: string) => void;
  signal?: AbortSignal;
};
export type TurnResult = { text: string; calls: ToolCall[] };
export interface ChatSession {
  next(options: TurnOptions): Promise<TurnResult>;
  addToolResults(results: { call: ToolCall; result: unknown }[]): void;
  addUserNote(text: string): void;
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const value = JSON.parse(raw || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}
function vendorExtras(config: LLMConfig): Record<string, unknown> {
  if (!config.thinking) return {};
  if (/bigmodel\.cn|deepseek\.com/.test(config.baseUrl)) return { thinking: { type: config.thinking } };
  if (/dashscope/.test(config.baseUrl)) return { enable_thinking: config.thinking === 'enabled' };
  return {};
}
const bearer = (config: LLMConfig): Record<string, string> =>
  config.key ? { Authorization: `Bearer ${config.key}` } : {};

type OpenAIMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
  reasoning_content?: string;
};

class OpenAISession implements ChatSession {
  private config: LLMConfig;
  private init: SessionInit;
  private messages: OpenAIMessage[];
  private toolChoice = true;
  constructor(config: LLMConfig, init: SessionInit) {
    this.config = config;
    this.init = init;
    this.messages = [
      { role: 'system', content: init.system },
      ...(init.history ?? []).map(t => ({ role: t.role, content: t.content })),
      { role: 'user', content: init.question },
    ];
  }
  private body(o: TurnOptions) {
    const tools = this.init.tools.filter(t => !o.allowed || o.allowed.includes(t.name));
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: this.messages,
      stream: true,
      temperature: this.init.temperature ?? 0.2,
      max_tokens: this.init.maxTokens ?? 4096,
      ...vendorExtras(this.config),
    };
    if (!tools.length || (o.toolMode === 'none' && !this.toolChoice)) return body;
    body.tools = tools.map(t => ({ type: 'function', function: t }));
    if (!this.toolChoice) body.tool_choice = 'auto';
    else if (o.toolMode === 'none') body.tool_choice = 'none';
    else if (o.toolMode === 'auto') body.tool_choice = 'auto';
    else body.tool_choice = tools.length === 1 ? { type: 'function', function: { name: tools[0].name } } : 'required';
    return body;
  }
  async next(o: TurnOptions): Promise<TurnResult> {
    const url = `${this.config.baseUrl}/chat/completions`;
    let response: Response;
    try {
      response = await post(url, bearer(this.config), this.body(o), o.signal);
    } catch (error) {
      // Several compatible vendors only accept tool_choice "auto"; downgrade once and remember it.
      if (!(error instanceof LLMError) || error.code !== 'MODEL_BAD_REQUEST' || !this.toolChoice || o.toolMode === 'auto')
        throw error;
      this.toolChoice = false;
      response = await post(url, bearer(this.config), this.body(o), o.signal);
    }
    let text = '',
      reasoning = '';
    const partial = new Map<number, { id: string; name: string; args: string }>();
    for await (const data of readSSE(response)) {
      if (data === '[DONE]') break;
      let json: {
        error?: { message?: string };
        choices?: {
          delta?: {
            content?: string | null;
            reasoning_content?: string | null;
            tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[];
          };
        }[];
      };
      try {
        json = JSON.parse(data);
      } catch {
        continue;
      }
      if (json.error) throw new LLMError('MODEL_HTTP_STREAM', 0, String(json.error.message ?? '').slice(0, 300));
      const delta = json.choices?.[0]?.delta;
      if (!delta) continue;
      if (delta.reasoning_content) {
        reasoning += delta.reasoning_content;
        o.onThinking?.(delta.reasoning_content);
      }
      if (delta.content) {
        text += delta.content;
        o.onText?.(delta.content);
      }
      delta.tool_calls?.forEach((tc, position) => {
        const index =
          typeof tc.index === 'number'
            ? tc.index
            : tc.id
              ? ([...partial].find(([, v]) => v.id === tc.id)?.[0] ?? partial.size)
              : Math.max(0, partial.size - 1 + position);
        const current = partial.get(index) ?? { id: '', name: '', args: '' };
        if (tc.id) current.id = tc.id;
        if (tc.function?.name) current.name = tc.function.name;
        if (tc.function?.arguments) current.args += tc.function.arguments;
        partial.set(index, current);
      });
    }
    const calls: ToolCall[] = [...partial.values()]
      .filter(c => c.name)
      .map((c, i) => ({ id: c.id || `call_${Date.now()}_${i}`, name: c.name, args: parseArgs(c.args) }));
    this.messages.push({
      role: 'assistant',
      content: text || null,
      ...(calls.length
        ? {
            tool_calls: calls.map(c => ({
              id: c.id,
              type: 'function' as const,
              function: { name: c.name, arguments: JSON.stringify(c.args) },
            })),
          }
        : {}),
      // DeepSeek thinking mode rejects tool requests (400) unless every earlier assistant turn carries its reasoning.
      ...(reasoning ? { reasoning_content: reasoning } : {}),
    });
    return { text, calls };
  }
  addToolResults(results: { call: ToolCall; result: unknown }[]) {
    for (const r of results)
      this.messages.push({ role: 'tool', tool_call_id: r.call.id, content: JSON.stringify(r.result) });
  }
  addUserNote(text: string) {
    this.messages.push({ role: 'user', content: text });
  }
}

type GeminiPart = {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  functionCall?: { name: string; args?: Record<string, unknown>; id?: string };
  functionResponse?: unknown;
  inlineData?: { mimeType: string; data: string };
};
type GeminiContent = { role: string; parts: GeminiPart[] };
type GeminiResponse = { candidates?: { content?: GeminiContent }[]; error?: { message?: string } };

function geminiSchema(schema: JsonSchema): Record<string, unknown> {
  const out: Record<string, unknown> = { type: schema.type.toUpperCase() };
  if (schema.description) out.description = schema.description;
  if (schema.required?.length) out.required = schema.required;
  if (schema.items) out.items = geminiSchema(schema.items);
  if (schema.properties)
    out.properties = Object.fromEntries(Object.entries(schema.properties).map(([k, v]) => [k, geminiSchema(v)]));
  return out;
}
function geminiModel(config: LLMConfig, model = config.model) {
  if (!model) throw new LLMError('MODEL_NOT_CONFIGURED');
  const name = model.replace(/^models\//, '');
  if (!/^[a-z0-9.-]+$/i.test(name)) throw new LLMError('MODEL_NOT_CONFIGURED');
  return `${config.baseUrl}/models/${name}`;
}

class GeminiSession implements ChatSession {
  private config: LLMConfig;
  private init: SessionInit;
  private contents: GeminiContent[];
  constructor(config: LLMConfig, init: SessionInit) {
    this.config = config;
    this.init = init;
    this.contents = [
      ...(init.history ?? []).map(t => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [{ text: t.content }] })),
      { role: 'user', parts: [{ text: init.question }] },
    ];
  }
  async next(o: TurnOptions): Promise<TurnResult> {
    const declarations = this.init.tools.map(t =>
      Object.keys(t.parameters.properties ?? {}).length
        ? { name: t.name, description: t.description, parameters: geminiSchema(t.parameters) }
        : { name: t.name, description: t.description },
    );
    const response = await post(
      `${geminiModel(this.config)}:streamGenerateContent?alt=sse`,
      { 'x-goog-api-key': this.config.key ?? '' },
      {
        systemInstruction: { parts: [{ text: this.init.system }] },
        contents: this.contents,
        tools: [{ functionDeclarations: declarations }],
        toolConfig: {
          functionCallingConfig: {
            mode: o.toolMode === 'required' ? 'ANY' : o.toolMode === 'none' ? 'NONE' : 'AUTO',
            ...(o.toolMode === 'required' && o.allowed ? { allowedFunctionNames: o.allowed } : {}),
          },
        },
        generationConfig: { temperature: this.init.temperature ?? 0.2, maxOutputTokens: this.init.maxTokens ?? 4096 },
      },
      o.signal,
    );
    const parts: GeminiPart[] = [];
    for await (const data of readSSE(response)) {
      let json: GeminiResponse;
      try {
        json = JSON.parse(data);
      } catch {
        continue;
      }
      if (json.error) throw new LLMError('MODEL_HTTP_STREAM', 0, String(json.error.message ?? '').slice(0, 300));
      for (const part of json.candidates?.[0]?.content?.parts ?? []) {
        parts.push(part);
        if (part.text && part.thought) o.onThinking?.(part.text);
        else if (part.text) o.onText?.(part.text);
      }
    }
    if (!parts.length) throw new LLMError('MODEL_EMPTY_RESPONSE');
    // Parts are replayed verbatim so Gemini thought signatures survive tool turns.
    this.contents.push({ role: 'model', parts });
    const calls = parts
      .filter(p => p.functionCall)
      .map((p, i) => ({
        id: p.functionCall!.id ?? `call_${i}`,
        rawId: p.functionCall!.id,
        name: p.functionCall!.name,
        args: p.functionCall!.args ?? {},
      }));
    const text = parts
      .filter(p => !p.thought)
      .map(p => p.text ?? '')
      .join('');
    return { text, calls };
  }
  addToolResults(results: { call: ToolCall; result: unknown }[]) {
    this.contents.push({
      role: 'user',
      parts: results.map(r => ({
        functionResponse: { name: r.call.name, ...(r.call.rawId ? { id: r.call.rawId } : {}), response: { result: r.result } },
      })),
    });
  }
  addUserNote(text: string) {
    this.contents.push({ role: 'user', parts: [{ text }] });
  }
}

export function createSession(config: LLMConfig, init: SessionInit): ChatSession {
  if (!llmReady(config)) throw new LLMError('MODEL_NOT_CONFIGURED');
  return config.provider === 'gemini' ? new GeminiSession(config, init) : new OpenAISession(config, init);
}

export async function generateJSON(
  config: LLMConfig,
  input: { system: string; prompt: string; temperature?: number; maxTokens?: number; signal?: AbortSignal },
): Promise<unknown> {
  if (!llmReady(config)) throw new LLMError('MODEL_NOT_CONFIGURED');
  if (config.provider === 'gemini') {
    const response = await post(
      `${geminiModel(config)}:generateContent`,
      { 'x-goog-api-key': config.key ?? '' },
      {
        systemInstruction: { parts: [{ text: input.system }] },
        contents: [{ role: 'user', parts: [{ text: input.prompt }] }],
        generationConfig: {
          temperature: input.temperature ?? 0.3,
          maxOutputTokens: input.maxTokens ?? 4096,
          responseMimeType: 'application/json',
        },
      },
      input.signal,
    );
    const data = (await response.json()) as GeminiResponse;
    const text = (data.candidates?.[0]?.content?.parts ?? [])
      .filter(p => !p.thought)
      .map(p => p.text ?? '')
      .join('');
    if (!text.trim()) throw new LLMError('MODEL_EMPTY_RESPONSE');
    return parseJSONLoose(text);
  }
  const url = `${config.baseUrl}/chat/completions`;
  const body: Record<string, unknown> = {
    model: config.model,
    messages: [
      { role: 'system', content: input.system },
      { role: 'user', content: input.prompt },
    ],
    temperature: input.temperature ?? 0.3,
    max_tokens: input.maxTokens ?? 4096,
    response_format: { type: 'json_object' },
    // Nobody sees the reasoning behind a quiz or a score, so unless thinking was explicitly requested it only adds latency.
    ...vendorExtras({ ...config, thinking: config.thinking ?? 'disabled' }),
  };
  let response: Response;
  try {
    response = await post(url, bearer(config), body, input.signal);
  } catch (error) {
    if (!(error instanceof LLMError) || error.code !== 'MODEL_BAD_REQUEST') throw error;
    delete body.response_format;
    response = await post(url, bearer(config), body, input.signal);
  }
  const data = (await response.json()) as { choices?: { message?: { content?: string | null } }[] };
  const text = data.choices?.[0]?.message?.content ?? '';
  if (!text.trim()) throw new LLMError('MODEL_EMPTY_RESPONSE');
  return parseJSONLoose(text);
}

export async function describeImage(
  config: LLMConfig,
  data: string,
  mimeType: string,
  prompt: string,
  signal?: AbortSignal,
): Promise<string> {
  if (!llmReady(config)) throw new LLMError('MODEL_NOT_CONFIGURED');
  let text = '';
  if (config.provider === 'gemini') {
    const response = await post(
      `${geminiModel(config, config.visionModel)}:generateContent`,
      { 'x-goog-api-key': config.key ?? '' },
      {
        contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType, data } }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 6000 },
      },
      signal,
    );
    const json = (await response.json()) as GeminiResponse;
    text = (json.candidates?.[0]?.content?.parts ?? [])
      .filter(p => !p.thought)
      .map(p => p.text ?? '')
      .join('');
  } else {
    if (!config.visionModel) throw new LLMError('MODEL_NO_VISION');
    // Zhipu documents raw base64 for image_url; other vendors follow the OpenAI data URL form.
    const url = /bigmodel\.cn/.test(config.baseUrl) ? data : `data:${mimeType};base64,${data}`;
    const response = await post(
      `${config.baseUrl}/chat/completions`,
      bearer(config),
      {
        model: config.visionModel,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url } },
              { type: 'text', text: prompt },
            ],
          },
        ],
        temperature: 0,
        max_tokens: 6000,
      },
      signal,
    );
    const json = (await response.json()) as { choices?: { message?: { content?: string | null } }[] };
    text = json.choices?.[0]?.message?.content ?? '';
  }
  if (!text.trim()) throw new LLMError('MODEL_EMPTY_RESPONSE');
  return text.trim();
}

export async function embedTexts(
  config: LLMConfig,
  texts: string[],
  kind: 'query' | 'document',
  signal?: AbortSignal,
): Promise<number[][]> {
  if (!config.embeddingModel || !llmReady(config)) throw new LLMError('MODEL_NOT_CONFIGURED');
  if (config.provider === 'gemini') {
    const model = config.embeddingModel.replace(/^models\//, '');
    if (!/^[a-z0-9.-]+$/i.test(model)) throw new LLMError('MODEL_NOT_CONFIGURED');
    const response = await post(
      `${config.baseUrl}/models/${model}:batchEmbedContents`,
      { 'x-goog-api-key': config.key ?? '' },
      {
        requests: texts.map(text => ({
          model: `models/${model}`,
          content: { parts: [{ text }] },
          taskType: kind === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT',
          outputDimensionality: 768,
        })),
      },
      signal,
      20000,
    );
    const data = (await response.json()) as { embeddings?: { values: number[] }[] };
    if (data.embeddings?.length !== texts.length) throw new LLMError('MODEL_EMPTY_RESPONSE');
    return data.embeddings.map(e => e.values);
  }
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += 16) {
    const batch = texts.slice(i, i + 16);
    const response = await post(
      `${config.baseUrl}/embeddings`,
      bearer(config),
      { model: config.embeddingModel, input: batch },
      signal,
      20000,
    );
    const data = (await response.json()) as { data?: { embedding: number[]; index: number }[] };
    if (data.data?.length !== batch.length) throw new LLMError('MODEL_EMPTY_RESPONSE');
    vectors.push(...[...data.data].sort((a, b) => a.index - b.index).map(d => d.embedding));
  }
  return vectors;
}
