import type { StudyDocument } from './types';
export async function ingestFile(file: File): Promise<StudyDocument> {
  if (file.size > 8 * 1024 * 1024) throw new Error('单份资料不能超过 8MB');
  const title = file.name.replace(/\.[^.]+$/, '').slice(0, 180) || '未命名资料';
  const base = { id: crypto.randomUUID(), title, createdAt: new Date().toISOString() };
  const ext = file.name.split('.').at(-1)?.toLowerCase();
  if (ext === 'pdf') {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
    try {
      if (pdf.numPages > 100) throw new Error('暂支持 100 页以内的 PDF，请按章节拆分');
      const pages = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i); const content = await page.getTextContent();
        const text = content.items.map(item => 'str' in item ? item.str + ('hasEOL' in item && item.hasEOL ? '\n' : ' ') : '').join('').trim();
        pages.push({ page: i, text }); page.cleanup();
      }
      const length = pages.reduce((n, p) => n + p.text.length, 0);
      if (length < 25) throw new Error('PDF 没有可提取的文字，可能是扫描件。请先识别为文本，或使用图片识别。');
      if (length > 150000) throw new Error('单份上限 15 万字符，请按章节拆分');
      return { ...base, kind: 'PDF', pages };
    } finally { await pdf.destroy(); }
  }
  if (ext === 'md' || ext === 'txt' || ext === 'markdown') {
    const text = await file.text();
    if (text.trim().length < 25) throw new Error('请至少提供 25 个字符的资料');
    if (text.length > 150000) throw new Error('单份资料上限 15 万字符，请按章节拆分');
    return { ...base, kind: ext === 'txt' ? 'Text' : 'Markdown', pages: [{ page: 1, text }] };
  }
  throw new Error('请选择 PDF、Markdown 或 TXT 文件');
}
export function downloadFile(name: string, text: string, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
