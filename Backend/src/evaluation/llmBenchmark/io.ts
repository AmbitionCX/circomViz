import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { promises as fs } from 'fs';
import path from 'path';
import { createInterface } from 'readline';

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return '{' + entries
      .map(([key, entry]) => JSON.stringify(key) + ':' + stableStringify(entry))
      .join(',') + '}';
  }
  return JSON.stringify(value);
}

export function sha256(value: unknown): string {
  const hash = createHash('sha256');
  if (typeof value === 'string') {
    hash.update(value);
  } else {
    updateStableHash(hash, value);
  }
  return hash.digest('hex');
}

function updateStableHash(hash: ReturnType<typeof createHash>, value: unknown): void {
  if (Array.isArray(value)) {
    hash.update('[');
    value.forEach((entry, index) => {
      if (index) hash.update(',');
      updateStableHash(hash, entry);
    });
    hash.update(']');
    return;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    hash.update('{');
    entries.forEach(([key, entry], index) => {
      if (index) hash.update(',');
      hash.update(JSON.stringify(key));
      hash.update(':');
      updateStableHash(hash, entry);
    });
    hash.update('}');
    return;
  }
  hash.update(JSON.stringify(value));
}

export async function ensureParent(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(path.resolve(filePath)), { recursive: true });
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, 'utf8')) as T;
}

export async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await ensureParent(filePath);
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

export async function readJsonl<T>(filePath: string): Promise<T[]> {
  const rows: T[] = [];
  try {
    await fs.access(filePath);
  } catch (error: any) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  const input = createReadStream(filePath, { encoding: 'utf8' });
  const lines = createInterface({ input, crlfDelay: Infinity });
  let lineNumber = 0;
  for await (const line of lines) {
    lineNumber += 1;
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line) as T);
    } catch (error: any) {
      throw new Error(`Invalid JSONL at ${filePath}:${lineNumber}: ${error.message}`);
    }
  }
  return rows;
}

export async function writeJsonl(filePath: string, rows: unknown[]): Promise<void> {
  await ensureParent(filePath);
  const resolvedPath = path.resolve(filePath);
  const temporaryPath = `${resolvedPath}.tmp-${process.pid}`;
  const output = await fs.open(temporaryPath, 'w');
  try {
    for (const row of rows) {
      await output.writeFile(JSON.stringify(row) + '\n', 'utf8');
    }
  } catch (error) {
    await output.close();
    await fs.unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
  await output.close();
  await fs.rename(temporaryPath, resolvedPath);
}

export async function appendJsonl(filePath: string, row: unknown): Promise<void> {
  await ensureParent(filePath);
  await fs.appendFile(filePath, JSON.stringify(row) + '\n', 'utf8');
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined
    ? ''
    : Array.isArray(value)
      ? value.join(';')
      : String(value);
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

export async function writeCsv(
  filePath: string,
  headers: string[],
  rows: Array<Record<string, unknown>>,
): Promise<void> {
  await ensureParent(filePath);
  const lines = [
    headers.map(csvCell).join(','),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(',')),
  ];
  await fs.writeFile(filePath, lines.join('\n') + '\n', 'utf8');
}
