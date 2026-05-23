import React from 'react';
import { GLContentPage } from './GLContentPage.jsx';

export function GLWorldView({ auth, brandSlots, onNavigateTab }) {
  return (
    <GLContentPage
      slug="world"
      fallbackTitle="Le monde de Gnomes & Licornes"
      auth={auth}
      brandSlots={brandSlots}
      onNavigateTab={onNavigateTab}
    />
  );
}
