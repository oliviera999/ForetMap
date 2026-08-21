import React, { useCallback, useMemo } from 'react';

import { api } from '../../services/api';
import { TourOverridesEditor } from '../../shared/components/TourOverridesEditor.jsx';
import {
  DISCOVERY_TOURS,
  RELAUNCH_STEP,
  SHARED_TOUR_KEY,
  tourOverrideKey,
} from '../../constants/discoveryTour.js';

/**
 * Édition des textes des visites guidées ForetMap (permission `tours.manage`).
 *
 * L'écran lui-même est partagé avec GL (`shared/components/TourOverridesEditor`) : ce
 * module ne fournit que le corpus du produit, ses libellés et sa plomberie réseau.
 */

const FIELD_LABELS = {
  title: 'Titre de l’étape',
  body: 'Texte (élève)',
  bodyTeacher: 'Texte (n3boss)',
};

/**
 * Sections d'édition : l'étape de relance d'abord, seule et clairement identifiée comme
 * commune, puis les parcours privés de cette étape.
 *
 * `RELAUNCH_STEP` est partagé par référence : le montrer treize fois laisserait croire
 * qu'on peut l'adapter à un onglet, alors que la réécriture vaut partout.
 */
function buildSections() {
  const sections = [
    {
      key: SHARED_TOUR_KEY,
      label: 'Étape commune',
      hint: 'Dernière étape de chacune des visites guidées : réécrite ici, elle change partout.',
      steps: [RELAUNCH_STEP],
    },
  ];
  for (const [tourKey, tour] of Object.entries(DISCOVERY_TOURS)) {
    const steps = tour.steps.filter((step) => step.key !== RELAUNCH_STEP.key);
    if (steps.length === 0) continue;
    sections.push({ key: tourKey, label: tour.title || tourKey, hint: '', steps });
  }
  return sections;
}

export function DiscoveryTourAdminPanel() {
  const sections = useMemo(() => buildSections(), []);

  const loadRegistry = useCallback(async () => {
    const data = await api('/api/settings/admin/tour-content');
    return data?.registry;
  }, []);

  const saveRegistry = useCallback(async (registry) => {
    await api('/api/settings/admin/tour-content', 'PUT', { registry });
  }, []);

  const resetRegistry = useCallback(async () => {
    const data = await api('/api/settings/admin/tour-content/reset', 'POST');
    return data?.registry || {};
  }, []);

  return (
    <TourOverridesEditor
      sections={sections}
      overrideKey={tourOverrideKey}
      fieldLabels={FIELD_LABELS}
      loadRegistry={loadRegistry}
      saveRegistry={saveRegistry}
      resetRegistry={resetRegistry}
      intro="Les textes des visites guidées — ces séquences qui présentent un écran à sa première ouverture. Laisser un champ vide affiche le texte livré avec l’application, montré en filigrane."
    />
  );
}

export default DiscoveryTourAdminPanel;
