const GOOGLE_SHEETS_URL =
  'https://script.google.com/macros/s/AKfycbxdZWlFxI_tznE05IE0FbiK2hYbJP4asLgshanJL8UC303E5e-jHSuGPb9i78KkG2og/exec';

export interface SheetBlessing {
  id: string;
  name: string;
  attending: string;
  dancing: string;
  song?: string;
  message: string;
  timestamp: string;
  likes: number;
}

export interface RsvpSubmission {
  id: string;
  name: string;
  attending: string;
  dancing: string;
  song: string;
  message: string;
  timestamp: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getField(row: Record<string, unknown>, aliases: string[]): unknown {
  const normalized = new Map(
    Object.entries(row).map(([key, value]) => [normalizeKey(key), value])
  );
  for (const alias of aliases) {
    const value = normalized.get(normalizeKey(alias));
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function normalizeBlessings(payload: unknown): SheetBlessing[] {
  const records = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.data)
      ? payload.data
      : isRecord(payload) && Array.isArray(payload.records)
        ? payload.records
        : [];

  const rows = records.map((record) => {
    if (Array.isArray(record)) return record;
    return isRecord(record) ? record : null;
  });

  const firstRow = rows[0];
  const headers =
    Array.isArray(firstRow) && firstRow.every((cell) => typeof cell === 'string')
      ? firstRow.map(String)
      : null;
  const dataRows = headers ? rows.slice(1) : rows;

  return dataRows.flatMap((row, index) => {
    const values: Record<string, unknown> | null = Array.isArray(row)
      ? headers
        ? Object.fromEntries(headers.map((header, column) => [header, row[column]]))
        : null
      : isRecord(row)
        ? row
        : null;
    if (!values) return [];

    const name = getField(values, ['name', 'guest', 'guest name', 'your name']);
    if (typeof name !== 'string' || !name.trim()) return [];

    const attending = getField(values, ['attending', 'attendance', 'rsvp', 'response']);
    const dancing = getField(values, ['dancing', 'dance', 'dance performance']);
    const song = getField(values, ['song', 'track', 'sangeet track']);
    const message = getField(values, ['message', 'blessing', 'wishes', 'blessing message']);
    const timestamp = getField(values, ['timestamp', 'time', 'date', 'created at', 'submitted at']);
    const id = getField(values, ['id', 'response id']);
    const likes = Number(getField(values, ['likes']) ?? 0);

    return [{
      id: String(id ?? `${name}-${timestamp ?? index}`),
      name: name.trim(),
      attending: String(attending ?? ''),
      dancing: String(dancing ?? ''),
      song: song ? String(song) : undefined,
      message: String(message ?? ''),
      timestamp: String(timestamp ?? 'Recently'),
      likes: Number.isFinite(likes) ? likes : 0,
    }];
  });
}

function fetchJsonp(): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const callbackName = `__weddingSheetCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement('script');
    const url = new URL(GOOGLE_SHEETS_URL);
    let timeoutId: number;

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      Reflect.deleteProperty(window, callbackName);
      script.remove();
    };

    Object.defineProperty(window, callbackName, {
      configurable: true,
      value: (data: unknown) => {
        cleanup();
        resolve(data);
      },
    });
    script.onerror = () => {
      cleanup();
      reject(new Error('Could not load responses from the Google Sheet.'));
    };
    url.searchParams.set('callback', callbackName);
    url.searchParams.set('_', String(Date.now()));
    script.src = url.toString();
    timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error('Timed out while loading responses from the Google Sheet.'));
    }, 10000);
    document.head.appendChild(script);
  });
}

export async function loadSheetBlessings(): Promise<SheetBlessing[]> {
  return normalizeBlessings(await fetchJsonp());
}

export async function submitRsvp(submission: RsvpSubmission): Promise<void> {
  await fetch(GOOGLE_SHEETS_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify({ action: 'submit', ...submission }),
  });
}
