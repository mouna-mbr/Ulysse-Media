import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../auth-context';
import { useToast } from '../toast-context';

function SignInPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const onSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const user = await login(form.email, form.password);
      toast.success(`Bienvenue, ${user.username} !`);
      if (user.role === 'ADMIN') {
        navigate('/backoffice/admin');
      } else if (user.role === 'EMPLOYE') {
        navigate('/backoffice/employe');
      } else {
        navigate('/');
      }
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
              L'atrium digital de la production <span className="text-on-primary-container">multimédia</span> premium.
            </h1>
            <p className="mt-6 text-lg text-primary-fixed-dim leading-relaxed">
              Gérez vos assets créatifs, suivez vos campagnes et collaborez dans un espace conçu pour l'excellence.
            </p>

            <div className="mt-12 inline-flex items-center gap-4 bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/10">
              <div className="flex -space-x-2">
                <div className="w-8 h-8 rounded-full border-2 border-primary/20 bg-slate-300" />
                <div className="w-8 h-8 rounded-full border-2 border-primary/20 bg-slate-400" />
                <div className="w-8 h-8 rounded-full border-2 border-primary/20 bg-slate-500" />
              </div>
              <p className="text-sm font-medium text-white/90">Rejoignez 500+ agences média</p>
            </div>
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
              <h2 className="text-3xl font-bold text-on-background tracking-tight">Bon retour</h2>
              <p className="text-on-surface-variant mt-2">Entrez vos identifiants pour accéder à votre tableau de bord.</p>
            </div>

            <form className="space-y-6" onSubmit={onSubmit}>
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-on-surface" htmlFor="email">Adresse email</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <span className="material-symbols-outlined text-outline text-[20px]">mail</span>
                  </div>
                  <input
                    className="w-full pl-11 pr-4 py-3 bg-surface-container-highest border-none rounded-xl text-on-surface focus:ring-2 focus:ring-primary/20 focus:bg-surface-container-lowest transition-all duration-200 outline-none placeholder:text-outline"
                    id="email"
                    name="email"
                    placeholder="nom@entreprise.com"
                    required
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-semibold text-on-surface" htmlFor="password">Mot de passe</label>
                  <a className="text-xs font-semibold text-primary hover:text-primary-container transition-colors" href="#forgot">Mot de passe oublié ?</a>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <span className="material-symbols-outlined text-outline text-[20px]">lock</span>
                  </div>
                  <input
                    className="w-full pl-11 pr-12 py-3 bg-surface-container-highest border-none rounded-xl text-on-surface focus:ring-2 focus:ring-primary/20 focus:bg-surface-container-lowest transition-all duration-200 outline-none placeholder:text-outline"
                    id="password"
                    name="password"
                    placeholder="••••••••"
                    required
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                  />
                  <button className="absolute inset-y-0 right-0 pr-4 flex items-center text-outline hover:text-on-surface-variant transition-colors" type="button" onClick={() => setShowPassword((prev) => !prev)}>
                    <span className="material-symbols-outlined text-[20px]">{showPassword ? 'visibility_off' : 'visibility'}</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center">
                <input className="w-4 h-4 text-primary bg-surface-container-highest border-none rounded focus:ring-primary focus:ring-offset-0" id="remember" type="checkbox" />
                <label className="ml-2 text-sm text-on-surface-variant select-none" htmlFor="remember">Se souvenir de moi pendant 30 jours</label>
              </div>

              <button className="w-full py-4 bg-gradient-to-br from-primary to-primary-container text-white font-semibold rounded-xl shadow-xl shadow-primary/10 hover:shadow-primary/20 active:scale-[0.98] transition-all duration-200" type="submit" disabled={loading}>
                {loading ? 'Connexion...' : 'Se connecter au tableau de bord'}
              </button>

              {error && <p className="text-sm text-red-700">{error}</p>}
            </form>

            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-outline-variant/30" />
              </div>
              <div className="relative flex justify-center text-xs uppercase tracking-widest font-semibold">
                <span className="bg-surface px-4 text-outline">Ou continuer avec</span>
              </div>
            </div>

            <button className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-surface-container-lowest border border-outline-variant/30 rounded-xl hover:bg-surface-container-low transition-colors duration-200 group" type="button">
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              <span className="text-sm font-semibold text-on-surface">Se connecter avec Google</span>
            </button>

            <p className="mt-10 text-center text-sm text-on-surface-variant">
              Vous n'avez pas de compte ?
              <Link className="font-bold text-primary hover:underline underline-offset-4 ml-1" to="/inscription">Créer un compte</Link>
            </p>
          </div>

          <div className="md:hidden mt-auto pt-12 text-center">
            <p className="text-[10px] text-outline tracking-widest uppercase">© 2024 Ulysse Media</p>
          </div>
        </section>
      </main>
    </div>
  );
}

export default SignInPage;
