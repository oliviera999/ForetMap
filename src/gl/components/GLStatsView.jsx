import React, { useMemo, useState, useEffect } from 'react';
import { StatCard, StatsSummaryGrid } from '../../shared/components/StatsSummaryGrid.jsx';
import { useGLPlayerStats } from '../hooks/useGLPlayerStats.js';
import { GLButton } from './ui/GLButton.jsx';
import { GLPlayerJournalReadModal } from './GLPlayerJournalReadModal.jsx';
import { GLField } from './ui/GLField.jsx';
import { GLSelect } from './ui/GLSelect.jsx';

const GL_STAT = {
  card: 'gl-stat-card',
  highlight: 'gl-stat-card--highlight',
  icon: 'gl-stat-icon',
  number: 'gl-stat-number',
  label: 'gl-stat-label',
};

function GlStatCard(props) {
  return (
    <StatCard
      {...props}
      cardClassName={GL_STAT.card}
      highlightClassName={GL_STAT.highlight}
      iconClassName={GL_STAT.icon}
      numberClassName={GL_STAT.number}
      labelClassName={GL_STAT.label}
    />
  );
}

function formatCount(value) {
  return Number(value || 0).toLocaleString('fr-FR');
}

function formatRatio(value, total) {
  const v = Number(value) || 0;
  const t = Number(total) || 0;
  if (t <= 0) return formatCount(v);
  return `${formatCount(v)} / ${formatCount(t)}`;
}

function playerLabel(row) {
  const pseudo = String(row?.pseudo || '').trim();
  const first = String(row?.first_name || '').trim();
  const last = String(row?.last_name || '').trim();
  const name = `${first} ${last}`.trim();
  if (pseudo && name) return `${pseudo} (${name})`;
  return pseudo || name || `Joueur #${row?.id ?? '?'}`;
}

const VITALITY_HISTORY_HINT =
  'Cumul sur toute la vie en classe (événements MJ, lancements de sorts, échanges marché terminés). Ne reflète pas uniquement la partie en cours.';

function VitalityStatsGrid({ stats, highlightPossessed = false }) {
  if (!stats || stats.hearts == null) return null;
  return (
    <>
      <h3 className="gl-stats-section-title">Vitalité (cœurs & gemmes)</h3>
      <p className="gl-hint gl-stats-note">{VITALITY_HISTORY_HINT}</p>
      <StatsSummaryGrid className="gl-stats-grid">
        <GlStatCard icon="❤️" value={stats.hearts} animateCount label="Cœurs possédés" highlight={highlightPossessed} title="Solde actuel sur ton compte joueur" />
        <GlStatCard icon="💎" value={stats.gems} animateCount label="Gemmes possédées" highlight={highlightPossessed} title="Solde actuel sur ton compte joueur" />
        <GlStatCard icon="⬆️" value={formatCount(stats.hearts_gained)} label="Cœurs gagnés" title={VITALITY_HISTORY_HINT} />
        <GlStatCard icon="⬇️" value={formatCount(stats.hearts_lost)} label="Cœurs perdus" title={VITALITY_HISTORY_HINT} />
        <GlStatCard icon="⬆️" value={formatCount(stats.gems_gained)} label="Gemmes gagnées" title={VITALITY_HISTORY_HINT} />
        <GlStatCard icon="⬇️" value={formatCount(stats.gems_lost)} label="Gemmes perdues" title={VITALITY_HISTORY_HINT} />
      </StatsSummaryGrid>
    </>
  );
}

function LearningStatsGrid({ stats, catalogTotals }) {
  const catalog = catalogTotals || {};
  return (
    <>
      <h3 className="gl-stats-section-title">Apprentissages</h3>
      <StatsSummaryGrid className="gl-stats-grid">
        <GlStatCard
          icon="🦋"
          value={formatRatio(stats?.species_learned, catalog.species_total)}
          label="Espèces étudiées"
        />
        <GlStatCard
          icon="📚"
          value={formatRatio(stats?.glossary_learned, catalog.glossary_total)}
          label="Termes glossaire appris"
        />
        <GlStatCard
          icon="🎓"
          value={formatRatio(stats?.tutorials_read, catalog.tutorials_total)}
          label="Tutoriels lus"
        />
      </StatsSummaryGrid>
    </>
  );
}

function ClassLeaderboardRow({ row, vitalityEnabled, rank, onViewJournal, showJournalButton }) {
  const s = row.stats || {};
  return (
    <div className="gl-stats-lb-row">
      <div className="gl-stats-lb-rank">{rank}</div>
      <div className="gl-stats-lb-name">
        <strong>{playerLabel(row)}</strong>
        {row.last_seen ? (
          <small>
            Vu le {new Date(row.last_seen).toLocaleDateString('fr-FR')}
          </small>
        ) : (
          <small>Jamais connecté</small>
        )}
      </div>
      <div className="gl-stats-lb-metrics">
        {vitalityEnabled ? (
          <>
            <span title="Cœurs possédés">❤️ {formatCount(s.hearts)}</span>
            <span title="Gemmes possédées">💎 {formatCount(s.gems)}</span>
            <span title={VITALITY_HISTORY_HINT}>❤️ +{formatCount(s.hearts_gained)} / −{formatCount(s.hearts_lost)}</span>
            <span title={VITALITY_HISTORY_HINT}>💎 +{formatCount(s.gems_gained)} / −{formatCount(s.gems_lost)}</span>
          </>
        ) : null}
        <span title="Espèces étudiées">🦋 {formatCount(s.species_learned)}</span>
        <span title="Termes glossaire">📚 {formatCount(s.glossary_learned)}</span>
        <span title="Tutoriels lus">🎓 {formatCount(s.tutorials_read)}</span>
      </div>
      {showJournalButton ? (
        <GLButton
          type="button"
          variant="secondary"
          className="gl-stats-lb-journal-btn"
          onClick={() => onViewJournal?.(row.id)}
        >
          📔 Carnet
        </GLButton>
      ) : null}
    </div>
  );
}

export function GLStatsView({
  mode = 'self',
  classes = [],
  auth = null,
  vitalityEnabled = false,
  initialClassId = null,
  compact = false,
  onClose = null,
}) {
  const activeClasses = useMemo(
    () => (Array.isArray(classes) ? classes : []).filter((c) => Number(c.is_active) !== 0),
    [classes]
  );
  const defaultClassId = useMemo(() => {
    if (initialClassId != null && String(initialClassId).trim() !== '') {
      return String(initialClassId);
    }
    if (auth?.classId != null) return String(auth.classId);
    if (activeClasses[0]?.id != null) return String(activeClasses[0].id);
    return '';
  }, [initialClassId, auth?.classId, activeClasses]);

  const [classFilterId, setClassFilterId] = useState(defaultClassId);
  const [search, setSearch] = useState('');
  const [journalPlayerId, setJournalPlayerId] = useState(null);

  const canViewPlayerJournal = useMemo(
    () => Array.isArray(auth?.permissions) && auth.permissions.includes('gl.players.manage'),
    [auth?.permissions]
  );

  useEffect(() => {
    if (mode !== 'class') return;
    if (!classFilterId && defaultClassId) {
      setClassFilterId(defaultClassId);
    }
  }, [mode, classFilterId, defaultClassId]);

  const effectiveClassId = classFilterId || defaultClassId;

  const { data, loading, error, reload } = useGLPlayerStats({
    mode,
    classId: mode === 'class' ? effectiveClassId : null,
    enabled: mode === 'self' || !!effectiveClassId,
  });

  const vitalityOn = mode === 'self' ? data?.vitalityEnabled === true : vitalityEnabled && data?.vitalityEnabled !== false;

  const filteredPlayers = useMemo(() => {
    const rows = Array.isArray(data?.players) ? data.players : [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => playerLabel(row).toLowerCase().includes(q));
  }, [data?.players, search]);

  if (loading && !data) {
    return (
      <div className="gl-stats-view gl-stats-view--loading">
        <p className="gl-hint">Chargement des statistiques…</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="gl-stats-view">
        <p className="gl-error" role="alert">{error}</p>
        <GLButton type="button" variant="secondary" onClick={reload}>Réessayer</GLButton>
      </div>
    );
  }

  if (mode === 'self') {
    const stats = data?.stats || {};
    return (
      <div className={`gl-stats-view fade-in ${compact ? 'gl-stats-view--compact' : ''}`}>
        <div className="gl-stats-head">
          <h2 className="gl-stats-title">📊 Mes statistiques</h2>
          {onClose ? (
            <GLButton type="button" variant="secondary" onClick={onClose}>Fermer</GLButton>
          ) : null}
        </div>
        <p className="gl-hint">
          Bilan sur toute ta vie dans la classe
          {data?.pseudo ? ` — ${data.pseudo}` : ''}.
        </p>
        {!vitalityOn ? (
          <p className="gl-hint gl-stats-note">
            La vitalité (cœurs / gemmes) n’est pas activée sur cette plateforme.
          </p>
        ) : (
          <VitalityStatsGrid stats={stats} highlightPossessed />
        )}
        <LearningStatsGrid stats={stats} catalogTotals={data?.catalogTotals} />
      </div>
    );
  }

  const totals = data?.classTotals || {};
  const catalog = data?.catalogTotals || totals.catalog || {};

  return (
    <div className="gl-stats-view fade-in">
      <div className="gl-stats-head">
        <h2 className="gl-stats-title">📊 Statistiques des joueurs</h2>
        <GLButton type="button" variant="secondary" onClick={reload} disabled={loading}>
          {loading ? 'Actualisation…' : 'Actualiser'}
        </GLButton>
      </div>

      {activeClasses.length > 0 ? (
        <div className="gl-stats-filter">
          <GLField label="Classe" hint={activeClasses.length > 1 ? 'Choisis la classe à analyser.' : undefined}>
            {activeClasses.length > 1 ? (
              <GLSelect
                value={classFilterId}
                onChange={(e) => setClassFilterId(e.target.value)}
              >
                {activeClasses.map((cls) => (
                  <option key={cls.id} value={String(cls.id)}>{cls.name}</option>
                ))}
              </GLSelect>
            ) : (
              <p className="gl-stats-class-name">{activeClasses[0]?.name || '—'}</p>
            )}
          </GLField>
        </div>
      ) : (
        <p className="gl-error" role="alert">Aucune classe active disponible.</p>
      )}

      {error ? <p className="gl-error" role="alert">{error}</p> : null}

      <p className="gl-hint">
        {formatCount(totals.active_players)} joueur{totals.active_players > 1 ? 's' : ''} actif{totals.active_players > 1 ? 's' : ''} dans cette classe.
      </p>

      {vitalityOn ? (
        <StatsSummaryGrid className="gl-stats-grid gl-stats-grid--class-totals">
          <GlStatCard icon="❤️" value={formatCount(totals.hearts)} label="Cœurs (total classe)" />
          <GlStatCard icon="💎" value={formatCount(totals.gems)} label="Gemmes (total classe)" />
        </StatsSummaryGrid>
      ) : null}

      <StatsSummaryGrid className="gl-stats-grid gl-stats-grid--class-totals">
        <GlStatCard icon="🦋" value={formatRatio(totals.species_learned, catalog.species_total)} label="Espèces étudiées (classe)" />
        <GlStatCard icon="📚" value={formatRatio(totals.glossary_learned, catalog.glossary_total)} label="Termes glossaire (classe)" />
        <GlStatCard icon="🎓" value={formatRatio(totals.tutorials_read, catalog.tutorials_total)} label="Tutoriels lus (classe)" />
      </StatsSummaryGrid>

      <div className="gl-stats-search">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Rechercher un joueur…"
          aria-label="Rechercher un joueur"
        />
      </div>

      <div className="gl-stats-leaderboard">
        {filteredPlayers.length === 0 ? (
          <p className="gl-hint">Aucun joueur ne correspond à ta recherche.</p>
        ) : (
          filteredPlayers.map((row, index) => (
            <ClassLeaderboardRow
              key={row.id}
              row={row}
              vitalityEnabled={vitalityOn}
              rank={index + 1}
              showJournalButton={canViewPlayerJournal}
              onViewJournal={setJournalPlayerId}
            />
          ))
        )}
      </div>

      <GLPlayerJournalReadModal
        playerId={journalPlayerId}
        open={journalPlayerId != null}
        onClose={() => setJournalPlayerId(null)}
      />
    </div>
  );
}
