import { App, Modal } from 'obsidian';

/**
 * Safety rails for the two operations that can DESTROY data:
 *   - `forcePush`: deletes this vault's subtree on the server, then re-uploads.
 *   - `forcePull`: deletes every non-excluded local file, then re-downloads.
 *
 * Both used to run on a single click with no confirmation. A mis-click (or a
 * command-palette hit while the wrong vault is focused) is unrecoverable
 * outside of Obsidian's file-recovery/trash, so we require an explicit,
 * typed confirmation that names the direction of the overwrite.
 */
export function confirmDestructive(app: App, opts: {
  title: string;
  /** What is destroyed and what replaces it — must name both sides. */
  message: string;
  /** Long-press word the user must type (e.g. the vault name). */
  requireText?: string;
  ctaText: string;
}): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v: boolean) => {
      if (settled) return;
      settled = true;
      modal.close();
      resolve(v);
    };
    const modal = new Modal(app);
    modal.titleEl.setText(opts.title);
    modal.contentEl.createEl('p', { text: opts.message });
    let input: HTMLInputElement | null = null;
    if (opts.requireText) {
      modal.contentEl.createEl('p', {
        text: 'Type "' + opts.requireText + '" to confirm:',
        cls: 'mod-warning',
      });
      input = modal.contentEl.createEl('input', { type: 'text' });
      input.style.width = '100%';
    }
    const btns = modal.contentEl.createDiv({ cls: 'modal-button-container' });
    const okBtn = btns.createEl('button', { text: opts.ctaText });
    okBtn.addClass('mod-warning');
    okBtn.addClass('mod-cta');
    if (opts.requireText) okBtn.setAttribute('disabled', 'true');
    const cancelBtn = btns.createEl('button', { text: 'Cancel' });
    cancelBtn.onclick = () => finish(false);
    okBtn.onclick = () => {
      if (opts.requireText && (input?.value ?? '').trim() !== opts.requireText) {
        okBtn.setText('Type the name exactly');
        return;
      }
      finish(true);
    };
    input?.addEventListener('input', () => {
      const match = (input?.value ?? '').trim() === opts.requireText;
      if (match) okBtn.removeAttribute('disabled');
      else okBtn.setAttribute('disabled', 'true');
    });
    // Closing via ESC / backdrop counts as "no".
    modal.onClose = () => {
      if (!settled) { settled = true; resolve(false); }
    };
    modal.open();
    input?.focus();
  });
}

/**
 * Guard against "the server looks empty" turning into mass deletion.
 *
 * A pull that returns far fewer items than this vault has mapped is almost
 * never a legitimate delete snowflake — it is a broken root filter, a cleaned
 * server, or a stale/reused sync target. Acting on it destroys local data, so
 * the caller must opt in explicitly.
 */
export function remoteLooksIncomplete(mappedCount: number, remoteInScope: number): boolean {
  if (mappedCount < 5) return false;
  return remoteInScope < Math.max(1, Math.floor(mappedCount * 0.5));
}
