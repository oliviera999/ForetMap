import React, { useEffect, useMemo, useState } from 'react';
import { useGLMarketTrade } from '../hooks/useGLMarketTrade.js';
import { GLButton } from './ui/GLButton.jsx';
import { GLField } from './ui/GLField.jsx';
import { GLInput } from './ui/GLInput.jsx';
import { GLTextarea } from './ui/GLTextarea.jsx';

function findMySide(trade, playerId) {
  if (!trade?.sides) return null;
  return trade.sides.find((side) => Number(side.playerId) === Number(playerId)) || null;
}

function findPeerSide(trade, playerId) {
  if (!trade?.sides) return null;
  return trade.sides.find((side) => Number(side.playerId) !== Number(playerId)) || null;
}

export function GLMarketView({ token, classId, playerId, onTradeCompleted }) {
  const market = useGLMarketTrade({
    token,
    classId,
    enabled: !!(token && classId && playerId),
    onTradeCompleted,
  });

  const [offerHealth, setOfferHealth] = useState(0);
  const [offerPower, setOfferPower] = useState(0);
  const [messageBody, setMessageBody] = useState('');

  const activeTrade = market.activeTrade;
  const mySide = useMemo(
    () => findMySide(activeTrade, playerId),
    [activeTrade, playerId]
  );
  const peerSide = useMemo(
    () => findPeerSide(activeTrade, playerId),
    [activeTrade, playerId]
  );

  const isNegotiating = activeTrade?.status === 'negotiating';
  const isFrozen = !!activeTrade?.frozen;
  const canEditOffer = isNegotiating && !isFrozen;

  useEffect(() => {
    if (!mySide) return;
    setOfferHealth(Number(mySide.offerHealth) || 0);
    setOfferPower(Number(mySide.offerPower) || 0);
  }, [mySide?.offerHealth, mySide?.offerPower, activeTrade?.id]);

  const negotiatingTrades = market.trades.filter((t) => t.status === 'negotiating');

  return (
    <section className="gl-market-view fade-in">
      <aside className="gl-market-disclaimer" role="note" aria-label="Règles du marché">
        <h2>Comment fonctionne le marché ?</h2>
        <ul>
          <li>
            Les <strong>cœurs</strong> (❤️) et <strong>gemmes</strong> (💎) sont tes points de vie et de pouvoir
            : ils restent sur ton compte même d’une partie à l’autre.
          </li>
          <li>
            Tu peux <strong>échanger</strong> avec un camarade de ta classe ou lui faire un <strong>don</strong>
            (tu proposes des cœurs et/ou des gemmes, l’autre peut proposer zéro).
          </li>
          <li>
            Discute dans le fil de l’échange, ajuste ton offre, puis coche <strong>J’accepte</strong> quand tu es prêt.
          </li>
          <li>
            Dès qu’un joueur coche « J’accepte », les montants sont <strong>figés</strong> : pour les modifier,
            décoche d’abord ta case (ou demande à l’autre de décocher la sienne).
          </li>
          <li>
            L’échange ne se réalise que lorsque <strong>les deux</strong> ont coché « J’accepte ». C’est alors
            <strong>définitif</strong> : vérifie bien les quantités avant de valider.
          </li>
          <li>
            Le MJ et l’équipe pédagogique peuvent consulter l’activité ; reste fair-play et respecte les règles du jeu.
          </li>
        </ul>
      </aside>

      {market.error ? <p className="gl-error-banner">{market.error}</p> : null}

      <div className="gl-market-layout">
        <div className="gl-market-sidebar">
          <h3>Camarades de classe</h3>
          <ul className="gl-market-classmates">
            {market.classmates.map((mate) => (
              <li key={mate.id}>
                <span className="gl-market-classmate-name">{mate.pseudo}</span>
                <span className="gl-market-classmate-vitality">
                  ❤️ {mate.healthPoints} · 💎 {mate.powerPoints}
                </span>
                <GLButton
                  type="button"
                  variant="secondary"
                  disabled={market.busy}
                  onClick={() => market.startTrade(mate.id)}
                >
                  Proposer un échange
                </GLButton>
              </li>
            ))}
            {!market.classmates.length ? (
              <li className="gl-market-empty">Aucun autre joueur actif dans ta classe.</li>
            ) : null}
          </ul>

          <h3>Échanges en cours</h3>
          <ul className="gl-market-trades-list">
            {negotiatingTrades.map((trade) => {
              const peer = findPeerSide(trade, playerId);
              return (
                <li key={trade.id} className={market.activeTradeId === trade.id ? 'is-active' : ''}>
                  <button
                    type="button"
                    onClick={() => market.selectTrade(trade.id)}
                  >
                    <span>{peer?.pseudo || 'Joueur'}</span>
                    {trade.frozen ? <span className="gl-market-badge">Figé</span> : null}
                  </button>
                </li>
              );
            })}
            {!negotiatingTrades.length ? (
              <li className="gl-market-empty">Aucun échange en cours.</li>
            ) : null}
          </ul>
        </div>

        <div className="gl-market-detail">
          {!activeTrade ? (
            <p className="gl-market-placeholder">
              Choisis un camarade ou un échange en cours pour négocier.
            </p>
          ) : (
            <>
              <header className="gl-market-detail-header">
                <h3>
                  Échange avec {peerSide?.pseudo || '…'}
                  {activeTrade.status === 'completed' ? ' — terminé' : ''}
                  {activeTrade.status === 'cancelled' ? ' — annulé' : ''}
                </h3>
                {isNegotiating ? (
                  <GLButton
                    type="button"
                    variant="ghost"
                    disabled={market.busy}
                    onClick={() => market.cancelTrade()}
                  >
                    Annuler l’échange
                  </GLButton>
                ) : null}
              </header>

              {isFrozen && isNegotiating ? (
                <p className="gl-market-frozen-hint" role="status">
                  Les offres sont figées : un joueur a coché « J’accepte ». Décoche pour modifier les montants.
                </p>
              ) : null}

              <div className="gl-market-offers">
                <div className="gl-market-offer-card">
                  <h4>Ton offre (ce que tu donnes)</h4>
                  <GLField label="Cœurs ❤️">
                    <GLInput
                      type="number"
                      min={0}
                      max={99}
                      value={offerHealth}
                      disabled={!canEditOffer || market.busy}
                      onChange={(e) => setOfferHealth(Number(e.target.value) || 0)}
                      onBlur={() => {
                        if (canEditOffer) market.updateOffer(offerHealth, offerPower);
                      }}
                    />
                  </GLField>
                  <GLField label="Gemmes 💎">
                    <GLInput
                      type="number"
                      min={0}
                      max={99}
                      value={offerPower}
                      disabled={!canEditOffer || market.busy}
                      onChange={(e) => setOfferPower(Number(e.target.value) || 0)}
                      onBlur={() => {
                        if (canEditOffer) market.updateOffer(offerHealth, offerPower);
                      }}
                    />
                  </GLField>
                  {isNegotiating ? (
                    <label className="gl-market-accept">
                      <input
                        type="checkbox"
                        checked={!!mySide?.accepted}
                        disabled={market.busy}
                        onChange={(e) => market.setAccepted(e.target.checked)}
                      />
                      <span>J’accepte</span>
                    </label>
                  ) : null}
                </div>

                <div className="gl-market-offer-card is-peer">
                  <h4>Offre de {peerSide?.pseudo || '…'} (ce que tu reçois)</h4>
                  <p className="gl-market-peer-offer">
                    ❤️ {Number(peerSide?.offerHealth) || 0} · 💎 {Number(peerSide?.offerPower) || 0}
                  </p>
                  {peerSide?.accepted ? (
                    <p className="gl-market-peer-accepted" role="status">L’autre joueur a accepté.</p>
                  ) : (
                    <p className="gl-market-peer-pending">En attente de l’autre joueur.</p>
                  )}
                </div>
              </div>

              <div className="gl-market-messages">
                <h4>Discussion</h4>
                <ul>
                  {(activeTrade.messages || []).map((msg) => (
                    <li
                      key={msg.id}
                      className={Number(msg.authorPlayerId) === Number(playerId) ? 'is-mine' : ''}
                    >
                      <strong>{msg.authorPseudo || 'Joueur'}</strong>
                      <p>{msg.body}</p>
                    </li>
                  ))}
                </ul>
                {isNegotiating ? (
                  <form
                    className="gl-market-message-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const body = messageBody.trim();
                      if (!body) return;
                      market.sendMessage(body).then(() => setMessageBody(''));
                    }}
                  >
                    <GLTextarea
                      value={messageBody}
                      onChange={(e) => setMessageBody(e.target.value)}
                      placeholder="Écrire un message…"
                      rows={2}
                      disabled={market.busy}
                    />
                    <GLButton type="submit" disabled={market.busy || !messageBody.trim()}>
                      Envoyer
                    </GLButton>
                  </form>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
