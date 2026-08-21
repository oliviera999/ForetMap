import React, { useCallback, useMemo } from 'react';

import { apiGL } from '../../services/apiGL.js';
import { TourOverridesEditor } from '../../../shared/components/TourOverridesEditor.jsx';
import { createTourRegistryApi } from '../../../shared/tour/tourRegistryCore.js';
import { GL_DISCOVERY_TOURS, GL_RELAUNCH_STEP } from '../../constants/glDiscoveryTour.js';
import { invalidateGlTourOverridesCache } from '../../hooks/useGlTourOverrides.js';
import { SHARED_TOUR_KEY } from '../../../shared/tour/tourRegistryCore.js';

/**
 * Édition des textes des visites guidées GL (permission `gl.content.manage`).
 *
 * Pendant du studio ForetMap, sur le même écran partagé : ne changent que le corpus,
 * les libellés — un MJ n'est pas un « n3boss » — et la plomberie réseau.
 */

const FIELD_LABELS = {
  title: 'Titre de l’étape',
  body: 'Texte (joueur)',
  bodyTeacher: 'Texte (MJ)',
};

const glTours = createTourRegistryApi(GL_DISCOVERY_TOURS, {
  sharedStepKeys: [GL_RELAUNCH_STEP.key],
});

function buildSections() {
  const sections = [
    {
      key: SHARED_TOUR_KEY,
      label: 'Étape commune',
      hint: 'Dernière étape de chaque visite guidée : réécrite ici, elle change partout.',
      steps: [GL_RELAUNCH_STEP],
    },
  ];
  for (const [tourKey, tour] of Object.entries(GL_DISCOVERY_TOURS)) {
    const steps = tour.steps.filter((step) => step.key !== GL_RELAUNCH_STEP.key);
    if (steps.length === 0) continue;
    sections.push({ key: tourKey, label: tour.title || tourKey, hint: '', steps });
  }
  return sections;
}

export function GLTourContentAdminPanel() {
  const sections = useMemo(() => buildSections(), []);

  const loadRegistry = useCallback(async () => {
    const data = await apiGL('/api/gl/content/tours');
    return data?.registry;
  }, []);

  const saveRegistry = useCallback(async (registry) => {
    await apiGL('/api/gl/content/tours', 'PUT', { registry });
    // Le parcours joué par les joueurs lit le cache : le vider fait prendre effet la
    // réécriture sans rechargement de page.
    invalidateGlTourOverridesCache();
  }, []);

  /*
   * Pas de bouton « tout réinitialiser » : côté GL, il faudrait une route dédiée, et
   * vider chaque champ revient déjà au texte livré. On n'ajoute pas un geste destructif
   * pour épargner quelques clics.
   */
  return (
    <TourOverridesEditor
      sections={sections}
      overrideKey={glTours.overrideKey}
      fieldLabels={FIELD_LABELS}
      loadRegistry={loadRegistry}
      saveRegistry={saveRegistry}
      intro="Les textes des visites guidées — ces séquences qui présentent un écran à sa première ouverture. Laisser un champ vide affiche le texte livré avec l’application, montré en filigrane."
    />
  );
}

export default GLTourContentAdminPanel;
