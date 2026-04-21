import MainNav from '../components/MainNav';
import { useAuth } from '../auth-context';

function ProfilePage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-surface">
      <MainNav />
      <main className="pt-32 px-6 max-w-4xl mx-auto">
        <div className="bg-white border border-outline-variant/20 rounded-2xl p-8">
          <h1 className="text-3xl font-bold text-primary">Mon profil</h1>
          <p className="mt-2 text-on-surface-variant">Informations de votre compte.</p>
          <div className="mt-8 space-y-3 text-sm">
            <p><span className="font-semibold">Nom :</span> {user?.username || '-'}</p>
            <p><span className="font-semibold">Email :</span> {user?.email || '-'}</p>
            <p><span className="font-semibold">Rôle :</span> {user?.role || '-'}</p>
            {user?.role === 'EMPLOYE' && (
              <p><span className="font-semibold">Disponibilite :</span> {user?.disponibilite ? 'Disponible' : 'Non disponible'}</p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default ProfilePage;
