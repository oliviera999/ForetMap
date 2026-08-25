import React, { useCallback, useEffect, useMemo, useState } from 'react';
import VisitMapMascotRenderer from '../VisitMapMascotRenderer.jsx';
import { VISIT_MASCOT_STATE } from '../../utils/visitMascotState.js';
import { parseVisitMascotAllowedIds } from '../../utils/visitViewStatus.js';
import { isMascotProposed, toggleProposedMascotId } from '../../utils/visitMascotAdminSelection.js';
import { api } from '../../services/api';
import { downloadApiFile } from '../../utils/downloadApiFile.js';

const ALLOWED_KEY = 'ui.visit.mascot.allowed_ids';

/**
 * Onglet **Mascottes livrées** du studio : les mascottes du catalogue, gérées là où on les
 * cherche plutôt que dispersées entre deux écrans.
 *
 * Trois constats ont motivé cet onglet.
 *
 * 1. **Douze des seize mascottes livrées n'ont pas d'animation propre.** Leur modèle fait pointer
 *    les vingt et un états sur la même image. Les proposer sans le dire promet une animation qui
 *    n'existe pas ; le badge le dit, et le serveur le **mesure** (`has_real_animation`).
 * 2. **Exporter demandait de cloner d'abord** — créer un pack pour le jeter aussitôt. L'export
 *    part maintenant du modèle lui-même.
 * 3. **Masquer une mascotte existait déjà**, mais dans Paramètres → Mascottes de visite. La même
 *    donnée (`ui.visit.mascot.allowed_ids`) est éditée ici : un seul réglage, deux endroits où
 *    le voir. On n'a pas dupliqué la mécanique.
 *
 * La case de visibilité écrit un réglage d'administration (`admin.settings.write`) alors que le
 * studio tourne sous `visit.manage`. Elle est donc **désactivée avec son explication** pour qui
 * n'a pas la permission — plutôt que d'ouvrir une route qui élargirait `visit.manage`.
 *
 * @param {{
 *   onCloneModel?: (catalogId: string) => void,
 *   onForceLogout?: () => void,
 *   actionBusy?: boolean,
 * }} props
 */
export default function MascotCatalogModelsView({
  onCloneModel = null,
  onForceLogout = null,
  actionBusy = false,
}) {
  const [models, setModels] = useState([]);
  // Le registre **complet** (catalogue + packs publiés), pas seulement les modèles affichés ici :
  // quand aucune restriction n'est posée, `toggleProposedMascotId` construit la première liste à
  // partir de cet ensemble. La limiter au catalogue retirerait silencieusement du sélecteur tous
  // les packs publiés au premier décochage.
  const [registryIds, setRegistryIds] = useState([]);
  const [canManageVisibility, setCanManageVisibility] = useState(false);
  const [allowedIds, setAllowedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [modelsRes, publicRes, registryRes] = await Promise.all([
        api('/api/visit/mascot-catalog/models'),
        api('/api/settings/public').catch(() => null),
        api('/api/visit/mascots').catch(() => null),
      ]);
      setModels(Array.isArray(modelsRes?.models) ? modelsRes.models : []);
      setCanManageVisibility(!!modelsRes?.can_manage_visibility);
      setAllowedIds(parseVisitMascotAllowedIds(publicRes?.visit?.mascot?.allowed_ids));
      setRegistryIds(
        (Array.isArray(registryRes?.mascots) ? registryRes.mascots : [])
          .map((entry) => String(entry?.id || entry?.catalog_id || '').trim())
          .filter(Boolean),
      );
      setError('');
    } catch (e) {
      if (e?.status === 401 && onForceLogout) onForceLogout();
      setError(e?.message || 'Liste des mascottes livrées indisponible');
    } finally {
      setLoading(false);
    }
  }, [onForceLogout]);

  useEffect(() => {
    void load();
  }, [load]);

  // Liste vide = aucune restriction : **toutes** les mascottes sont proposées. C'est la valeur
  // par défaut du réglage, et elle doit se lire comme telle et non comme « aucune ».
  const unrestricted = allowedIds.length === 0;

  const animatedCount = useMemo(() => models.filter((m) => m.has_real_animation).length, [models]);

  const onToggleProposed = useCallback(
    async (catalogId) => {
      if (!canManageVisibility) return;
      const known = registryIds.length ? registryIds : models.map((m) => m.catalog_id);
      const next = toggleProposedMascotId(allowedIds, known, catalogId);
      setBusyId(catalogId);
      setMessage('');
      try {
        await api(`/api/settings/admin/${encodeURIComponent(ALLOWED_KEY)}`, 'PUT', {
          value: next.join(','),
        });
        setAllowedIds(next);
        setMessage(
          next.length === 0
            ? 'Toutes les mascottes sont proposées aux visiteurs.'
            : `${next.length} mascotte(s) proposée(s) aux visiteurs.`,
        );
      } catch (e) {
        setError(e?.message || 'Enregistrement impossible');
      } finally {
        setBusyId('');
      }
    },
    [allowedIds, canManageVisibility, models, registryIds],
  );

  const onExport = useCallback(async (catalogId, label) => {
    setBusyId(catalogId);
    setMessage('');
    try {
      await downloadApiFile(
        `/api/visit/mascot-catalog/${encodeURIComponent(catalogId)}/export.zip`,
        `mascot-pack-${catalogId}.zip`,
      );
      setMessage(`Archive « ${label} » téléchargée.`);
    } catch (e) {
      setError(e?.message || 'Export impossible');
    } finally {
      setBusyId('');
    }
  }, []);

  if (loading) return <div className="empty">Chargement des mascottes livrées…</div>;

  return (
    <div className="mascot-catalog-models">
      <p className="section-sub">
        Les {models.length} mascottes livrées avec l’application. {animatedCount} portent une vraie
        animation ; les {models.length - animatedCount} autres n’ont qu’une image fixe et
        s’affichent en silhouette dessinée.
      </p>

      {error ? (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="alert alert-success" role="status">
          {message}
        </div>
      ) : null}

      {!canManageVisibility ? (
        <p className="section-sub" style={{ fontSize: '0.8rem' }}>
          La case « proposée aux visiteurs » écrit un réglage d’administration. Votre rôle gère les
          packs mascotte, pas les paramètres — un administrateur peut le faire depuis
          <strong> Paramètres → Mascottes de visite</strong>.
        </p>
      ) : unrestricted ? (
        <p className="section-sub" style={{ fontSize: '0.8rem' }}>
          Aucune restriction n’est posée : toute mascotte, y compris un pack publié ensuite, est
          proposée aux visiteurs. Décocher la première en pose une.
        </p>
      ) : null}

      <ul className="mascot-catalog-models__list">
        {models.map((model) => {
          const proposed = isMascotProposed(allowedIds, model.catalog_id);
          const rowBusy = actionBusy || busyId === model.catalog_id;
          return (
            <li key={model.catalog_id} className="mascot-catalog-models__row">
              <div className="mascot-catalog-models__preview" aria-hidden="true">
                <VisitMapMascotRenderer
                  mascotId={model.catalog_id}
                  mascotState={VISIT_MASCOT_STATE.IDLE}
                />
              </div>

              <div className="mascot-catalog-models__meta">
                <strong>{model.label}</strong>
                <span className="mascot-catalog-models__badge">
                  {model.has_real_animation
                    ? `${model.frame_count} trames`
                    : 'silhouette seule — pas d’animation'}
                </span>
              </div>

              <div className="mascot-catalog-models__actions">
                <label className="mascot-catalog-models__visibility">
                  <input
                    type="checkbox"
                    checked={proposed}
                    disabled={!canManageVisibility || rowBusy}
                    onChange={() => void onToggleProposed(model.catalog_id)}
                  />
                  <span>Proposée aux visiteurs</span>
                </label>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  disabled={rowBusy || !onCloneModel}
                  onClick={() => onCloneModel && onCloneModel(model.catalog_id)}
                >
                  Cloner pour modifier
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  disabled={rowBusy}
                  onClick={() => void onExport(model.catalog_id, model.label)}
                >
                  Exporter ZIP
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
