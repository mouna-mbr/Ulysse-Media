import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { authRequest } from '../api';
import { useAuth } from '../auth-context';
import { useToast } from '../toast-context';

const TASK_STATUS_LABELS = {
  TO_DO: 'A faire',
  DOING: 'En cours',
  READY: 'Pret'
};

function EmployeeDashboardPage() {
  const { token } = useAuth();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState(null);
  const [upcomingMeetings, setUpcomingMeetings] = useState([]);
  const [myTasks, setMyTasks] = useState([]);

  useEffect(() => {
    if (!token) return;

    const loadDashboard = async () => {
      setLoading(true);
      try {
        const res = await authRequest('/dashboard/employee', token);
        setMetrics(res.metrics || {});
        setUpcomingMeetings(res.upcomingMeetings || []);
        setMyTasks(res.myTasks || []);
      } catch (error) {
        toast.error(error.message);
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, [token, toast]);

  const cards = useMemo(() => {
    const values = metrics || {};
    return [
      { title: 'Projets actifs', value: values.activeProjects || 0, note: `${values.assignedQuotes || 0} devis assignes` },
      { title: 'Taches totales', value: values.tasksTotal || 0, note: `${values.tasksTodo || 0} a faire` },
      { title: 'Taches en cours', value: values.tasksDoing || 0, note: `${values.tasksReady || 0} pretes` },
      { title: 'Milestones a traiter', value: values.pendingMilestones || 0, note: 'Creation ou correction attendue' }
    ];
  }, [metrics]);

  if (loading) {
    return <div className="rounded-2xl border border-outline-variant/20 bg-white p-5 text-sm text-on-surface-variant">Chargement dashboard employe...</div>;
  }

  return (
    <section className="space-y-6">
      <header className="rounded-2xl border border-outline-variant/20 bg-white p-6">
        <h1 className="text-3xl font-bold text-primary">Accueil Employe</h1>
        <p className="mt-2 text-on-surface-variant">Vue dynamique de vos projets, taches et reunions a venir.</p>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <article key={card.title} className="rounded-2xl border border-outline-variant/20 bg-white p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-outline">{card.title}</p>
            <p className="mt-3 text-3xl font-extrabold text-on-surface">{card.value}</p>
            <p className="mt-2 text-xs text-on-surface-variant">{card.note}</p>
          </article>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <article className="rounded-2xl border border-outline-variant/20 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-on-surface">Mes taches prioritaires</h2>
            <Link to="/backoffice/projects" className="text-sm font-semibold text-blue-900 hover:underline">Voir board</Link>
          </div>

          {myTasks.length === 0 ? (
            <p className="text-sm text-on-surface-variant">Aucune tache assignee.</p>
          ) : (
            <div className="space-y-3">
              {myTasks.map((task) => (
                <article key={task.id} className="rounded-xl border border-outline-variant/20 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-on-surface">{task.title}</p>
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-800">
                      {TASK_STATUS_LABELS[task.status] || task.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-on-surface-variant">Projet: {task.projectName || task.projectId}</p>
                  <p className="mt-1 text-xs text-on-surface-variant">
                    Deadline: {task.deadline ? new Date(task.deadline).toLocaleString('fr-FR') : 'Non definie'}
                  </p>
                </article>
              ))}
            </div>
          )}
        </article>

        <article className="rounded-2xl border border-outline-variant/20 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-on-surface">Meetings a venir</h2>
            <Link to="/backoffice/reunions" className="text-sm font-semibold text-blue-900 hover:underline">Voir agenda</Link>
          </div>

          {upcomingMeetings.length === 0 ? (
            <p className="text-sm text-on-surface-variant">Aucune reunion planifiee.</p>
          ) : (
            <div className="space-y-3">
              {upcomingMeetings.map((meeting) => (
                <article key={meeting.id} className="rounded-xl border border-outline-variant/20 bg-slate-50 p-3">
                  <p className="text-sm font-semibold text-on-surface">{meeting.title}</p>
                  <p className="mt-1 text-xs text-on-surface-variant">{meeting.start ? new Date(meeting.start).toLocaleString('fr-FR') : '-'}</p>
                  <p className="mt-1 text-xs font-semibold text-blue-800">{meeting.status || '-'}</p>
                </article>
              ))}
            </div>
          )}
        </article>
      </section>
    </section>
  );
}

export default EmployeeDashboardPage;
