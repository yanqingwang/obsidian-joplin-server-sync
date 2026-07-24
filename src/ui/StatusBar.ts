export class StatusBar {
  private el: HTMLElement;

  constructor(el: HTMLElement) {
    this.el = el;
    this.el.addClass('joplin-sync-status');
    this.setIdle();
  }

  setIdle(): void {
    this.el.setText('Joplin: idle');
    this.el.className = 'joplin-sync-status';
  }

  setSyncing(): void {
    this.el.setText('Joplin: syncing\u2026');
    this.el.className = 'joplin-sync-status syncing';
  }

  setOk(time: number): void {
    const t = new Date(time).toLocaleTimeString();
    this.el.setText('Joplin: OK (' + t + ')');
    this.el.className = 'joplin-sync-status ok';
  }

  setError(msg: string): void {
    this.el.setText('Joplin: error');
    this.el.className = 'joplin-sync-status error';
    console.error('[joplin-sync]', msg);
  }

  setProgress(done: number, total: number): void {
    this.el.setText('Joplin: ' + done + '/' + total);
  }
}