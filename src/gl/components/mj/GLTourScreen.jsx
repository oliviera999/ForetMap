import { useCallback, useMemo, useState } from 'react';
import { useGlTenirTour } from '../../hooks/useGlTenirTour.js';
import { useAppDialogs } from '../../../shared/components/AppDialogsProvider.jsx';
import { useGlTenirOlu } from '../../hooks/useGlTenirOlu.js';
import { GLOluBulle } from '../tenir/GLOluBulle.jsx';
import { GLButton } from '../ui/GLButton.jsx';
import { GLTourSablier } from './GLTourSablier.jsx';
import { GLTourDesSaisie } from './GLTourDesSaisie.jsx';
import { GLTourSouffle } from './GLTourSouffle.jsx';
import { GLTeamSpiritPanel } from './GLTeamSpiritPanel.jsx';
import { GLTourJournal } from './GLTourJournal.jsx';
import { numeroCase } from '../../../shared/glCaseNumeroCore.js';

const PHASE_LABELS = {
  ouverture: 'Ouverture',
  jeu: 'Jeu',
  souffle: 'Souffle',
  clos: 'Clos',
};

function TeamCard({ team, round, surface, tenir, busy, onLancer, onSuivante, isActive }) {
  const fenetre = round?.fenetresFouille || {};
  const fenetreOuverte = fenetre[String(team.id)] ?? fenetre.tous ?? false;
  return (
    <section
      className={`gl-tour-team-card gl-tour-team-card--${team.type}${isActive ? ' is-active' : ''}`}
      data-testid={`gl-tour-team-${team.id}`}
      aria-current={isActive ? 'true' : undefined}
    >
      <header>
        <h4>
          {team.name}
          <small className="gl-hint"> · {team.type === 'unicorn' ? 'licornes' : 'gnomes'}</small>
        </h4>
        <span className="gl-hint">
          case {numeroCase(team.pathIndex) ?? '—'}
          {team.auCamp ? ' · au camp' : ''}
          {team.hasRolledDiceThisRound ? ' · dés lancés' : ''}
        </span>
      </header>
      {round?.phase === 'jeu' ? (
        <>
          <GLTourDesSaisie
            count={tenir?.settings?.des_count || 2}
            desMode={tenir?.settings?.des_mode_effectif || 'physique'}
            allowLibre
            disabled={busy || (surface === 'tableau' && !isActive)}
            onLancer={(body) => onLancer({ ...body, teamId: team.id })}
          />
          {surface === 'hybride' ? (
            <p className="gl-hint">Fenêtre de fouille : {fenetreOuverte ? 'ouverte' : 'fermée'}</p>
          ) : null}
        </>
      ) : null}
      {surface === 'tableau' && isActive && round?.phase === 'jeu' ? (
        <GLButton type="button" variant="secondary" disabled={busy} onClick={onSuivante}>
          Équipe suivante
        </GLButton>
      ) : null}
    </section>
  );
}

/**
 * Écran du tour (prof), projeté : bandeau de phase, cartes d'équipe dans l'ordre figé, sablier
 * (tableau), dés en attente, absences, retrait, Team Spirit, « Le voile », journal.
 * Toute action passe par le serveur puis recharge (`onReloadGame`).
 */
export function GLTourScreen({
  game,
  teams = [],
  roster = [],
  tenir,
  token,
  onReloadGame,
  onClose,
  showFailure,
  voyageurSoundsEnabled = false,
  events = [],
}) {
  const { confirm, prompt } = useAppDialogs();
  const olu = useGlTenirOlu({ gameId: game?.id, events, teams, enabled: !!game?.id });
  const gameId = game?.id;
  const tourApi = useGlTenirTour({ gameId, enabled: !!gameId, onChanged: onReloadGame });
  const [refreshKey, setRefreshKey] = useState(0);
  const [absences, setAbsences] = useState(() => new Set());
  const [projectionUrl, setProjectionUrl] = useState('');
  const view = tourApi.tour;
  const round = view?.round || null;
  const surface = view?.surface || tenir?.surface || 'tableau';
  const settings = tenir?.settings || {};

  const orderedTeams = useMemo(() => {
    const byId = new Map((view?.teams || []).map((t) => [Number(t.id), t]));
    const ordre = round?.ordre?.length ? round.ordre : (view?.teams || []).map((t) => t.id);
    return ordre.map((id) => byId.get(Number(id))).filter(Boolean);
  }, [view, round]);

  const act = useCallback(
    async (fn) => {
      const result = await fn();
      setRefreshKey((k) => k + 1);
      if (tourApi.error) showFailure?.(tourApi.error);
      return result;
    },
    [tourApi.error, showFailure],
  );

  const sonnerie = useCallback(() => {
    if (!voyageurSoundsEnabled || typeof window === 'undefined' || !window.AudioContext) return;
    try {
      const ctx = new window.AudioContext();
      const osc = ctx.createOscillator();
      osc.frequency.value = 660;
      osc.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch (_) {
      /* silencieux */
    }
  }, [voyageurSoundsEnabled]);

  async function cloreChapitre() {
    const ok = await confirm({
      message:
        'Clore le chapitre ? La caravane porte les retardataires au camp, les honneurs sont attribués, les parures rendues. Irréversible.',
      confirmLabel: 'Clore',
    });
    if (!ok) return;
    await act(() =>
      import('../../services/apiGL.js').then(({ apiGL }) =>
        apiGL(`/api/gl/games/${gameId}/end`, 'POST'),
      ),
    );
    await onReloadGame?.();
  }

  if (!gameId || !tenir?.enabled) {
    return <p className="gl-hint">Cette partie ne joue pas « Tenir à deux ».</p>;
  }

  return (
    <div className="gl-tour-screen" data-testid="gl-tour-screen">
      <header className="gl-tour-screen__banner">
        <h2>
          Tour {view?.roundNumber || '—'} ·{' '}
          {round ? PHASE_LABELS[round.phase] : 'aucun tour ouvert'} · {surface}
        </h2>
        <div className="gl-inline-actions">
          {!round || round.phase === 'clos' ? (
            <GLButton
              type="button"
              disabled={tourApi.busy}
              onClick={() => act(() => tourApi.ouvrir())}
            >
              Ouvrir le tour
            </GLButton>
          ) : null}
          {round?.phase === 'ouverture' ? (
            <GLButton
              type="button"
              disabled={tourApi.busy}
              onClick={() => act(() => tourApi.phase('jeu'))}
            >
              Passer en jeu
            </GLButton>
          ) : null}
          {round?.phase === 'souffle' ? (
            <GLButton
              type="button"
              disabled={tourApi.busy}
              onClick={() => act(() => tourApi.phase('clos'))}
            >
              Clore le tour
            </GLButton>
          ) : null}
          <GLButton
            type="button"
            variant="secondary"
            disabled={tourApi.busy}
            onClick={() => act(() => tourApi.refresh())}
          >
            Actualiser
          </GLButton>
          <GLButton
            type="button"
            variant="secondary"
            disabled={tourApi.busy}
            onClick={async () => {
              const res = await tourApi.projectionToken();
              if (res?.url) setProjectionUrl(res.url);
            }}
          >
            Lien de projection
          </GLButton>
          {typeof onClose === 'function' ? (
            <GLButton type="button" variant="ghost" onClick={onClose}>
              Quitter l’écran du tour
            </GLButton>
          ) : null}
        </div>
        {projectionUrl ? (
          <p className="gl-hint">
            Projection (12 h) : <code>{projectionUrl}</code>
          </p>
        ) : null}
        {tourApi.error ? <p className="gl-error-banner">{tourApi.error}</p> : null}
        <GLOluBulle line={olu.line} speakerName={olu.speakerName} frozen={olu.frozen} />
        {round?.oluErreur ? (
          <p className="gl-tour-olu" data-testid="gl-tour-olu">
            Olu : « {round.oluErreur.texte} »
            {round.oluCorrigeTeamId == null && round.phase !== 'clos' ? (
              <span className="gl-inline-actions">
                {orderedTeams.map((t) => (
                  <GLButton
                    key={t.id}
                    type="button"
                    variant="ghost"
                    disabled={tourApi.busy}
                    onClick={() => act(() => tourApi.oluCorrige(t.id))}
                  >
                    corrigé par {t.name}
                  </GLButton>
                ))}
              </span>
            ) : round.oluErreur.correction ? (
              <em> — {round.oluErreur.correction}</em>
            ) : null}
          </p>
        ) : null}
      </header>

      <div className="gl-tour-screen__layout">
        <main className="gl-tour-screen__main">
          {surface === 'tableau' && round?.phase === 'jeu' ? (
            <GLTourSablier
              seconds={Number(settings.sablier_secondes) || 180}
              resetKey={round.equipeActiveId}
              running
              onDone={sonnerie}
            />
          ) : null}
          <div className="gl-tour-teams">
            {orderedTeams.map((team) => (
              <TeamCard
                key={team.id}
                team={team}
                round={round}
                surface={surface}
                tenir={tenir}
                busy={tourApi.busy}
                isActive={
                  round?.equipeActiveId != null && Number(round.equipeActiveId) === Number(team.id)
                }
                onLancer={(body) => act(() => tourApi.lancer(body))}
                onSuivante={() => act(() => tourApi.equipeSuivante())}
              />
            ))}
          </div>

          {round?.desEnAttente?.length ? (
            <section className="gl-gameplay-block" data-testid="gl-tour-des-attente">
              <h3>Dés en attente de validation</h3>
              {round.desEnAttente.map((s) => (
                <div key={s.id} className="gl-inline-actions">
                  <span>
                    {orderedTeams.find((t) => Number(t.id) === s.teamId)?.name ||
                      `Équipe ${s.teamId}`}{' '}
                    : {s.faces.join(' + ')} = {s.total}
                  </span>
                  <GLButton
                    type="button"
                    disabled={tourApi.busy}
                    onClick={() => act(() => tourApi.validerSaisie(s.id))}
                  >
                    Valider
                  </GLButton>
                  <GLButton
                    type="button"
                    variant="ghost"
                    disabled={tourApi.busy}
                    onClick={() => act(() => tourApi.refuserSaisie(s.id))}
                  >
                    Refuser
                  </GLButton>
                </div>
              ))}
            </section>
          ) : null}

          {surface === 'hybride' && round?.phase === 'jeu' ? (
            <section className="gl-gameplay-block">
              <h3>Fenêtre de fouille</h3>
              <div className="gl-inline-actions">
                <GLButton
                  type="button"
                  disabled={tourApi.busy}
                  onClick={() => act(() => tourApi.fouilleFenetre(null, true))}
                >
                  Ouvrir pour toutes
                </GLButton>
                <GLButton
                  type="button"
                  variant="secondary"
                  disabled={tourApi.busy}
                  onClick={() => act(() => tourApi.fouilleFenetre(null, false))}
                >
                  Fermer
                </GLButton>
              </div>
            </section>
          ) : null}

          {round && round.phase === 'jeu' ? (
            <GLTourSouffle
              round={round}
              voileActif={settings.voile !== false}
              disabled={tourApi.busy}
              onSouffle={(body) => act(() => tourApi.phase('souffle', body))}
            />
          ) : round && round.phase !== 'ouverture' ? (
            <GLTourSouffle round={round} voileActif={settings.voile !== false} disabled />
          ) : null}

          {round ? (
            <section className="gl-gameplay-block" data-testid="gl-tour-absences">
              <h3>Absences et retrait</h3>
              <ul className="gl-tour-roster">
                {roster.map((p) => (
                  <li key={p.playerId} className="gl-inline-actions">
                    <label>
                      <input
                        type="checkbox"
                        checked={absences.has(Number(p.playerId))}
                        onChange={(e) => {
                          const next = new Set(absences);
                          if (e.target.checked) next.add(Number(p.playerId));
                          else next.delete(Number(p.playerId));
                          setAbsences(next);
                        }}
                      />
                      <span>
                        {p.pseudo || `${p.firstName} ${p.lastName}`.trim()}{' '}
                        <small className="gl-hint">· {p.teamName}</small>
                      </span>
                    </label>
                    <GLButton
                      type="button"
                      variant="ghost"
                      disabled={tourApi.busy}
                      onClick={async () => {
                        const enRetrait = (tenir?.retraits || []).some(
                          (r) => Number(r.playerId) === Number(p.playerId),
                        );
                        if (enRetrait) {
                          await act(() => tourApi.retrait(p.playerId, false));
                          return;
                        }
                        const motif = await prompt({
                          message: 'Motif du retrait (vu du prof seul)',
                          required: false,
                        });
                        if (motif == null) return;
                        await act(() => tourApi.retrait(p.playerId, true, motif));
                      }}
                    >
                      {(tenir?.retraits || []).some(
                        (r) => Number(r.playerId) === Number(p.playerId),
                      )
                        ? 'Lever le retrait'
                        : 'Retrait'}
                    </GLButton>
                  </li>
                ))}
              </ul>
              <GLButton
                type="button"
                variant="secondary"
                disabled={tourApi.busy}
                onClick={() => act(() => tourApi.absences([...absences]))}
              >
                Enregistrer les absences ({absences.size})
              </GLButton>
            </section>
          ) : null}

          {round && (round.phase === 'souffle' || round.phase === 'clos') ? (
            <GLTeamSpiritPanel
              teams={teams}
              disabled={tourApi.busy}
              lumiere={view?.lumiere}
              onSave={(bilans) => act(() => tourApi.teamSpirit(bilans))}
            />
          ) : null}

          <section className="gl-gameplay-block">
            <GLButton
              type="button"
              variant="secondary"
              disabled={tourApi.busy}
              onClick={cloreChapitre}
            >
              Clore le chapitre
            </GLButton>
          </section>
        </main>
        <GLTourJournal gameId={gameId} token={token} refreshKey={refreshKey} />
      </div>
    </div>
  );
}
