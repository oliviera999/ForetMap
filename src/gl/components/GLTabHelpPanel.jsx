import React from 'react';

import { GLHelpPanel } from './GLHelpPanel.jsx';
import { useGlHelpContent } from '../hooks/useGlHelpContent.js';

/** Panneau d'aide GL pour l'onglet courant (textes depuis `content.help`). */
export function GLTabHelpPanel({ tab, defaultOpen = false }) {
  const helpKey = `tab:${tab}`;
  const { title, body } = useGlHelpContent(helpKey);
  return (
    <GLHelpPanel helpKey={helpKey} title={title} body={body} defaultOpen={defaultOpen} />
  );
}
