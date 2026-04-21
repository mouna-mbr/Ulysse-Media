import { useMemo, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { request } from '../api';

function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = useMemo(() => searchParams.get('token') || '', [searchParams]);

  const [form, setForm] = useState({ newPassword: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setMessage('');

    if (!token) {
      setMessage('Token de reinitialisation manquant.');
      return;
    }
    if (form.newPassword.length < 8) {
      setMessage('Le mot de passe doit contenir au moins 8 caracteres.');
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      setMessage('La confirmation ne correspond pas.');
      return;
    }

    setLoading(true);
    try {
      const res = await request('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword: form.newPassword })
      });
      setMessage(res.message || 'Mot de passe reinitialise.');
      setTimeout(() => navigate('/connexion'), 1200);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <main className="w-full max-w-md rounded-2xl border border-outline-variant/20 bg-white p-7">
        <h1 className="text-2xl font-bold text-primary">Reinitialiser le mot de passe</h1>
        <p className="mt-2 text-sm text-on-surface-variant">Definissez un nouveau mot de passe pour votre compte.</p>

        <form className="mt-5 space-y-3" onSubmit={submit}>
          <input
            type="password"
            required
            placeholder="Nouveau mot de passe"
            className="w-full rounded-xl border border-outline-variant/30 px-4 py-2.5"
            value={form.newPassword}
            onChange={(event) => setForm((prev) => ({ ...prev, newPassword: event.target.value }))}
          />
          <input
            type="password"
            required
            placeholder="Confirmer le mot de passe"
            className="w-full rounded-xl border border-outline-variant/30 px-4 py-2.5"
            value={form.confirmPassword}
            onChange={(event) => setForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-blue-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
          >
            {loading ? 'Mise a jour...' : 'Reinitialiser'}
          </button>
        </form>

        {message && <p className="mt-4 text-sm text-slate-700">{message}</p>}

        <Link to="/connexion" className="mt-5 inline-flex text-sm font-semibold text-blue-900 hover:underline">
          Retour connexion
        </Link>
      </main>
    </div>
  );
}

export default ResetPasswordPage;
