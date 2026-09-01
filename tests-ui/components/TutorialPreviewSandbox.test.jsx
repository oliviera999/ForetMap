// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

/**
 * C5 (audit stabilité/perf 2026-09) — bac à sable de l'aperçu tutoriel.
 *
 * Une fiche de NOTRE origine (assainie côté serveur) s'affiche sans `allow-scripts` :
 * la combinaison `allow-same-origin` + `allow-scripts` annulait le sandbox. Les clics
 * (auto-liens de glossaire, `target="_blank"`) sont interceptés par le PARENT. Un site
 * externe (`type = 'link'`) garde ses scripts : son origine propre l'isole déjà.
 */

vi.mock('../../src/services/api', () => ({
  api: vi.fn(async () => ({ items: [] })),
  API: '',
  getAuthToken: () => 'jeton-test',
  AccountDeletedError: class AccountDeletedError extends Error {},
}));

import {
  TutorialPreviewModal,
  isAppOriginPreviewSource,
} from '../../src/components/TutorialPreviewModal.jsx';

const APP_ORIGIN = window.location.origin;

function mountModal(tutorial) {
  return render(<TutorialPreviewModal tutorial={tutorial} onClose={() => {}} />);
}

function getFrame() {
  return screen.getByTitle(/Aperçu :/);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('isAppOriginPreviewSource', () => {
  it('reconnaît les chemins relatifs et les URL absolues de même origine', () => {
    expect(isAppOriginPreviewSource('/api/tutorials/4/view', APP_ORIGIN)).toBe(true);
    expect(isAppOriginPreviewSource(`${APP_ORIGIN}/tutos/fiche.pdf`, APP_ORIGIN)).toBe(true);
    expect(isAppOriginPreviewSource('https://exemple.org/fiche', APP_ORIGIN)).toBe(false);
    expect(isAppOriginPreviewSource('', APP_ORIGIN)).toBe(false);
  });
});

describe('TutorialPreviewModal — bac à sable', () => {
  it('fiche de notre origine : sandbox SANS allow-scripts', () => {
    mountModal({ id: 4, title: 'Haie', preview_url: '/api/tutorials/4/view' });
    const sandbox = getFrame().getAttribute('sandbox');
    expect(sandbox).toContain('allow-same-origin');
    expect(sandbox).not.toContain('allow-scripts');
    expect(sandbox).not.toContain('allow-forms');
  });

  it('site externe (type link) : les scripts restent permis (origine propre)', () => {
    mountModal({ id: 5, title: 'Externe', type: 'link', source_url: 'https://exemple.org/x' });
    const sandbox = getFrame().getAttribute('sandbox');
    expect(sandbox).toContain('allow-scripts');
  });

  it('clic sur un auto-lien de glossaire : le parent relaie le même message foretmap:glossary', () => {
    const postMessageSpy = vi.spyOn(window, 'postMessage');
    mountModal({ id: 4, title: 'Haie', preview_url: '/api/tutorials/4/view' });
    const frame = getFrame();
    const doc = frame.contentDocument;
    doc.open();
    doc.write(
      '<body><a href="#g" class="fm-glossary-inline-link" data-glossary-code="GL0007">bocage</a></body>',
    );
    doc.close();
    fireEvent.load(frame);
    const anchor = doc.querySelector('a');
    const notPrevented = anchor.dispatchEvent(
      new window.MouseEvent('click', { bubbles: true, cancelable: true }),
    );

    expect(notPrevented).toBe(false);
    expect(postMessageSpy).toHaveBeenCalledWith(
      { type: 'foretmap:glossary', code: 'GL0007' },
      window.location.origin,
    );
  });

  it('clic sur un lien target=_blank : intercepté (navigation ramenée dans l’iframe)', () => {
    mountModal({ id: 4, title: 'Haie', preview_url: '/api/tutorials/4/view' });
    const frame = getFrame();
    const doc = frame.contentDocument;
    doc.open();
    doc.write('<body><a href="#suite" target="_blank">suite</a></body>');
    doc.close();
    fireEvent.load(frame);
    const anchor = doc.querySelector('a');
    const notPrevented = anchor.dispatchEvent(
      new window.MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    expect(notPrevented).toBe(false);
  });

  it('un lien ordinaire n’est pas détourné', () => {
    mountModal({ id: 4, title: 'Haie', preview_url: '/api/tutorials/4/view' });
    const frame = getFrame();
    const doc = frame.contentDocument;
    doc.open();
    doc.write('<body><a href="#ancre">ancre locale</a></body>');
    doc.close();
    fireEvent.load(frame);
    const anchor = doc.querySelector('a');
    const notPrevented = anchor.dispatchEvent(
      new window.MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    expect(notPrevented).toBe(true);
  });
});
