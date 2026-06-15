import React from 'react';
import { MarkdownContent } from './MarkdownContent.jsx';

/**
 * Carte (présentation) d'une observation du carnet élève — extraite de
 * `ObservationNotebook` (O6). Affiche la date, le contenu Markdown, la zone
 * associée et la photo éventuelle, plus un bouton de suppression (avec
 * confirmation) qui remonte l'id au parent. DOM/classes/textes inchangés.
 *
 * @param {object} props
 * @param {{ id: number|string, created_at: string, content: string, zone_name?: string, image_url?: string }} props.entry observation à afficher
 * @param {(id: number|string) => void} props.onDelete supprime l'observation d'id donné (déjà confirmée)
 */
export function ObservationCard({ entry, onDelete }) {
  return (
    <div className="obs-card fade-in">
      <div className="obs-header">
        <span className="obs-date">{new Date(entry.created_at).toLocaleDateString('fr-FR', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</span>
        <button className="btn btn-ghost btn-sm" style={{padding:'2px 6px', minHeight:'auto', fontSize:'.7rem'}}
          onClick={() => { if (confirm('Supprimer cette observation ?')) onDelete(entry.id); }}>🗑️</button>
      </div>
      <MarkdownContent className="obs-content">{entry.content}</MarkdownContent>
      {entry.zone_name && <div className="obs-zone">📍 {entry.zone_name}</div>}
      {entry.image_url && <img src={entry.image_url} alt="observation" style={{width:'100%',borderRadius:8,marginTop:8,maxHeight:200,objectFit:'cover'}}/>}
    </div>
  );
}
