export function safeFileName(name: string): string {
  const cleaned = (name || '')
    .replace(/[/\\]/g, '_')
    .replace(/\p{Cc}/gu, '')
    .trim();
  return cleaned || 'Untitled';
}
