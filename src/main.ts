import './ui/styles.css';
import { Sfx } from './audio/Sfx';
import { Game } from './core/Game';
import { StartScreen } from './ui/StartScreen';

const canvas = document.getElementById('scene') as HTMLCanvasElement | null;
const uiRoot = document.getElementById('ui') as HTMLDivElement | null;

if (!canvas || !uiRoot) {
  throw new Error('Elemen #scene atau #ui tidak ditemukan di index.html');
}

// Behaviours that ruin a game for a six year old on a tablet.
document.addEventListener('contextmenu', (event) => event.preventDefault());
document.addEventListener('dblclick', (event) => event.preventDefault());
document.addEventListener('gesturestart', (event) => event.preventDefault());

const sfx = new Sfx();
const startScreen = new StartScreen(uiRoot, () => {
  void begin();
});
startScreen.show();

let game: Game | null = null;
let starting = false;

async function begin(): Promise<void> {
  if (starting || game) return;
  starting = true;

  // Must happen inside the gesture: browsers gate audio behind a user action.
  sfx.unlock();
  startScreen.showLoading();

  try {
    game = await Game.create({
      canvas: canvas as HTMLCanvasElement,
      uiRoot: uiRoot as HTMLDivElement,
      startScreen,
      sfx,
      onProgress: (fraction) => startScreen.setProgress(fraction),
    });
    startScreen.setProgress(1);
    await game.play();
  } catch (error) {
    console.error('[robotgen] gagal memulai', error);
    starting = false;
    startScreen.show();
  }
}
