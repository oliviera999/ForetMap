/**
 * Découpe les planches d'animation OLU (fond magenta) en trames PNG transparentes
 * de taille fixe, calées sur une ligne de sol commune.
 *
 * Voir docs/MASCOT_OLU_PLANCHES_SPRITES.md §5. Modèle : scripts/fox-backpack-extract-and-compose.cjs.
 *
 * Usage (racine dépôt) :
 *   node scripts/olu-sheets-cut.cjs --in <dossier-planches> --out public/assets/mascots/olu-planches/frames
 *   node scripts/olu-sheets-cut.cjs --in <dossier> --out <dossier> --contact <fichier.png>
 *
 * Le découpage se fait **par contenu** et non par grille : les modèles d'image alignent mal les
 * cases d'une bande. On isole les sujets par colonnes vides, ce qui tolère un espacement inégal.
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// ---------------------------------------------------------------------------
// Géométrie de sortie
// ---------------------------------------------------------------------------

const CELL = 256; // côté d'une trame finale (px)
const GROUND_Y = 242; // ligne de sol dans la trame : le bas du sujet posé s'y appuie
const TARGET_STANDING_H = 206; // hauteur visée d'OLU debout, identique sur toutes les planches
const SAFE_MARGIN = 4; // marge minimale gauche/droite

// ---------------------------------------------------------------------------
// Clé chromatique
// ---------------------------------------------------------------------------

// Le fond n'est PAS le #FF00FF demandé : les planches sortent autour de (247,6,233), et la
// valeur varie d'une planche à l'autre. On ne compare donc pas à une couleur de référence mais
// à un écart : « magenta » = le vert est très en dessous du minimum du rouge et du bleu.
// Sur la palette d'OLU (roux, crème, brun, kaki, sauge) cet écart est toujours négatif ;
// sur le fond il dépasse 200. Le seuil est donc très loin des deux populations.
const CHROMA_THRESHOLD = 60;

// Rognage du masque, en pixels source, pour supprimer le liseré magenta laissé par
// l'anticrénelage et par la compression JPEG. À ~500 px de côté source pour 256 px de sortie,
// deux pixels source valent un pixel de sortie : la silhouette ne maigrit pas visiblement.
const ERODE_PX = 2;

// Une composante isolée sous ce seuil (part de l'aire de la planche) est du parasite :
// l'éclat blanc que le générateur pose en bas à droite, un point de compression.
const MIN_COMPONENT_AREA_RATIO = 0.0012;

// ---------------------------------------------------------------------------
// Les planches
// ---------------------------------------------------------------------------

/**
 * `file` — nom du fichier source dans le dossier `--in`.
 * `state` — état du pack alimenté par la planche.
 * `frames` — nombre de sujets attendus ; un écart est une erreur, pas un avertissement.
 * `fps` — cadence de l'état.
 * `seated` — le sujet est assis : sa hauteur ne peut pas servir de référence d'échelle.
 * `also` — états supplémentaires servis par les mêmes trames (cadence propre).
 */
const SHEETS = [
  { file: 'idle.png', state: 'idle', frames: 4, fps: 4 },
  {
    file: 'walking.png',
    state: 'walking',
    frames: 6,
    fps: 10,
    also: [{ state: 'running', fps: 14 }],
  },
  { file: 'talk.png', state: 'talk', frames: 4, fps: 8 },
  { file: 'point.png', state: 'point', frames: 4, fps: 6 },
  { file: 'happy.png', state: 'happy', frames: 5, fps: 10 },
  { file: 'happy_jump.png', state: 'happy_jump', frames: 5, fps: 10 },
  { file: 'celebrate.jpg', state: 'celebrate', frames: 6, fps: 12 },
  { file: 'spin.jpg', state: 'spin', frames: 6, fps: 12 },
  {
    file: 'inspect.jpg',
    state: 'inspect',
    frames: 4,
    fps: 3,
    also: [{ state: 'map_read', fps: 3 }],
  },
  { file: 'search.jpg', state: 'search', frames: 5, fps: 6 },
  { file: 'wave.jpg', state: 'wave', frames: 6, fps: 8 },
  { file: 'alert.jpg', state: 'alert', frames: 3, fps: 11 },
  { file: 'surprise.jpg', state: 'surprise', frames: 3, fps: 9 },
  { file: 'sad.jpg', state: 'sad', frames: 4, fps: 4 },
  { file: 'love.jpg', state: 'love', frames: 4, fps: 6 },
  { file: 'angry.jpg', state: 'angry', frames: 4, fps: 8 },
  { file: 'sleep.jpg', state: 'sleep', frames: 4, fps: 3, seated: true },
  { file: 'eat.jpg', state: 'eat', frames: 5, fps: 6 },
  { file: 'dance.jpg', state: 'dance', frames: 6, fps: 10 },
];

// OLU assis occupe moins de hauteur que debout. Sans référence debout sur la planche `sleep`,
// on ne peut pas déduire son échelle de sa seule hauteur : elle est posée ici, en part de la
// hauteur debout. Vérifier le résultat sur la planche de contrôle (`--contact`).
const SEATED_HEIGHT_RATIO = 0.74;

// ---------------------------------------------------------------------------
// Traitement d'image
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = { in: null, out: null, contact: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--in') out.in = argv[++i];
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--contact') out.contact = argv[++i];
  }
  return out;
}

/** Masque binaire du sujet : 1 = personnage, 0 = fond magenta. */
function chromaMask(rgb, width, height) {
  const mask = new Uint8Array(width * height);
  for (let p = 0, i = 0; p < mask.length; p += 1, i += 3) {
    const r = rgb[i];
    const g = rgb[i + 1];
    const b = rgb[i + 2];
    mask[p] = Math.min(r, b) - g > CHROMA_THRESHOLD ? 0 : 1;
  }
  return mask;
}

/** Rogne le masque de `radius` pixels (distance de Chebyshev), en deux passes séparables. */
function erode(mask, width, height, radius) {
  if (radius <= 0) return mask;
  const tmp = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let keep = 1;
      for (let d = -radius; d <= radius && keep; d += 1) {
        const xx = x + d;
        if (xx < 0 || xx >= width || !mask[y * width + xx]) keep = 0;
      }
      tmp[y * width + x] = keep;
    }
  }
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let keep = 1;
      for (let d = -radius; d <= radius && keep; d += 1) {
        const yy = y + d;
        if (yy < 0 || yy >= height || !tmp[yy * width + x]) keep = 0;
      }
      out[y * width + x] = keep;
    }
  }
  return out;
}

/** Supprime les composantes connexes trop petites pour être le personnage. */
function dropSmallComponents(mask, width, height) {
  const seen = new Uint8Array(mask.length);
  const minArea = Math.round(width * height * MIN_COMPONENT_AREA_RATIO);
  const stack = new Int32Array(mask.length);
  let dropped = 0;
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    const members = [];
    while (top > 0) {
      const p = stack[--top];
      members.push(p);
      const x = p % width;
      const y = (p - x) / width;
      if (x > 0 && mask[p - 1] && !seen[p - 1]) ((seen[p - 1] = 1), (stack[top++] = p - 1));
      if (x < width - 1 && mask[p + 1] && !seen[p + 1]) ((seen[p + 1] = 1), (stack[top++] = p + 1));
      if (y > 0 && mask[p - width] && !seen[p - width])
        ((seen[p - width] = 1), (stack[top++] = p - width));
      if (y < height - 1 && mask[p + width] && !seen[p + width])
        ((seen[p + width] = 1), (stack[top++] = p + width));
    }
    if (members.length < minArea) {
      for (const p of members) mask[p] = 0;
      dropped += 1;
    }
  }
  return dropped;
}

/** Isole les sujets par plages de colonnes non vides. */
function columnRuns(mask, width, height) {
  const runs = [];
  let current = null;
  for (let x = 0; x < width; x += 1) {
    let filled = false;
    for (let y = 0; y < height; y += 1) {
      if (mask[y * width + x]) {
        filled = true;
        break;
      }
    }
    if (filled) {
      if (current) current.x1 = x;
      else current = { x0: x, x1: x };
    } else if (current) {
      runs.push(current);
      current = null;
    }
  }
  if (current) runs.push(current);
  return runs;
}

function boundingBox(mask, width, height, run) {
  let y0 = height;
  let y1 = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = run.x0; x <= run.x1; x += 1) {
      if (mask[y * width + x]) {
        if (y < y0) y0 = y;
        y1 = y;
        break;
      }
    }
  }
  return { x0: run.x0, x1: run.x1, y0, y1, w: run.x1 - run.x0 + 1, h: y1 - y0 + 1 };
}

async function cutSheet(sheet, inDir) {
  const src = path.join(inDir, sheet.file);
  if (!fs.existsSync(src)) throw new Error(`Planche absente : ${src}`);

  const { data, info } = await sharp(src)
    .flatten({ background: '#ffffff' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;

  let mask = chromaMask(data, width, height);
  mask = erode(mask, width, height, ERODE_PX);
  const dropped = dropSmallComponents(mask, width, height);

  const runs = columnRuns(mask, width, height);
  if (runs.length !== sheet.frames) {
    throw new Error(
      `${sheet.file} : ${runs.length} sujets isolés, ${sheet.frames} attendus ` +
        `(${runs.map((r) => `${r.x0}-${r.x1}`).join(' ')})`,
    );
  }

  const boxes = runs.map((r) => boundingBox(mask, width, height, r));

  // La ligne de sol de la planche, c'est le bas le plus bas de ses sujets : les trames où les
  // pieds décollent (saut, danse) gardent ainsi leur hauteur relative. Un calage individuel
  // ferait disparaître le saut.
  const groundSrc = Math.max(...boxes.map((b) => b.y1));

  // Échelle de la planche : chaque planche a été générée séparément, OLU n'y a donc pas la même
  // taille en pixels. On ramène la hauteur médiane à une hauteur commune.
  const heights = boxes.map((b) => b.h).sort((a, b) => a - b);
  const medianH = heights[Math.floor(heights.length / 2)];
  const targetH = sheet.seated ? TARGET_STANDING_H * SEATED_HEIGHT_RATIO : TARGET_STANDING_H;
  let scale = targetH / medianH;

  // Un sujet plus large que haut (marche de profil, sommeil assis) ne doit pas déborder.
  const maxW = Math.max(...boxes.map((b) => b.w));
  const maxScaleForWidth = (CELL - 2 * SAFE_MARGIN) / maxW;
  if (scale > maxScaleForWidth) scale = maxScaleForWidth;

  // Alpha à partir du masque rogné, sur les couleurs d'origine.
  const rgba = Buffer.alloc(width * height * 4);
  for (let p = 0, i = 0, j = 0; p < mask.length; p += 1, i += 3, j += 4) {
    rgba[j] = data[i];
    rgba[j + 1] = data[i + 1];
    rgba[j + 2] = data[i + 2];
    rgba[j + 3] = mask[p] ? 255 : 0;
  }
  const keyed = sharp(rgba, { raw: { width, height, channels: 4 } });

  const frames = [];
  for (let idx = 0; idx < boxes.length; idx += 1) {
    const b = boxes[idx];
    const outW = Math.max(1, Math.round(b.w * scale));
    const outH = Math.max(1, Math.round(b.h * scale));
    const subject = await keyed
      .clone()
      .extract({ left: b.x0, top: b.y0, width: b.w, height: b.h })
      .resize(outW, outH, { fit: 'fill', kernel: 'lanczos3' })
      .png()
      .toBuffer();

    // Hauteur du sujet au-dessus de la ligne de sol de sa planche, à l'échelle de sortie.
    const liftOut = Math.round((groundSrc - b.y1) * scale);
    const top = GROUND_Y - liftOut - outH;
    const left = Math.round((CELL - outW) / 2);

    const cell = await sharp({
      create: {
        width: CELL,
        height: CELL,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{ input: subject, left, top }])
      // Palette de 256 couleurs : ~3,4× plus léger que le PNG vraie couleur, sans différence
      // visible sur cet aplat cel-shaded (128 couleurs, en revanche, fait apparaître un
      // tramage sur le poitrail crème). Comparé image à image avant d'être retenu.
      .png({ palette: true, colours: 256, effort: 10, compressionLevel: 9 })
      .toBuffer();

    frames.push(cell);
  }

  return { frames, boxes, scale, medianH, groundSrc, dropped, width, height };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.in || !args.out) {
    console.error(
      'Usage: node scripts/olu-sheets-cut.cjs --in <planches> --out <frames> [--contact <png>]',
    );
    process.exit(1);
  }
  fs.mkdirSync(args.out, { recursive: true });

  const report = [];
  const contactRows = [];

  for (const sheet of SHEETS) {
    const cut = await cutSheet(sheet, args.in);
    const names = [];
    for (let i = 0; i < cut.frames.length; i += 1) {
      const name = `${sheet.state}-${i}.png`;
      fs.writeFileSync(path.join(args.out, name), cut.frames[i]);
      names.push(name);
    }
    report.push({
      state: sheet.state,
      also: (sheet.also || []).map((a) => a.state),
      files: names,
      fps: sheet.fps,
      frames: cut.frames.length,
      scale: Number(cut.scale.toFixed(3)),
      medianH: cut.medianH,
      dropped: cut.dropped,
      source: `${cut.width}x${cut.height}`,
    });
    console.log(
      `${sheet.state.padEnd(11)} ${cut.frames.length} trames  ` +
        `source ${cut.width}x${cut.height}  h~${cut.medianH}px  échelle ${cut.scale.toFixed(3)}` +
        (cut.dropped ? `  (${cut.dropped} parasite(s) retiré(s))` : ''),
    );

    if (args.contact) {
      const row = await sharp({
        create: {
          width: CELL * cut.frames.length,
          height: CELL,
          channels: 4,
          background: { r: 24, g: 24, b: 28, alpha: 255 },
        },
      })
        .composite(cut.frames.map((buf, i) => ({ input: buf, left: i * CELL, top: 0 })))
        .png()
        .toBuffer();
      contactRows.push({ row, width: CELL * cut.frames.length });
    }
  }

  if (args.contact) {
    const width = Math.max(...contactRows.map((r) => r.width));
    const height = CELL * contactRows.length;
    await sharp({
      create: { width, height, channels: 4, background: { r: 24, g: 24, b: 28, alpha: 255 } },
    })
      .composite(contactRows.map((r, i) => ({ input: r.row, left: 0, top: i * CELL })))
      .png()
      .toFile(args.contact);
    console.log(`\nPlanche de contrôle : ${args.contact}`);
  }

  fs.writeFileSync(
    path.join(args.out, '..', 'cut-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  const total = report.reduce((n, r) => n + r.frames, 0);
  console.log(`\n${report.length} planches, ${total} trames écrites dans ${args.out}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
