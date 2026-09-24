export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Marks a subtree as control surface. The touch device ignores any pointer that
 * starts inside one, so tapping a button never spawns the joystick.
 */
export function markUi<T extends HTMLElement>(node: T): T {
  node.setAttribute('data-ui', '');
  return node;
}

export function button(className: string, text: string, onClick: () => void): HTMLButtonElement {
  const node = el('button', className, text);
  node.type = 'button';
  node.addEventListener('click', (event) => {
    event.preventDefault();
    onClick();
  });
  return node;
}

export function iconButton(glyph: string, label: string, onClick: () => void): HTMLButtonElement {
  const node = button('icon-button', glyph, onClick);
  node.setAttribute('aria-label', label);
  node.title = label;
  return node;
}

export function keyCap(text: string, wide = false): HTMLSpanElement {
  return el('span', wide ? 'key wide' : 'key', text);
}

export function canFullscreen(): boolean {
  return typeof document !== 'undefined' && typeof document.documentElement.requestFullscreen === 'function';
}

export async function toggleFullscreen(): Promise<void> {
  if (!canFullscreen()) return;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch {
    // Some browsers refuse without a gesture or inside an iframe; ignore.
  }
}
