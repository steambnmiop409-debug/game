import './style.css';
import fontUrl from 'galmuri/dist/Galmuri11.woff2?url';

async function boot() {
  try {
    const face = new FontFace('Galmuri11', `url(${fontUrl})`);
    await face.load();
    document.fonts.add(face);
  } catch (e) {
    console.warn('글꼴을 불러오지 못했습니다', e);
  }
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const q = new URLSearchParams(location.search);
  if (q.has('viewer')) {
    const { runViewer } = await import('./debug/viewer');
    runViewer(canvas);
    return;
  }
  const { Game } = await import('./game');
  const game = new Game(canvas, document.getElementById('ui') as HTMLElement);
  (window as unknown as { __game: unknown }).__game = game;
  await game.start();
}

boot();
