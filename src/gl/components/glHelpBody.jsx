/**
 * Rend un corps d'aide GL : une ligne unique devient un paragraphe, plusieurs lignes
 * une liste à puces. Partagé par l'encadré inline (`GLHelpPanel`) et la modale
 * (`GLHelpDialog`), qui doivent présenter un même texte de la même façon.
 */
export function renderGlHelpBody(body) {
  const text = String(body || '').trim();
  if (!text) return null;
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length <= 1 && !text.includes('•') && !text.startsWith('-')) {
    return <p>{text}</p>;
  }
  return (
    <ul className="gl-help-list">
      {lines.map((line) => (
        <li key={line}>{line.replace(/^[-•]\s*/, '')}</li>
      ))}
    </ul>
  );
}
