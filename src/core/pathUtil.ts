export function safeFileName(name: string): string {
  const cleaned = (name || '')
    .replace(/[\\/]/g, '_')
    .replace(/[\x00-\x1f\x7f]/g, '')
    .trim();
  return cleaned || 'Untitled';
}
