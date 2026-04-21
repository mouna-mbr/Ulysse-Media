import { useState } from 'react';
import MainNav from '../components/MainNav';
import { authRequest } from '../api';
import { useAuth } from '../auth-context';
import { useToast } from '../toast-context';

function SettingsPage() {
  const { token, user, applyAuthSnapshot } = useAuth();
  const toast = useToast();
  const [availabilitySaving, setAvailabilitySaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });

  const isEmployee = user?.role === 'EMPLOYE';
  const isAvailable = !!user?.disponibilite;

  const saveAvailability = async (nextAvailability) => {
    if (!isEmployee) return;
    setAvailabilitySaving(true);
    try {
      const res = await authRequest('/profile', token, {
        method: 'PATCH',
        body: JSON.stringify({ disponibilite: nextAvailability })
      });
      applyAuthSnapshot(res.user, res.token);
      toast.success(nextAvailability ? 'Statut: disponible.' : 'Statut: non disponible.');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setAvailabilitySaving(false);
    }
  };

  const submitPassword = async (event) => {
    event.preventDefault();
    if (passwordForm.newPassword.length < 8) {
      toast.warning('Le nouveau mot de passe doit contenir au moins 8 caracteres.');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.warning('La confirmation du mot de passe ne correspond pas.');
      return;
    }

    setPasswordSaving(true);
    try {
      await authRequest('/auth/change-password', token, {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword
        })
      });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast.success('Mot de passe mis a jour.');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface">
      <MainNav />
      <main className="pt-32 px-6 max-w-4xl mx-auto">
        <section className="space-y-5">
          <div className="bg-white border border-outline-variant/20 rounded-2xl p-8">
            <h1 className="text-3xl font-bold text-primary">Paramètres</h1>
            <p className="mt-2 text-on-surface-variant">Gestion securite et preferences compte.</p>
          </div>

          {isEmployee && (
            <div className="bg-white border border-outline-variant/20 rounded-2xl p-8">
              <h2 className="text-xl font-bold text-on-surface">Disponibilite employe</h2>
              <p className="mt-1 text-sm text-on-surface-variant">Indiquez si vous etes disponible pour de nouvelles affectations.</p>
              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  disabled={availabilitySaving}
                  onClick={() => saveAvailability(true)}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold ${isAvailable ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-700'}`}
                >
                  Disponible
                </button>
                <button
                  type="button"
                  disabled={availabilitySaving}
                  onClick={() => saveAvailability(false)}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold ${!isAvailable ? 'bg-rose-700 text-white' : 'bg-slate-100 text-slate-700'}`}
                >
                  Non disponible
                </button>
              </div>
            </div>
          )}

          <div className="bg-white border border-outline-variant/20 rounded-2xl p-8">
            <h2 className="text-xl font-bold text-on-surface">Changer le mot de passe</h2>
            <form className="mt-4 space-y-3" onSubmit={submitPassword}>
              <input
                type="password"
                placeholder="Mot de passe actuel"
                className="w-full rounded-xl border border-outline-variant/30 px-4 py-2.5"
                value={passwordForm.currentPassword}
                onChange={(event) => setPasswordForm((prev) => ({ ...prev, currentPassword: event.target.value }))}
              />
              <input
                type="password"
                placeholder="Nouveau mot de passe"
                className="w-full rounded-xl border border-outline-variant/30 px-4 py-2.5"
                value={passwordForm.newPassword}
                onChange={(event) => setPasswordForm((prev) => ({ ...prev, newPassword: event.target.value }))}
              />
              <input
                type="password"
                placeholder="Confirmer le nouveau mot de passe"
                className="w-full rounded-xl border border-outline-variant/30 px-4 py-2.5"
                value={passwordForm.confirmPassword}
                onChange={(event) => setPasswordForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
              />
              <button
                type="submit"
                disabled={passwordSaving}
                className="rounded-lg bg-blue-900 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
              >
                {passwordSaving ? 'Mise a jour...' : 'Mettre a jour le mot de passe'}
              </button>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}

export default SettingsPage;
