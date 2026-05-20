import React from 'react';
import { GLContentPage } from './GLContentPage.jsx';

export function GLRulesView({ auth, onNavigateTab }) {
  return (
    <GLContentPage slug="rules" fallbackTitle="Les regles du jeu" auth={auth} onNavigateTab={onNavigateTab} />
  );
}
