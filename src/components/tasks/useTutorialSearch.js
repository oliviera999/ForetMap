import { useMemo, useState } from 'react';

/**
 * Recherche de tutoriels partagée par `TaskFormModal` et `TaskProjectFormModal`
 * (audit 2026-07, P1) : tri alphabétique fr du catalogue + filtrage insensible
 * à la casse sur le titre. L'état de recherche vit dans le hook (réinitialisé
 * au montage du formulaire, les modales étant montées/démontées à chaque ouverture).
 */
export function useTutorialSearch(tutorials) {
  const [search, setSearch] = useState('');
  const searchableTutorials = useMemo(
    () =>
      [...tutorials].sort((a, b) =>
        String(a.title || '').localeCompare(String(b.title || ''), 'fr'),
      ),
    [tutorials],
  );
  const filteredTutorials = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return searchableTutorials;
    return searchableTutorials.filter((t) =>
      String(t.title || '')
        .toLowerCase()
        .includes(q),
    );
  }, [searchableTutorials, search]);
  return { search, setSearch, filteredTutorials };
}
