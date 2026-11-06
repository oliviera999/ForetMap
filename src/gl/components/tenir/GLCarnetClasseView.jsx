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
                  {p.trouveePar ? ` · trouvée par ${p.trouveePar.name}` : ''}
                  {p.tenuePar ? ` · tenue par ${p.tenuePar.name}` : ''}
                  {p.palissementPct > 0 ? ` · pâlie à ${p.palissementPct} %` : ''}
                </div>
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
