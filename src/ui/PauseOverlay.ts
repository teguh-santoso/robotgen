import { el, button, canFullscreen, markUi, toggleFullscreen } from './dom';

export interface PauseCallbacks {
  onResume: () => void;
  onRestart: () => void;
  onTidyToys: () => void;
  onToggleSound: () => boolean;
  onToggleRumble: () => boolean;
  /** Advances to the next quality level and returns its label. */
  onCycleQuality: () => string;
  onToggleStats: () => boolean;
}

/**
 * Aimed at the grown-up, not the child: this is where sound, haptics and the
 * render quality live. The quality row matters on an old laptop, where the
 * automatic choice may still be too ambitious.
 */
export class PauseOverlay {
  private readonly overlay: HTMLDivElement;
  private readonly message: HTMLParagraphElement;
  private readonly soundToggle: HTMLButtonElement;
  private readonly rumbleToggle: HTMLButtonElement;
  private readonly qualityToggle: HTMLButtonElement;
  private readonly statsToggle: HTMLButtonElement;

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

    this.qualityToggle = button('big-button secondary', 'Kualitas', () => {
      this.syncQuality(callbacks.onCycleQuality());
    });

    this.statsToggle = button('big-button secondary', 'Statistik', () => {
      this.syncStats(callbacks.onToggleStats());
    });

    const diagnostics = el('div', 'card-actions-row');
    diagnostics.append(this.qualityToggle, this.statsToggle);

    const actions = el('div', 'card-actions');
    actions.append(
      button('big-button', 'LANJUT', callbacks.onResume),
      toggles,
      diagnostics,
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
    this.syncQuality('Otomatis');
    this.syncStats(false);
  }

  private syncSound(muted: boolean): void {
    this.soundToggle.textContent = muted ? '\u{1F507} Suara Mati' : '\u{1F50A} Suara Nyala';
    this.soundToggle.classList.toggle('toggle-off', muted);
  }

  private syncRumble(enabled: boolean): void {
    this.rumbleToggle.textContent = enabled ? '\u{1F3AE} Getaran Nyala' : '\u{1F3AE} Getaran Mati';
    this.rumbleToggle.classList.toggle('toggle-off', !enabled);
  }

  /** `label` is the human-readable quality, e.g. "Otomatis (Rendah)". */
  syncQuality(label: string): void {
    this.qualityToggle.textContent = `\u2699 Kualitas: ${label}`;
    const automatic = label.startsWith('Otomatis');
    this.qualityToggle.classList.toggle('toggle-off', automatic);
  }

  syncStats(enabled: boolean): void {
    this.statsToggle.textContent = enabled ? '\u{1F4CA} Statistik Nyala' : '\u{1F4CA} Statistik Mati';
    this.statsToggle.classList.toggle('toggle-off', !enabled);
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
