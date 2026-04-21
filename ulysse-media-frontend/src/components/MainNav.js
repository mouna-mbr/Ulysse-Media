import { Link } from 'react-router-dom';
import { useAuth } from '../auth-context';
import NotificationBell from './NotificationBell';

function MainNav() {
  const { user, logout } = useAuth();
  const initials = (user?.username || 'U')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'U';

  return (
    <nav className="fixed top-0 w-full z-50 bg-surface/70 backdrop-blur-xl shadow-sm">
      <div className="flex justify-between items-center px-8 py-4 max-w-full">
        <div className="flex items-center gap-8">
          <Link to="/" className="text-2xl font-extrabold text-blue-900">Ulysse Media</Link>
          <div className="hidden md:flex gap-6">
            <Link className="text-blue-900 border-b-2 border-blue-900 pb-1 tracking-tight font-bold" to="/services">Services</Link>
            {!user && <a className="text-slate-600 hover:text-blue-700 transition-colors duration-200" href="/#portfolio">Portfolio</a>}
            {!user && <a className="text-slate-600 hover:text-blue-700 transition-colors duration-200" href="/#about">À propos</a>}
            <Link className="text-slate-600 hover:text-blue-700 transition-colors duration-200" to="/contact">Contact</Link>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {!user ? (
            <>
              <Link className="text-blue-900 font-semibold hover:text-blue-700 transition-colors px-4" to="/connexion">Se connecter</Link>
              <Link className="bg-gradient-to-br from-primary to-primary-container text-white px-6 py-2.5 rounded-xl font-bold shadow-lg transform transition active:scale-95" to="/inscription">
                S'inscrire
              </Link>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <NotificationBell />

              <details className="relative">
                <summary className="list-none cursor-pointer flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-blue-50">
                  <span className="w-9 h-9 rounded-full bg-blue-700 text-white text-xs font-bold flex items-center justify-center">
                    {initials}
                  </span>
                  <span className="text-blue-800 font-semibold">{user.username}</span>
                  <span className="material-symbols-outlined text-blue-700 text-[18px]">keyboard_arrow_down</span>
                </summary>
                <div className="absolute right-0 mt-2 w-52 bg-white border border-outline-variant/30 rounded-xl shadow-xl overflow-hidden">
                  <Link className="block px-4 py-3 text-sm text-slate-700 hover:bg-surface-container-low" to="/profil">
                    Voir profil
                  </Link>
                  <Link className="block px-4 py-3 text-sm text-slate-700 hover:bg-surface-container-low" to="/parametres">
                    Voir paramètres
                  </Link>
                  {user.role === 'CLIENT' && (
                    <Link className="block px-4 py-3 text-sm text-slate-700 hover:bg-surface-container-low" to="/mes-devis">
                      Mes demandes de devis
                    </Link>
                  )}
                  {user.role === 'CLIENT' && (
                    <Link className="block px-4 py-3 text-sm text-slate-700 hover:bg-surface-container-low" to="/mes-reunions">
                      Mes reunions
                    </Link>
                  )}
                  {user.role === 'CLIENT' && (
                    <Link className="block px-4 py-3 text-sm text-slate-700 hover:bg-surface-container-low" to="/mes-projets">
                      Mes projets
                    </Link>
                  )}
                  <button
                    className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50"
                    onClick={logout}
                    type="button"
                  >
                    Déconnexion
                  </button>
                </div>
              </details>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

export default MainNav;
