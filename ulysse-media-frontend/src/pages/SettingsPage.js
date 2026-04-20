import MainNav from '../components/MainNav';

function SettingsPage() {
  return (
    <div className="min-h-screen bg-surface">
      <MainNav />
      <main className="pt-32 px-6 max-w-4xl mx-auto">
        <div className="bg-white border border-outline-variant/20 rounded-2xl p-8">
          <h1 className="text-3xl font-bold text-primary">Paramètres</h1>
          <p className="mt-2 text-on-surface-variant">Zone de paramètres client (préparée pour la suite).</p>
        </div>
      </main>
    </div>
  );
}

export default SettingsPage;
