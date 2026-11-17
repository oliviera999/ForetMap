import { useEffect, useRef, useState } from 'react';
import { GLButton } from '../ui/GLButton.jsx';
import { useGlTrameDefi } from '../../hooks/useGlTrameDefi.js';
import { GLTrameBoard } from './GLTrameBoard.jsx';

const CONSIGNES = Object.freeze({
  retisser:
    'Relie les cartes : chaque flèche va de celui qui est mangé vers celui qui mange. Touche une carte, puis celle qui la mange.',
  fils: 'Relie chaque cause à son effet : touche une carte, puis celle qu’elle provoque.',
  alteree:
    'La carte grisée a disparu de ce milieu. Pour chaque autre carte, dis ce qu’elle devient, puis vérifie.',
  reparer:
    'Range les six espèces, lis la leçon, puis choisis ce qui protégerait deux espèces menacées.',
});

const PREDICTIONS = Object.freeze([
  ['augmente', '↑', 'il y en a plus'],
  ['diminue', '↓', 'il y en a moins'],
  ['disparait', '✕', 'il n’y en a plus'],
  ['rien', '=', 'pas de changement'],
]);

const CATEGORIES = Object.freeze({
  en_danger: 'En danger',
  fragile: 'Fragile',
  pas_menace: 'Pas menacée',
});

/** Libellé d'une flèche posée, lu par un lecteur d'écran : « A provoque B ». */
const FLECHE_LABELS = Object.freeze({ fils: 'provoque', adaptation: 'mène à' });

/** Retisser, Les fils cachés et Les fils de l'adaptation : poser et retirer des flèches. */
function Tisser({ defi, vue, enregistrer, indice }) {
  const fleches = vue.fleches || [];
  const brutes = fleches.map((f) => ({ de: f.de, vers: f.vers }));
  const base = { fleches: brutes, positions: vue.positions || {} };
  return (
    <GLTrameBoard
      cartes={defi.cartes}
      fleches={fleches}
      flecheLabel={FLECHE_LABELS[defi.type] || 'sert de nourriture à'}
      suggestion={indice?.lien || null}
      disabled={defi.statut === 'reussi'}
      onAjouter={(de, vers) =>
        enregistrer({
          ...base,
          fleches: [...brutes.filter((f) => !(f.de === de && f.vers === vers)), { de, vers }],
        })
      }
      onRetirer={(de, vers) =>
        enregistrer({ ...base, fleches: brutes.filter((f) => !(f.de === de && f.vers === vers)) })
      }
    />
  );
}

/** La trame altérée : une prédiction par carte, puis « Vérifier ». */
function Alteree({ defi, vue, enregistrer }) {
  const predictions = vue.predictions || {};
  const verifiee = new Map((vue.verification || []).map((c) => [c.code, c]));
  const fini = defi.statut === 'reussi';
  const choisir = (code, valeur) =>
    enregistrer({ predictions: { ...predictions, [code]: valeur }, verifie: false });
  const aPrevoir = defi.cartes.filter((c) => c.code !== defi.retiree);
  const pret = aPrevoir.every((c) => predictions[c.code]);
  return (
    <>
      {/* Le sens des quatre boutons est écrit : un `title` ne se lit pas au doigt. */}
      <p className="gl-trame-prediction__legende" data-testid="gl-trame-prediction-legende">
        {PREDICTIONS.map(([valeur, picto, label]) => (
          <span key={valeur}>
            <strong aria-hidden="true">{picto}</strong> {label}
          </span>
        ))}
      </p>
      <GLTrameBoard
        cartes={defi.cartes}
        liensFixes={defi.liens}
        grisee={defi.retiree}
        sousCarte={(carte) => {
          if (carte.code === defi.retiree) return <span className="gl-hint">carte retirée</span>;
          const v = verifiee.get(carte.code);
          return (
            <div className="gl-trame-prediction">
              <div
                className="gl-trame-prediction__choix"
                role="radiogroup"
                aria-label={`Que devient ${carte.nom} ?`}
              >
                {PREDICTIONS.map(([valeur, picto, label]) => (
                  <button
                    key={valeur}
                    type="button"
                    role="radio"
                    aria-checked={predictions[carte.code] === valeur}
                    aria-label={`${carte.nom} : ${label}`}
                    title={label}
                    className={`gl-trame-prediction__bouton${
                      predictions[carte.code] === valeur ? ' is-choisi' : ''
                    }`}
                    disabled={fini}
                    onClick={() => choisir(carte.code, valeur)}
                    data-testid={`gl-trame-prediction-${carte.code}-${valeur}`}
                  >
                    {picto}
                  </button>
                ))}
              </div>
              {v ? (
                <p
                  className={`gl-trame-prediction__retour${v.juste ? ' is-juste' : ''}`}
                  data-testid={`gl-trame-retour-${carte.code}`}
                >
                  <span aria-hidden="true">{v.juste ? '✓ ' : '… '}</span>
                  {v.message}
                </p>
              ) : null}
            </div>
          );
        }}
      />
      {!fini ? (
        <GLButton
          type="button"
          variant="primary"
          disabled={!pret}
          onClick={() => enregistrer({ predictions, verifie: true }, { toutDeSuite: true })}
          data-testid="gl-trame-verifier"
        >
          Vérifier
        </GLButton>
      ) : null}
      {!pret && !fini ? (
        <p className="gl-hint">Choisis une réponse pour chaque carte avant de vérifier.</p>
      ) : null}
      {defi.message ? <p role="status">{defi.message}</p> : null}
      {defi.pourAllerPlusLoin ? (
        <p className="gl-trame-plus-loin" data-testid="gl-trame-plus-loin">
          <strong>Pour aller plus loin :</strong> {defi.pourAllerPlusLoin}
        </p>
      ) : null}
    </>
  );
}

/** Réparer : trois colonnes, la leçon, puis les mesures. */
function Reparer({ defi, vue, enregistrer }) {
  const rangement = vue.rangement || {};
  const choix = vue.choix || {};
  const fini = defi.statut === 'reussi';
  const base = {
    rangement,
    mesures: choix,
    leconLue: vue.leconLue === true,
    pourquoi: vue.pourquoi || '',
  };
  const verifie = new Map((defi.rangementVerifie || []).map((c) => [c.code, c]));
  const mesuresVerifiees = new Map((defi.mesuresVerifiees || []).map((e) => [e.code, e]));
  const ranger = (code, categorie) =>
    enregistrer({ ...base, rangement: { ...rangement, [code]: categorie } });
  const basculer = (code, mesure) => {
    const actuelles = choix[code] || [];
    const suivantes = actuelles.includes(mesure)
      ? actuelles.filter((m) => m !== mesure)
      : [...actuelles, mesure];
    enregistrer({ ...base, mesures: { ...choix, [code]: suivantes } });
  };
  return (
    <div className="gl-trame-reparer">
      <div className="gl-trame-reparer__colonnes">
        {Object.entries(CATEGORIES).map(([cle, label]) => (
          <section key={cle} className="gl-trame-reparer__colonne" aria-label={label}>
            <h5>{label}</h5>
            <ul>
              {defi.aClasser
                .filter((e) => rangement[e.code] === cle)
                .map((e) => (
                  <li key={e.code} data-testid={`gl-trame-range-${e.code}`}>
                    {e.nom}
                    {verifie.get(e.code) ? (
                      <span className="gl-hint">
                        {' '}
                        <span aria-hidden="true">{verifie.get(e.code).juste ? '✓' : '…'}</span>{' '}
                        {verifie.get(e.code).message}
                      </span>
                    ) : null}
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
      <ul className="gl-trame-reparer__especes">
        {defi.aClasser.map((e) => (
          <li key={e.code}>
            <strong>{e.nom}</strong>
            <span className="gl-inline-actions" role="group" aria-label={`Ranger ${e.nom}`}>
              {Object.entries(CATEGORIES).map(([cle, label]) => (
                <GLButton
                  key={cle}
                  type="button"
                  size="sm"
                  variant={rangement[e.code] === cle ? 'primary' : 'ghost'}
                  aria-pressed={rangement[e.code] === cle}
                  disabled={fini}
                  onClick={() => ranger(e.code, cle)}
                  data-testid={`gl-trame-ranger-${e.code}-${cle}`}
                >
                  {label}
                </GLButton>
              ))}
            </span>
          </li>
        ))}
      </ul>

      {defi.lecon ? (
        <section className="gl-trame-reparer__lecon" data-testid="gl-trame-lecon">
          <h5>La leçon du plateau</h5>
          <p>{defi.lecon}</p>
          {!vue.leconLue ? (
            <GLButton
              type="button"
              onClick={() => enregistrer({ ...base, leconLue: true })}
              data-testid="gl-trame-lecon-lue"
            >
              J’ai lu
            </GLButton>
          ) : null}
        </section>
      ) : null}

      {defi.lecon && vue.leconLue ? (
        <section className="gl-trame-reparer__mesures" data-testid="gl-trame-mesures">
          <h5>Que faire pour elles ?</h5>
          <p className="gl-hint">
            Choisis au moins une mesure qui répond à la menace, pour {defi.requises} espèces.
          </p>
          {defi.especes.map((e) => (
            <fieldset key={e.code} className="gl-trame-reparer__espece">
              <legend>
                {e.nom}
                {e.signalee ? <span className="gl-hint"> · signalée par une Licorne</span> : null}
              </legend>
              <p>{e.menace}</p>
              <div className="gl-trame-reparer__choix">
                {defi.mesures.map((m) => (
                  <label key={m.code}>
                    <input
                      type="checkbox"
                      checked={(choix[e.code] || []).includes(m.code)}
                      disabled={fini}
                      onChange={() => basculer(e.code, m.code)}
                      data-testid={`gl-trame-mesure-${e.code}-${m.code}`}
                    />{' '}
                    {m.texte}
                  </label>
                ))}
              </div>
              {mesuresVerifiees.get(e.code)?.message ? (
                <p className="gl-hint" role="status">
                  {mesuresVerifiees.get(e.code).message}
                </p>
              ) : null}
            </fieldset>
          ))}
          <label className="gl-trame-reparer__pourquoi">
            <span>Dis pourquoi (facultatif)</span>
            <textarea
              maxLength={280}
              rows={2}
              value={vue.pourquoi || ''}
              disabled={fini}
              onChange={(event) => enregistrer({ ...base, pourquoi: event.target.value })}
            />
          </label>
        </section>
      ) : null}
    </div>
  );
}

/**
 * Ranger (« Le bon rôle », « Le bon pays », ensemble unifié M21) : des cartes, des catégories —
 * le plateau de Réparer, sans leçon ni mesures. Une carte bien rangée reçoit son « pourquoi » ;
 * une autre « Pas encore. », jamais la réponse. Le bilan arrive à la réussite.
 */
function Ranger({ defi, vue, enregistrer }) {
  const rangement = vue.rangement || {};
  const fini = defi.statut === 'reussi';
  const categories = defi.categories || [];
  // Le retour du serveur ne vaut que pour la colonne qu'il a vue (un geste en cours l'efface).
  const verifie = new Map(
    (defi.rangementVerifie || [])
      .filter((c) => defi.rangement?.[c.code] === rangement[c.code])
      .map((c) => [c.code, c]),
  );
  const ranger = (code, categorie) =>
    enregistrer({ rangement: { ...rangement, [code]: categorie } });
  return (
    <div className="gl-trame-reparer gl-trame-ranger">
      <div className="gl-trame-reparer__colonnes gl-trame-ranger__colonnes">
        {categories.map((cat) => (
          <section key={cat.code} className="gl-trame-reparer__colonne" aria-label={cat.nom}>
            <h5>{cat.nom}</h5>
            {cat.aide ? <p className="gl-hint">{cat.aide}</p> : null}
            <ul>
              {defi.cartes
                .filter((c) => rangement[c.code] === cat.code)
                .map((c) => (
                  <li key={c.code} data-testid={`gl-trame-range-${c.code}`}>
                    {verifie.get(c.code) ? (
                      <span aria-hidden="true">{verifie.get(c.code).juste ? '✓ ' : '… '}</span>
                    ) : null}
                    {c.nom}
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
      <ul className="gl-trame-reparer__especes">
        {defi.cartes.map((c) => {
          const v = verifie.get(c.code);
          return (
            <li key={c.code} className="gl-trame-ranger__carte">
              <strong>{c.nom}</strong>
              {c.indice ? (
                <span className="gl-trame-ranger__indice" data-testid={`gl-trame-indice-${c.code}`}>
                  {' '}
                  {c.indice}
                </span>
              ) : null}
              <span className="gl-inline-actions" role="group" aria-label={`Ranger ${c.nom}`}>
                {categories.map((cat) => (
                  <GLButton
                    key={cat.code}
                    type="button"
                    size="sm"
                    variant={rangement[c.code] === cat.code ? 'primary' : 'ghost'}
                    aria-pressed={rangement[c.code] === cat.code}
                    disabled={fini}
                    onClick={() => ranger(c.code, cat.code)}
                    data-testid={`gl-trame-ranger-${c.code}-${cat.code}`}
                  >
                    {cat.nom}
                  </GLButton>
                ))}
              </span>
              {v ? (
                <p
                  className={`gl-trame-prediction__retour${v.juste ? ' is-juste' : ''}`}
                  role="status"
                  data-testid={`gl-trame-retour-${c.code}`}
                >
                  <span aria-hidden="true">{v.juste ? '✓ ' : '… '}</span>
                  {v.message}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
      {defi.bilan ? (
        <p className="gl-trame-plus-loin" data-testid="gl-trame-bilan">
          {defi.bilan}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Un défi de la Trame à l'écran (« Tenir à deux », lot 3) : consigne, plateau du défi, indices
 * gratuits, et la réussite quand elle vient. L'état affiché suit le geste tout de suite ; le
 * classement et les vérifications reviennent du serveur.
 *
 * @param {object} p
 * @param {number} p.gameId
 * @param {{ type: string, unite: string, teamId?: number|null }} p.cible
 * @param {() => void} [p.onRetour]
 * @param {() => void} [p.onReussi]
 */
export function GLDefiPlayer({ gameId, cible, onRetour = null, onReussi = null }) {
  const { defi, etat, error, busy, reussite, indice, enregistrer, demanderIndice } = useGlTrameDefi(
    { gameId, cible, onReussi },
  );
  const [indiceOuvert, setIndiceOuvert] = useState(false);
  const reussiRef = useRef(null);
  const fini = defi?.statut === 'reussi';
  useEffect(() => {
    if (fini) reussiRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [fini]);
  if (!defi) {
    return (
      <section className="gl-defi gl-gameplay-block" data-testid="gl-defi">
        {error ? <p className="gl-error-banner">{error}</p> : null}
        {busy ? (
          <p className="gl-hint" role="status">
            Chargement du défi…
          </p>
        ) : null}
        {onRetour ? (
          <GLButton type="button" variant="ghost" onClick={onRetour}>
            Retour aux défis
          </GLButton>
        ) : null}
      </section>
    );
  }
  // L'état local (geste en cours d'envoi) prime sur celui du serveur, sans son classement.
  const vue = {
    ...defi,
    ...(etat || {}),
    ...(etat?.fleches
      ? {
          fleches: etat.fleches.map(
            (f) =>
              (defi.fleches || []).find((s) => s.de === f.de && s.vers === f.vers) || {
                ...f,
                classement: null,
                message: '',
              },
          ),
        }
      : {}),
    ...(etat?.mesures ? { choix: etat.mesures } : {}),
  };
  const Jeu =
    defi.type === 'alteree'
      ? Alteree
      : defi.type === 'reparer'
        ? Reparer
        : defi.type === 'ranger'
          ? Ranger
          : Tisser;
  // Ranger et les fils de l'adaptation portent un titre complet (« Le bon rôle · Savane »).
  const titreSeul = defi.type === 'ranger' || defi.type === 'adaptation';
  return (
    <section className="gl-defi gl-gameplay-block" data-testid="gl-defi" data-type={defi.type}>
      <header className="gl-defi__tete">
        <div>
          <h4>
            {titreSeul && defi.titre ? defi.titre : defi.libelle}
            {!titreSeul && defi.titre && defi.titre !== defi.libelle ? ` — ${defi.titre}` : ''}
            {defi.niveau ? ` · ${defi.niveau} cartes` : ''}
          </h4>
          <p>{defi.consigne || CONSIGNES[defi.type]}</p>
          {defi.critere && (defi.type === 'retisser' || defi.type === 'adaptation') ? (
            <p className="gl-hint">Pour finir : {defi.critere}</p>
          ) : null}
        </div>
        <div className="gl-inline-actions">
          {!fini ? (
            <GLButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={async () => {
                await demanderIndice();
                setIndiceOuvert(true);
              }}
              data-testid="gl-defi-indice"
            >
              Un indice
            </GLButton>
          ) : null}
          {onRetour ? (
            <GLButton type="button" variant="ghost" size="sm" onClick={onRetour}>
              Retour aux défis
            </GLButton>
          ) : null}
        </div>
      </header>
      {error ? <p className="gl-error-banner">{error}</p> : null}
      {indiceOuvert && indice ? (
        <p className="gl-defi__indice" role="status" data-testid="gl-defi-indice-texte">
          <span aria-hidden="true">💡 </span>
          {indice.message}
        </p>
      ) : null}
      {/* Au-dessus du plateau : la réussite se voit sans avoir à défiler. */}
      {fini ? (
        <div className="gl-defi__reussi" role="status" data-testid="gl-defi-reussi" ref={reussiRef}>
          <strong>Défi réussi.</strong> La Trame se resserre.
          {reussite?.page ? ' Une page de veillée rejoint ton carnet.' : ''}
          {reussite?.message ? ` ${reussite.message}` : ''}
        </div>
      ) : null}
      <Jeu defi={defi} vue={vue} enregistrer={enregistrer} indice={indiceOuvert ? indice : null} />
    </section>
  );
}
