import React, { useState } from 'react';
import { api } from '../services/api';

function PinModal({ onSuccess, onClose }) {
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const check = async () => {
    if (!pin.trim()) return setErr('Code requis');
    setErr('');
    setLoading(true);
    try {
      const data = await api('/api/auth/teacher', 'POST', { pin: pin.trim() });
      if (!data || !data.token) {
        setErr('Réponse serveur invalide');
        setLoading(false);
        return;
      }
      localStorage.setItem('foretmap_teacher_token', data.token);
      onSuccess();
    } catch (e) {
      setErr(e.message || 'Code incorrect');
      setPin('');
    }
    setLoading(false);
  };

  return (
    <div className="pin-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pin-card fade-in">
        <div style={{ fontSize: '2rem', marginBottom: 8 }}>🔒</div>
        <h3>Mode professeur</h3>
        <p>Entrez le code PIN pour accéder au tableau de bord</p>
        {err && <div className="pin-error">{err}</div>}
        <input
          className="pin-input" type="password" maxLength={4}
          value={pin} onChange={e => { setPin(e.target.value); setErr(''); }}
          onKeyDown={e => e.key === 'Enter' && !loading && check()}
          placeholder="••••" autoFocus
        />
        <button className="btn btn-primary btn-full" onClick={check} disabled={loading}>
          {loading ? 'Vérification…' : 'Entrer'}
        </button>
        <button className="btn btn-ghost btn-full" style={{ marginTop: 8 }} onClick={onClose}>Annuler</button>
      </div>
    </div>
  );
}

function AuthScreen({ onLogin, appVersion }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setErr('');
    if (!first.trim() || !last.trim() || !pass) return setErr('Tous les champs sont requis');
    if (mode === 'register' && pass !== pass2) return setErr('Les mots de passe ne correspondent pas');
    if (mode === 'register' && pass.length < 4) return setErr('Mot de passe trop court (min 4 caractères)');
    setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const student = await api(endpoint, 'POST', { firstName: first.trim(), lastName: last.trim(), password: pass });
      localStorage.setItem('foretmap_student', JSON.stringify(student));
      onLogin(student);
    } catch (e) { setErr(e.message); }
    setLoading(false);
  };

  const onKey = e => e.key === 'Enter' && submit();

  return (
    <div className="auth-wrap">
      <div className="auth-card fade-in">
        <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>🌿</div>
        <h1>ForêtMap</h1>
        <p className="sub">Atelier forêt comestible — Lycée Lyautey</p>

        <div className="auth-tabs">
          <button className={`auth-tab ${mode === 'login' ? 'active' : ''}`} onClick={() => { setMode('login'); setErr(''); }}>
            Connexion
          </button>
          <button className={`auth-tab ${mode === 'register' ? 'active' : ''}`} onClick={() => { setMode('register'); setErr(''); }}>
            Créer un compte
          </button>
        </div>

        {err && <div className="auth-error">⚠️ {err}</div>}

        <div className="row">
          <div className="field"><label>Prénom</label>
            <input value={first} onChange={e => setFirst(e.target.value)} placeholder="Mohamed" autoFocus onKeyDown={onKey} />
          </div>
          <div className="field"><label>Nom</label>
            <input value={last} onChange={e => setLast(e.target.value)} placeholder="El Farrai" onKeyDown={onKey} />
          </div>
        </div>
        <div className="field"><label>Mot de passe</label>
          <input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="••••" onKeyDown={onKey} />
        </div>
        {mode === 'register' && (
          <div className="field"><label>Confirmer le mot de passe</label>
            <input type="password" value={pass2} onChange={e => setPass2(e.target.value)} placeholder="••••" onKeyDown={onKey} />
          </div>
        )}
        <button className="btn btn-primary btn-full" onClick={submit} disabled={loading} style={{ marginTop: 4 }}>
          {loading ? '...' : mode === 'login' ? 'Se connecter 🌱' : 'Créer le compte'}
        </button>
        {appVersion != null && <p className="auth-version">Version {appVersion}</p>}
      </div>
    </div>
  );
}

export { PinModal, AuthScreen };
