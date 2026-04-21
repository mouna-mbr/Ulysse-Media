import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { authRequest } from '../api';
import { useAuth } from '../auth-context';
import { useToast } from '../toast-context';

function formatCurrency(cents) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format((Number(cents || 0)) / 100);
}

function formatMonth(period) {
  if (!period) return '-';
  const [year, month] = String(period).split('-');
  const date = new Date(Number(year), Number(month) - 1, 1);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }) : period;
}

const QUOTE_STATUS_LABELS = {
  EN_ATTENTE: 'En attente',
  EN_COURS: 'En cours',
  VALIDE: 'Valide',
  REJETE: 'Rejete'
};

function AdminDashboardPage() {
  const { token } = useAuth();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState(null);
  const [monthlyRevenue, setMonthlyRevenue] = useState([]);
  const [recentQuotes, setRecentQuotes] = useState([]);

  useEffect(() => {
    if (!token) return;

    const loadDashboard = async () => {
      setLoading(true);
      try {
        const res = await authRequest('/dashboard/admin', token);
        setMetrics(res.metrics || {});
        setMonthlyRevenue(res.monthlyRevenue || []);
        setRecentQuotes(res.recentQuotes || []);
      } catch (error) {
        toast.error(error.message);
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, [token, toast]);

  const kpis = useMemo(() => {
    const values = metrics || {};
    return [
      { title: 'Revenu total', value: formatCurrency(values.totalRevenueCents), hint: 'Paiements encaisses' },
      { title: 'Projets actifs', value: String(values.projectsActive || 0), hint: `${values.projectsTotal || 0} projets au total` },
      { title: 'Utilisateurs', value: String(values.usersTotal || 0), hint: `${values.clientsActive || 0} clients / ${values.employeesActive || 0} employes actifs` },
      { title: 'Messages contact', value: String(values.contactMessages || 0), hint: `${values.pendingQuotes || 0} devis en attente ou en cours` }
    ];
  }, [metrics]);

  const maxRevenue = Math.max(1, ...monthlyRevenue.map((item) => Number(item.totalCents || 0)));

  if (loading) {
    return <div className="rounded-2xl border border-outline-variant/20 bg-white p-5 text-sm text-on-surface-variant">Chargement dashboard admin...</div>;
  }

  return (
    <section className="space-y-6">
      <header className="rounded-2xl border border-outline-variant/20 bg-white p-6">
        <h1 className="text-3xl font-bold text-primary tracking-tight">Dashboard Admin</h1>
        <p className="mt-2 text-on-surface-variant">Vue globale de l'activite commerciale et operationnelle.</p>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <article key={kpi.title} className="rounded-2xl border border-outline-variant/20 bg-white p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-outline">{kpi.title}</p>
            <p className="mt-3 text-3xl font-extrabold text-on-surface tracking-tight">{kpi.value}</p>
            <p className="mt-2 text-xs text-on-surface-variant">{kpi.hint}</p>
          </article>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <article className="xl:col-span-2 rounded-2xl border border-outline-variant/20 bg-white p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-on-surface">Revenu sur 6 mois</h2>
              <p className="text-sm text-on-surface-variant">Evolution mensuelle des paiements valides</p>
            </div>
          </div>

          {monthlyRevenue.length === 0 ? (
            <p className="text-sm text-on-surface-variant">Aucune donnee de revenu disponible.</p>
          ) : (
            <div className="space-y-3">
              {monthlyRevenue.map((item) => {
                const value = Number(item.totalCents || 0);
                const width = Math.max(4, Math.round((value / maxRevenue) * 100));
                return (
                  <div key={item.period}>
                    <div className="mb-1 flex items-center justify-between text-xs text-on-surface-variant">
                      <span>{formatMonth(item.period)}</span>
                      <span className="font-semibold text-on-surface">{formatCurrency(value)}</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-blue-800" style={{ width: `${width}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </article>

        <article className="rounded-2xl border border-outline-variant/20 bg-white p-6">
          <h3 className="text-lg font-bold text-on-surface">Sante des projets</h3>
          <p className="mt-1 text-sm text-on-surface-variant">Completion moyenne et volume actif</p>
          <div className="mt-4 rounded-xl bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-widest text-outline">Completion moyenne</p>
            <p className="mt-2 text-3xl font-extrabold text-blue-900">{metrics?.avgCompletion || 0}%</p>
          </div>
          <div className="mt-3 rounded-xl bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-widest text-outline">Projets actifs</p>
            <p className="mt-2 text-3xl font-extrabold text-blue-900">{metrics?.projectsActive || 0}</p>
          </div>
          <Link to="/backoffice/admin/contacts" className="mt-4 inline-flex text-sm font-semibold text-blue-900 hover:underline">
            Voir les messages contact
          </Link>
        </article>
      </section>

      <section className="rounded-2xl border border-outline-variant/20 bg-white p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold text-on-surface">Demandes de devis recentes</h3>
            <p className="text-sm text-on-surface-variant">Dernieres requetes envoyees par les clients</p>
          </div>
          <Link to="/backoffice/devis" className="text-sm font-semibold text-blue-900 hover:underline">Voir tout</Link>
        </div>

        {recentQuotes.length === 0 ? (
          <p className="text-sm text-on-surface-variant">Aucune demande recente.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-outline uppercase text-[11px] tracking-widest">
                  <th className="pb-3">ID</th>
                  <th className="pb-3">Client</th>
                  <th className="pb-3">Service</th>
                  <th className="pb-3">Date</th>
                  <th className="pb-3">Statut</th>
                </tr>
              </thead>
              <tbody>
                {recentQuotes.map((quote) => (
                  <tr key={quote.id} className="border-t border-outline-variant/20">
                    <td className="py-3 font-semibold text-on-surface">{quote.id}</td>
                    <td className="py-3">{quote.clientName}</td>
                    <td className="py-3 text-on-surface-variant">{quote.serviceType}</td>
                    <td className="py-3 text-on-surface-variant">{quote.createdAt ? new Date(quote.createdAt).toLocaleDateString('fr-FR') : '-'}</td>
                    <td className="py-3">
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-[11px] font-bold uppercase text-blue-800">
                        {QUOTE_STATUS_LABELS[quote.status] || quote.status || '-'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}

export default AdminDashboardPage;
