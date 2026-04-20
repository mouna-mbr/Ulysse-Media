import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MainNav from '../components/MainNav';
import { authRequest } from '../api';
import { useAuth } from '../auth-context';
import { useToast } from '../toast-context';

const STATUS_LABEL = {
  EN_ATTENTE: 'En attente',
  AFFECTE: 'Affecte',
  ETUDE_ENVOYEE: 'Etude envoyee',
  REPONDU: 'Repondu',
  EN_ATTENTE_PAIEMENT: 'Attente paiement',
  ACCEPTE: 'Accepte',
  REFUSE: 'Refuse',
  IN_PROGRESS: 'Execution',
  REVIEW: 'Review',
  DELIVERY_READY: 'Livraison'
};

const STATUS_CLASS = {
  EN_ATTENTE: 'bg-amber-100 text-amber-700',
  AFFECTE: 'bg-blue-100 text-blue-700',
  ETUDE_ENVOYEE: 'bg-violet-100 text-violet-700',
  REPONDU: 'bg-emerald-100 text-emerald-700',
  EN_ATTENTE_PAIEMENT: 'bg-orange-100 text-orange-700',
  ACCEPTE: 'bg-emerald-100 text-emerald-700',
  REFUSE: 'bg-red-100 text-red-700',
  IN_PROGRESS: 'bg-sky-100 text-sky-700',
  REVIEW: 'bg-amber-100 text-amber-700',
  DELIVERY_READY: 'bg-emerald-100 text-emerald-700'
};

function ProjectCard({ project, onOpen, isClient }) {
  const statusKey = project.projectStatus || project.status;
  return (
    <article className="rounded-2xl border border-outline-variant/20 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Projet</p>
          <h3 className="mt-1 text-lg font-bold text-on-surface line-clamp-2">{project.name}</h3>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_CLASS[statusKey] || 'bg-slate-100 text-slate-700'}`}>
          {STATUS_LABEL[statusKey] || statusKey}
        </span>
      </div>

      <p className="mt-3 line-clamp-2 text-sm text-on-surface-variant">{project.description || 'Aucune description.'}</p>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-slate-50 px-2 py-2">
          <p className="text-[11px] text-on-surface-variant">TO_DO</p>
          <p className="font-bold text-slate-700">{project.taskStats?.toDo || 0}</p>
        </div>
        <div className="rounded-xl bg-slate-50 px-2 py-2">
          <p className="text-[11px] text-on-surface-variant">DOING</p>
          <p className="font-bold text-blue-700">{project.taskStats?.doing || 0}</p>
        </div>
        <div className="rounded-xl bg-slate-50 px-2 py-2">
          <p className="text-[11px] text-on-surface-variant">READY</p>
          <p className="font-bold text-emerald-700">{project.taskStats?.ready || 0}</p>
        </div>
      </div>

      <div className="mt-4 space-y-1 text-xs text-on-surface-variant">
        <p><span className="font-semibold">Client:</span> {project.clientName || '-'}</p>
        <p><span className="font-semibold">Employe:</span> {project.assignedEmployeeName || 'Non affecte'}</p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="rounded-xl bg-blue-900 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800"
        >
          Ouvrir le board
        </button>
        <a
          href={project.isClient ? `/mes-devis/${project.id}` : `/backoffice/devis/${project.id}`}
          className="flex items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm font-semibold text-blue-900 hover:bg-blue-100"
        >
          Voir le devis
        </a>
      </div>
    </article>
  );
}

function ProjectsPage() {
  const { user, token } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [employeeId, setEmployeeId] = useState('ALL');

  const isBackoffice = user?.role === 'ADMIN' || user?.role === 'EMPLOYE';

  const loadProjects = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (status !== 'ALL') params.set('status', status);
      if (user?.role === 'ADMIN' && employeeId !== 'ALL') params.set('employeeId', employeeId);
      const query = params.toString();
      const res = await authRequest(`/projects${query ? `?${query}` : ''}`, token);
      setProjects(res.projects || []);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, status, employeeId]);

  const employeeOptions = useMemo(() => {
    const values = projects
      .map((project) => ({ id: project.assignedEmployeeId, name: project.assignedEmployeeName }))
      .filter((item) => item.id && item.name);
    const map = new Map();
    values.forEach((item) => map.set(item.id, item));
    return Array.from(map.values());
  }, [projects]);

  const content = (
    <main className="mx-auto w-full max-w-[110rem] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <header>
        <h1 className="text-2xl font-bold text-on-surface">Projects</h1>
        <p className="text-sm text-on-surface-variant">
          {user?.role === 'ADMIN'
            ? 'Vue globale des projets et de leurs taches.'
            : user?.role === 'EMPLOYE'
              ? 'Projets qui vous sont assignes.'
              : 'Suivi de vos projets.'}
        </p>
      </header>

      <section className="rounded-2xl border border-outline-variant/20 bg-white p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto]">
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher un projet..."
            className="rounded-xl border border-outline-variant/30 px-3 py-2 text-sm"
          />
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="rounded-xl border border-outline-variant/30 px-3 py-2 text-sm"
          >
            <option value="ALL">Tous les statuts</option>
            {Object.keys(STATUS_LABEL).map((key) => (
              <option key={key} value={key}>{STATUS_LABEL[key]}</option>
            ))}
          </select>
          {user?.role === 'ADMIN' ? (
            <select
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
              className="rounded-xl border border-outline-variant/30 px-3 py-2 text-sm"
            >
              <option value="ALL">Tous les employes</option>
              {employeeOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.name}</option>
              ))}
            </select>
          ) : <div />}
          <button
            type="button"
            onClick={loadProjects}
            className="rounded-xl bg-blue-900 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
          >
            Rechercher
          </button>
        </div>
      </section>

      {loading ? (
        <div className="rounded-2xl border border-outline-variant/20 bg-white p-6 text-sm text-on-surface-variant">Chargement des projets...</div>
      ) : projects.length === 0 ? (
        <div className="rounded-2xl border border-outline-variant/20 bg-white p-6 text-sm text-on-surface-variant">Aucun projet trouve.</div>
      ) : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={{ ...project, isClient: user?.role === 'CLIENT' }}
              isClient={user?.role === 'CLIENT'}
              onOpen={() => navigate(user?.role === 'CLIENT' ? `/mes-projets/${project.id}` : `/backoffice/projects/${project.id}`)}
            />
          ))}
        </section>
      )}
    </main>
  );

  if (isBackoffice) return content;
  return (
    <div className="min-h-screen bg-surface-container-lowest">
      <MainNav />
      <div className="pt-20">{content}</div>
    </div>
  );
}

export default ProjectsPage;
