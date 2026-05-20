import React from 'react';
import { GLContentPage } from './GLContentPage.jsx';

export function GLSpellsView({ auth, onNavigateTab }) {
  return (
    <GLContentPage slug="spells" fallbackTitle="Le grimoire des sortileges" auth={auth} onNavigateTab={onNavigateTab} />
  );
}
