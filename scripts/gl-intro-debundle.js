#!/usr/bin/env node
'use strict';

/**
 * Extrait l'intro GL depuis le fichier hors-ligne bundlé (Claude Design).
 * Usage:
 *   node scripts/gl-intro-debundle.js [chemin-bundle.html] [--out=public/gl/intro]
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_BUNDLE = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  'Downloads',
  'Intro Gnomes & Licornes (hors-ligne) (1).html'
);
const DEFAULT_OUT = path.join(ROOT, 'public', 'gl', 'intro');
const DEFAULT_CONFIG = path.join(ROOT, 'data', 'gl', 'intro.default.json');

const SCENE_IMAGE_KEYS = {
  boite: 'GL_intro_01_la-boite',
  copiste: 'GL_intro_02_le-copiste',
  carnet: 'GL_intro_03_le-carnet-de-selene',
  miroir: 'GL_intro_04_le-miroir-passage',
  selene: 'GL_intro_05_selene-au-seuil',
  corbeau: 'GL_intro_06_le-corbeau-messager',
  souffle: 'GL_intro_07_salle-de-classe',
  seuil: 'GL_intro_08_le-carnet-dans-la-savane',
  bienvenue: 'GL_intro_09_la-traversee-des-biomes',
};

function parseArgs(argv) {
  let bundlePath = DEFAULT_BUNDLE;
  let outDir = DEFAULT_OUT;
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--out=')) outDir = path.resolve(ROOT, arg.slice(6));
    else if (!arg.startsWith('--')) bundlePath = path.resolve(arg);
  }
  return { bundlePath, outDir };
}

function extractJsonScript(html, type) {
  const open = `<script type="${type}">`;
  const start = html.indexOf(open);
  if (start < 0) throw new Error(`Bloc ${type} introuvable`);
  const jsonStart = start + open.length;
  const end = html.indexOf('</script>', jsonStart);
  if (end < 0) throw new Error(`Fin de bloc ${type} introuvable`);
  return JSON.parse(html.slice(jsonStart, end).trim());
}

function decodeManifestEntry(entry) {
  const raw = Buffer.from(entry.data, 'base64');
  if (!entry.compressed) return raw;
  return zlib.gunzipSync(raw);
}

function extFromMime(mime) {
  const map = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'audio/mpeg': 'mp3',
    'font/woff2': 'woff2',
    'application/font-woff2': 'woff2',
  };
  return map[mime] || 'bin';
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeFile(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, data);
}

function stripTweaksAndBundler(html) {
  let out = html;
  out = out.replace(/<div id="tweaks-root"[\s\S]*?<\/div>\s*/gi, '');
  out = out.replace(/<script[^>]*src="[^"]*tweaks-panel[\s\S]*?<\/script>\s*/gi, '');
  out = out.replace(/<script[^>]*src="[^"]*react[\s\S]*?<\/script>\s*/gi, '');
  out = out.replace(/<script[^>]*src="[^"]*babel[\s\S]*?<\/script>\s*/gi, '');
  out = out.replace(/<script[^>]*type="text\/babel"[\s\S]*?<\/script>\s*/gi, '');
  out = out.replace(/<script[^>]*type="text\/jsx"[\s\S]*?<\/script>\s*/gi, '');
  return out;
}

function patchIntroHtml(html) {
  let out = stripTweaksAndBundler(html);
  out = out.replace(
    /const GAME_URL\s*=\s*"[^"]*";/,
    'const GAME_URL = ""; // intégration ForetMap : postMessage uniquement'
  );
  const configLoader = `
<script>
(function loadGlIntroConfig() {
  const apply = (payload) => {
    if (!payload || typeof payload !== 'object') return;
    if (Array.isArray(payload.scenes) && typeof SCENES !== 'undefined') {
      for (const scene of payload.scenes) {
        const target = SCENES.find((s) => s.id === scene.id);
        if (!target) continue;
        if (scene.kicker != null) target.kicker = scene.kicker;
        if (scene.text != null) target.text = scene.text;
        if (scene.hold != null) target.hold = scene.hold;
        if (scene.voice != null) target.voice = scene.voice;
        if (scene.erase != null) target.erase = !!scene.erase;
        if (scene.finale != null) target.finale = !!scene.finale;
        if (scene.cta != null) target.cta = !!scene.cta;
      }
    }
    if (payload.images && typeof IMAGES !== 'undefined') {
      for (const [id, url] of Object.entries(payload.images)) {
        if (url) IMAGES[id] = url;
      }
    }
    if (payload.audio && typeof audLoop !== 'undefined') {
      if (payload.audio.loopUrl) audLoop.src = payload.audio.loopUrl;
      if (payload.audio.finalUrl) audFinal.src = payload.audio.finalUrl;
    }
    if (payload.opening) {
      const o = payload.opening;
      const sub = document.querySelector('#opening .o-sub');
      const title = document.querySelector('#opening h1');
      const credit = document.querySelector('#opening .o-cred');
      const btn = document.getElementById('open-btn');
      if (sub && o.kicker) sub.textContent = o.kicker;
      if (title && o.titleHtml) title.innerHTML = o.titleHtml;
      if (credit && o.credit) credit.textContent = o.credit;
      if (btn && o.button) btn.textContent = o.button;
    }
    if (payload.finale?.button) {
      const enter = document.getElementById('enter');
      if (enter) enter.textContent = payload.finale.button;
    }
  };
  fetch('/api/gl/content/intro', { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : null))
    .then(apply)
    .catch(() => {});
})();
</script>`;
  if (!out.includes('loadGlIntroConfig')) {
    out = out.replace('</body>', `${configLoader}\n</body>`);
  }
  return out;
}

function extractScenesConfig(template) {
  const scenesMatch = template.match(/const SCENES\s*=\s*(\[[\s\S]*?\]);/);
  if (!scenesMatch) throw new Error('SCENES introuvable dans le template');
  // eslint-disable-next-line no-eval
  const scenes = eval(scenesMatch[1]);
  const opening = {
    kicker: 'une boîte vous a été confiée',
    titleHtml: 'Gnomes <span class="amp">&amp;</span> Licornes',
    credit: 'le carnet de Selene — recopié par le copiste',
    button: 'Ouvrir la boîte',
    foot: "jeu pédagogique d'écologie · cycle 3",
  };
  return {
    enabled: true,
    opening,
    finale: { button: 'Prends le crayon. Cours.' },
    audio: {
      loopKey: 'GL_intro_audio_loop',
      finalKey: 'GL_intro_audio_final',
    },
    scenes: scenes.map((scene) => ({
      id: scene.id,
      voice: scene.voice,
      kicker: scene.kicker,
      text: scene.text,
      imageKey: SCENE_IMAGE_KEYS[scene.id] || `GL_intro_${scene.id}`,
      hold: scene.hold,
      erase: !!scene.erase,
      finale: !!scene.finale,
      cta: !!scene.cta,
      kb: scene.kb || [0, 0],
      kb0: scene.kb0 || [0, 0],
    })),
  };
}

function main() {
  const { bundlePath, outDir } = parseArgs(process.argv);
  if (!fs.existsSync(bundlePath)) {
    console.error(`[gl-intro-debundle] Fichier introuvable : ${bundlePath}`);
    process.exit(1);
  }

  console.log(`[gl-intro-debundle] Lecture : ${bundlePath}`);
  const html = fs.readFileSync(bundlePath, 'utf8');
  const manifest = extractJsonScript(html, '__bundler/manifest');
  const extResources = extractJsonScript(html, '__bundler/ext_resources');
  let template = extractJsonScript(html, '__bundler/template');
  if (typeof template !== 'string') template = String(template);

  const assetsDir = path.join(outDir, 'assets');
  const imgDir = path.join(assetsDir, 'img');
  const audioDir = path.join(assetsDir, 'audio');
  const fontsDir = path.join(assetsDir, 'fonts');
  [imgDir, audioDir, fontsDir].forEach(ensureDir);

  const uuidToRel = {};
  const sceneUuidById = {};

  for (const entry of extResources) {
    const m = manifest[entry.uuid];
    if (!m) continue;
    const bytes = decodeManifestEntry(m);
    const ext = extFromMime(m.mime || entry.mime);
    let rel;
    const sceneId = Object.keys(SCENE_IMAGE_KEYS).find((id) => entry.id === id || entry.id.includes(id));
    if (m.mime && m.mime.startsWith('image/') && sceneId) {
      rel = `assets/img/${sceneId}.${ext}`;
    } else if (m.mime && m.mime.startsWith('audio/')) {
      const bytes = decodeManifestEntry(m);
      rel = bytes.length > 4000000 ? 'assets/audio/final.mp3' : 'assets/audio/loop.mp3';
    } else if (m.mime && (m.mime.includes('font') || ext === 'woff2')) {
      rel = `assets/fonts/${entry.uuid}.${ext}`;
    } else if (m.mime && m.mime.startsWith('image/')) {
      rel = `assets/img/${entry.id || entry.uuid}.${ext}`;
    } else {
      rel = `assets/${entry.id || entry.uuid}.${ext}`;
    }
    const abs = path.join(outDir, rel);
    writeFile(abs, bytes);
    uuidToRel[entry.uuid] = rel;
    if (sceneId) sceneUuidById[sceneId] = rel;
  }

  for (const uuid of Object.keys(manifest)) {
    if (uuidToRel[uuid]) continue;
    const m = manifest[uuid];
    const bytes = decodeManifestEntry(m);
    const ext = extFromMime(m.mime);
    let rel = `assets/${uuid}.${ext}`;
    if (m.mime && m.mime.startsWith('audio/mpeg')) {
      rel = bytes.length > 4000000 ? 'assets/audio/final.mp3' : 'assets/audio/loop.mp3';
    }
    writeFile(path.join(outDir, rel), bytes);
    uuidToRel[uuid] = rel;
  }

  let patchedTemplate = template;
  for (const [uuid, rel] of Object.entries(uuidToRel)) {
    patchedTemplate = patchedTemplate.split(uuid).join(rel);
  }

  patchedTemplate = patchedTemplate.replace(
    /const IMAGES = [\s\S]*?};/,
    `const IMAGES = {
  boite:"assets/img/boite.png", copiste:"assets/img/copiste.png", carnet:"assets/img/carnet.png",
  miroir:"assets/img/miroir.png", selene:"assets/img/selene.png", corbeau:"assets/img/corbeau.png",
  souffle:"assets/img/souffle.png", seuil:"assets/img/seuil.png", bienvenue:"assets/img/bienvenue.png",
};`
  );

  patchedTemplate = patchedTemplate.replace(
    /<audio id="aud-loop"[^>]*>/,
    '<audio id="aud-loop" src="assets/audio/loop.mp3" loop preload="auto">'
  );
  patchedTemplate = patchedTemplate.replace(
    /<audio id="aud-final"[^>]*>/,
    '<audio id="aud-final" src="assets/audio/final.mp3" preload="auto">'
  );

  patchedTemplate = patchedTemplate.replace(
    /function enterGame\(\)\{[\s\S]*?\n\}/,
    `function enterGame(){
  try { if (window.parent && window.parent !== window) window.parent.postMessage({type:'gl-intro-done'}, '*'); } catch(e){}
  if (window.self === window.top && GAME_URL) window.location.href = GAME_URL;
}`
  );
  patchedTemplate = patchedTemplate.replace(/#tweaks-root\{[^}]+\}\s*/g, '');

  patchedTemplate = patchIntroHtml(patchedTemplate);
  writeFile(path.join(outDir, 'index.html'), patchedTemplate);

  const config = extractScenesConfig(template);
  writeFile(DEFAULT_CONFIG, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

  console.log(`[gl-intro-debundle] HTML : ${path.join(outDir, 'index.html')}`);
  console.log(`[gl-intro-debundle] Config : ${DEFAULT_CONFIG}`);
  console.log(`[gl-intro-debundle] Assets : ${Object.keys(uuidToRel).length} fichiers`);
}

main();
