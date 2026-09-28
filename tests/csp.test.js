'use strict';

require('./helpers/setup');
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const {
  CSP_REPORT_PATH,
  TUTORIAL_VIEW_SCRIPT_HASHES,
  inlineScriptHash,
  buildEnforcedPolicy,
  buildTutorialViewPolicy,
  buildGlIntroPolicy,
  resolveCspVariant,
} = require('../lib/csp');
const { injectTutorialViewIframeLinkScript } = require('../lib/tutorialRouteHelpers');
const { injectGlossaryAutolinkScript } = require('../lib/foretmapGlossaryAutolink');
const {
  WINDOW_MS,
  MAX_KEYS,
  normalizeReport,
  recordViolation,
  resetCspReportState,
  getCspReportState,
} = require('../lib/cspReport');

function directives(policy) {
  return new Map(
    policy
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const [name, ...values] = d.split(/\s+/);
        return [name, values];
      }),
  );
}

describe('CSP — politique', () => {
  it('la politique imposée ferme les vecteurs principaux', () => {
    const d = directives(buildEnforcedPolicy());
    assert.deepStrictEqual(d.get('default-src'), ["'self'"]);
    assert.deepStrictEqual(d.get('object-src'), ["'none'"], 'aucun plugin');
    assert.deepStrictEqual(d.get('base-uri'), ["'self'"], 'pas de réécriture de <base>');
    assert.deepStrictEqual(d.get('form-action'), ["'self'"], 'pas de post vers un tiers');
    assert.deepStrictEqual(d.get('frame-ancestors'), ["'self'"], 'pas de clickjacking');
  });

  it("script-src n'autorise ni inline ni eval, mais autorise le WebAssembly de Rive", () => {
    const script = directives(buildEnforcedPolicy()).get('script-src');
    assert.ok(script.includes("'self'"));
    assert.ok(
      script.includes("'wasm-unsafe-eval'"),
      'Rive compile du WebAssembly ; sans cette source il ne démarre pas',
    );
    assert.ok(!script.includes("'unsafe-inline'"), 'aucun script inline dans le build');
    assert.ok(!script.includes("'unsafe-eval'"), "'unsafe-eval' rendrait la politique inutile");
  });

  it('aucun CDN tiers : le runtime Rive est servi depuis notre origine', () => {
    // `src/utils/riveRuntime.js` remplace les URL unpkg/jsdelivr par défaut. Si cette
    // substitution disparaissait, la politique le bloquerait — d'où ce test qui
    // fige l'intention.
    const policy = buildEnforcedPolicy();
    assert.ok(!policy.includes('unpkg.com'), 'unpkg ne doit pas être nécessaire');
    assert.ok(!policy.includes('jsdelivr'), 'jsdelivr ne doit pas être nécessaire');
  });

  it('frame-src autorise https : un tutoriel « lien » embarque une URL externe', () => {
    // `TutorialPreviewModal` affiche `tutorial.source_url`, saisie par un professeur.
    // Restreindre à 'self' casserait la fonctionnalité — d'où l'exception, documentée.
    const frame = directives(buildEnforcedPolicy()).get('frame-src');
    assert.ok(frame.includes("'self'"));
    assert.ok(frame.includes('https:'));
  });

  it('le report-uri pointe vers le collecteur monté', () => {
    assert.ok(buildEnforcedPolicy().includes(`report-uri ${CSP_REPORT_PATH}`));
  });
});

describe('CSP — exceptions par route', () => {
  it('la vue tutoriel autorise ses deux scripts serveur par empreinte, rien de plus', () => {
    const script = directives(buildTutorialViewPolicy()).get('script-src');
    assert.deepStrictEqual(
      script.filter((s) => s.startsWith("'sha256-")),
      [...TUTORIAL_VIEW_SCRIPT_HASHES],
    );
    assert.strictEqual(TUTORIAL_VIEW_SCRIPT_HASHES.length, 2);
    assert.ok(!script.includes("'unsafe-inline'"), 'un script du contenu reste bloqué');
  });

  it('les empreintes correspondent aux scripts réellement injectés', () => {
    const html = injectGlossaryAutolinkScript(
      injectTutorialViewIframeLinkScript('<html><head></head><body><p>x</p></body></html>'),
    );
    const bodies = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    assert.strictEqual(bodies.length, 2);
    for (const body of bodies) {
      assert.ok(TUTORIAL_VIEW_SCRIPT_HASHES.includes(inlineScriptHash(body)));
    }
  });

  it("seule l'intro GL reçoit 'unsafe-inline' pour les scripts", () => {
    const script = directives(buildGlIntroPolicy()).get('script-src');
    assert.ok(script.includes("'unsafe-inline'"));
    assert.ok(!script.includes("'unsafe-eval'"));
  });

  it('le chemin choisit la variante', () => {
    assert.strictEqual(resolveCspVariant('/api/tutorials/12/view'), 'tutorialView');
    assert.strictEqual(resolveCspVariant('/api/tutorials/12/download/html'), 'default');
    assert.strictEqual(resolveCspVariant('/gl/intro/index.html'), 'glIntro');
    assert.strictEqual(resolveCspVariant('/gl/introuvable'), 'default');
    assert.strictEqual(resolveCspVariant('/'), 'default');
  });
});

describe('CSP — en-têtes servis', () => {
  it('la politique complète est imposée, sans en-tête Report-Only', async () => {
    const res = await request(app).get('/api/health');
    const policy = res.headers['content-security-policy'];
    assert.match(policy, /default-src 'self'/);
    assert.match(policy, /script-src 'self' 'wasm-unsafe-eval'(;|$)/);
    assert.strictEqual(res.headers['content-security-policy-report-only'], undefined);
  });

  it("l'intro GL reçoit sa politique dédiée", async () => {
    const res = await request(app).get('/gl/intro/index.html');
    assert.match(res.headers['content-security-policy'], /script-src [^;]*'unsafe-inline'/);
  });
});

describe('CSP — collecteur de signalements', () => {
  beforeEach(() => resetCspReportState());

  it('accepte le format csp-report et répond 204', async () => {
    await request(app)
      .post(CSP_REPORT_PATH)
      .set('Content-Type', 'application/csp-report')
      .send(
        JSON.stringify({
          'csp-report': {
            'document-uri': 'https://foretmap.example/app',
            'effective-directive': 'script-src',
            'blocked-uri': 'https://tiers.example/x.js',
          },
        }),
      )
      .expect(204);
    const state = getCspReportState();
    assert.strictEqual(state.distinctSignatures, 1);
    assert.match(state.entries[0].signature, /^script-src ← https:\/\/tiers\.example$/);
  });

  it('accepte aussi le format Reporting API (tableau)', async () => {
    await request(app)
      .post(CSP_REPORT_PATH)
      .set('Content-Type', 'application/reports+json')
      .send(
        JSON.stringify([
          {
            body: {
              documentURL: 'https://foretmap.example/app',
              effectiveDirective: 'style-src',
              blockedURL: 'https://tiers.example/a.css',
            },
          },
        ]),
      )
      .expect(204);
    assert.strictEqual(getCspReportState().distinctSignatures, 1);
  });

  it('un corps illisible ne fait pas échouer la requête', async () => {
    await request(app)
      .post(CSP_REPORT_PATH)
      .set('Content-Type', 'application/csp-report')
      .send('{"pas":"un signalement"}')
      .expect(204);
    assert.strictEqual(getCspReportState().distinctSignatures, 0);
  });

  it('un corps surdimensionné est refusé, y compris en application/json', async () => {
    // Régression : le collecteur doit être monté **avant** `express.json({ limit: '25mb' })`.
    // Monté après, un signalement en `application/json` aurait été lu par le parseur général —
    // soit 25 Mo acceptés sans authentification là où 16 ko suffisent.
    const gros = JSON.stringify({
      'csp-report': {
        'document-uri': 'https://a.example/p',
        'effective-directive': 'img-src',
        'blocked-uri': `https://b.example/${'x'.repeat(40_000)}.png`,
      },
    });
    const res = await request(app)
      .post(CSP_REPORT_PATH)
      .set('Content-Type', 'application/json')
      .send(gros);
    assert.strictEqual(res.status, 413, 'le corps doit être borné, pas absorbé');
    assert.strictEqual(getCspReportState().distinctSignatures, 0);
  });

  it('les répétitions sont regroupées, pas réécrites', () => {
    const r = normalizeReport({
      'csp-report': {
        'document-uri': 'https://a.example/p',
        'effective-directive': 'img-src',
        'blocked-uri': 'https://b.example/1.png',
      },
    });
    for (let i = 0; i < 500; i += 1) recordViolation(r);
    const state = getCspReportState();
    assert.strictEqual(state.distinctSignatures, 1, 'une seule signature');
    assert.strictEqual(state.entries[0].count, 500, 'le compteur porte le volume');
  });

  it('le chemin distingue mal une violation : seule l’origine compte', () => {
    const base = { 'document-uri': 'https://a.example/p', 'effective-directive': 'img-src' };
    recordViolation(
      normalizeReport({ 'csp-report': { ...base, 'blocked-uri': 'https://b.example/1.png' } }),
    );
    recordViolation(
      normalizeReport({ 'csp-report': { ...base, 'blocked-uri': 'https://b.example/2.png' } }),
    );
    assert.strictEqual(getCspReportState().distinctSignatures, 1);
  });

  it('le nombre de signatures suivies est plafonné', () => {
    for (let i = 0; i < MAX_KEYS + 25; i += 1) {
      recordViolation(
        normalizeReport({
          'csp-report': {
            'document-uri': 'https://a.example/p',
            'effective-directive': 'img-src',
            'blocked-uri': `https://h${i}.example/x.png`,
          },
        }),
      );
    }
    const state = getCspReportState();
    assert.strictEqual(state.distinctSignatures, MAX_KEYS, 'la table ne croît pas sans borne');
    assert.strictEqual(state.droppedSignatures, 25, 'le surplus est compté, pas stocké');
  });

  it('la fenêtre écoulée vide les compteurs', () => {
    const t0 = Date.now();
    const r = normalizeReport({
      'csp-report': {
        'document-uri': 'https://a.example/p',
        'effective-directive': 'img-src',
        'blocked-uri': 'https://b.example/1.png',
      },
    });
    recordViolation(r, t0);
    assert.strictEqual(getCspReportState().distinctSignatures, 1);
    recordViolation(r, t0 + WINDOW_MS + 1);
    assert.strictEqual(
      getCspReportState().entries[0].count,
      1,
      'après la fenêtre, on repart du nouveau signalement',
    );
  });

  it('une valeur spéciale de la spécification est conservée telle quelle', () => {
    // `blocked-uri` vaut parfois `inline`, `eval` ou `data` — pas une URL.
    const r = normalizeReport({
      'csp-report': {
        'document-uri': 'https://a.example/p',
        'effective-directive': 'script-src-elem',
        'blocked-uri': 'inline',
      },
    });
    assert.strictEqual(r.blockedOrigin, 'inline');
  });
});
