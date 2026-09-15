import { describe, test, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import {
  parseJournalEmbeds,
  hydrateJournalEmbedTitles,
  hydrateJournalEmbedCards,
  useJournalEmbedTitles,
} from '../../../src/shared/journal/useJournalEmbedTitles.js';

const FM = '<aside class="journal-embed" data-embed-type="plant" data-ref="12"></aside>';
const GL =
  '<aside class="gl-journal-embed" data-gl-embed-type="spell" data-gl-ref="SL001"></aside>';

describe('useJournalEmbedTitles — les deux dialectes d’encart, un seul hook', () => {
  test('parse les deux dialectes et dédoublonne', () => {
    expect(parseJournalEmbeds(`${FM}${GL}${FM}`)).toEqual([
      { type: 'plant', ref: '12' },
      { type: 'spell', ref: 'SL001' },
    ]);
    expect(parseJournalEmbeds('')).toEqual([]);
  });

  test('hydrate chaque dialecte avec SON attribut de titre', () => {
    const out = hydrateJournalEmbedTitles(`${FM}${GL}`, {
      'plant|12': 'Noisetier',
      'spell|SL001': 'Flamme',
    });
    expect(out).toContain('data-journal-title="Noisetier"');
    expect(out).toContain('data-gl-title="Flamme"');
    expect(out).not.toContain(
      'class="journal-embed" data-embed-type="plant" data-ref="12" data-gl-title',
    );
  });

  test('sans titre résolu, renvoie le HTML d’origine (même référence)', () => {
    expect(hydrateJournalEmbedTitles(FM, {})).toBe(FM);
    expect(hydrateJournalEmbedTitles(FM, { 'plant|99': 'Autre' })).toBe(FM);
  });

  test('le hook appelle le résolveur produit puis hydrate ; sans encart, aucun appel', async () => {
    const resolve = vi.fn().mockResolvedValue({ titles: { 'plant|12': 'Noisetier' } });
    const { result } = renderHook(() => useJournalEmbedTitles(FM, resolve));
    expect(result.current).toBe(FM);
    await waitFor(() => expect(result.current).toContain('data-journal-title="Noisetier"'));
    expect(resolve).toHaveBeenCalledWith([{ type: 'plant', ref: '12' }]);

    const none = vi.fn();
    const { result: r2 } = renderHook(() => useJournalEmbedTitles('<p>Bonjour</p>', none));
    expect(r2.current).toBe('<p>Bonjour</p>');
    expect(none).not.toHaveBeenCalled();
  });

  test('erreur du résolveur : HTML d’origine conservé', async () => {
    const resolve = vi.fn().mockRejectedValue(new Error('panne'));
    const { result } = renderHook(() => useJournalEmbedTitles(GL, resolve));
    await waitFor(() => expect(resolve).toHaveBeenCalled());
    expect(result.current).toBe(GL);
  });

  test('hydrateJournalEmbedCards remplit une planche (titre + extrait)', () => {
    const out = hydrateJournalEmbedCards(FM, {
      'plant|12': {
        title: 'Noisetier',
        label: 'Espèce',
        excerpt: 'Arbuste des haies',
        imageUrl: null,
      },
    });
    expect(out).toContain('data-journal-title="Noisetier"');
    expect(out).toContain('journal-embed--plate');
    expect(out).toContain('Arbuste des haies');
    expect(out).toContain('Espèce');
  });

  test('le hook préfère les cards enrichies', async () => {
    const resolve = vi.fn().mockResolvedValue({
      titles: { 'plant|12': 'Noisetier' },
      cards: {
        'plant|12': { title: 'Noisetier', label: 'Espèce', excerpt: 'Haie', imageUrl: null },
      },
    });
    const { result } = renderHook(() => useJournalEmbedTitles(FM, resolve));
    await waitFor(() => expect(result.current).toContain('journal-embed--plate'));
    expect(result.current).toContain('Haie');
  });
});
