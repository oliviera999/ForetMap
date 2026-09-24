import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useBiodivPedago } from '../../contexts/BiodivPedagoContext.jsx';
import { Tooltip } from '../../shared/components/Tooltip.jsx';
import { IconClose, IconEye } from '../../shared/icons.jsx';
import { useOverlayHistoryBack } from '../../shared/platform/useOverlayHistoryBack';
import { describeAppPreview } from '../../utils/appPreview.js';
import { PEDAGO_LEVEL_LABELS, PEDAGO_LEVELS } from '../../utils/biodivPedagoLevel.js';

/**
 * Menu « Aperçu » de l'en-tête : réunit en un seul endroit les deux façons, pour un
 * n3boss, de voir l'application autrement — la vue de rôle simulée (interface n3beur /
 * n3boss) et le niveau d'affichage biodiversité (Collège / Lycée / Université).
 *
 * La vue de rôle reste pilotée par `App` (`roleViewMode`, callback) ; le niveau vient du
 * contexte biodiversité. Rien n'est rendu quand aucune des deux options n'est ouverte au
 * compte courant.
 */
export function AppPreviewMenu({
  roleViewMode = 'native',
  canSwitchToStudentView = false,
  canSwitchToTeacherView = false,
  onRoleViewModeSelect,
  roleTerms,
  helpText,
}) {
  const { canTeacherPreview, teacherPreview, setTeacherPreview, fullViewByDefault } =
    useBiodivPedago();
  const [open, setOpen] = useState(false);
  const [portalNode, setPortalNode] = useState(null);
  const triggerWrapRef = useRef(null);
  const panelRef = useRef(null);
  const closePanel = () => setOpen(false);
  useOverlayHistoryBack(open, closePanel);

  const canPickRole = canSwitchToStudentView || canSwitchToTeacherView;
  const preview = describeAppPreview({ roleViewMode, teacherPreview, roleTerms });

  useEffect(() => {
    const node = document.createElement('div');
    document.body.appendChild(node);
    setPortalNode(node);
    return () => {
      document.body.removeChild(node);
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      const t = event.target;
      if (panelRef.current?.contains(t)) return;
      if (triggerWrapRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!canPickRole && !canTeacherPreview) return null;

  function exitPreview() {
    if (preview.levelActive) setTeacherPreview(null);
    if (preview.roleActive) onRoleViewModeSelect?.('native');
  }

  const roleOptions = [
    { value: 'native', label: 'Ma vue habituelle', visible: true },
    {
      value: 'student',
      label: `Vue ${roleTerms.studentSingular}`,
      visible: canSwitchToStudentView,
    },
    {
      value: 'teacher',
      label: `Vue ${roleTerms.teacherShort}`,
      visible: canSwitchToTeacherView,
    },
  ].filter((option) => option.visible);

  const autoLevelLabel = fullViewByDefault
    ? 'Complet (vue gestion)'
    : 'Automatique (carte et groupe)';

  const panel = open ? (
    <div
      ref={panelRef}
      className="fm-panel preview-menu__panel fade-in"
      role="dialog"
      aria-label="Aperçu"
      data-testid="app-preview-panel"
    >
      <div className="preview-menu__head">
        <strong>Aperçu</strong>
        <button
          type="button"
          className="preview-menu__close"
          aria-label="Fermer le menu Aperçu"
          onClick={closePanel}
        >
          <IconClose size={16} />
        </button>
      </div>
      <p className="preview-menu__intro">
        Voir l’application comme elle apparaît aux autres. Tes droits réels ne changent pas.
      </p>
      {canPickRole ? (
        <fieldset className="preview-menu__group">
          <legend>Interface</legend>
          {roleOptions.map((option) => (
            <label key={option.value} className="preview-menu__option">
              <input
                type="radio"
                name="app-preview-role"
                value={option.value}
                checked={roleViewMode === option.value}
                onChange={() => onRoleViewModeSelect?.(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </fieldset>
      ) : null}
      {canTeacherPreview ? (
        <fieldset className="preview-menu__group">
          <legend>Affichage biodiversité</legend>
          <label className="preview-menu__option">
            <input
              type="radio"
              name="app-preview-level"
              value=""
              checked={!teacherPreview}
              onChange={() => setTeacherPreview(null)}
            />
            <span>{autoLevelLabel}</span>
          </label>
          {PEDAGO_LEVELS.map((level) => (
            <label key={level} className="preview-menu__option">
              <input
                type="radio"
                name="app-preview-level"
                value={level}
                checked={teacherPreview === level}
                onChange={() => setTeacherPreview(level)}
              />
              <span>{PEDAGO_LEVEL_LABELS[level]}</span>
            </label>
          ))}
          <p className="preview-menu__hint">
            Fiches, quiz, glossaire et réseau trophique. Les réglages du site ne changent pas.
          </p>
        </fieldset>
      ) : null}
      {preview.active ? (
        <button type="button" className="btn btn-secondary btn-sm" onClick={exitPreview}>
          Quitter l’aperçu
        </button>
      ) : null}
    </div>
  ) : null;

  const triggerLabel = preview.active ? `Aperçu actif : ${preview.summary}` : 'Aperçu';

  return (
    <div className="preview-menu" ref={triggerWrapRef}>
      <Tooltip text={helpText?.('header.preview')}>
        <button
          type="button"
          className={`lock-btn preview-menu__trigger${preview.active ? ' is-active' : ''}`}
          aria-label={triggerLabel}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
        >
          <IconEye />
          {preview.active ? (
            <span className="preview-menu__summary" aria-hidden="true">
              {preview.summary}
            </span>
          ) : null}
        </button>
      </Tooltip>
      {portalNode && panel ? createPortal(panel, portalNode) : null}
    </div>
  );
}
