/**
 * Briques communes des navigations en PÔLES (lot 6 de l'audit UI/UX du 19/11/2026, U10) :
 * barre prof (`TeacherTopTabs`, trois pôles depuis l'audit D-4) et barre élève
 * (`StudentBottomNav`, quatre pôles Terrain / Vivant / Apprendre / Moi).
 *
 * Ce module ne porte que ce qui est identique des deux côtés :
 *   - `resolveNavPoles` : le pôle actif est DÉRIVÉ de l'onglet courant (rien n'est persisté),
 *     un pôle sans onglet visible disparaît, cliquer un pôle ouvre son premier onglet ;
 *   - `useCompactNav` : bascule compacte (largeur de `src/shared/breakpoints.js` ou pointeur
 *     grossier), forçable par `layoutMode` dans les tests ;
 *   - `NavPoleButtons` : la rangée de pôles (`aria-current="true"` sur le pôle actif) ;
 *   - `NavSheetTabs` / `NavSheetPoleGroups` : les onglets d'une feuille BottomSheet
 *     (`aria-current="page"` sur l'onglet actif), à plat ou groupés par pôle.
 *
 * La mise en forme propre à chaque barre (rangée haute prof, barre basse élève, badges,
 * primaires mobiles) reste dans son composant : les classes sont passées en props.
 *
 * Forme d'un onglet : `{ id, label, Icon, pole, badge?, unread? }` ; d'un pôle :
 * `{ id, label, Icon }`. Les icônes viennent de `src/shared/icons.jsx` (décoratives).
 */
import { useId } from 'react';

import { MEDIA } from '../../shared/breakpoints.js';
import { useMediaQuery } from '../../shared/hooks/useMediaQuery.js';
import { UnreadDot } from './UnreadDot.jsx';

/**
 * Pointeur grossier (tablette, téléphone) : pas de point de bascule associé — l'échelle de
 * `src/shared/breakpoints.js` ne couvre que la largeur.
 */
export const NAV_COARSE_POINTER_QUERY = '(pointer: coarse)';

/**
 * Regroupe les onglets visibles par pôle et dérive le pôle actif.
 * @param {{ poles: {id:string}[], tabs: {id:string, pole:string}[], tab: string }} opts
 * @returns {{
 *   activePoleId: string|null,
 *   polesWithTabs: Array<{id:string, label:string, tabs:object[]}>,
 *   tabsOfPole: (poleId: string) => object[],
 *   firstTabOfPole: (poleId: string) => string|undefined,
 * }}
 */
export function resolveNavPoles({ poles, tabs, tab }) {
  const byPole = new Map(poles.map((pole) => [pole.id, []]));
  for (const item of tabs) {
    if (byPole.has(item.pole)) byPole.get(item.pole).push(item);
  }
  const polesWithTabs = poles
    .filter((pole) => byPole.get(pole.id).length > 0)
    .map((pole) => ({ ...pole, tabs: byPole.get(pole.id) }));
  const current = tabs.find((item) => item.id === tab);
  const activePoleId =
    current && byPole.has(current.pole) ? current.pole : (polesWithTabs[0]?.id ?? null);
  const tabsOfPole = (poleId) => byPole.get(poleId) || [];
  return {
    activePoleId,
    polesWithTabs,
    tabsOfPole,
    firstTabOfPole: (poleId) => tabsOfPole(poleId)[0]?.id,
  };
}

/**
 * Disposition compacte : sous la largeur donnée (une entrée de `MEDIA`) ou pointeur grossier.
 * @param {{ widthQuery?: string, layoutMode?: 'auto'|'compact'|'full' }} opts
 */
export function useCompactNav({ widthQuery = MEDIA.belowDesktop, layoutMode = 'auto' } = {}) {
  const widthCompact = useMediaQuery(widthQuery);
  const pointerCompact = useMediaQuery(NAV_COARSE_POINTER_QUERY);
  return layoutMode === 'compact' || (layoutMode === 'auto' && (widthCompact || pointerCompact));
}

/**
 * Rangée de pôles. Un clic sur un pôle inactif ouvre son premier onglet ; `onPoleClick` reçoit
 * en plus l'id du pôle (le prof en mode compact ouvre alors la feuille du pôle).
 */
export function NavPoleButtons({
  polesWithTabs,
  activePoleId,
  onTabChange,
  onPoleClick,
  className,
  buttonClassName,
  iconSize = 16,
  hasPopup = false,
  ariaLabel,
  renderAddon,
}) {
  return (
    <div className={className} role="group" aria-label={ariaLabel}>
      {polesWithTabs.map((pole) => {
        const { id, label, Icon, tabs } = pole;
        const isActive = activePoleId === id;
        return (
          <button
            key={id}
            type="button"
            className={`${buttonClassName}${isActive ? ' active' : ''}`}
            aria-current={isActive ? 'true' : undefined}
            aria-haspopup={hasPopup ? 'dialog' : undefined}
            onClick={() => {
              if (!isActive && tabs[0]) onTabChange(tabs[0].id);
              onPoleClick?.(id);
            }}
          >
            <Icon size={iconSize} /> {label}
            {renderAddon?.(pole)}
            <UnreadDot show={tabs.some((item) => item.unread)} />
          </button>
        );
      })}
    </div>
  );
}

/** Onglets d'une feuille de navigation (grille de `.fm-nav-drawer-tab`). */
export function NavSheetTabs({ tabs, tab, onSelect, ariaLabel, labelledBy, renderAddon }) {
  return (
    <div
      className="fm-nav-drawer-tabs"
      role="group"
      aria-label={labelledBy ? undefined : ariaLabel}
      aria-labelledby={labelledBy}
    >
      {tabs.map((item) => {
        const { id, Icon, label, unread } = item;
        const isActive = tab === id;
        return (
          <button
            key={id}
            type="button"
            className={`fm-nav-drawer-tab${isActive ? ' is-active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onSelect(id)}
          >
            <span className="fm-nav-drawer-tab__icon" aria-hidden="true">
              <Icon size={18} />
            </span>
            <span className="fm-nav-drawer-tab__label">
              {label}
              {renderAddon?.(item)}
              <UnreadDot show={Boolean(unread)} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Feuille « Plus » groupée par pôles : un intitulé par pôle, puis ses onglets. Le groupe du
 * pôle actif porte `aria-current="true"`.
 */
export function NavSheetPoleGroups({ polesWithTabs, activePoleId, tab, onSelect, renderAddon }) {
  const baseId = useId();
  return (
    <div className="fm-nav-drawer-groups">
      {polesWithTabs.map(({ id, label, Icon, tabs }) => {
        const headingId = `${baseId}-${id}`;
        const isActive = activePoleId === id;
        return (
          <section
            key={id}
            className={`fm-nav-drawer-group${isActive ? ' is-active' : ''}`}
            aria-labelledby={headingId}
            aria-current={isActive ? 'true' : undefined}
          >
            <h3 id={headingId} className="fm-nav-drawer-group__title">
              <Icon size={16} /> {label}
            </h3>
            <NavSheetTabs
              tabs={tabs}
              tab={tab}
              onSelect={onSelect}
              labelledBy={headingId}
              renderAddon={renderAddon}
            />
          </section>
        );
      })}
    </div>
  );
}
