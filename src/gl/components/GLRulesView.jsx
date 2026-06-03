import React from 'react';
import { GLContentPage } from './GLContentPage.jsx';

export function GLRulesView({
  auth,
  brandSlots,
  onNavigateTab,
  glossaryLinkItems = [],
  onOpenGlossaryTerm,
}) {
  return (
    <GLContentPage
      slug="rules"
      fallbackTitle="Les regles du jeu"
      auth={auth}
      brandSlots={brandSlots}
      onNavigateTab={onNavigateTab}
      glossaryLinkItems={glossaryLinkItems}
      onOpenGlossaryTerm={onOpenGlossaryTerm}
    />
  );
}
