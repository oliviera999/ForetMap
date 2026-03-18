/**
 * Point d'entrée Vite + React.
 * Pour migrer complètement : déplacer le contenu de public/index.html (composants React + CSS)
 * vers src/App.jsx et src/index.css, puis supprimer public/index.html et servir le build (dist/) en prod.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';

function App() {
  return (
    <div style={{ padding: 24, fontFamily: 'DM Sans', color: '#1a4731' }}>
      <p>Build Vite actif. L’application complète est encore servie depuis <code>public/index.html</code>.</p>
      <p>Pour migrer : copier les composants et styles vers <code>src/App.jsx</code> et <code>src/index.css</code>.</p>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
