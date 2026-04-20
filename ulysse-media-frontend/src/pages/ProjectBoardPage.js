import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import MainNav from '../components/MainNav';
import { authRequest } from '../api';
import { useAuth } from '../auth-context';
import { useToast } from '../toast-context';
import ConfirmDialog from '../components/ConfirmDialog';

const COLUMNS = [
  { key: 'TO_DO', label: 'TO_DO' },
  { key: 'DOING', label: 'DOING' },
  { key: 'READY', label: 'READY' }
];

const EMPTY_FORM = {
  title: '',
  description: '',
  status: 'TO_DO',
  assignedEmployeeId: '',
  meetingId: '',
  milestoneId: '',
  deadline: ''
};

const EMPTY_DELIVERABLE_FORM = {
  title: '',
  description: '',
  visibleToClient: true,
  file: null
};

const PROJECT_STATUS_LABEL = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  REVIEW: 'In review',
  DELIVERY_READY: 'Delivery ready'
};

function formatCurrency(cents) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format((Number(cents || 0)) / 100);
}

function toLocalInputValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function TaskCard({ task, canManage, onEdit, onDelete }) {
  return (
    <article
      draggable={canManage}
      onDragStart={(event) => {
        if (!canManage) return;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/task-id', task.id);
      }}
      className="rounded-xl border border-outline-variant/20 bg-white p-3 shadow-sm"
    >
      <h4 className="text-sm font-semibold text-on-surface">{task.title}</h4>
      <p className="mt-1 line-clamp-3 text-xs text-on-surface-variant">{task.description || 'Sans description'}</p>
      <div className="mt-3 space-y-1 text-[11px] text-on-surface-variant">
        <p><span className="font-semibold">Assigne:</span> {task.assignedEmployeeName || '-'}</p>
        <p><span className="font-semibold">Meeting:</span> {task.meetingId || '-'}</p>
        <p><span className="font-semibold">Deadline:</span> {task.deadline ? new Date(task.deadline).toLocaleString('fr-FR') : '-'}</p>
      </div>
      {canManage && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-900 hover:bg-blue-100"
          >
            Modifier
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
          >
            Supprimer
          </button>
        </div>
      )}
    </article>
  );
}

function ProjectBoardPage() {
  const { projectId } = useParams();
  const { user, token } = useAuth();
  const toast = useToast();

  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [deliverables, setDeliverables] = useState([]);
  const [paymentProgress, setPaymentProgress] = useState({ paidPercent: 0, paidCents: 0, totalCents: 0 });
  const [permissions, setPermissions] = useState({});
  const [assignees, setAssignees] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [workflowSaving, setWorkflowSaving] = useState(false);
  const [draggingTaskId, setDraggingTaskId] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const [deliverableForm, setDeliverableForm] = useState(EMPTY_DELIVERABLE_FORM);
  const [confirmState, setConfirmState] = useState({ open: false, title: '', message: '', onConfirm: null, danger: true });

  const isBackoffice = user?.role === 'ADMIN' || user?.role === 'EMPLOYE';
  const canManage = isBackoffice;
  const isClient = user?.role === 'CLIENT';
  const showPrices = user?.role === 'ADMIN' || user?.role === 'CLIENT';

  const loadBoard = async () => {
    if (!token || !projectId) return;
    setLoading(true);
    try {
      const [boardRes, folderRes] = await Promise.all([
        authRequest(`/projects/${projectId}/tasks`, token),
        authRequest(`/projects/${projectId}`, token)
      ]);

      setProject(folderRes.project || boardRes.project || null);
      setTasks(boardRes.tasks || []);
      setMeetings((folderRes.meetings || boardRes.meetings || []).filter((meeting) => meeting.status !== 'CANCELED'));
      setAssignees(boardRes.assignees || []);
      setMilestones(folderRes.milestones || []);
      setDeliverables(folderRes.deliverables || []);
      setPaymentProgress(folderRes.paymentProgress || { paidPercent: 0, paidCents: 0, totalCents: 0 });
      setPermissions(folderRes.permissions || {});
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBoard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, token]);

  const groupedTasks = useMemo(() => {
    const grouped = { TO_DO: [], DOING: [], READY: [] };
    tasks.forEach((task) => {
      if (grouped[task.status]) grouped[task.status].push(task);
    });
    return grouped;
  }, [tasks]);

  const openCreateModal = () => {
    setEditingTaskId(null);
    setForm({
      ...EMPTY_FORM,
      assignedEmployeeId: assignees[0]?.id || '',
      milestoneId: milestones[0]?.id || ''
    });
    setModalOpen(true);
  };

  const openEditModal = (task) => {
    setEditingTaskId(task.id);
    setForm({
      title: task.title || '',
      description: task.description || '',
      status: task.status || 'TO_DO',
      assignedEmployeeId: task.assignedEmployeeId || assignees[0]?.id || '',
      meetingId: task.meetingId || '',
      milestoneId: task.milestoneId || '',
      deadline: toLocalInputValue(task.deadline)
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditingTaskId(null);
    setForm(EMPTY_FORM);
  };

  const saveTask = async () => {
    if (!form.title.trim() || !form.assignedEmployeeId) {
      toast.warning('Titre et employe assigne sont requis.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        projectId,
        title: form.title.trim(),
        description: form.description.trim(),
        status: form.status,
        assignedEmployeeId: form.assignedEmployeeId,
        meetingId: form.meetingId || null,
        milestoneId: form.milestoneId || null,
        deadline: form.deadline ? new Date(form.deadline).toISOString() : null
      };

      if (editingTaskId) {
        const res = await authRequest(`/tasks/${editingTaskId}`, token, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        setTasks((prev) => prev.map((task) => (task.id === editingTaskId ? res.task : task)));
        toast.success('Tache mise a jour.');
      } else {
        const res = await authRequest('/tasks', token, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        setTasks((prev) => [res.task, ...prev]);
        toast.success('Tache creee.');
      }

      closeModal();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const moveTask = async (taskId, nextStatus) => {
    const previousTasks = tasks;
    const movedTask = tasks.find((item) => item.id === taskId);
    if (!movedTask || movedTask.status === nextStatus) return;

    setTasks((prev) => prev.map((task) => (task.id === taskId ? { ...task, status: nextStatus } : task)));

    try {
      const res = await authRequest(`/tasks/${taskId}/status`, token, {
        method: 'PUT',
        body: JSON.stringify({ status: nextStatus })
      });
      setTasks((prev) => prev.map((task) => (task.id === taskId ? res.task : task)));
    } catch (error) {
      setTasks(previousTasks);
      toast.error(error.message);
    }
  };

  const closeConfirm = () => {
    setConfirmState({ open: false, title: '', message: '', onConfirm: null, danger: true });
  };

  const askConfirm = ({ title, message, onConfirm, danger = true }) => {
    setConfirmState({ open: true, title, message, onConfirm, danger });
  };

  const deleteTask = (task) => {
    askConfirm({
      title: 'Supprimer la tache',
      message: `Supprimer la tache "${task.title}" ?`,
      onConfirm: async () => {
        closeConfirm();

        setSaving(true);
        try {
          await authRequest(`/tasks/${task.id}`, token, { method: 'DELETE' });
          setTasks((prev) => prev.filter((item) => item.id !== task.id));
          toast.success('Tache supprimee.');
        } catch (error) {
          toast.error(error.message);
        } finally {
          setSaving(false);
        }
      }
    });
  };

  const payKickoff20 = async () => {
    setWorkflowSaving(true);
    try {
      const res = await authRequest(`/projects/${projectId}/pay-kickoff`, token, { method: 'POST' });
      if (res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
        return;
      }
      toast.error('URL de paiement kickoff indisponible.');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setWorkflowSaving(false);
    }
  };

  const uploadDeliverable = async () => {
    if (!deliverableForm.title.trim() || !deliverableForm.file) {
      toast.warning('Titre et fichier sont requis.');
      return;
    }

    setWorkflowSaving(true);
    try {
      const formData = new FormData();
      formData.append('title', deliverableForm.title.trim());
      formData.append('description', deliverableForm.description.trim());
      formData.append('visibleToClient', deliverableForm.visibleToClient ? 'true' : 'false');
      formData.append('file', deliverableForm.file);

      await authRequest(`/projects/${projectId}/deliverables`, token, {
        method: 'POST',
        body: formData
      });

      toast.success('Livrable charge.');
      setDeliverableForm(EMPTY_DELIVERABLE_FORM);
      await loadBoard();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setWorkflowSaving(false);
    }
  };

  const openDeliverable = async (deliverableId) => {
    try {
      const res = await authRequest(`/projects/${projectId}/deliverables/${deliverableId}/download`, token);
      if (res.url) {
        window.open(res.url, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      toast.error(error.message);
    }
  };

  const content = (
    <main className="mx-auto w-full max-w-[120rem] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to={user?.role === 'CLIENT' ? '/mes-projets' : '/backoffice/projects'} className="text-sm font-semibold text-blue-900">← Retour aux projects</Link>
          <h1 className="mt-2 text-2xl font-bold text-on-surface">{project?.name || 'Project board'}</h1>
          <p className="text-sm text-on-surface-variant">Espace principal du projet, avec acces aux interfaces Meetings et Milestones.</p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={openCreateModal}
            className="rounded-xl bg-blue-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
          >
            Nouvelle tache
          </button>
        )}
      </header>

      {loading ? (
        <div className="rounded-2xl border border-outline-variant/20 bg-white p-6 text-sm text-on-surface-variant">Chargement du board...</div>
      ) : !project ? (
        <div className="rounded-2xl border border-outline-variant/20 bg-white p-6 text-sm text-on-surface-variant">Projet introuvable.</div>
      ) : (
        <>
          <section className="rounded-2xl border border-outline-variant/20 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Project status</p>
                  <p className="text-lg font-bold text-on-surface">{PROJECT_STATUS_LABEL[project.projectStatus] || project.projectStatus || 'In progress'}</p>
                </div>
                <Link
                  to={isClient ? `/mes-devis/${project.id}` : `/backoffice/devis/${project.id}`}
                  className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-900 hover:bg-blue-100"
                >
                  Voir le devis associe
                </Link>
              </div>
              <div className="text-right">
                <p className="text-xs text-on-surface-variant">Paiement global</p>
                <p className="text-lg font-bold text-blue-900">{paymentProgress.paidPercent || 0}%</p>
                {showPrices && (
                  <p className="text-xs text-on-surface-variant">{formatCurrency(paymentProgress.paidCents)} / {formatCurrency(paymentProgress.totalCents)}</p>
                )}
                {permissions.canPayKickoff20 && (
                  <button
                    type="button"
                    onClick={payKickoff20}
                    disabled={workflowSaving}
                    className="mt-2 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
                  >
                    Payer kickoff 20%
                  </button>
                )}
              </div>
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-blue-800 transition-all" style={{ width: `${Math.min(100, Math.max(0, paymentProgress.paidPercent || 0))}%` }} />
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <Link
              to={isClient ? `/mes-projets/${projectId}/milestones` : `/backoffice/projects/${projectId}/milestones`}
              className="group flex items-center justify-between rounded-2xl border border-outline-variant/20 bg-white p-5 transition hover:border-blue-300 hover:bg-blue-50"
            >
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Milestones</p>
                <p className="mt-1 text-2xl font-bold text-on-surface">{milestones.length}</p>
                <p className="mt-1 text-sm text-on-surface-variant">Gerer les milestones, les tickets et valider les paiements.</p>
              </div>
              <span className="text-2xl text-slate-300 transition group-hover:text-blue-500">&#8594;</span>
            </Link>
            <Link
              to={isClient ? `/mes-projets/${projectId}/meetings` : `/backoffice/projects/${projectId}/meetings`}
              className="group flex items-center justify-between rounded-2xl border border-outline-variant/20 bg-white p-5 transition hover:border-blue-300 hover:bg-blue-50"
            >
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Meetings</p>
                <p className="mt-1 text-2xl font-bold text-on-surface">{meetings.length}</p>
                <p className="mt-1 text-sm text-on-surface-variant">Reunions, comptes-rendus et planification du prochain meeting.</p>
              </div>
              <span className="text-2xl text-slate-300 transition group-hover:text-blue-500">&#8594;</span>
            </Link>
          </section>

          {isClient && (
            <section className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4">
              <h2 className="text-base font-bold text-blue-900">Procedure paiement client</h2>
              <div className="mt-3 grid gap-2 text-sm text-slate-700">
                <p>1. Acompte 10% deja paye pour lancer le projet.</p>
                <p>
                  2. Kickoff 20% :
                  {' '}
                  {permissions.canPayKickoff20 ? (
                    <span className="font-semibold text-emerald-700">disponible maintenant (bouton en haut).</span>
                  ) : (
                    <span className="font-semibold text-amber-700">disponible apres le 1er meeting complete.</span>
                  )}
                </p>
                <p>3. Paiement des milestones: ouvrez Milestones et payez seulement celles "Pret pour paiement".</p>
                <p>4. Livrables: telechargement complet une fois le paiement final valide.</p>
              </div>
              <div className="mt-3 rounded-xl bg-white p-3 text-xs text-slate-600">
                Progression actuelle: <span className="font-semibold text-slate-800">{paymentProgress.paidPercent || 0}%</span>
                {' '}
                ({formatCurrency(paymentProgress.paidCents)} / {formatCurrency(paymentProgress.totalCents)})
              </div>
            </section>
          )}

          {!isClient && (
            <section className="rounded-2xl border border-outline-variant/20 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-bold text-on-surface">Kanban</h2>
                <span className="text-xs text-on-surface-variant">{tasks.length} taches</span>
              </div>
              <div className="mt-3 grid gap-4 lg:grid-cols-3">
                {COLUMNS.map((column) => (
                  <div
                    key={column.key}
                    onDragOver={(event) => {
                      if (!canManage) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                    }}
                    onDrop={(event) => {
                      if (!canManage) return;
                      event.preventDefault();
                      const taskId = event.dataTransfer.getData('text/task-id') || draggingTaskId;
                      if (taskId) moveTask(taskId, column.key);
                      setDraggingTaskId(null);
                    }}
                    className="rounded-2xl border border-outline-variant/20 bg-surface-container-low p-3"
                  >
                    <div className="mb-3 flex items-center justify-between px-1">
                      <h3 className="text-sm font-bold text-slate-800">{column.label}</h3>
                      <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">
                        {groupedTasks[column.key]?.length || 0}
                      </span>
                    </div>

                    <div className="space-y-3">
                      {(groupedTasks[column.key] || []).map((task) => (
                        <div
                          key={task.id}
                          onDragStart={() => setDraggingTaskId(task.id)}
                          onDragEnd={() => setDraggingTaskId(null)}
                        >
                          <TaskCard
                            task={task}
                            canManage={canManage}
                            onEdit={() => openEditModal(task)}
                            onDelete={() => deleteTask(task)}
                          />
                        </div>
                      ))}

                      {groupedTasks[column.key]?.length === 0 && (
                        <div className="rounded-xl border border-dashed border-outline-variant/30 bg-white/70 p-4 text-center text-xs text-on-surface-variant">
                          Aucune tache
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-outline-variant/20 bg-white p-4">
            <h2 className="text-base font-bold text-on-surface">Livrables</h2>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {deliverables.map((deliverable) => (
                <div key={deliverable.id} className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-on-surface">{deliverable.title}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${deliverable.downloadable ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {deliverable.downloadable ? 'Open' : 'Locked'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-on-surface-variant">{deliverable.fileName || 'Fichier'}</p>
                  <button
                    type="button"
                    onClick={() => openDeliverable(deliverable.id)}
                    className="mt-2 w-full rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-900 hover:bg-blue-100"
                  >
                    Ouvrir
                  </button>
                </div>
              ))}
              {deliverables.length === 0 && <p className="text-xs text-on-surface-variant md:col-span-2 xl:col-span-3">Aucun livrable.</p>}
            </div>

            {permissions.canManageWorkflow && (
              <div className="mt-3 grid gap-2 border-t border-outline-variant/20 pt-3">
                <input
                  type="text"
                  value={deliverableForm.title}
                  onChange={(event) => setDeliverableForm((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="Titre du livrable"
                  className="rounded-lg border border-outline-variant/30 px-3 py-2 text-xs"
                />
                <textarea
                  rows={2}
                  value={deliverableForm.description}
                  onChange={(event) => setDeliverableForm((prev) => ({ ...prev, description: event.target.value }))}
                  placeholder="Description"
                  className="rounded-lg border border-outline-variant/30 px-3 py-2 text-xs"
                />
                <label className="inline-flex items-center gap-2 text-xs text-on-surface-variant">
                  <input
                    type="checkbox"
                    checked={deliverableForm.visibleToClient}
                    onChange={(event) => setDeliverableForm((prev) => ({ ...prev, visibleToClient: event.target.checked }))}
                  />
                  Visible client
                </label>
                <input
                  type="file"
                  onChange={(event) => setDeliverableForm((prev) => ({ ...prev, file: event.target.files?.[0] || null }))}
                  className="text-xs"
                />
                <button
                  type="button"
                  disabled={workflowSaving}
                  onClick={uploadDeliverable}
                  className="rounded-lg bg-blue-900 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-800"
                >
                  Uploader livrable
                </button>
              </div>
            )}
          </section>
        </>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-on-surface">{editingTaskId ? 'Modifier la tache' : 'Nouvelle tache'}</h3>

            <div className="grid gap-3">
              <input
                type="text"
                placeholder="Titre"
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                className="rounded-xl border border-outline-variant/30 px-3 py-2 text-sm"
              />

              <textarea
                rows={3}
                placeholder="Description"
                value={form.description}
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                className="rounded-xl border border-outline-variant/30 px-3 py-2 text-sm"
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <select
                  value={form.status}
                  onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
                  className="rounded-xl border border-outline-variant/30 px-3 py-2 text-sm"
                >
                  {COLUMNS.map((column) => (
                    <option key={column.key} value={column.key}>{column.label}</option>
                  ))}
                </select>

                <select
                  value={form.assignedEmployeeId}
                  onChange={(event) => setForm((prev) => ({ ...prev, assignedEmployeeId: event.target.value }))}
                  className="rounded-xl border border-outline-variant/30 px-3 py-2 text-sm"
                >
                  <option value="">Assigner a...</option>
                  {assignees.map((assignee) => (
                    <option key={assignee.id} value={assignee.id}>{assignee.username} ({assignee.email})</option>
                  ))}
                </select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <select
                  value={form.meetingId}
                  onChange={(event) => setForm((prev) => ({ ...prev, meetingId: event.target.value }))}
                  className="rounded-xl border border-outline-variant/30 px-3 py-2 text-sm"
                >
                  <option value="">Meeting reference (optionnel)</option>
                  {meetings.map((meeting) => (
                    <option key={meeting.id} value={meeting.id}>
                      {meeting.title} - {new Date(meeting.start).toLocaleDateString('fr-FR')}
                    </option>
                  ))}
                </select>

                <select
                  value={form.milestoneId}
                  onChange={(event) => setForm((prev) => ({ ...prev, milestoneId: event.target.value }))}
                  className="rounded-xl border border-outline-variant/30 px-3 py-2 text-sm"
                >
                  <option value="">Milestone associe (optionnel)</option>
                  {milestones.map((milestone) => (
                    <option key={milestone.id} value={milestone.id}>
                      {milestone.title} [{milestone.status}]
                    </option>
                  ))}
                </select>

                <input
                  type="datetime-local"
                  value={form.deadline}
                  onChange={(event) => setForm((prev) => ({ ...prev, deadline: event.target.value }))}
                  className="rounded-xl border border-outline-variant/30 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-900"
              >
                Fermer
              </button>
              <button
                type="button"
                onClick={saveTask}
                disabled={saving}
                className="rounded-xl bg-blue-900 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
              >
                {saving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        onCancel={closeConfirm}
        onConfirm={() => confirmState.onConfirm && confirmState.onConfirm()}
        confirmText="Supprimer"
        cancelText="Annuler"
        loading={saving || workflowSaving}
        danger={confirmState.danger}
      />
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

export default ProjectBoardPage;
