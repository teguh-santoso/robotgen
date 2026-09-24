import { el, button, markUi } from './dom';

/** Shown once every star has been collected. There is no failure screen. */
export class CompleteOverlay {
  private readonly overlay: HTMLDivElement;
  private readonly count: HTMLSpanElement;

  constructor(root: HTMLElement, onReplay: () => void) {
    this.overlay = markUi(el('div', 'overlay hidden'));
    const card = el('div', 'card');

    const summary = el('div', 'stars-summary');
    this.count = el('span', undefined, '0 / 0');
    summary.append(el('span', 'hud-star-icon'), this.count);

    const actions = el('div', 'card-actions');
    actions.append(
      el('p', undefined, 'Semua bintang sudah kamu kumpulkan!'),
      button('big-button', 'MAIN LAGI', onReplay),
    );

    card.append(el('h2', 'complete-title', 'HEBAT!'), summary, actions);
    this.overlay.append(card);
    root.append(this.overlay);
  }

  setStars(collected: number, total: number): void {
    this.count.textContent = `${collected} / ${total}`;
  }

  show(): void {
    this.overlay.classList.remove('hidden');
    // Restart the entrance animation.
    this.overlay.style.animation = 'none';
    void this.overlay.offsetWidth;
    this.overlay.style.animation = '';
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
