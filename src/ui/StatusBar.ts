export class StatusBar {
  private el: HTMLElement;

  constructor(el: HTMLElement) {
    this.el = el;
    this.el.addClass('joplin-sync-status');
    this.setIdle();
  }

  setIdle(): void {
    this.el.setText('');
    this.el.className = 'joplin-sync-status';
  }

  setSyncing(): void {
    this.el.setText('Joplin: syncing\u2026');
    this.el.className = 'joplin-sync-status syncing';
  }

  setOk(time: number, count?: number): void {
    const t = new Date(time).toLocaleTimeString();
    const suffix = count !== undefined ? ' (' + count + ' items)' : '';
    this.el.setText('Joplin: OK ' + t + suffix);
    this.el.className = 'joplin-sync-status ok';
  }

  setError(msg: string): void {
    this.el.setText('Joplin: error');
    this.el.className = 'joplin-sync-status error';
    console.error('[joplin-sync]', msg);
  }

  setProgress(done: number, total: number, phase?: string): void {
    const prefix = phase ? phase + ' ' : '';
    this.el.setText('Joplin: ' + prefix + done + '/' + total);
  }
}