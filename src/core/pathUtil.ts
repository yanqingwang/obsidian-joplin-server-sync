const WINDOWS_RESERVED = new Set(['CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9']);

export function safeFileName(name: string): string {
  let cleaned = (name || '')
    .replace(/[/\\]/g, '_')
    .replace(/[:*?"<>|]/g, '_')
    .replace(/\p{Cc}/gu, '')
    .replace(/\s+$/g, '')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 200);
  if (cleaned === '' || cleaned === '.') return 'Untitled';
  if (WINDOWS_RESERVED.has(cleaned.toUpperCase())) return '_' + cleaned;
  return cleaned;
}
