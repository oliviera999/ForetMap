import { getBuildBrand } from '../../../shared/brand/brandNames.js';
import { privacyNoticeHref } from '../../../shared/privacy/privacyNoticePath.js';
import { GLButton } from '../ui/GLButton.jsx';
import { GLParentsDemoQuiz } from './GLParentsDemoQuiz.jsx';

/**
 * Onglet **« Pour les parents »** de la vitrine (`?demo=parents`) : visible seulement dans
 * une session invitée ouverte par cette URL. Cinq étapes, cinq minutes, sur un téléphone :
 *
 * 1. l'univers (page d'introduction) ;
 * 2. le plateau de démonstration ;
 * 3. une fiche « nature » ;
 * 4. un quiz d'essai, sans trace ;
 * 5. ce que l'enfant apprend, et ce qu'il advient de ses données.
 *
 * Rien ici ne raconte le récit du jeu : la vitrine montre la matière et le cadre, l'histoire
 * reste aux élèves. Les ancres `data-gl-tour` portent la visite guidée `parents`
 * (`glDiscoveryTour.js`).
 */
const STEPS = Object.freeze([
  {
    key: 'univers',
    title: 'L’univers',
    text: 'Une introduction en deux minutes : qui joue, à quoi, et pourquoi en équipe.',
    tab: 'world',
    cta: 'Lire l’introduction',
  },
  {
    key: 'plateau',
    title: 'Le plateau',
    text: 'Lancez le dé, avancez sur le premier plateau et ouvrez les premiers feuillets.',
    tab: 'discovery',
    cta: 'Essayer le plateau',
  },
  {
    key: 'nature',
    title: 'Une fiche nature',
    text: 'Le décor d’un territoire et les espèces qui y vivent : la matière du cours, en jeu.',
    tab: 'ecosystemes',
    cta: 'Ouvrir une fiche',
  },
]);

const LEARNINGS = Object.freeze([
  {
    title: 'Observer et nommer',
    text: 'Reconnaître une espèce, la situer dans son milieu, utiliser le vocabulaire scientifique à bon escient.',
  },
  {
    title: 'Relier',
    text: 'Qui mange qui, qui dépend de quoi : les réseaux trophiques et les équilibres d’un écosystème.',
  },
  {
    title: 'Décider ensemble',
    text: 'Chaque tour se joue en équipe : argumenter, répartir les ressources, assumer un choix.',
  },
  {
    title: 'Raconter et consigner',
    text: 'Un carnet à compléter, des pages à réécrire : lire, résumer et garder une trace de ce qu’on a compris.',
  },
]);

export function GLParentsDemoView({ onNavigate, biomeSlugs = [] }) {
  const brand = getBuildBrand();
  const gameName = brand.glName || 'Gnomes & Licornes';
  const orgName = brand.orgName || '';

  return (
    <article className="gl-panel gl-parents-demo fade-in" data-testid="gl-parents-demo">
      <header className="gl-parents-demo__head">
        <p className="gl-parents-demo__eyebrow">Visite pour les parents</p>
        <h2>{gameName} en cinq minutes</h2>
        <p className="gl-hint">
          Vous découvrez le jeu tel que votre enfant le voit en classe
          {orgName ? ` (${orgName})` : ''}. Rien de ce que vous faites ici n’est enregistré.
        </p>
      </header>

      <section
        className="gl-parents-demo__section"
        data-gl-tour="parents-chemin"
        aria-labelledby="gl-parents-chemin-title"
      >
        <h3 id="gl-parents-chemin-title">Le chemin</h3>
        <ol className="gl-parents-demo__steps">
          {STEPS.map((step, index) => (
            <li key={step.key} className="gl-parents-demo__step">
              <span className="gl-parents-demo__step-num" aria-hidden="true">
                {index + 1}
              </span>
              <div className="gl-parents-demo__step-body">
                <strong>{step.title}</strong>
                <p>{step.text}</p>
                <GLButton
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => onNavigate?.(step.tab)}
                >
                  {step.cta}
                </GLButton>
              </div>
            </li>
          ))}
          <li className="gl-parents-demo__step">
            <span className="gl-parents-demo__step-num" aria-hidden="true">
              4
            </span>
            <div className="gl-parents-demo__step-body">
              <strong>Un quiz d’essai</strong>
              <p>Juste en dessous : une vraie question du jeu, sans note ni trace.</p>
            </div>
          </li>
          <li className="gl-parents-demo__step">
            <span className="gl-parents-demo__step-num" aria-hidden="true">
              5
            </span>
            <div className="gl-parents-demo__step-body">
              <strong>Ce que votre enfant apprend</strong>
              <p>Et ce qu’il advient de ses données : tout en bas de cette page.</p>
            </div>
          </li>
        </ol>
      </section>

      <section
        className="gl-parents-demo__section"
        id="gl-parents-quiz"
        data-gl-tour="parents-quiz"
        aria-labelledby="gl-parents-quiz-title"
      >
        <h3 id="gl-parents-quiz-title">Un quiz d’essai</h3>
        <p className="gl-hint">
          Les questions sont celles que rencontrent les équipes sur le plateau. Votre réponse ne
          compte pour personne et n’est pas conservée.
        </p>
        <GLParentsDemoQuiz biomeSlugs={biomeSlugs} />
      </section>

      <section
        className="gl-parents-demo__section"
        data-gl-tour="parents-apprentissages"
        aria-labelledby="gl-parents-apprentissages-title"
      >
        <h3 id="gl-parents-apprentissages-title">Ce que votre enfant apprend</h3>
        <ul className="gl-parents-demo__learnings">
          {LEARNINGS.map((item) => (
            <li key={item.title}>
              <strong>{item.title}</strong>
              <p>{item.text}</p>
            </li>
          ))}
        </ul>

        <h4>Qui anime ?</h4>
        <p>
          L’enseignant est le maître du jeu : il prépare la partie, mène les tours en classe, valide
          les actions des équipes et relit les carnets. Le jeu ne remplace pas le cours, il lui
          donne un terrain.
        </p>

        <h4>Et les données de votre enfant ?</h4>
        <ul className="gl-parents-demo__data">
          <li>
            Le compte est créé par l’enseignant, avec un pseudo : votre enfant n’a rien à fournir,
            ni adresse ni téléphone.
          </li>
          <li>Aucune publicité, aucun suivi commercial, aucun partage à des tiers.</li>
          <li>
            Ce qui est enregistré sert au suivi pédagogique (réponses, feuillets, carnet) et peut
            être exporté ou supprimé à la demande.
          </li>
          <li>
            Le détail est dans la notice{' '}
            <a href={privacyNoticeHref()} target="_blank" rel="noreferrer">
              « Vos données »
            </a>
            .
          </li>
        </ul>
      </section>
    </article>
  );
}
