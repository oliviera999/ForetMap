import { useState } from 'react';
import { TotpChallenge } from '../components/auth/TotpChallenge.jsx';
import { saveStaffToken } from './staffSession.js';

/**
 * Plan des personnels — étape de double authentification au retour Google d'un compte
 * administrateur ou n3boss : le jeton n'est mémorisé qu'après le code. Requêtes `fetch`
 * directes (même origine) : le plan n'embarque pas le client HTTP de ForetMap.
 */
async function postJson(path, method = 'GET', body) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = {};
  try {
    data = await res.json();
  } catch (_) {
    data = {};
  }
  if (!res.ok) {
    const err = new Error(data?.error || 'La connexion n’a pas abouti. Réessayez.');
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

/**
 * @param {object} props
 * @param {object} props.challenge charge `#oauth=` de type `mfa`
 * @param {import('react').ReactNode} props.children le plan, monté une fois l'étape franchie
 */
export function StaffMfaGate({ challenge, children }) {
  const [done, setDone] = useState(!challenge);
  if (done) return children;
  return (
    <main className="staff-mfa-gate" style={{ maxWidth: 420, margin: '40px auto', padding: 16 }}>
      <TotpChallenge
        challenge={challenge}
        request={postJson}
        onComplete={(body) => {
          saveStaffToken(body?.authToken);
          setDone(true);
        }}
        onCancel={() => setDone(true)}
      />
    </main>
  );
}
