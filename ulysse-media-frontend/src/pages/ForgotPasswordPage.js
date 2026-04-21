import { useState } from 'react';
import { Link } from 'react-router-dom';
import { request } from '../api';

function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      await request('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() })
      });
      setSent(true);
    } catch (error) {
      setSent(true); // Still show success to prevent enumeration
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <main className="w-full max-w-md rounded-2xl border border-outline-variant/20 bg-white p-7">
        <h1 className="text-2xl font-bold text-primary">Mot de passe oublie</h1>

        {sent ? (
          <div className="mt-5 rounded-xl bg-emerald-50 border border-emerald-200 p-5">
            <p className="text-sm font-semibold text-emerald-800">Email envoye !</p>
            <p className="mt-1 text-sm text-emerald-700">
              Si un compte correspond a <strong>{email}</strong>, vous allez recevoir un email avec un lien de reinitialisation valable 1 heure.
            </p>
            <p className="mt-2 text-xs text-emerald-600">Verifiez aussi vos spams.</p>
          </div>
        ) : (
          <>
            <p className="mt-2 text-sm text-on-surface-variant">Entrez votre email pour recevoir un lien de reinitialisation.</p>
            <form className="mt-5 space-y-3" onSubmit={submit}>
              <input
                type="email"
                required
                placeholder="email@exemple.com"
                className="w-full rounded-xl border border-outline-variant/30 px-4 py-2.5"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-blue-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
              >
                {loading ? 'Envoi...' : 'Envoyer le lien'}
              </button>
            </form>
          </>
        )}

        <Link to="/connexion" className="mt-5 inline-flex text-sm font-semibold text-blue-900 hover:underline">
          Retour connexion
        </Link>
      </main>
    </div>
  );
}

export default ForgotPasswordPage;
