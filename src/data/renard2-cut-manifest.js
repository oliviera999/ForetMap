/**
 * Mascotte Renard 2 : noms de fichiers sous /assets/mascots/renard2-cut/frames/
 * (générés par scripts/renard2-cut-extract.cjs, convention cell-r{R}-c{C}.png).
 */
export const RENARD2_FRAMES_BASE = '/assets/mascots/renard2-cut/frames';

/** @type {Record<string, { files: string[], fps: number }>} */
export const renard2CutManifest = {
  idle: { files: ['cell-r0-c0.png', 'cell-r0-c1.png', 'cell-r0-c2.png'], fps: 3 },
  walking: { files: ['cell-r1-c0.png', 'cell-r1-c1.png', 'cell-r1-c2.png', 'cell-r1-c3.png', 'cell-r1-c4.png'], fps: 10 },
  running: { files: ['cell-r1-c0.png', 'cell-r1-c1.png', 'cell-r1-c2.png', 'cell-r1-c3.png', 'cell-r1-c4.png'], fps: 14 },
  talk: { files: ['cell-r2-c0.png', 'cell-r2-c1.png', 'cell-r2-c2.png', 'cell-r2-c3.png'], fps: 8 },
  inspect: { files: ['cell-r0-c2.png'], fps: 1 },
  map_read: { files: ['cell-r0-c0.png'], fps: 1 },
  surprise: { files: ['cell-r3-c0.png'], fps: 2 },
  alert: { files: ['cell-r3-c0.png'], fps: 5 },
  angry: { files: ['cell-r3-c0.png'], fps: 7 },
  spin: { files: ['cell-r3-c1.png', 'cell-r3-c2.png'], fps: 10 },
  happy: { files: ['cell-r3-c3.png', 'cell-r3-c4.png', 'cell-r3-c5.png'], fps: 9 },
  happy_jump: { files: ['cell-r3-c3.png', 'cell-r3-c4.png', 'cell-r3-c5.png'], fps: 11 },
  celebrate: { files: ['cell-r3-c3.png', 'cell-r3-c4.png', 'cell-r3-c5.png'], fps: 10 },
};
