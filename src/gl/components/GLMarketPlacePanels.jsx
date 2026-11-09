import { useState } from 'react';
import { GLButton } from './ui/GLButton.jsx';
import { GLField } from './ui/GLField.jsx';
import { GLInput } from './ui/GLInput.jsx';

/**
 * Panneaux du Marché v2 « Tenir à deux » : la place (annonces), le don, le comptoir (parures).
 * Composants feuilles : tout l'état réseau vient de `useGLMarketPlace`.
 */

function sideLabel(side, heartsTradable) {
  if (!side) return '—';
  const parts = [];
  if (side.gemmes) parts.push(`💎 ${side.gemmes}`);
  if (side.coeurs && heartsTradable) parts.push(`❤️ ${side.coeurs}`);
  if (Array.isArray(side.feuillets) && side.feuillets.length) {
    parts.push(`📜 ${side.feuillets.length} page${side.feuillets.length > 1 ? 's' : ''}`);
  }
  return parts.length ? parts.join(' · ') : '—';
}

function SideFields({ label, value, onChange, heartsTradable, ownFeuillets, disabled }) {
  return (
    <fieldset className="gl-market-side-fields">
      <legend>{label}</legend>
      <GLField label="Gemmes 💎">
        <GLInput
          type="number"
          min={0}
          max={8}
          value={value.gemmes}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, gemmes: Number(e.target.value) || 0 })}
        />
      </GLField>
      {heartsTradable ? (
        <GLField label="Cœurs ❤️">
          <GLInput
            type="number"
            min={0}
            max={8}
            value={value.coeurs}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, coeurs: Number(e.target.value) || 0 })}
          />
        </GLField>
      ) : null}
      {ownFeuillets?.length ? (
        <GLField label="Page 📜">
          <select
            value={value.feuillets[0] || ''}
            disabled={disabled}
            onChange={(e) =>
              onChange({ ...value, feuillets: e.target.value ? [e.target.value] : [] })
            }
          >
            <option value="">— aucune —</option>
            {ownFeuillets.map((f) => (
              <option key={f.feuilletCode} value={f.feuilletCode}>
                {f.titre || f.feuilletCode}
              </option>
            ))}
          </select>
        </GLField>
      ) : null}
    </fieldset>
  );
}

const EMPTY_SIDE = { gemmes: 0, coeurs: 0, feuillets: [] };

/**
 * Encart repliable « Comment fonctionne le marché ? » en tête de La place : quatre lignes pour
 * un élève de 6ᵉ (annonces, échange à deux, don, parures). Même nom accessible que l'encart
 * de l'onglet Échanges (`role="note"`, « Règles du marché ») : un seul des deux est monté à
 * la fois.
 */
export function GLMarketPlaceRegles({ heartsTradable = false, paruresEnabled = true }) {
  const ressource = heartsTradable ? 'tes gemmes ou tes cœurs' : 'tes gemmes';
  return (
    <aside
      className="gl-market-disclaimer gl-market-disclaimer--place"
      role="note"
      aria-label="Règles du marché"
    >
      <details open>
        <summary>
          <h2>Comment fonctionne le marché ?</h2>
        </summary>
        <ul>
          <li>
            Sur <strong>la place</strong>, tu publies une annonce : <strong>je cherche</strong>,{' '}
            <strong>j’offre</strong>, ou <strong>je propose</strong> (les deux côtés à la fois).
          </li>
          <li>
            <strong>Répondre</strong> à une annonce ouvre un <strong>échange à deux</strong> (onglet
            Échanges) : chacun ajuste son offre, puis coche « J’accepte ».
          </li>
          <li>
            Un <strong>don</strong> part <strong>tout de suite</strong> : ce que tu donnes quitte ta
            bourse, sans retour.
          </li>
          {paruresEnabled ? (
            <li>
              Au <strong>Comptoir</strong>, les <strong>parures</strong> s’achètent avec {ressource}{' '}
              et décorent ton équipe.
            </li>
          ) : (
            <li>
              Tes <strong>gemmes</strong> et tes <strong>cœurs</strong> restent à toi d’un chapitre
              à l’autre : réfléchis avant de donner.
            </li>
          )}
        </ul>
      </details>
    </aside>
  );
}

export function GLMarketPlacePanel({
  place,
  playerId,
  heartsTradable,
  ownFeuillets,
  onTradeOpened,
  paruresEnabled = true,
}) {
  const [type, setType] = useState('cherche');
  const [cherche, setCherche] = useState(EMPTY_SIDE);
  const [offre, setOffre] = useState(EMPTY_SIDE);

  async function submit(event) {
    event.preventDefault();
    const created = await place.createAnnonce({
      type,
      cherche: type === 'offre' ? undefined : cherche,
      offre: type === 'cherche' ? undefined : offre,
    });
    if (created) {
      setCherche(EMPTY_SIDE);
      setOffre(EMPTY_SIDE);
    }
  }

  return (
    <div className="gl-market-place" data-testid="gl-market-place">
      <GLMarketPlaceRegles heartsTradable={heartsTradable} paruresEnabled={paruresEnabled} />
      <form className="gl-market-annonce-form gl-form" onSubmit={submit}>
        <h3>Publier une annonce</h3>
        <label>
          Type
          <select value={type} onChange={(e) => setType(e.target.value)} disabled={place.busy}>
            <option value="cherche">Je cherche</option>
            <option value="offre">J’offre</option>
            <option value="propose">Je propose (les deux côtés)</option>
          </select>
        </label>
        {type !== 'offre' ? (
          <SideFields
            label="Ce que je cherche"
            value={cherche}
            onChange={setCherche}
            heartsTradable={heartsTradable}
            ownFeuillets={null}
            disabled={place.busy}
          />
        ) : null}
        {type !== 'cherche' ? (
          <SideFields
            label="Ce que j’offre"
            value={offre}
            onChange={setOffre}
            heartsTradable={heartsTradable}
            ownFeuillets={ownFeuillets}
            disabled={place.busy}
          />
        ) : null}
        <GLButton type="submit" disabled={place.busy}>
          Publier
        </GLButton>
      </form>

      <h3>Sur la place</h3>
      <ul className="gl-market-annonces">
        {place.annonces.map((a) => {
          const mine = Number(a.playerId) === Number(playerId);
          return (
            <li key={a.id} className={`gl-market-annonce gl-market-annonce--${a.type}`}>
              <div>
                <strong>{a.pseudo || 'Joueur'}</strong>
                {a.teamName ? <span className="gl-hint"> · {a.teamName}</span> : null}
                <p>
                  {a.type === 'cherche' ? 'Cherche ' : a.type === 'offre' ? 'Offre ' : 'Propose '}
                  {a.type === 'cherche'
                    ? sideLabel(a.cherche, heartsTradable)
                    : a.type === 'offre'
                      ? sideLabel(a.offre, heartsTradable)
                      : `${sideLabel(a.offre, heartsTradable)} contre ${sideLabel(a.cherche, heartsTradable)}`}
                </p>
              </div>
              {mine ? (
                <GLButton
                  type="button"
                  variant="ghost"
                  disabled={place.busy}
                  onClick={() => place.deleteAnnonce(a.id)}
                >
                  Retirer
                </GLButton>
              ) : (
                <GLButton
                  type="button"
                  variant="secondary"
                  disabled={place.busy}
                  onClick={async () => {
                    const trade = await place.repondreAnnonce(a.id);
                    if (trade?.id) onTradeOpened?.(trade.id);
                  }}
                >
                  Répondre
                </GLButton>
              )}
            </li>
          );
        })}
        {!place.annonces.length ? (
          <li className="gl-market-empty">Aucune annonce pour l’instant.</li>
        ) : null}
      </ul>
    </div>
  );
}

/** Bouton « Don » sur un camarade : une ressource ou une page, à la fois. */
export function GLMarketDonButton({ mate, place, heartsTradable, ownFeuillets }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState('gemmes');
  const [amount, setAmount] = useState(1);
  const [feuilletCode, setFeuilletCode] = useState('');
  if (!open) {
    return (
      <GLButton type="button" variant="ghost" disabled={place.busy} onClick={() => setOpen(true)}>
        Don
      </GLButton>
    );
  }
  return (
    <form
      className="gl-market-don-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const payload = { receveurId: mate.id };
        if (kind === 'page') payload.feuilletCode = feuilletCode;
        else payload[kind] = amount;
        const result = await place.donner(payload);
        if (result) setOpen(false);
      }}
    >
      <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Nature du don">
        <option value="gemmes">Gemmes 💎</option>
        {heartsTradable ? <option value="coeurs">Cœurs ❤️</option> : null}
        {ownFeuillets?.length ? <option value="page">Une page 📜</option> : null}
      </select>
      {kind === 'page' ? (
        <select
          value={feuilletCode}
          onChange={(e) => setFeuilletCode(e.target.value)}
          aria-label="Page à donner"
        >
          <option value="">— choisir —</option>
          {ownFeuillets.map((f) => (
            <option key={f.feuilletCode} value={f.feuilletCode}>
              {f.titre || f.feuilletCode}
            </option>
          ))}
        </select>
      ) : (
        <GLInput
          type="number"
          min={1}
          max={8}
          value={amount}
          aria-label="Quantité"
          onChange={(e) => setAmount(Number(e.target.value) || 1)}
        />
      )}
      <GLButton type="submit" disabled={place.busy || (kind === 'page' && !feuilletCode)}>
        Donner
      </GLButton>
      <GLButton type="button" variant="ghost" onClick={() => setOpen(false)}>
        Annuler
      </GLButton>
    </form>
  );
}

export function GLMarketComptoirPanel({ place, heartsTradable }) {
  return (
    <div className="gl-market-comptoir" data-testid="gl-market-comptoir">
      <h3>Comptoir des parures</h3>
      <p className="gl-hint">
        Une parure est portée par la mascotte de ton équipe jusqu’au seuil. Aucun effet de jeu.
      </p>
      {place.parures.portees.length ? (
        <p className="gl-market-parures-portees">
          Portées par ton équipe : {place.parures.portees.map((p) => p.nom).join(', ')}
        </p>
      ) : null}
      <ul className="gl-market-parures">
        {place.parures.catalogue.map((p) => (
          <li key={p.code} className={p.disponible ? '' : 'is-unavailable'}>
            <div>
              <strong>{p.nom}</strong> <span className="gl-hint">— {p.prix} au choix</span>
              <p>{p.description}</p>
            </div>
            {p.disponible ? (
              <span className="gl-inline-actions">
                <GLButton
                  type="button"
                  variant="secondary"
                  disabled={place.busy}
                  onClick={() => place.acheterParure(p.code, 'gemmes')}
                >
                  💎 {p.prix}
                </GLButton>
                {heartsTradable ? (
                  <GLButton
                    type="button"
                    variant="secondary"
                    disabled={place.busy}
                    onClick={() => place.acheterParure(p.code, 'coeurs')}
                  >
                    ❤️ {p.prix}
                  </GLButton>
                ) : null}
              </span>
            ) : (
              <span className="gl-hint">bientôt au comptoir</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
