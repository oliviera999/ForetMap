export function buildJournalEmbedSnippet(type, ref) {
  const safeType = String(type || '').trim().toLowerCase();
  const safeRef = String(ref || '').trim().replace(/"/g, '');
  return `<aside class="gl-journal-embed" data-gl-embed-type="${safeType}" data-gl-ref="${safeRef}"></aside>`;
}

export const JOURNAL_EMBED_TYPE_LABELS = {
  spell: 'Sortilège',
  species: 'Espèce (biocénose)',
  glossary: 'Terme glossaire',
  chapter: 'Chapitre / scène',
  module_stub: 'Module (à venir)',
};
