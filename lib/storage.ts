import type { Workspace } from './types';
import { z } from 'zod';

const pageSchema = z.object({ page: z.number().int().min(1), text: z.string().max(150000) });
export const documentSchema = z.object({
  id: z.string().min(1).max(200), title: z.string().min(1).max(240),
  kind: z.enum(['PDF', 'Markdown', 'Text', 'Image']), pages: z.array(pageSchema).min(1).max(100),
  createdAt: z.string().datetime(), sample: z.boolean().optional(),
});
// Backups are untrusted input: full domain records are checked before entering the UI.
const chunkSchema = z.object({ id: z.string(), documentId: z.string(), title: z.string(), section: z.string(), page: z.number(), text: z.string(), start: z.number(), end: z.number() });
const backupSchema = z.object({
  version: z.literal(1), documents: z.array(documentSchema).max(40),
  answers: z.array(z.object({ id: z.string(), question: z.string(), text: z.string(), evidence: z.array(chunkSchema.extend({score: z.number(), rank: z.number()})), mode: z.enum(['extractive', 'gemini']), refused: z.boolean(), trace: z.array(z.object({tool:z.string(),label:z.string(),detail:z.string(),ms:z.number()})), createdAt:z.string(), elapsedMs:z.number(), retrieval:z.enum(['bm25','hybrid']), citationWarnings:z.array(z.string()).optional() })).max(100),
  attempts: z.array(z.object({ id:z.string(),questionId:z.string(),section:z.string(),correct:z.boolean(),selected:z.number(),at:z.string(),evidence:chunkSchema })).max(2000),
  tasks: z.array(z.object({id:z.string(),title:z.string(),section:z.string(),due:z.string(),minutes:z.number(),documentId:z.string(),page:z.number(),done:z.boolean()})).max(1000),
});
export function parseBackup(value: unknown): Workspace { return backupSchema.parse(value); }

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('zhixu-workspace', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('workspace');
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
}
export async function loadWorkspace(): Promise<Workspace | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const r = db.transaction('workspace').objectStore('workspace').get('current');
    r.onsuccess = () => { db.close(); try { resolve(r.result ? parseBackup(r.result) : null); } catch (e) { reject(e); } };
    r.onerror = () => { db.close(); reject(r.error); };
  });
}
export async function saveWorkspace(value: Workspace) {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('workspace', 'readwrite'); tx.objectStore('workspace').put(value, 'current');
    tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
