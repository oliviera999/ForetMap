import { describe, it, expect } from 'vitest';
import {
  buildRecomputeBody,
  changedRows,
  describeSkipReason,
  formatRecomputeRow,
  summarizeRecompute,
} from '../../src/utils/progressionRecompute.js';

describe('buildRecomputeBody', () => {
  it('périmètre « tous » : ni group_id ni user_id', () => {
    expect(buildRecomputeBody()).toEqual({ scope: 'all', allow_demotion: false, dry_run: false });
  });

  it('périmètre groupe : porte group_id', () => {
    expect(buildRecomputeBody({ scope: 'group', groupId: 'g-1', dryRun: true })).toEqual({
      scope: 'group',
      group_id: 'g-1',
      allow_demotion: false,
      dry_run: true,
    });
  });

  it('périmètre compte : porte user_id et l’alignement strict', () => {
    expect(buildRecomputeBody({ scope: 'user', userId: 'u-9', allowDemotion: true })).toEqual({
      scope: 'user',
      user_id: 'u-9',
      allow_demotion: true,
      dry_run: false,
    });
  });
});

describe('summarizeRecompute', () => {
  it('périmètre vide', () => {
    expect(summarizeRecompute({ scanned: 0, changed: 0 })).toMatch(/Aucun compte/);
  });

  it('rien à changer', () => {
    expect(summarizeRecompute({ scanned: 12, changed: 0 })).toMatch(/déjà alignés/);
  });

  it('aperçu : annonce que rien n’est enregistré', () => {
    const text = summarizeRecompute({ scanned: 12, changed: 3, dryRun: true });
    expect(text).toMatch(/Aperçu/);
    expect(text).toMatch(/rien n’a encore été enregistré/i);
  });

  it('application : compte les profils mis à jour', () => {
    expect(summarizeRecompute({ scanned: 12, changed: 3 })).toBe(
      '3 profil(s) sur 12 mis à jour d’après les tâches validées.',
    );
  });
});

describe('formatRecomputeRow', () => {
  it('ligne modifiée : ancien → nouveau palier avec le compteur', () => {
    expect(
      formatRecomputeRow({
        displayName: 'Ada Lovelace',
        done: 60,
        changed: true,
        roleDisplayName: 'n3beur chevronné',
        previousRoleDisplayName: 'n3beur novice',
      }),
    ).toBe('Ada Lovelace — 60 tâches validées → n3beur chevronné (était n3beur novice)');
  });

  it('singulier pour une seule tâche', () => {
    expect(
      formatRecomputeRow({
        displayName: 'Bob',
        done: 1,
        changed: true,
        roleDisplayName: 'n3beur novice',
      }),
    ).toBe('Bob — 1 tâche validée → n3beur novice');
  });

  it('ligne inchangée : motif lisible', () => {
    expect(
      formatRecomputeRow({
        displayName: 'Chloé',
        done: 3,
        changed: false,
        reason: 'already_aligned',
      }),
    ).toBe('Chloé — 3 tâches validées — déjà au bon palier');
  });
});

describe('describeSkipReason', () => {
  it('motif connu', () => {
    expect(describeSkipReason('not_n3beur_member')).toMatch(/groupe n3beur/);
  });

  it('motif inconnu : libellé neutre', () => {
    expect(describeSkipReason('quelque_chose')).toBe('inchangé');
  });
});

describe('changedRows', () => {
  it('ne garde que les lignes modifiées, triées par nom', () => {
    const rows = changedRows({
      results: [
        { userId: '2', displayName: 'Zoé', changed: true },
        { userId: '1', displayName: 'Alice', changed: true },
        { userId: '3', displayName: 'Bob', changed: false },
      ],
    });
    expect(rows.map((r) => r.displayName)).toEqual(['Alice', 'Zoé']);
  });

  it('payload vide', () => {
    expect(changedRows(null)).toEqual([]);
  });
});
