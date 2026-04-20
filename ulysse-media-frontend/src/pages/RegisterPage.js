import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth-context';

function RegisterPage() {
  const { registerClient } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', email: '', password: '', tel: '', address: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const onSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      await registerClient(form);
      navigate('/');
    } catch (submissionError) {
      setError(submissionError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-background text-on-background selection:bg-primary-fixed selection:text-on-primary-fixed min-h-screen">
      <main className="min-h-screen flex flex-col md:flex-row overflow-hidden">
        <section className="hidden md:flex relative w-1/2 flex-col justify-between p-12 lg:p-20 overflow-hidden">
          <div className="absolute inset-0 z-0">
            <img
              className="w-full h-full object-cover"
              alt="Studio cinématographique moderne"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuB1puBtpAvr9AmRphxnVCfvPndWYbS8cMOm9yaS0688xLV7XfDfCuKcCE_P3hE0B8DlyVntOVxJNPmN8CgbRC72kz_RrmAw9op0mma_rmey1TUeTU1xJiLYh74_Z9aulWvu5FF8Ye3WPIxjxP6-hf0qwiv7bjTVIlQJAnQOnXxkqK9FzJ6rIPtqVH5pGCC9Lp6ksyJwnbLc5XwGyXojhDP2Tw3ML5Tav4PLR0ZNQ8Qfxf0lSIrGq5m72octN2F0XOH4kSs6KHlSG-Z_"
            />
            <div className="absolute inset-0 bg-gradient-to-br from-primary/80 via-primary-container/60 to-transparent" />
          </div>

          <div className="relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-surface-container-lowest rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
                <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>movie_filter</span>
              </div>
              <span className="text-2xl font-extrabold tracking-tighter text-white">Ulysse Media</span>
            </div>
          </div>

          <div className="relative z-10 mt-auto max-w-lg">
            <h1 className="text-4xl lg:text-5xl font-bold text-white tracking-tight leading-[1.1]">
              Créez votre espace <span className="text-on-primary-container">client</span> en quelques secondes.
            </h1>
            <p className="mt-6 text-lg text-primary-fixed-dim leading-relaxed">
              Centralisez vos demandes, suivez vos projets et échangez avec l'équipe Ulysse Media en temps réel.
            </p>
          </div>

          <div className="relative z-10 mt-12">
            <p className="text-xs text-primary-fixed/60 tracking-widest uppercase">© 2024 Ulysse Media. Pensé pour l'excellence.</p>
          </div>
        </section>

        <section className="flex-1 flex flex-col justify-center items-center p-6 md:p-12 lg:p-24 bg-surface">
          <div className="md:hidden w-full flex items-center justify-center mb-12">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-3xl">movie_filter</span>
              <span className="text-xl font-extrabold text-primary">Ulysse Media</span>
            </div>
          </div>

          <div className="w-full max-w-md">
            <div className="mb-10 text-center md:text-left">
              <h2 className="text-3xl font-bold text-on-background tracking-tight">Créer un compte</h2>
              <p className="text-on-surface-variant mt-2">Renseignez vos informations pour rejoindre la plateforme.</p>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <input
                className="w-full py-3 px-4 bg-surface-container-highest border-none rounded-xl"
                placeholder="Nom d'utilisateur"
                value={form.username}
                onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
                required
              />
              <input
                type="email"
                className="w-full py-3 px-4 bg-surface-container-highest border-none rounded-xl"
                placeholder="Email professionnel"
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                required
              />

              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="w-full py-3 px-4 pr-12 bg-surface-container-highest border-none rounded-xl"
                  placeholder="Mot de passe"
                  value={form.password}
                  onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                  required
                />
                <button className="absolute inset-y-0 right-0 pr-4 flex items-center text-outline hover:text-on-surface-variant" type="button" onClick={() => setShowPassword((prev) => !prev)}>
                  <span className="material-symbols-outlined text-[20px]">{showPassword ? 'visibility_off' : 'visibility'}</span>
                </button>
              </div>

              <input
                className="w-full py-3 px-4 bg-surface-container-highest border-none rounded-xl"
                placeholder="Téléphone"
                value={form.tel}
                onChange={(e) => setForm((prev) => ({ ...prev, tel: e.target.value }))}
              />
              <input
                className="w-full py-3 px-4 bg-surface-container-highest border-none rounded-xl"
                placeholder="Adresse"
                value={form.address}
                onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
              />

              <button disabled={loading} type="submit" className="w-full py-4 bg-gradient-to-br from-primary to-primary-container text-white font-semibold rounded-xl shadow-xl shadow-primary/10 hover:shadow-primary/20 active:scale-[0.98] transition-all duration-200">
                {loading ? 'Création...' : 'Créer mon compte'}
              </button>
              {error && <p className="text-sm text-red-700">{error}</p>}
            </form>

            <p className="mt-10 text-center text-sm text-on-surface-variant">
              Vous avez déjà un compte ?
              <Link className="font-bold text-primary hover:underline underline-offset-4 ml-1" to="/connexion">Se connecter</Link>
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

export default RegisterPage;
