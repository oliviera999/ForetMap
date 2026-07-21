import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGL } from '../../services/apiGL.js';
import { GLField } from '../ui/GLField.jsx';
import { GLInput } from '../ui/GLInput.jsx';
import { GLSelect } from '../ui/GLSelect.jsx';
import { GLBadge } from '../ui/GLBadge.jsx';
import { GLDataList } from '../ui/GLDataList.jsx';
import { channelLabel, isOrphanChannel } from '../../utils/glFeuilletChannelLabels.js';

/**
 * Vue d'ensemble admin des feuillets : couverture par canal d'acquisition, orphelins,
 * répartition par chapitre, liens résolus en noms d'éléments et stats de découverte.
 * Lecture seule (l'édition unitaire/masse se fait dans l'onglet « Feuillets »).
 */
export function GLLoreFeuilletsOverviewPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filterQ, setFilterQ] = useState('');
  const [filterChannel, setFilterChannel] = useState('');
  const [filterChapter, setFilterChapter] = useState('');
  const [filterAnchor, setFilterAnchor] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiGL('/api/gl/lore/admin/feuillets/overview');
      setData(res || null);
    } catch (err) {
      setError(err.message || "Chargement de la vue d'ensemble impossible");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const items = useMemo(() => (Array.isArray(data?.items) ? data.items : []), [data]);
  const channelKeys = useMemo(
    () => Object.keys(data?.channels?.counts || {}).sort(),
    [data?.channels?.counts],
  );
  const chapters = useMemo(
    () => (Array.isArray(data?.byChapter) ? data.byChapter : []),
    [data?.byChapter],
  );

  const filteredItems = useMemo(() => {
    const q = filterQ.trim().toLowerCase();
    return items.filter((it) => {
      if (filterChannel && it.channel !== filterChannel) return false;
      if (filterAnchor === 'linked' && it.kingdomZoneId == null) return false;
      if (filterAnchor === 'unlinked' && it.kingdomZoneId != null) return false;
      if (filterAnchor === 'lost' && !(it.channel === 'zone' && it.kingdomZoneId == null))
        return false;
      if (filterChapter) {
        if (filterChapter === '__none__') {
          if (it.chapters?.length) return false;
        } else if (!it.chapters?.some((c) => String(c.id) === filterChapter)) {
          return false;
        }
      }
      if (q) {
        const hay = `${it.feuilletCode} ${it.titre || ''} ${it.linkLabel || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, filterQ, filterChannel, filterChapter, filterAnchor]);

  const columns = [
    { key: 'code', label: 'Code' },
    { key: 'titre', label: 'Titre' },
    { key: 'channel', label: 'Canal' },
    { key: 'link', label: 'Lien' },
    { key: 'chapters', label: 'Chapitre(s)' },
    { key: 'anchor', label: 'Ancrage carte' },
    { key: 'discovery', label: 'Découverte' },
    { key: 'statut', label: 'Statut' },
  ];

  const rows = filteredItems.map((it) => {
    const chapterText = it.chapters?.length ? it.chapters.map((c) => c.name).join(', ') : '—';
    const discoveryText = `${it.discovery?.teams || 0} éq. / ${it.discovery?.games || 0} part.`;
    const channelBadge = (
      <GLBadge tone={isOrphanChannel(it.channel) ? 'danger' : 'neutral'}>
        {channelLabel(it.channel)}
      </GLBadge>
    );
    const statutBadge = (
      <GLBadge tone={(it.statut || 'actif') === 'actif' ? 'success' : 'danger'}>
        {it.statut}
      </GLBadge>
    );
    const anchorLost = it.channel === 'zone' && it.kingdomZoneId == null;
    const anchorBadge =
      it.kingdomZoneId != null ? (
        <GLBadge tone="success">zone #{it.kingdomZoneId}</GLBadge>
      ) : anchorLost ? (
        <GLBadge tone="danger">perdu</GLBadge>
      ) : (
        <span>—</span>
      );
    return {
      key: it.feuilletCode,
      desktopCells: (
        <>
          <td>
            <code>{it.feuilletCode}</code>
          </td>
          <td>{it.titre || '—'}</td>
          <td>{channelBadge}</td>
          <td>{it.linkLabel || '—'}</td>
          <td>{chapterText}</td>
          <td>{anchorBadge}</td>
          <td>{discoveryText}</td>
          <td>{statutBadge}</td>
        </>
      ),
      mobileCells: (
        <>
          <div className="gl-data-card-row">
            <span className="gl-data-card-label">Code</span>
            <code>{it.feuilletCode}</code>
          </div>
          <div className="gl-data-card-row">
            <span className="gl-data-card-label">Titre</span>
            <strong>{it.titre || '—'}</strong>
          </div>
          <div className="gl-data-card-row">
            <span className="gl-data-card-label">Canal</span>
            {channelBadge}
          </div>
          <div className="gl-data-card-row">
            <span className="gl-data-card-label">Lien</span>
            <span>{it.linkLabel || '—'}</span>
          </div>
          <div className="gl-data-card-row">
            <span className="gl-data-card-label">Chapitre(s)</span>
            <span>{chapterText}</span>
          </div>
          <div className="gl-data-card-row">
            <span className="gl-data-card-label">Ancrage carte</span>
            {anchorBadge}
          </div>
          <div className="gl-data-card-row">
            <span className="gl-data-card-label">Découverte</span>
            <span>{discoveryText}</span>
          </div>
        </>
      ),
    };
  });

  return (
    <section className="gl-admin-section gl-feuillets-overview fade-in">
      <h3>Vue d'ensemble des feuillets</h3>
      {error ? <p className="gl-error">{error}</p> : null}
      {loading && !data ? <p className="gl-hint">Chargement…</p> : null}

      {data ? (
        <>
          <div className="gl-feuillets-overview__kpis">
            <div className="gl-kpi-card">
              <span className="gl-kpi-card__value">{data.total}</span>
              <span className="gl-kpi-card__label">feuillets</span>
            </div>
            <div className="gl-kpi-card">
              <span className="gl-kpi-card__value">{data.active}</span>
              <span className="gl-kpi-card__label">actifs</span>
            </div>
            <div className="gl-kpi-card gl-kpi-card--warn">
              <span className="gl-kpi-card__value">{data.channels?.orphans?.length || 0}</span>
              <span className="gl-kpi-card__label">orphelins</span>
            </div>
            <div className="gl-kpi-card">
              <span className="gl-kpi-card__value">{data.unassignedChapterCount || 0}</span>
              <span className="gl-kpi-card__label">hors chapitre</span>
            </div>
            <div
              className={`gl-kpi-card${data.mapAnchorLostCount ? ' gl-kpi-card--warn' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => setFilterAnchor(filterAnchor === 'lost' ? '' : 'lost')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setFilterAnchor(filterAnchor === 'lost' ? '' : 'lost');
                }
              }}
              title="Feuillets attendus sur une zone mais sans ancrage carte (ex. zone effacée avec un chapitre supprimé)"
            >
              <span className="gl-kpi-card__value">{data.mapAnchorLostCount || 0}</span>
              <span className="gl-kpi-card__label">ancrage carte perdu</span>
            </div>
          </div>

          <div className="gl-feuillets-overview__grids">
            <div>
              <h4>Couverture par canal</h4>
              <ul className="gl-feuillets-overview__coverage">
                {channelKeys.map((key) => (
                  <li key={key}>
                    <button
                      type="button"
                      className={filterChannel === key ? 'is-active' : ''}
                      onClick={() => setFilterChannel(filterChannel === key ? '' : key)}
                    >
                      <span>{channelLabel(key)}</span>
                      <strong>{data.channels.counts[key]}</strong>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Répartition par chapitre</h4>
              <ul className="gl-feuillets-overview__coverage">
                {chapters.map((ch) => (
                  <li key={ch.id}>
                    <button
                      type="button"
                      className={filterChapter === String(ch.id) ? 'is-active' : ''}
                      onClick={() =>
                        setFilterChapter(filterChapter === String(ch.id) ? '' : String(ch.id))
                      }
                    >
                      <span>{ch.name}</span>
                      <strong>{ch.count}</strong>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="gl-form gl-form--compact gl-feuillets-filters">
            <GLField label="Recherche">
              <GLInput
                value={filterQ}
                onChange={(e) => setFilterQ(e.target.value)}
                placeholder="Code, titre ou lien…"
              />
            </GLField>
            <GLField label="Canal">
              <GLSelect value={filterChannel} onChange={(e) => setFilterChannel(e.target.value)}>
                <option value="">Tous</option>
                {channelKeys.map((key) => (
                  <option key={key} value={key}>
                    {channelLabel(key)}
                  </option>
                ))}
              </GLSelect>
            </GLField>
            <GLField label="Chapitre">
              <GLSelect value={filterChapter} onChange={(e) => setFilterChapter(e.target.value)}>
                <option value="">Tous</option>
                {chapters.map((ch) => (
                  <option key={ch.id} value={String(ch.id)}>
                    {ch.name}
                  </option>
                ))}
                <option value="__none__">Hors chapitre</option>
              </GLSelect>
            </GLField>
            <GLField label="Ancrage carte">
              <GLSelect value={filterAnchor} onChange={(e) => setFilterAnchor(e.target.value)}>
                <option value="">Tous</option>
                <option value="linked">Lié à une zone</option>
                <option value="unlinked">Non lié</option>
                <option value="lost">Ancrage perdu</option>
              </GLSelect>
            </GLField>
          </div>

          <p className="gl-hint">
            {filteredItems.length}/{items.length} feuillets affichés.
          </p>
          <GLDataList columns={columns} rows={rows} emptyLabel="Aucun feuillet." />
        </>
      ) : null}
    </section>
  );
}
