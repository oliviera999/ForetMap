import React, { useEffect, useMemo, useState } from 'react';
import { apiGL } from '../../services/apiGL.js';
import { GLSelect } from '../ui/GLSelect.jsx';
import { GLInput } from '../ui/GLInput.jsx';

/**
 * Sélecteur d'espèce pour l'association d'un feuillet (canal « espece »).
 * Remplace la saisie manuelle de `lien_canal` + `lien_ref` : on choisit l'espèce
 * dans une liste (scopée au biome du feuillet) et le composant renseigne les deux
 * champs d'un coup. Un repli « référence manuelle » couvre les autres canaux
 * (pays, etc.) ou l'absence de biome.
 *
 * @param {string} biomeSlug biome du feuillet (les espèces GL sont scopées par biome)
 * @param {string} canal valeur courante de `lien_canal`
 * @param {string} reference valeur courante de `lien_ref`
 * @param {(next: { canal: string, ref: string }) => void} onChange
 */
export function GLFeuilletSpeciesPicker({ biomeSlug, canal, reference, onChange }) {
  const [species, setSpecies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [manual, setManual] = useState(false);

  const isSpeciesCanal = (canal || '').trim().toLowerCase() === 'espece';

  useEffect(() => {
    let cancelled = false;
    const slug = (biomeSlug || '').trim();
    if (!slug) {
      setSpecies([]);
      setLoadError('');
      return undefined;
    }
    setLoading(true);
    setLoadError('');
    apiGL(`/api/gl/species?biomeSlug=${encodeURIComponent(slug)}`)
      .then((res) => {
        if (cancelled) return;
        setSpecies(Array.isArray(res?.items) ? res.items : []);
      })
      .catch((err) => {
        if (cancelled) return;
        setSpecies([]);
        setLoadError(err.message || 'Espèces indisponibles');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [biomeSlug]);

  const currentCode = isSpeciesCanal ? (reference || '').trim() : '';
  const knownCurrent = useMemo(
    () => species.some((s) => (s.species_code || '') === currentCode),
    [species, currentCode],
  );

  function selectSpecies(code) {
    if (!code) {
      onChange({ canal: '', ref: '' });
      return;
    }
    onChange({ canal: 'espece', ref: code });
  }

  // Repli manuel : aucun biome, chargement en échec, ou canal ≠ espèce à préserver.
  const showManual = manual || !biomeSlug || (!!canal && !isSpeciesCanal);

  return (
    <div className="gl-feuillet-species-picker">
      {biomeSlug && !showManual ? (
        <>
          <GLSelect
            value={currentCode}
            disabled={loading}
            aria-label="Espèce liée"
            onChange={(e) => selectSpecies(e.target.value)}
          >
            <option value="">— Aucune espèce liée —</option>
            {currentCode && !knownCurrent ? (
              <option value={currentCode}>{currentCode} (hors biome courant)</option>
            ) : null}
            {species.map((s) => (
              <option key={s.species_code} value={s.species_code}>
                {(s.nom_commun || s.nom_scientifique || s.species_code) + ` (${s.species_code})`}
              </option>
            ))}
          </GLSelect>
          <div className="gl-feuillet-species-picker__meta">
            {loading ? <span className="gl-hint">Chargement des espèces…</span> : null}
            {loadError ? <span className="gl-error">{loadError}</span> : null}
            <button type="button" className="gl-linklike" onClick={() => setManual(true)}>
              Référence manuelle
            </button>
          </div>
        </>
      ) : (
        <div className="gl-feuillet-species-picker__manual">
          <GLInput
            aria-label="Canal du lien"
            placeholder="Canal (ex : espece, pays)"
            value={canal || ''}
            onChange={(e) => onChange({ canal: e.target.value, ref: reference || '' })}
          />
          <GLInput
            aria-label="Référence du lien"
            placeholder="Référence (ex : SP0001)"
            value={reference || ''}
            onChange={(e) => onChange({ canal: canal || '', ref: e.target.value })}
          />
          {biomeSlug ? (
            <button type="button" className="gl-linklike" onClick={() => setManual(false)}>
              Choisir dans la liste
            </button>
          ) : (
            <span className="gl-hint">Renseignez un biome pour lister les espèces.</span>
          )}
        </div>
      )}
    </div>
  );
}
