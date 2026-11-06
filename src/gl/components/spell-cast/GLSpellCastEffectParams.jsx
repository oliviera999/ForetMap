import { GLButton } from '../ui/GLButton.jsx';

export const FENETRE_LABELS = Object.freeze({
  avant_jet: 'avant le jet',
  apres_jet: 'après le jet',
  jeu: 'phase jeu',
  jeu_avant_fouille: 'phase jeu, avant une fouille',
  avant_jets_pacte: 'avant les jets des deux équipes',
  activite: 'pendant l’activité (file du prof)',
  seuil: 'au seuil',
  seuil_veillee: 'au seuil ou en veillée',
  fin_seance: 'fin de séance',
  trimestre_3: 'troisième trimestre',
});

export function limiteLabel(limite) {
  if (!limite) return '';
  const par =
    {
      tour: 'tour',
      seance: 'séance',
      chapitre: 'chapitre',
      trimestre: 'trimestre',
      annee: 'année',
    }[limite.par] || limite.par;
  const portee =
    { equipe: 'équipe', partie: 'partie', eleve: 'élève' }[limite.portee] || limite.portee;
  return `${limite.n}/${par}/${portee}`;
}

/** Paramètres que l'assistant doit demander pour ce sort v2 (déduits de `cible`, `ressource`, `peuple`). */
export function neededParams(spell) {
  if (!spell?.tenir_v2 && !spell?.tenirV2) return [];
  const out = [];
  const cible = String(spell.cible || '');
  const code = String(spell.spell_code || spell.spellCode || '');
  if (String(spell.ressource) === 'choix') out.push('ressource');
  if (String(spell.peuple) === 'pacte') out.push('partenaire');
  if (cible === 'autre_equipe') out.push('cible');
  if (code === 'SL002') out.push('delta');
  if (cible === 'zone_palie') out.push('zoneKey');
  if (cible === 'eleve' && code === 'SL033') out.push('heritage');
  return out;
}

/**
 * Formulaire des paramètres d'un sort v2 : sens de Progression, équipe cible, partenaire du
 * pacte, ressource au choix, page pâlie (Nommer), bénéficiaire (Héritage).
 */
export function GLSpellCastEffectParams({
  spell,
  teams = [],
  teamId,
  teamType = null,
  roster = [],
  pagesPalies = [],
  value,
  onChange,
  onSubmit,
  busy = false,
}) {
  const needs = neededParams(spell);
  const others = teams.filter((t) => Number(t.id) !== Number(teamId));
  const otherPeople = others.filter((t) => (teamType ? t.type !== teamType : true));
  const set = (k, v) => onChange?.({ ...(value || {}), [k]: v });
  const v = value || {};
  const ready =
    (!needs.includes('ressource') || v.ressource) &&
    (!needs.includes('partenaire') || v.partnerTeamId) &&
    (!needs.includes('cible') || v.targetTeamId) &&
    (!needs.includes('delta') || v.delta === 1 || v.delta === -1) &&
    (!needs.includes('zoneKey') || v.zoneKey) &&
    (!needs.includes('heritage') || (v.beneficiairePlayerId && v.heritageRessource));
  return (
    <div className="gl-spell-cast-panel__body" data-testid="gl-spell-cast-params">
      {spell?.fenetre ? (
        <p className="gl-hint">Fenêtre : {FENETRE_LABELS[spell.fenetre] || spell.fenetre}</p>
      ) : null}
      {spell?.limite ? <p className="gl-hint">Limite : {limiteLabel(spell.limite)}</p> : null}
      {needs.includes('ressource') ? (
        <label className="gl-field">
          Payer en
          <select value={v.ressource || ''} onChange={(e) => set('ressource', e.target.value)}>
            <option value="">—</option>
            <option value="coeurs">cœurs ❤️</option>
            <option value="gemmes">gemmes 💎</option>
          </select>
        </label>
      ) : null}
      {needs.includes('delta') ? (
        <fieldset className="gl-field">
          <legend>Sens</legend>
          <label>
            <input
              type="radio"
              name="delta"
              checked={v.delta === 1}
              onChange={() => set('delta', 1)}
            />{' '}
            +1 case
          </label>{' '}
          <label>
            <input
              type="radio"
              name="delta"
              checked={v.delta === -1}
              onChange={() => set('delta', -1)}
            />{' '}
            −1 case
          </label>
        </fieldset>
      ) : null}
      {needs.includes('cible') ? (
        <label className="gl-field">
          Équipe visée
          <select
            value={v.targetTeamId || ''}
            onChange={(e) => set('targetTeamId', Number(e.target.value) || null)}
          >
            <option value="">—</option>
            {others.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {needs.includes('partenaire') ? (
        <label className="gl-field">
          Équipe partenaire (l’autre peuple)
          <select
            value={v.partnerTeamId || ''}
            onChange={(e) => set('partnerTeamId', Number(e.target.value) || null)}
          >
            <option value="">—</option>
            {otherPeople.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {needs.includes('zoneKey') ? (
        <label className="gl-field">
          Page pâlie à nommer
          <select value={v.zoneKey || ''} onChange={(e) => set('zoneKey', e.target.value)}>
            <option value="">—</option>
            {pagesPalies.map((p) => (
              <option key={p.zoneKey} value={p.zoneKey}>
                {p.titre || p.indice}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {needs.includes('heritage') ? (
        <>
          <label className="gl-field">
            Lègue à
            <select
              value={v.beneficiairePlayerId || ''}
              onChange={(e) => set('beneficiairePlayerId', Number(e.target.value) || null)}
            >
              <option value="">—</option>
              {roster.map((r) => (
                <option key={r.playerId} value={r.playerId}>
                  {r.pseudo || `${r.firstName || ''} ${r.lastName || ''}`.trim()}
                </option>
              ))}
            </select>
          </label>
          <label className="gl-field">
            Ressource léguée
            <select
              value={v.heritageRessource || ''}
              onChange={(e) => set('heritageRessource', e.target.value)}
            >
              <option value="">—</option>
              <option value="coeurs">cœurs ❤️</option>
              <option value="gemmes">gemmes 💎</option>
            </select>
          </label>
        </>
      ) : null}
      <GLButton
        type="button"
        variant="primary"
        disabled={!ready || busy}
        onClick={() => onSubmit?.(v)}
      >
        Continuer
      </GLButton>
    </div>
  );
}

/** Corps de brouillon (`startDraft`) à partir des paramètres saisis. */
export function buildDraftOptions(params = {}) {
  const effectParams = {};
  if (params.delta === 1 || params.delta === -1) effectParams.delta = params.delta;
  if (params.targetTeamId) effectParams.targetTeamId = Number(params.targetTeamId);
  if (params.zoneKey) effectParams.zoneKey = String(params.zoneKey);
  if (params.beneficiairePlayerId) {
    effectParams.beneficiairePlayerId = Number(params.beneficiairePlayerId);
    effectParams.ressource = params.heritageRessource || 'coeurs';
  }
  return {
    ressource: params.ressource || undefined,
    partnerTeamId: params.partnerTeamId || undefined,
    effectParams: Object.keys(effectParams).length ? effectParams : undefined,
  };
}
