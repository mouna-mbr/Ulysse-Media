function EmployeeDashboardPage() {
  return (
    <section className="space-y-6">
      <header className="bg-white border border-outline-variant/20 rounded-2xl p-6">
        <h1 className="text-3xl font-bold text-primary">Accueil Employé</h1>
        <p className="mt-2 text-on-surface-variant">Bienvenue dans votre espace backoffice employé.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <article className="bg-white border border-outline-variant/20 rounded-2xl p-5">
          <p className="text-sm text-on-surface-variant">Tâches</p>
          <h2 className="mt-2 text-xl font-semibold text-on-surface">Production en cours</h2>
          <p className="mt-2 text-sm text-on-surface-variant">Consultez les livrables et priorités du jour.</p>
        </article>
        <article className="bg-white border border-outline-variant/20 rounded-2xl p-5">
          <p className="text-sm text-on-surface-variant">Planning</p>
          <h2 className="mt-2 text-xl font-semibold text-on-surface">Calendrier</h2>
          <p className="mt-2 text-sm text-on-surface-variant">Visualisez vos échéances et disponibilités.</p>
        </article>
      </div>
    </section>
  );
}

export default EmployeeDashboardPage;
