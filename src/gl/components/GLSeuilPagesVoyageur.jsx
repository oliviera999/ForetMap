import { useState } from 'react';
import { GLButton } from './ui/GLButton.jsx';

/**
 * Le Seuil — « Ma Lettre » et « Mon Mentorat » (ensemble unifié, M23).
 *
 * Les deux sorts se paient une fois, pendant la partie. Leur suite se joue ici, sans rien
 * repayer : écrire sa Lettre (trois amorces d'Olu), la réécrire après un « pas encore », retenter
 * son Mentorat une autre séance. Tous les textes viennent du serveur (catalogue des sorts).
 */

const LETTRE_ETATS = {
  a_ecrire: 'Ta Lettre est payée : écris-la quand tu veux.',
  proposee: 'Ta page est en relecture chez ton professeur.',
};

export function GLSeuilLettre({ lettre, onEcrire }) {
  const [amorce, setAmorce] = useState(lettre?.amorce || lettre?.amorces?.[0]?.code || '');
  const [titre, setTitre] = useState(lettre?.titre || '');
  const [texte, setTexte] = useState(lettre?.texte || '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  if (!lettre) return null;
  const aEcrire = lettre.statut === 'a_ecrire' || lettre.statut === 'pas_encore';
  const choisie = (lettre.amorces || []).find((a) => a.code === amorce) || null;

  const envoyer = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await onEcrire(lettre.id, { amorce: amorce || null, titre, texte });
      setMessage('Ta page part en relecture chez ton professeur.');
    } catch (err) {
      setMessage(err?.message || 'Ta page n’a pas pu partir. Réessaie.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="gl-seuil-grimoire gl-seuil-lettre"
      aria-labelledby="gl-seuil-lettre"
      data-testid="gl-seuil-lettre"
      data-statut={lettre.statut}
    >
      <h3 id="gl-seuil-lettre">Ma Lettre</h3>
      {lettre.presentation ? (
        <p className="gl-seuil-grimoire__intro">{lettre.presentation}</p>
      ) : null}
      {lettre.retour ? (
        <p className="gl-seuil-spell__message" role="status">
          {lettre.retour}
        </p>
      ) : LETTRE_ETATS[lettre.statut] ? (
        <p className="gl-seuil-spell__status">{LETTRE_ETATS[lettre.statut]}</p>
      ) : null}
      {lettre.statut === 'pas_encore' && lettre.piste ? (
        <p className="gl-seuil-lettre__piste" data-testid="gl-seuil-lettre-piste">
          La piste de ton professeur : {lettre.piste}
        </p>
      ) : null}
      {aEcrire ? (
        <form className="gl-seuil-spell__picker gl-seuil-plume" onSubmit={envoyer}>
          {lettre.amorces?.length ? (
            <fieldset className="gl-seuil-lettre__amorces">
              <legend>Pour commencer, choisis une amorce</legend>
              {lettre.amorces.map((a) => (
                <label key={a.code} className="gl-seuil-lettre__amorce">
                  <input
                    type="radio"
                    name="gl-lettre-amorce"
                    value={a.code}
                    checked={amorce === a.code}
                    onChange={() => setAmorce(a.code)}
                  />
                  <span>{a.titre}</span>
                </label>
              ))}
              {choisie ? <p className="gl-seuil-spell__desc">{choisie.texte}</p> : null}
            </fieldset>
          ) : null}
          <label>
            Titre
            <input
              type="text"
              maxLength={160}
              value={titre}
              onChange={(e) => setTitre(e.target.value)}
              required
            />
          </label>
          <label>
            Ta page
            <textarea
              rows={6}
              maxLength={4000}
              value={texte}
              onChange={(e) => setTexte(e.target.value)}
              required
            />
          </label>
          <GLButton
            type="submit"
            variant="primary"
            size="sm"
            disabled={busy || titre.trim().length < 3 || texte.trim().length < 20}
          >
            Envoyer à la relecture
          </GLButton>
        </form>
      ) : lettre.titre ? (
        <p className="gl-seuil-spell__desc">« {lettre.titre} »</p>
      ) : null}
      {message ? (
        <p className="gl-seuil-spell__message" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}

const MENTORAT_ETATS = {
  prevu: 'Ton Mentorat est prévu : ton professeur choisit le moment.',
};

export function GLSeuilMentorat({ mentorat, onRetenter }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  if (!mentorat) return null;

  const retenter = async () => {
    setBusy(true);
    setMessage('');
    try {
      await onRetenter(mentorat.id);
      setMessage('C’est noté : ton professeur choisit le moment.');
    } catch (err) {
      setMessage(err?.message || 'Pas maintenant. Réessaie à la prochaine séance.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="gl-seuil-grimoire gl-seuil-mentorat"
      aria-labelledby="gl-seuil-mentorat"
      data-testid="gl-seuil-mentorat"
      data-statut={mentorat.statut}
    >
      <h3 id="gl-seuil-mentorat">Mon Mentorat</h3>
      {mentorat.statut !== 'valide' && mentorat.consigne ? (
        <p className="gl-seuil-grimoire__intro">{mentorat.consigne}</p>
      ) : null}
      {mentorat.retour ? (
        <p className="gl-seuil-spell__message" role="status">
          {mentorat.retour}
        </p>
      ) : MENTORAT_ETATS[mentorat.statut] ? (
        <p className="gl-seuil-spell__status">{MENTORAT_ETATS[mentorat.statut]}</p>
      ) : null}
      {mentorat.statut === 'pas_encore' && mentorat.piste ? (
        <p className="gl-seuil-lettre__piste" data-testid="gl-seuil-mentorat-piste">
          La piste de ton professeur : {mentorat.piste}
        </p>
      ) : null}
      {mentorat.statut === 'pas_encore' ? (
        <GLButton type="button" variant="primary" size="sm" disabled={busy} onClick={retenter}>
          Je retente, sans rien repayer
        </GLButton>
      ) : null}
      {message ? (
        <p className="gl-seuil-spell__message" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
