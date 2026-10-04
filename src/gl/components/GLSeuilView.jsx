import { useEffect, useMemo, useState } from 'react';
import '../styles/gl-seuil.css';
import { useGLVoyageur } from '../hooks/useGLVoyageur.js';
import { isModuleEnabled } from '../constants/modules.js';
import { GLButton } from './ui/GLButton.jsx';
import { GLMascotAvatar } from './GLMascotAvatar.jsx';

const SEEN_LEVEL_KEY = 'gl_voyageur_seen_level';

const REGARD_META = {
  proche: { label: 'Regard du proche', emoji: '🍄', hint: 'observer, nommer, mesurer' },
  loin: { label: 'Regard du loin', emoji: '🦄', hint: 'raconter, relier, se souvenir' },
};

const EXPEDITION_STATUS = {
  live: 'Séance en cours : ton expédition est sur le plateau.',
  paused: 'Ton expédition campe entre deux séances. Ce que tu apprends ici te fait grandir.',
  draft: 'Ton expédition se prépare : la séance n’a pas encore commencé.',
  ended: 'Expédition terminée. La prochaine traversée se prépare.',
};

function formatTraverseeDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function readSeenLevel() {
  try {
    const n = Number(localStorage.getItem(SEEN_LEVEL_KEY));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch (_) {
    return null;
  }
}

function writeSeenLevel(level) {
  try {
    localStorage.setItem(SEEN_LEVEL_KEY, String(level));
  } catch (_) {
    // noop
  }
}

/**
 * Suggestions « Ce soir, tu peux… » : on pousse vers le regard le moins exercé, puis vers
 * l'autre, puis vers un sortilège prêt (ou le plateau si la séance est en cours).
 * Les onglets dont le module est éteint ne sont jamais proposés.
 */
export function buildSeuilSuggestions(data, modules) {
  if (!data) return [];
  const proche = data.regards?.proche?.points ?? 0;
  const loin = data.regards?.loin?.points ?? 0;
  const forProche = [
    { id: 'species', icon: '🦋', label: 'Étudie une espèce dans La nature', tab: 'biodiversite' },
    { id: 'glossary', icon: '📚', label: 'Apprends un mot du glossaire', tab: 'glossary' },
  ];
  const forLoin = [
    {
      id: 'carnet',
      icon: '📒',
      label: 'Relis ton Carnet de Sélène',
      tab: 'selene-carnet',
      module: 'loreCarnetEnabled',
    },
    {
      id: 'journal',
      icon: '📔',
      label: 'Écris un article dans Mon journal',
      tab: 'my-journal',
      module: 'playerJournalEnabled',
    },
    {
      id: 'lore',
      icon: '📜',
      label: 'Découvre un mot du lexique lore',
      tab: 'lore-glossary',
      module: 'loreGlossaryEnabled',
    },
  ];
  const allowed = (s) => !s.module || isModuleEnabled(modules, s.module);
  const weakFirst = proche <= loin ? [forProche, forLoin] : [forLoin, forProche];
  const out = [];
  const first = weakFirst[0].find(allowed);
  const second = weakFirst[1].find(allowed);
  if (first) out.push(first);
  if (second) out.push(second);
  const readySpell = (data.grimoire || []).find((s) => s.unlocked && s.charged);
  if (readySpell) {
    out.push({
      id: 'spell',
      icon: readySpell.emoji,
      label: `Ton sortilège ${readySpell.name} est prêt`,
      anchor: 'gl-seuil-grimoire',
    });
  } else if (data.expedition?.gameStatus === 'live') {
    out.push({
      id: 'board',
      icon: '🗺️',
      label: 'Rejoins ton expédition sur le plateau',
      tab: 'maps',
    });
  }
  return out.slice(0, 3);
}

function LevelRing({ data }) {
  const span = Math.max(1, data.nextLevelAt - data.levelStart);
  const ratio = Math.min(1, Math.max(0, (data.points - data.levelStart) / span));
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="gl-seuil-ring" aria-hidden="true">
      <svg viewBox="0 0 120 120" width="132" height="132">
        <circle className="gl-seuil-ring__track" cx="60" cy="60" r={radius} />
        <circle
          className="gl-seuil-ring__fill"
          cx="60"
          cy="60"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          transform="rotate(-90 60 60)"
        />
      </svg>
      <span className="gl-seuil-ring__center">
        <span className="gl-seuil-ring__emoji foretmap-emoji-text-mixed">{data.stage?.emoji}</span>
        <span className="gl-seuil-ring__level">Niveau {data.level}</span>
      </span>
    </div>
  );
}

function RegardBar({ regard, data }) {
  const meta = REGARD_META[regard];
  const value = data.regards?.[regard]?.points ?? 0;
  const total = Math.max(
    1,
    (data.regards?.proche?.points ?? 0) + (data.regards?.loin?.points ?? 0),
  );
  const sources = (data.regards?.[regard]?.sources || []).filter((s) => s.count > 0);
  return (
    <div className={`gl-seuil-regard gl-seuil-regard--${regard}`}>
      <div className="gl-seuil-regard__head">
        <span className="foretmap-emoji-text-mixed" aria-hidden>
          {meta.emoji}
        </span>{' '}
        <strong>{meta.label}</strong>
        <span className="gl-seuil-regard__value">{value} pt</span>
      </div>
      <div
        className="gl-seuil-regard__bar"
        role="progressbar"
        aria-label={`${meta.label} : ${value} points`}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={value}
      >
        <span style={{ width: `${Math.round((value / total) * 100)}%` }} />
      </div>
      <p className="gl-seuil-regard__hint">
        {sources.length
          ? sources.map((s) => `${s.label} : ${s.count}`).join(' · ')
          : `Pour l’instant rien ici : ${meta.hint}.`}
      </p>
    </div>
  );
}

function SpellCard({ spell, onCast, loadTargets }) {
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [justCast, setJustCast] = useState(false);

  const openPicker = async () => {
    setOpen(true);
    setMessage('');
    setTargets(null);
    try {
      setTargets(await loadTargets(spell.code));
    } catch (err) {
      setTargets({ items: [], emptyMessage: err?.message || 'Impossible de charger les cibles.' });
    }
  };

  const cast = async (target) => {
    setBusy(true);
    setMessage('');
    try {
      await onCast(spell.code, target.target);
      setOpen(false);
      setJustCast(true);
      setMessage(`${spell.emoji} ${spell.name} lancé sur « ${target.label} ».`);
    } catch (err) {
      setMessage(err?.message || 'Le sortilège a échoué.');
    } finally {
      setBusy(false);
    }
  };

  let status;
  if (!spell.unlocked) status = `S’ouvre au niveau ${spell.levelRequired}`;
  else if (spell.charged && spell.targetKind === 'qcm')
    status = 'Prêt — se lance pendant une question';
  else if (spell.charged) status = 'Prêt';
  else status = `Se recharge : encore ${spell.pointsToRecharge} point(s) à gagner`;

  return (
    <li
      className={`gl-seuil-spell${spell.unlocked ? '' : ' is-locked'}${
        spell.unlocked && spell.charged ? ' is-ready' : ''
      }${justCast ? ' is-cast' : ''}`}
      onAnimationEnd={() => setJustCast(false)}
    >
      <div className="gl-seuil-spell__head">
        <span className="gl-seuil-spell__emoji foretmap-emoji-text-mixed" aria-hidden>
          {spell.unlocked ? spell.emoji : '🔒'}
        </span>
        <div>
          <strong>{spell.name}</strong>
          <span className={`gl-seuil-tag gl-seuil-tag--${spell.regard}`}>
            {REGARD_META[spell.regard]?.label}
          </span>
        </div>
      </div>
      <p className="gl-seuil-spell__desc">{spell.description}</p>
      <p className="gl-seuil-spell__status">{status}</p>
      {spell.unlocked && spell.charged && spell.targetKind !== 'qcm' && !open ? (
        <GLButton type="button" variant="primary" size="sm" onClick={openPicker}>
          Lancer
        </GLButton>
      ) : null}
      {open ? (
        <div className="gl-seuil-spell__picker">
          {!targets ? (
            <p role="status">Recherche des cibles…</p>
          ) : targets.items?.length ? (
            <>
              <p className="gl-seuil-spell__pick-label">Sur quoi lancer {spell.name} ?</p>
              <ul className="gl-seuil-spell__targets">
                {targets.items.map((t) => (
                  <li key={t.target}>
                    <GLButton
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() => cast(t)}
                    >
                      {t.label}
                      {t.effacementPct ? ` (effacé à ${t.effacementPct} %)` : ''}
                    </GLButton>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>{targets.emptyMessage}</p>
          )}
          <GLButton type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Fermer
          </GLButton>
        </div>
      ) : null}
      {message ? (
        <p className="gl-seuil-spell__message" role="status">
          {message}
        </p>
      ) : null}
    </li>
  );
}

/**
 * « Le Seuil » — accueil du joueur à deux faces : moi (niveau à deux regards) et mon
 * expédition (l'équipe et sa mascotte), puis le grimoire du voyageur.
 */
export function GLSeuilView({ onNavigateTab, modules }) {
  const { data, loading, error, errorStatus, loadTargets, castSpell } = useGLVoyageur();
  const [levelUp, setLevelUp] = useState(null);
  const [gesture, setGesture] = useState(null);

  // Le geste dure le temps de l'animation ; minuterie plutôt que `animationend`, qui ne
  // vient jamais quand l'élève a réduit les mouvements.
  useEffect(() => {
    if (!gesture) return undefined;
    const timer = setTimeout(() => setGesture(null), 1800);
    return () => clearTimeout(timer);
  }, [gesture]);

  useEffect(() => {
    if (!data?.level) return;
    const seen = readSeenLevel();
    if (seen != null && data.level > seen) setLevelUp(data.level);
    if (seen == null || data.level > seen) writeSeenLevel(data.level);
  }, [data?.level]);

  const suggestions = useMemo(() => buildSeuilSuggestions(data, modules), [data, modules]);
  const nextSpell = useMemo(
    () => (data?.grimoire || []).find((s) => !s.unlocked) || null,
    [data?.grimoire],
  );

  if (loading && !data) {
    return (
      <div className="gl-seuil" role="status" aria-busy="true">
        <p className="gl-seuil__loading">Le Seuil s’ouvre…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="gl-seuil">
        <p className="gl-seuil__notice" role={errorStatus === 403 ? 'status' : 'alert'}>
          {errorStatus === 403
            ? 'Le Seuil est l’accueil des joueurs : il montre le niveau et l’expédition d’un élève.'
            : error}
        </p>
      </div>
    );
  }

  const go = (s) => {
    if (s.tab) onNavigateTab?.(s.tab);
    else if (s.anchor) document.getElementById(s.anchor)?.scrollIntoView?.({ behavior: 'smooth' });
  };

  const exp = data.expedition;

  return (
    <div className="gl-seuil fade-in">
      <header className="gl-seuil__header">
        <h2>Le Seuil</h2>
        <p>Ton voyage avance à ton rythme, même entre deux séances.</p>
      </header>

      {levelUp ? (
        <div className="gl-seuil-levelup" role="status">
          <span className="foretmap-emoji-text-mixed" aria-hidden>
            {data.stage?.emoji}
          </span>
          <div>
            <strong>Niveau {levelUp} atteint !</strong>
            <span> Tu es désormais {data.stage?.name}.</span>
          </div>
          <GLButton type="button" variant="ghost" size="sm" onClick={() => setLevelUp(null)}>
            Fermer
          </GLButton>
        </div>
      ) : null}

      <div className="gl-seuil__faces">
        <section
          className="gl-seuil-face gl-seuil-face--moi"
          aria-labelledby="gl-seuil-moi"
          data-gl-tour="seuil-moi"
        >
          <h3 id="gl-seuil-moi">Moi, voyageur</h3>
          <div className="gl-seuil-face__identity">
            <LevelRing data={data} />
            <div>
              <p className="gl-seuil-face__stage">{data.stage?.name}</p>
              <p className="gl-seuil-face__affinity">
                <span className="foretmap-emoji-text-mixed" aria-hidden>
                  {data.affinity?.emoji}
                </span>{' '}
                {data.affinity?.label}
              </p>
              <p className="gl-seuil-face__next">
                Encore <strong>{data.pointsToNextLevel}</strong> point(s) avant le niveau{' '}
                {data.level + 1}.
              </p>
              {nextSpell ? (
                <p className="gl-seuil-face__unlock">
                  Au niveau {nextSpell.levelRequired} : le sortilège {nextSpell.emoji}{' '}
                  {nextSpell.name}.
                </p>
              ) : null}
            </div>
          </div>
          <RegardBar regard="proche" data={data} />
          <RegardBar regard="loin" data={data} />
        </section>

        <section
          className="gl-seuil-face gl-seuil-face--expedition"
          aria-labelledby="gl-seuil-expedition"
        >
          <h3 id="gl-seuil-expedition">Mon expédition</h3>
          {exp ? (
            <div className="gl-seuil-expedition">
              <div
                className={`gl-seuil-mascot${gesture ? ` gl-seuil-mascot--${gesture.code}` : ''}`}
              >
                {gesture ? (
                  <span className="gl-seuil-mascot__bubble" role="status">
                    {gesture.bubble?.[exp.teamType] || gesture.bubble?.gnome}
                  </span>
                ) : null}
                <GLMascotAvatar
                  mascotId={exp.mascotId}
                  size={84}
                  fallbackType={exp.teamType === 'unicorn' ? 'unicorn' : 'gnome'}
                  fallbackLabel={exp.teamName}
                />
              </div>
              <div>
                <p className="gl-seuil-expedition__team">{exp.teamName}</p>
                <p className="gl-seuil-expedition__people">
                  {exp.teamType === 'unicorn' ? 'Peuple des licornes' : 'Peuple des gnomes'}
                  {exp.chapterTitle ? ` · ${exp.chapterTitle}` : ''}
                </p>
                <p className={`gl-seuil-expedition__status is-${exp.gameStatus}`}>
                  {EXPEDITION_STATUS[exp.gameStatus] || EXPEDITION_STATUS.paused}
                </p>
                {exp.teammates?.length ? (
                  <p className="gl-seuil-expedition__mates">Avec : {exp.teammates.join(', ')}</p>
                ) : null}
                {exp.gameStatus === 'live' ? (
                  <GLButton type="button" variant="primary" onClick={() => onNavigateTab?.('maps')}>
                    Rejoindre le plateau
                  </GLButton>
                ) : null}
                {data.gestures?.length ? (
                  <div className="gl-seuil-gestures" aria-label="Gestes de la mascotte">
                    {data.gestures.map((g) =>
                      g.unlocked ? (
                        <button
                          key={g.code}
                          type="button"
                          className="gl-seuil-gesture"
                          onClick={() => setGesture(g)}
                        >
                          <span className="foretmap-emoji-text-mixed" aria-hidden>
                            {g.emoji}
                          </span>{' '}
                          {g.name}
                        </button>
                      ) : (
                        <span key={g.code} className="gl-seuil-gesture is-locked">
                          🔒 {g.name} · niveau {g.levelRequired}
                        </span>
                      ),
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="gl-seuil-expedition__none">
              Ton compagnon t’attend à la prochaine traversée : ton professeur formera les
              expéditions. En attendant, ton voyage continue ici.
            </p>
          )}
        </section>
      </div>

      {suggestions.length ? (
        <section className="gl-seuil-tonight" aria-labelledby="gl-seuil-tonight">
          <h3 id="gl-seuil-tonight">Ce soir, tu peux…</h3>
          <ul>
            {suggestions.map((s) => (
              <li key={s.id}>
                <button type="button" className="gl-seuil-tonight__item" onClick={() => go(s)}>
                  <span className="foretmap-emoji-text-mixed" aria-hidden>
                    {s.icon}
                  </span>
                  <span>{s.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section
        className="gl-seuil-grimoire"
        id="gl-seuil-grimoire"
        aria-labelledby="gl-seuil-gri"
        data-gl-tour="seuil-grimoire"
      >
        <h3 id="gl-seuil-gri">Grimoire du voyageur</h3>
        <p className="gl-seuil-grimoire__intro">
          Tes sortilèges à toi, hors des chapitres. Ils s’ouvrent avec ton niveau et se rechargent
          quand tu apprends de nouvelles choses.
        </p>
        <ul className="gl-seuil-grimoire__list">
          {(data.grimoire || []).map((spell) => (
            <SpellCard
              key={spell.code}
              spell={spell}
              onCast={castSpell}
              loadTargets={loadTargets}
            />
          ))}
        </ul>
      </section>

      <section className="gl-seuil-traversees" aria-labelledby="gl-seuil-trav">
        <h3 id="gl-seuil-trav">Mes traversées</h3>
        {data.traversees?.length ? (
          <ul className="gl-seuil-traversees__list">
            {data.traversees.map((t) => (
              <li key={t.gameId} className="gl-seuil-traversee">
                <GLMascotAvatar
                  mascotId={t.mascotId}
                  size={48}
                  fallbackType={t.teamType === 'unicorn' ? 'unicorn' : 'gnome'}
                  fallbackLabel={t.teamName}
                />
                <div>
                  <p className="gl-seuil-traversee__team">{t.teamName}</p>
                  <p className="gl-seuil-traversee__meta">
                    {t.chapterTitle || t.gameName}
                    {formatTraverseeDate(t.endedAt) ? ` · ${formatTraverseeDate(t.endedAt)}` : ''}
                  </p>
                  {t.teammates?.length ? (
                    <p className="gl-seuil-traversee__meta">Avec : {t.teammates.join(', ')}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="gl-seuil-grimoire__intro">
            Tes expéditions terminées viendront se ranger ici, avec leur mascotte et tes compagnons
            de route.
          </p>
        )}
      </section>
    </div>
  );
}
