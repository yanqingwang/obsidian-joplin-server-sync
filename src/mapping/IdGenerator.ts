export function createJoplinId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export function isValidJoplinId(id: string): boolean {
  return /^[0-9a-f]{32}$/.test(id);
}