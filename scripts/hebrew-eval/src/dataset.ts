import fs from 'node:fs';
import path from 'node:path';
import { DATASET_DIR } from './env.js';
import { readJson } from './util.js';
import type { DatasetMessage, EvalContext } from './types.js';

export interface Dataset {
  messages: DatasetMessage[];
  context: EvalContext;
  rubricMarkdown: string | undefined;
  sources: { messages: string; context: string; rubric: string | undefined };
}

interface SampleFile {
  messages: DatasetMessage[];
  context: EvalContext;
}

function normalizeMessage(m: Partial<DatasetMessage>, i: number): DatasetMessage {
  if (typeof m.text !== 'string' || !m.text.trim()) throw new Error(`dataset: message #${i} ללא text`);
  return {
    id: String(m.id ?? `m${i + 1}`),
    persona: String(m.persona ?? ''),
    text: m.text,
    expected_intent: String(m.expected_intent ?? ''),
    expected_complexity: String(m.expected_complexity ?? 'complex').toLowerCase(),
    must_do: Array.isArray(m.must_do) ? m.must_do.map(String) : [],
    must_not_do: Array.isArray(m.must_not_do) ? m.must_not_do.map(String) : [],
    notes: m.notes === undefined ? undefined : String(m.notes),
    ...(Array.isArray(m.expected_tools) ? { expected_tools: m.expected_tools.map(String) } : {}),
    ...(typeof m.confirmed === 'boolean' ? { confirmed: m.confirmed } : {}),
    ...(typeof m.expected_online_meeting === 'boolean' ? { expected_online_meeting: m.expected_online_meeting } : {}),
  };
}

function normalizeContext(c: Partial<EvalContext>): EvalContext {
  return {
    profile: (c.profile ?? {}) as Record<string, unknown>,
    emails: Array.isArray(c.emails) ? c.emails : [],
    events: Array.isArray(c.events) ? c.events : [],
    files: Array.isArray(c.files) ? c.files : [],
    reminders: Array.isArray(c.reminders) ? c.reminders : [],
    ...(typeof c.today === 'string' ? { today: c.today } : {}),
  };
}

/**
 * Loads dataset/messages.json + dataset/context.json (+ rubric.md).
 * Falls back to dataset/_sample.json (3 items) when the real files are missing — with a loud warning.
 */
export function loadDataset(opts: { dir?: string; limit?: number; ids?: string[] } = {}): Dataset {
  const dir = opts.dir ? path.resolve(opts.dir) : DATASET_DIR;
  const messagesFile = path.join(dir, 'messages.json');
  const contextFile = path.join(dir, 'context.json');
  const rubricFile = path.join(dir, 'rubric.md');
  const sampleFile = path.join(dir, '_sample.json');

  let sample: SampleFile | undefined;
  const loadSample = () => {
    if (!sample) {
      if (!fs.existsSync(sampleFile)) throw new Error(`לא נמצא דאטהסט: ${messagesFile} וגם לא ${sampleFile}`);
      sample = readJson<SampleFile>(sampleFile);
    }
    return sample;
  };

  let messages: DatasetMessage[];
  let messagesSource: string;
  if (fs.existsSync(messagesFile)) {
    const raw = readJson<unknown>(messagesFile);
    const arr = Array.isArray(raw) ? raw : (raw as { messages?: unknown[] }).messages;
    if (!Array.isArray(arr)) throw new Error(`${messagesFile}: צריך להיות מערך של הודעות`);
    messages = arr.map((m, i) => normalizeMessage(m as Partial<DatasetMessage>, i));
    messagesSource = messagesFile;
  } else {
    console.warn(`אזהרה: ${messagesFile} לא קיים — משתמש ב-_sample.json (3 הודעות לבדיקה בלבד)`);
    messages = loadSample().messages.map(normalizeMessage);
    messagesSource = sampleFile;
  }

  let context: EvalContext;
  let contextSource: string;
  if (fs.existsSync(contextFile)) {
    context = normalizeContext(readJson<Partial<EvalContext>>(contextFile));
    contextSource = contextFile;
  } else {
    if (messagesSource === messagesFile) console.warn(`אזהרה: ${contextFile} לא קיים — משתמש ב-context מתוך _sample.json`);
    context = normalizeContext(loadSample().context);
    contextSource = sampleFile;
  }

  const ids = new Set<string>();
  for (const m of messages) {
    if (ids.has(m.id)) throw new Error(`dataset: מזהה הודעה כפול: ${m.id}`);
    ids.add(m.id);
  }

  if (opts.ids && opts.ids.length > 0) {
    const want = new Set(opts.ids);
    const missing = opts.ids.filter((id) => !ids.has(id));
    if (missing.length) throw new Error(`--ids: מזהים שלא קיימים בדאטהסט: ${missing.join(', ')}`);
    messages = messages.filter((m) => want.has(m.id));
  }
  if (opts.limit && opts.limit > 0) messages = messages.slice(0, opts.limit);

  const rubricMarkdown = fs.existsSync(rubricFile) ? fs.readFileSync(rubricFile, 'utf8') : undefined;
  return {
    messages,
    context,
    rubricMarkdown,
    sources: { messages: messagesSource, context: contextSource, rubric: rubricMarkdown ? rubricFile : undefined },
  };
}
