import { DataList } from '../../../shared/ui/DataList.jsx';

/** Classes G&L historiques, posées en plus des classes neutres du composant partagé. */
const GL_DATA_LIST_CLASS_NAMES = Object.freeze({
  root: 'gl-data-list',
  desktop: 'gl-admin-table-wrap gl-data-list__desktop',
  table: 'gl-admin-table gl-data-table',
  mobile: 'gl-data-list__mobile',
  card: 'gl-data-card',
});

/**
 * Liste de données G&L — enveloppe du composant partagé `DataList` (lot 3) : même API
 * (`columns`, `rows`, `emptyLabel`), classes `gl-data-*` conservées pour le thème.
 */
export function GLDataList(props) {
  return <DataList {...props} classNames={GL_DATA_LIST_CLASS_NAMES} />;
}
