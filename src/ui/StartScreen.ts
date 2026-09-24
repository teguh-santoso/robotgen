import { el, button, keyCap, markUi } from './dom';

function controlItem(keys: HTMLElement[], label: string): HTMLDivElement {
  const item = el('div', 'control-item');
  const keyRow = el('div', 'control-key');
  keyRow.append(...keys);
  item.append(keyRow, el('div', 'control-label', label));
  return item;
}

function stickIcon(): HTMLDivElement {
  return el('div', 'stick');
}

function padButton(): HTMLSpanElement {
  const node = el('span', 'key');
  node.textContent = '\u2715';
  return node;
}

/**
 * The MULAI screen. It exists for three practical reasons: browsers only allow
 * audio after a tap, gamepads are only visible after a user gesture, and Rapier
 * needs a moment to load. It also doubles as the control tutorial.
 */
export class StartScreen {
  private readonly overlay: HTMLDivElement;
  private readonly intro: HTMLDivElement;
  private readonly loading: HTMLDivElement;
  private readonly progressBar: HTMLSpanElement;

  constructor(root: HTMLElement, onStart: () => void) {
    this.overlay = markUi(el('div', 'overlay intro-layer'));

    const card = el('div', 'card');
    card.append(el('h1', undefined, 'ROBOTGEN'));
    card.append(el('p', undefined, 'Ayo kumpulkan semua bintang di taman!'));

    const grid = el('div', 'control-grid');
    const touch = window.matchMedia?.('(pointer: coarse)').matches === true;

    if (touch) {
      grid.append(controlItem([stickIcon()], 'Jalan'));
      grid.append(controlItem([el('span', 'key wide', 'LOMPAT')], 'Lompat'));
    } else {
      const moveKeys = [
        keyCap('W'),
        keyCap('A'),
        keyCap('S'),
        keyCap('D'),
        el('span', 'control-label', 'atau'),
        keyCap('\u2191'),
        keyCap('\u2190'),
        keyCap('\u2193'),
        keyCap('\u2192'),
      ];
      grid.append(controlItem(moveKeys, 'Jalan'));
      grid.append(controlItem([keyCap('Space', true)], 'Lompat'));
      grid.append(controlItem([stickIcon()], 'Stick kiri'));
      grid.append(controlItem([padButton()], 'Lompat di PS'));
    }

    this.intro = el('div');
    this.intro.append(grid);
    const startButton = button('big-button', 'MULAI', onStart);
    this.intro.append(startButton);

    this.progressBar = el('span');
    const bar = el('div', 'loading-bar');
    bar.append(this.progressBar);

    this.loading = el('div');
    this.loading.style.display = 'none';
    this.loading.append(
      el('h2', undefined, 'Sebentar ya\u2026'),
      el('p', undefined, 'Robotnya sedang bangun.'),
      bar,
    );

    const actions = el('div', 'card-actions');
    actions.append(this.intro, this.loading);
    card.append(actions);
    this.overlay.append(card);
    root.append(this.overlay);
  }

  show(): void {
    this.overlay.classList.remove('hidden');
    this.intro.style.display = '';
    this.loading.style.display = 'none';
  }

  showLoading(): void {
    this.intro.style.display = 'none';
    this.loading.style.display = '';
    this.setProgress(0.1);
  }

  setProgress(fraction: number): void {
    this.progressBar.style.width = `${Math.round(Math.min(Math.max(fraction, 0.05), 1) * 100)}%`;
  }

  hide(): void {
    this.overlay.classList.add('hidden');
  }

  dispose(): void {
    this.overlay.remove();
  }
}
