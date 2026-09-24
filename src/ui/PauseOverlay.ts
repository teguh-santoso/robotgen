import { el, button, canFullscreen, markUi, toggleFullscreen } from './dom';

export interface PauseCallbacks {
  onResume: () => void;
  onRestart: () => void;
  onTidyToys: () => void;
  onToggleSound: () => boolean;
  onToggleRumble: () => boolean;
}

export class PauseOverlay {
  private readonly overlay: HTMLDivElement;
  private readonly message: HTMLParagraphElement;
  private readonly soundToggle: HTMLButtonElement;
  private readonly rumbleToggle: HTMLButtonElement;

  constructor(root: HTMLElement, callbacks: PauseCallbacks) {
    this.overlay = markUi(el('div', 'overlay hidden'));
    const card = el('div', 'card');
    card.append(el('h2', undefined, 'Berhenti Sebentar'));

    this.message = el('p', undefined, 'Tekan LANJUT kalau sudah siap.');
    card.append(this.message);

    this.soundToggle = button('big-button secondary', '\u{1F50A} Suara', () => {
      this.syncSound(callbacks.onToggleSound());
    });
    this.rumbleToggle = button('big-button secondary', '\u{1F3AE} Getaran', () => {
      this.syncRumble(callbacks.onToggleRumble());
    });

    const toggles = el('div', 'card-actions-row');
    toggles.append(this.soundToggle, this.rumbleToggle);

    const actions = el('div', 'card-actions');
    actions.append(
      button('big-button', 'LANJUT', callbacks.onResume),
      toggles,
      button('big-button secondary', '\u{1F9F9} Rapikan Mainan', callbacks.onTidyToys),
      button('big-button secondary', '\u21BB Ulang dari Awal', callbacks.onRestart),
    );

    if (canFullscreen()) {
      actions.append(
        button('big-button secondary', '\u26F6 Layar Penuh', () => void toggleFullscreen()),
      );
    }

    card.append(actions);
    this.overlay.append(card);
    root.append(this.overlay);
    this.syncSound(false);
    this.syncRumble(true);
  }

  private syncSound(muted: boolean): void {
    this.soundToggle.textContent = muted ? '\u{1F507} Suara Mati' : '\u{1F50A} Suara Nyala';
    this.soundToggle.classList.toggle('toggle-off', muted);
  }

  private syncRumble(enabled: boolean): void {
    this.rumbleToggle.textContent = enabled ? '\u{1F3AE} Getaran Nyala' : '\u{1F3AE} Getaran Mati';
    this.rumbleToggle.classList.toggle('toggle-off', !enabled);
  }

  setMessage(text: string): void {
    this.message.textContent = text;
  }

  show(): void {
    this.overlay.classList.remove('hidden');
  }

  hide(): void {
    this.overlay.classList.add('hidden');
  }

  get isOpen(): boolean {
    return !this.overlay.classList.contains('hidden');
  }

  dispose(): void {
    this.overlay.remove();
  }
}
