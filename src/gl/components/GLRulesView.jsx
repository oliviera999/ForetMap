import React from 'react';
import { GLContentPage } from './GLContentPage.jsx';

export function GLRulesView({ auth }) {
  return <GLContentPage slug="rules" fallbackTitle="Les regles du jeu" auth={auth} />;
}
