import { GLButton } from '../ui/GLButton.jsx';
import { GLTenirQuestionCard } from './GLTenirQuestionCard.jsx';

const ETAT_LABELS = {
  endormie: 'dort encore',
  revelee: 'révélée',
  trouvee: 'trouvée',
  tenue: 'tenue',
  palie: 'pâlie',
  reparee: 'réparée',
};

/**
 * Carnet de la classe (« Tenir à deux », spec § 5) : les N pages du plateau — indice, état,
 * découvreuse, tenue par, pâlissement pour l'équipe du lecteur. Boutons « Lire » (page trouvée)
 * ; la question de lecture s'affiche quand l'équipe peut tenir la page. Aucun polygone.
 * En dessous, « en marge » : les Lettres validées (L7), qui ne comptent pas pour le carnet.
 */
export function GLCarnetClasseView({ chasse, teamId = null, readOnly = false }) {
  const carnet = chasse?.carnet;
  if (!carnet) return null;
  const page = chasse.page;
  return (
    <section className="gl-carnet-classe gl-panel" data-testid="gl-carnet-classe">
      <header className="gl-carnet-classe__head">
        <h3>Carnet de la classe</h3>
        <p className="gl-hint">
          {carnet.tenues}/{carnet.total} pages tenues · {carnet.trouvees} trouvées
          {carnet.carnetCompletAt ? ' · carnet complet' : ''}
        </p>
      </header>
      {carnet.aReparer?.length ? (
        <p className="gl-carnet-classe__a-reparer" data-testid="gl-carnet-a-reparer">
          <strong>À réparer</strong> (signalé par une Licorne) :{' '}
          {carnet.aReparer.map((e) => e.nom).join(', ')}
        </p>
      ) : null}
      <ol className="gl-carnet-classe__pages">
        {(carnet.pages || []).map((p) => {
          const lisible = ['trouvee', 'reparee', 'tenue'].includes(p.etat);
          return (
            <li key={p.zoneKey} className={`gl-carnet-page gl-carnet-page--${p.etat}`}>
              <div className="gl-carnet-page__texte">
                <strong>{p.titre || p.indice}</strong>
                {p.titre ? <span className="gl-hint"> — {p.indice}</span> : null}
                <div className="gl-hint">
                  {ETAT_LABELS[p.etat] || p.etat}
                  {p.reveleePar ? ` · révélée par ${p.reveleePar.name}` : ''}
                  {p.trouveePar ? ` · trouvée par ${p.trouveePar.name}` : ''}
                  {p.tenuePar ? ` · tenue par ${p.tenuePar.name}` : ''}
                  {p.palissementPct > 0 ? ` · pâlie à ${p.palissementPct} %` : ''}
                </div>
                {/* Lot 2 : une page trouvée attend un lecteur de l'autre peuple ; une page que
                    l'équipe a trouvée et lue ne pâlit pas sous le voile. */}
                {p.protegee ? (
                  <span className="gl-carnet-pastille gl-carnet-pastille--protegee">protégée</span>
                ) : null}
                {p.attendUnLecteur ? (
                  <span className="gl-carnet-pastille">attend un lecteur</span>
                ) : null}
              </div>
              {!readOnly && lisible ? (
                <GLButton
                  type="button"
                  variant="ghost"
                  disabled={chasse.busy}
                  onClick={() => chasse.ouvrir(p.zoneKey, teamId)}
                >
                  Lire
                </GLButton>
              ) : null}
            </li>
          );
        })}
      </ol>
      {/* L7 : les Lettres validées sont des pages de voyageurs, en marge — hors du compte. */}
      {carnet.marge?.length ? (
        <div className="gl-carnet-classe__marge" data-testid="gl-carnet-marge">
          <h4>En marge : les pages des voyageurs</h4>
          <ul>
            {carnet.marge.map((m) => (
              <li key={m.feuilletCode}>
                « {m.titre} »{m.auteur ? <span className="gl-hint"> — {m.auteur}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {page ? (
        <article className="gl-carnet-page-ouverte" data-testid="gl-carnet-page-ouverte">
          <header>
            <h4>{page.feuillet?.titre || page.zoneKey}</h4>
            <GLButton type="button" variant="ghost" onClick={chasse.closePage}>
              Fermer
            </GLButton>
          </header>
          {page.palissementPct > 0 ? (
            <p className="gl-hint">Cette page a pâli pour ton équipe ({page.palissementPct} %).</p>
          ) : null}
          <div
            className="gl-carnet-page-ouverte__texte"
            style={page.palissementPct > 0 ? { opacity: 1 - page.palissementPct / 100 } : undefined}
          >
            {page.feuillet?.incipit ? <p>{page.feuillet.incipit}</p> : null}
            {page.feuillet?.texte ? <p>{page.feuillet.texte}</p> : null}
          </div>
          {page.peutTenir && page.question ? (
            <GLTenirQuestionCard
              question={page.question}
              title="Tenir la page"
              submitLabel="Tenir"
              disabled={chasse.busy}
              feedback={page.feedback || null}
              onAnswer={(choiceId) => chasse.tenir(choiceId, teamId)}
            />
          ) : page.etat === 'tenue' ? (
            <p className="gl-hint" role="status">
              {page.feedback || 'Page tenue à deux.'}
            </p>
          ) : null}
        </article>
      ) : null}
      {chasse.error ? <p className="gl-error-banner">{chasse.error}</p> : null}
    </section>
  );
}
