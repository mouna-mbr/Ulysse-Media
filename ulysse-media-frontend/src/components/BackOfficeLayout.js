import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth-context';
import NotificationBell from './NotificationBell';

function BackOfficeLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const isAdmin = user?.role === 'ADMIN';
  const sectionTitle = location.pathname.includes('/utilisateurs')
    ? 'Utilisateurs'
    : location.pathname.includes('/contacts')
      ? 'Contacts'
    : location.pathname.includes('/portfolios')
      ? 'Portfolios'
      : location.pathname.includes('/services')
        ? 'Services'
      : location.pathname.includes('/projects')
        ? 'Projects'
        : location.pathname.includes('/devis')
          ? 'Demandes de devis'
        : location.pathname.includes('/reunions')
          ? 'Reunions & Calendrier'
          : 'Overview';

  const navClassName = ({ isActive }) => (
    `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${isActive
      ? 'bg-primary-fixed text-on-primary-fixed'
      : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'}`
  );

  const passiveNavClass = 'flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-on-surface-variant  hover:bg-surface-container-low transition-all duration-200';

  return (
    <div className="min-h-screen bg-background text-on-surface font-body antialiased">
      <aside className="fixed left-0  top-0 h-screen w-64 bg-surface-container-lowest border-r border-outline-variant/30 p-4 flex flex-col z-40 overflow-y-auto">
        <div className="mb-8 px-2 flex items-center gap-3">
          <div className="w-10 h-10 bg-primary-container rounded-xl flex items-center justify-center text-on-primary-container">
            <span className="material-symbols-outlined text-white">rocket_launch</span>
          </div>
          <div>
            <h1 className="font-headline font-extrabold text-primary text-lg leading-tight">Ulysee Media</h1>
            <p className="text-xs text-outline uppercase tracking-widest">Management Suite</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1">
          <NavLink to={isAdmin ? '/backoffice/admin' : '/backoffice/employe'} end className={navClassName}>
            <span className="material-symbols-outlined">dashboard</span>
            <span>Dashboard</span>
          </NavLink>

          {isAdmin && (
            <NavLink to="/backoffice/admin/utilisateurs" className={navClassName}>
              <span className="material-symbols-outlined">groups</span>
              <span>Utilisateurs</span>
            </NavLink>
          )}

          {isAdmin && (
            <NavLink to="/backoffice/admin/services" className={navClassName}>
              <span className="material-symbols-outlined">design_services</span>
              <span>Services</span>
            </NavLink>
          )}

          {isAdmin && (
            <NavLink to="/backoffice/admin/portfolios" className={navClassName}>
              <span className="material-symbols-outlined">perm_media</span>
              <span>Portfolios</span>
            </NavLink>
          )}

          {isAdmin && (
            <NavLink to="/backoffice/admin/contacts" className={navClassName}>
              <span className="material-symbols-outlined">contact_mail</span>
              <span>Contacts</span>
            </NavLink>
          )}

          <NavLink to="/backoffice/devis" className={navClassName}>
            <span className="material-symbols-outlined">request_quote</span>
            <span>Demandes de devis</span>
          </NavLink>

          <NavLink to="/backoffice/reunions" className={navClassName}>
            <span className="material-symbols-outlined">calendar_month</span>
            <span>Reunions</span>
          </NavLink>

          <NavLink to="/backoffice/projects" className={navClassName}>
            <span className="material-symbols-outlined">view_kanban</span>
            <span>Projects</span>
          </NavLink>
          <button type="button" className={`${passiveNavClass} w-full text-left`}>
            <span className="material-symbols-outlined">perm_media</span>
            <span>Media Library</span>
          </button>
          <button type="button" className={`${passiveNavClass} w-full text-left`}>
            <span className="material-symbols-outlined">monitoring</span>
            <span>Analytics</span>
          </button>
        </nav>

        <div className="mt-auto border-t border-outline-variant/30 pt-4 space-y-2">
          <button type="button" className={`${passiveNavClass} w-full text-left`}>
            <span className="material-symbols-outlined">settings</span>
            <span>Settings</span>
          </button>
          <button
            type="button"
            className="w-full rounded-xl px-4 py-3 text-sm font-semibold bg-gradient-to-br from-primary to-primary-container text-white"
            onClick={logout}
          >
            Déconnexion
          </button>
        </div>
      </aside>

      <main className="ml-64 min-h-screen">
        <header className="sticky top-0 z-30 bg-surface/80 backdrop-blur-xl border-b border-outline-variant/20 px-8 py-4 flex items-center justify-between">
          <h2 className="font-headline font-extrabold text-2xl text-primary tracking-tight">{sectionTitle}</h2>

          <div className="flex items-center gap-6">
            <div className="hidden md:flex items-center bg-surface-container-highest px-4 py-2 rounded-full gap-3">
              <span className="material-symbols-outlined text-outline text-[20px]">search</span>
              <input
                className="bg-transparent border-none focus:ring-0 text-sm text-on-surface w-48 p-0"
                placeholder="Search data..."
                type="text"
              />
            </div>

            <div className="flex items-center gap-4 border-l border-outline-variant/30 pl-6">
              <NotificationBell dark />

              <div className="flex items-center gap-3">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-semibold leading-none">{user?.username || 'Ulysse Admin'}</p>
                  <p className="text-xs text-outline">{user?.role || 'Backoffice'}</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-primary-fixed text-on-primary-fixed flex items-center justify-center font-bold">
                  {(user?.username || 'U').slice(0, 1).toUpperCase()}
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="p-6 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export default BackOfficeLayout;
