import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGlTenirTour } from '../../hooks/useGlTenirTour.js';
import { useAppDialogs } from '../../../shared/components/AppDialogsProvider.jsx';
import { useGlTenirOlu } from '../../hooks/useGlTenirOlu.js';
import { GLOluBulle } from '../tenir/GLOluBulle.jsx';
import { GLButton } from '../ui/GLButton.jsx';
import { GLTourSablier } from './GLTourSablier.jsx';
import { GLSablier, GLSablierReglage } from '../tenir/GLSablier.jsx';
import { GLTourDesSaisie } from './GLTourDesSaisie.jsx';
import { GLTourSouffle } from './GLTourSouffle.jsx';
import { GLTeamSpiritPanel } from './GLTeamSpiritPanel.jsx';
import { GLTourJournal } from './GLTourJournal.jsx';
import { GLClassLinkPanel } from './GLClassLinkPanel.jsx';
import { GLDemandesPanel } from './GLDemandesPanel.jsx';
import { numeroCase } from '../../../shared/glCaseNumeroCore.js';

/** Durée d'affichage d'un mot de passe provisoire avant qu'il ne s'efface seul. */
const MOT_DE_PASSE_VISIBLE_MS = 60_000;

const PHASE_LABELS = {
  ouverture: 'Ouverture',
  jeu: 'Jeu',
  souffle: 'Souffle',
  clos: 'Clos',
};

function TeamCard({
  team,
  round,
  surface,
  tenir,
  busy,
  onLancer,
  onSuivante,
  isActive,
  presence = null,
  roster = [],
  onArrivee = null,
}) {
  const fenetre = round?.fenetresFouille || {};
  const fenetreOuverte = fenetre[String(team.id)] ?? fenetre.tous ?? false;
  const reserve = (tenir?.reserves || []).find((r) => Number(r.teamId) === Number(team.id));
  const fouilles = team.fouilles || null;
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
          {team.unDe ? ' · un seul dé au prochain tour' : ''}
          {fouilles ? ` · fouilles ${fouilles.restantes}/${fouilles.quota}` : ''}
          {reserve && (reserve.health || reserve.power)
            ? ` · réserve ❤️ ${reserve.health} 💎 ${reserve.power}`
            : ''}
        </span>
      </header>
      {/* M14 : tout le monde est là par défaut — on ne montre que les absents déclarés. */}
      {presence?.absents?.length ? (
        <p className="gl-tour-presence" data-testid={`gl-tour-presence-${team.id}`}>
          <span className="gl-tour-presence__pastille" role="status">
            {`${presence.absents.length} absent${presence.absents.length > 1 ? 's' : ''}`}
          </span>{' '}
          {(presence.absents || []).map((playerId) => {
            const eleve = roster.find((r) => Number(r.playerId) === Number(playerId));
            const nom = eleve
              ? eleve.pseudo || `${eleve.firstName} ${eleve.lastName}`.trim()
              : 'Un élève';
            return (
              <GLButton
                key={playerId}
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => onArrivee?.(team.id, playerId)}
              >
                {nom} vient d’arriver
              </GLButton>
            );
          })}
        </p>
      ) : null}
      {round?.phase === 'jeu' ? (
        <>
          <GLTourDesSaisie
            key={`des-${team.desProchainJet || tenir?.settings?.des_count || 2}`}
            count={team.desProchainJet || tenir?.settings?.des_count || 2}
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
  // M14 : mot de passe provisoire d'un élève, montré une fois ici — jamais gardé ni journalisé.
  const [motDePasse, setMotDePasse] = useState(null);
  // L'écran du prof est souvent recopié au tableau : le mot de passe s'efface seul.
  useEffect(() => {
    if (!motDePasse) return undefined;
    const minuteur = setTimeout(() => setMotDePasse(null), MOT_DE_PASSE_VISIBLE_MS);
    return () => clearTimeout(minuteur);
  }, [motDePasse]);
  const [projectionUrl, setProjectionUrl] = useState('');
  const view = tourApi.tour;
  const round = view?.round || null;
  // Les équipes disent elles-mêmes qui manque (lot 2) : la liste du prof suit le serveur, pour
  // qu'« Enregistrer les absences » corrige sans effacer ce que les équipes ont confirmé.
  const absencesServeur = Array.isArray(round?.absences) ? round.absences.join(',') : null;
  useEffect(() => {
    if (absencesServeur == null) return;
    setAbsences(new Set(absencesServeur ? absencesServeur.split(',').map(Number) : []));
  }, [absencesServeur]);
  const surface = view?.surface || tenir?.surface || 'tableau';
  const settings = tenir?.settings || {};
  // Escalier du chapitre 1 (M8) : avant la séance 3, le voile n'est pas encore ouvert.
  const voileFerme = !!tenir?.escalier && !tenir.escalier.modules.includes('voile');
  // Sabliers : la vue vient du serveur (même état que les tablettes et la projection).
  const sablier = view?.sablier || tenir?.sablier || null;
  const sablierActif = sablier ? sablier.actif !== false : settings.sablier_actif !== false;
  const sablierPhase = sablier?.phase || null;
  // « A sonné » se lit pour un tour, une phase et une durée : il retombe seul quand l'un change.
  const [sonnePour, setSonnePour] = useState(null);
  const autoFaitRef = useRef(null);
  const souffleRef = useRef(null);
  const phaseKey = `${view?.roundNumber || 0}:${round?.phase || ''}`;
  const sonnerieKey = `${phaseKey}:${sablierPhase?.secondes || 0}`;
  const sablierSonne = sonnePour === sonnerieKey;

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

  /**
   * Fin du sablier de phase : rien n'est annulé. La console met en avant le passage au
   * souffle ; avec « Passer au souffle à la fin », elle y passe toute seule, une fois par
   * tour (dé gris tiré par l'app).
   */
  const sablierPhaseFini = useCallback(() => {
    sonnerie();
    setSonnePour(sonnerieKey);
    if (sablierPhase?.auto && round?.phase === 'jeu' && autoFaitRef.current !== phaseKey) {
      autoFaitRef.current = phaseKey;
      act(() => tourApi.phase('souffle', {}));
    }
  }, [sonnerie, sonnerieKey, sablierPhase?.auto, round?.phase, phaseKey, act, tourApi]);
  const reglerSablier = useCallback((body) => act(() => tourApi.sablier(body)), [act, tourApi]);

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
          {surface !== 'tableau' ? (
            <GLButton
              type="button"
              variant="secondary"
              disabled={tourApi.busy}
              onClick={() => act(() => tourApi.toutAuTableau(true))}
              data-testid="gl-tour-tout-au-tableau"
            >
              Tout au tableau
            </GLButton>
          ) : view?.surfaceAvantTableau ? (
            <GLButton
              type="button"
              variant="secondary"
              disabled={tourApi.busy}
              onClick={() => act(() => tourApi.toutAuTableau(false))}
              data-testid="gl-tour-rendre-la-main"
            >
              Rendre la main aux équipes
            </GLButton>
          ) : null}
          {view?.demandesEnAttente ? (
            <a
              href="#gl-demandes"
              className="gl-demandes__pastille"
              data-testid="gl-demandes-pastille"
            >
              Demandes : {view.demandesEnAttente}
            </a>
          ) : null}
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
        {surface !== 'tableau' ? (
          <GLClassLinkPanel game={game} teams={teams} refreshKey={refreshKey} />
        ) : null}
        {round?.phase === 'clos' && round.durees?.libelle ? (
          <p className="gl-hint gl-tour-durees" data-testid="gl-tour-durees">
            Ce tour : {round.durees.libelle}
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
          <div id="gl-demandes">
            <GLDemandesPanel
              game={game}
              teams={teams}
              tourApi={tourApi}
              refreshKey={refreshKey}
              total={view?.demandesEnAttente ?? null}
              roundNumber={view?.roundNumber || 0}
              onChanged={async () => {
                await tourApi.refresh();
                await onReloadGame?.();
                setRefreshKey((k) => k + 1);
              }}
              showFailure={showFailure}
            />
          </div>
          {surface === 'tableau' && round?.phase === 'jeu' ? (
            sablierActif ? (
              <GLTourSablier
                seconds={Number(sablier?.equipeSecondes ?? settings.sablier_secondes) || 180}
                resetKey={round.equipeActiveId}
                running
                onDone={sonnerie}
                reglages={sablier}
                onRegler={reglerSablier}
                busy={tourApi.busy}
              />
            ) : (
              <GLSablierReglage
                mode="equipe"
                reglages={sablier}
                onRegler={reglerSablier}
                busy={tourApi.busy}
              />
            )
          ) : null}
          {surface !== 'tableau' && round?.phase === 'jeu' ? (
            sablierPhase ? (
              <GLSablier
                mode="phase"
                secondes={sablierPhase.secondes}
                restantSecondes={sablierPhase.restantSecondes}
                enPause={sablierPhase.enPause}
                onDone={sablierPhaseFini}
                doneHint="le sablier du tour a sonné (rien n’est annulé)"
                reglages={sablier}
                onRegler={reglerSablier}
                busy={tourApi.busy}
                testId="gl-sablier-phase"
              />
            ) : (
              <GLSablierReglage
                mode="phase"
                reglages={sablier}
                onRegler={reglerSablier}
                busy={tourApi.busy}
              />
            )
          ) : null}
          {sablierSonne && round?.phase === 'jeu' && surface !== 'tableau' ? (
            <p className="gl-tour-sablier-alerte" role="status" data-testid="gl-sablier-alerte">
              Le sablier a sonné : c’est le moment de passer au souffle.{' '}
              <GLButton
                type="button"
                size="sm"
                onClick={() => {
                  souffleRef.current?.scrollIntoView?.({ block: 'center' });
                  souffleRef.current?.querySelector?.('button, select')?.focus?.();
                }}
              >
                Passer au souffle
              </GLButton>
            </p>
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
                presence={
                  view?.presences?.requise
                    ? (view.presences.equipes || []).find(
                        (e) => Number(e.teamId) === Number(team.id),
                      ) || null
                    : null
                }
                roster={roster}
                onArrivee={(teamId, playerId) => act(() => tourApi.arrivee(playerId, teamId))}
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

          {round?.arriveesEnSuspens?.length ? (
            <section className="gl-gameplay-block" data-testid="gl-tour-arrivees-suspens">
              <h3>Jets en attente (Relance possible)</h3>
              <p className="gl-hint">
                La case d’arrivée s’affiche mais ne s’applique qu’au jet gardé — ou d’office dès
                qu’une autre équipe joue.
              </p>
              {round.arriveesEnSuspens.map((a) => (
                <div key={a.teamId} className="gl-inline-actions">
                  <span>
                    {orderedTeams.find((t) => Number(t.id) === a.teamId)?.name ||
                      `Équipe ${a.teamId}`}{' '}
                    : {a.total} → case {numeroCase(a.index) ?? '?'}
                    {a.label ? ` « ${a.label} »` : ''}
                  </span>
                  <GLButton
                    type="button"
                    disabled={tourApi.busy}
                    onClick={() => act(() => tourApi.garderJet(a.teamId))}
                  >
                    Appliquer la case
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
            <div
              ref={souffleRef}
              className={sablierSonne && surface !== 'tableau' ? 'gl-tour-souffle-attention' : ''}
            >
              <GLTourSouffle
                round={round}
                voileActif={settings.voile !== false}
                voileFerme={voileFerme}
                disabled={tourApi.busy}
                onSouffle={(body) => act(() => tourApi.phase('souffle', body))}
              />
            </div>
          ) : round && round.phase !== 'ouverture' ? (
            <GLTourSouffle
              round={round}
              voileActif={settings.voile !== false}
              voileFerme={voileFerme}
              disabled
            />
          ) : null}

          {round ? (
            <section className="gl-gameplay-block" data-testid="gl-tour-absences">
              <h3>Absences, retrait, mot de passe</h3>
              <p className="gl-hint">
                Tout le monde est présent d’office. Un retrait se lève tout seul à la fin du tour.
              </p>
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
                    <GLButton
                      type="button"
                      variant="ghost"
                      disabled={tourApi.busy}
                      data-testid={`gl-tour-mdp-${p.playerId}`}
                      onClick={async () => {
                        setMotDePasse(null);
                        try {
                          const res = await tourApi.motDePasse(p.playerId);
                          if (res?.motDePasse) {
                            setMotDePasse({ playerId: p.playerId, valeur: res.motDePasse });
                          }
                        } catch (err) {
                          showFailure?.(err.message || 'Mot de passe non réinitialisé');
                        }
                      }}
                    >
                      Mot de passe oublié
                    </GLButton>
                    {motDePasse && Number(motDePasse.playerId) === Number(p.playerId) ? (
                      <span className="gl-tour-mdp" role="status" data-testid="gl-tour-mdp">
                        Mot de passe provisoire : <strong>{motDePasse.valeur}</strong> (à changer à
                        la connexion){' '}
                        <GLButton
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setMotDePasse(null)}
                        >
                          Masquer
                        </GLButton>
                      </span>
                    ) : null}
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
