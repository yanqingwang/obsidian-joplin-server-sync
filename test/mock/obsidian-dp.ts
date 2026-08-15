// Alias shim for the delta-pull verification harness: re-export the in-memory
// obsidian mock and add the few extra symbols SyncEngine pulls from 'obsidian'
// that the base mock doesn't define. Kept separate so we don't touch the
// shared mock used by other tests.
export * from './obsidian';

export class Modal {
  app: any;
  titleEl: any = { setText() {} };
  contentEl: any = { createEl: () => ({ setText() {}, addClass() {}, onclick: undefined, createEl: () => ({}) }) };
  constructor(app: any) { this.app = app; }
  open() {}
  close() {}
}
