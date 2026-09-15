/**
 * Barre du fil du carnet : recherche plein texte, filtre par type, ordre chronologique.
 * Même balisage et mêmes libellés d'accessibilité pour ForetMap et G&L ; le produit ne
 * fournit que ses classes et le libellé de recherche.
 *
 * @param {object} props
 * @param {ReturnType<import('./useJournalFeed.js').useJournalFeed>} props.feed
 * @param {object} props.ui
 * @param {string} props.ui.classPrefix
 * @param {string} [props.ui.hintClassName]
 * @param {string} [props.ui.inputClassName]
 * @param {string} [props.ui.toolbarClassName]
 * @param {string} [props.searchLabel='Rechercher dans mon carnet']
 */
export function JournalFeedToolbar({ feed, ui, searchLabel = 'Rechercher dans mon carnet' }) {
  const p = ui.classPrefix;
  return (
    <div className={`${p}__toolbar ${ui.toolbarClassName || ''}`.trim()}>
      <input
        type="search"
        className={`${ui.inputClassName || ''} ${p}__search`.trim()}
        placeholder={`${searchLabel}…`}
        value={feed.search}
        onChange={(e) => feed.setSearch(e.target.value)}
        aria-label={searchLabel}
      />
      <label className={ui.hintClassName || ''}>
        Afficher :{' '}
        <select
          value={feed.kindFilter}
          onChange={(e) => feed.setKindFilter(e.target.value)}
          aria-label="Filtrer par type d’entrée"
        >
          <option value="all">Tout</option>
          <option value="article">Articles</option>
          <option value="import">Éléments appris</option>
        </select>
      </label>
      <label className={ui.hintClassName || ''}>
        Trier :{' '}
        <select
          value={feed.sortOrder}
          onChange={(e) => feed.setSortOrder(e.target.value)}
          aria-label="Trier le fil"
        >
          <option value="recent">Plus récent d’abord</option>
          <option value="oldest">Plus ancien d’abord</option>
        </select>
      </label>
    </div>
  );
}
