'use strict';

// Lien direct `?seance=slug` (src/utils, ESM importé dynamiquement).

const { test } = require('node:test');
const assert = require('node:assert/strict');

function fakeWindow(href) {
  const store = new Map();
  const url = new URL(href);
  const win = {
    location: { href: url.href, search: url.search },
    history: {
      state: null,
      replaceState(_s, _t, next) {
        win.replacedWith = next;
      },
    },
    sessionStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
  };
  return win;
}

test('readSessionSlugFromSearch / buildSessionShareUrl', async () => {
  const { readSessionSlugFromSearch, buildSessionShareUrl } =
    await import('../src/utils/pedagoSessionLink.js');
  assert.equal(readSessionSlugFromSearch('?seance=Lycee-Classer'), 'lycee-classer');
  assert.equal(readSessionSlugFromSearch('?seance=<script>'), null);
  assert.equal(readSessionSlugFromSearch(''), null);
  assert.equal(
    buildSessionShareUrl('https://foret.example/', 'college-qui-mange-qui'),
    'https://foret.example/?seance=college-qui-mange-qui',
  );
});

test('consumeSessionLinkFromLocation : met de côté puis retire le paramètre', async () => {
  const { consumeSessionLinkFromLocation, clearPendingSessionLink } =
    await import('../src/utils/pedagoSessionLink.js');
  const win = fakeWindow('https://foret.example/app?seance=demo-seance&tab=map#x');
  assert.equal(consumeSessionLinkFromLocation(win), 'demo-seance');
  assert.equal(win.replacedWith, '/app?tab=map#x');

  const after = fakeWindow('https://foret.example/app');
  after.sessionStorage.setItem('foretmap.pendingSeance.v1', 'demo-seance');
  assert.equal(consumeSessionLinkFromLocation(after), 'demo-seance');
  clearPendingSessionLink(after);
  assert.equal(consumeSessionLinkFromLocation(after), null);
  assert.equal(consumeSessionLinkFromLocation(null), null);
});
