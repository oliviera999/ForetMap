/** Mode édition plateau (?editPlateau=1, ?editFeuilletZones=1 ou VITE_GL_EDIT_FEUILLET_ZONES). */
export function isFeuilletZoneEditMode() {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GL_EDIT_FEUILLET_ZONES === '1') {
    return true;
  }
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    if (params.get('editPlateau') === '1') return true;
    if (params.get('editFeuilletZones') === '1') return true;
  }
  return false;
}
