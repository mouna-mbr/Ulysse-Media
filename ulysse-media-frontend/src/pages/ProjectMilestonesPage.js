import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import MainNav from '../components/MainNav';
import { authRequest } from '../api';
import { useAuth } from '../auth-context';
import { useToast } from '../toast-context';
import ConfirmDialog from '../components/ConfirmDialog';

const COLUMNS = [
  { key: 'TO_DO', label: 'A faire' },
  { key: 'DOING', label: 'En cours' },
  { key: 'READY', label: 'Termine' }
];

const EMPTY_TASK_FORM = {
  title: '',
  description: '',
  status: 'TO_DO',
  assignedEmployeeId: '',
  milestoneId: '',
  deadline: ''
};

const EMPTY_MILESTONE_FORM = {
  title: '',
  description: '',
  dueDate: ''
};

const MILESTONE_STATUS_LABEL = {
  CREATED: 'A preparer',
  READY_FOR_PAYMENT: 'Pret pour paiement',
  PENDING: 'Paiement en cours',
  PAID: 'Paye',
  FAILED: 'Paiement echoue'
};

const MILESTONE_STATUS_COLOR = {
  CREATED: 'bg-slate-100 text-slate-600',
  READY_FOR_PAYMENT: 'bg-blue-100 text-blue-800',
  PENDING: 'bg-amber-100 text-amber-800',
  PAID: 'bg-emerald-100 text-emerald-700',
  FAILED: 'bg-rose-100 text-rose-700'
};

const TASK_STATUS_COLOR = {
  TO_DO: 'bg-slate-100 text-slate-700',
  DOING: 'bg-blue-100 text-blue-800',
  READY: 'bg-emerald-100 text-emerald-700'
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

function ProjectMilestonesPage() {
  const { projectId } = useParams();
  const { user, token } = useAuth();
  const toast = useToast();

  const isBackoffice = user?.role === 'ADMIN' || user?.role === 'EMPLOYE';
  const canManage = user?.role === 'ADMIN' || user?.role === 'EMPLOYE';
  const isClient = user?.role === 'CLIENT';
  const showPrices = user?.role === 'ADMIN' || user?.role === 'CLIENT';
  const backUrl = isClient ? `/mes-projets/${projectId}` : `/backoffice/projects/${projectId}`;

  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [permissions, setPermissions] = useState({});
  const [assignees, setAssignees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [workflowSaving, setWorkflowSaving] = useState(false);

  const [selectedMilestoneId, setSelectedMilestoneId] = useState('');
  const [milestoneForm, setMilestoneForm] = useState(EMPTY_MILESTONE_FORM);
  const [editingMilestoneId, setEditingMilestoneId] = useState(null);
  const [milestoneValidationMeetings, setMilestoneValidationMeetings] = useState({});
  const [showMilestoneForm, setShowMilestoneForm] = useState(false);

  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [taskForm, setTaskForm] = useState(EMPTY_TASK_FORM);
  const [confirmState, setConfirmState] = useState({ open: false, title: '', message: '', onConfirm: null, danger: true });

  const loadData = async () => {
    if (!token || !projectId) return;
    setLoading(true);
    try {
      const [boardRes, folderRes] = await Promise.all([
        authRequest(`/projects/${projectId}/tasks`, token),
        authRequest(`/projects/${projectId}`, token)
      ]);
      setProject(folderRes.project || boardRes.project || null);
      setTasks(boardRes.tasks || []);
      setMeetings((folderRes.meetings || []).filter((m) => m.status !== 'CANCELED'));
      setAssignees(boardRes.assignees || []);
      setMilestones(folderRes.milestones || []);
      setPermissions(folderRes.permissions || {});
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, token]);

  const selectedMilestone = useMemo(
    () => milestones.find((m) => m.id === selectedMilestoneId) || milestones[0] || null,
    [milestones, selectedMilestoneId]
  );

  const selectedMilestoneTasks = useMemo(
    () => tasks.filter((t) => t.milestoneId && t.milestoneId === selectedMilestone?.id),
    [tasks, selectedMilestone]
  );

  useEffect(() => {
    if (!milestones.length) { setSelectedMilestoneId(''); return; }
    setSelectedMilestoneId((current) => (milestones.some((m) => m.id === current) ? current : milestones[0].id));
  }, [milestones]);

  const createMilestone = async () => {
    if (!milestoneForm.title.trim()) { toast.warning('Titre milestone requis.'); return; }
    setWorkflowSaving(true);
    try {
      const payload = {
        title: milestoneForm.title.trim(),
        description: milestoneForm.description.trim(),
        dueDate: milestoneForm.dueDate ? new Date(milestoneForm.dueDate).toISOString() : undefined
      };
      await authRequest(
        editingMilestoneId ? `/projects/${projectId}/milestones/${editingMilestoneId}` : `/projects/${projectId}/milestones`,
        token,
        { method: editingMilestoneId ? 'PUT' : 'POST', body: JSON.stringify(payload) }
      );
      toast.success(editingMilestoneId ? 'Milestone modifiee.' : 'Milestone creee.');
      setMilestoneForm(EMPTY_MILESTONE_FORM);
      setEditingMilestoneId(null);
      setShowMilestoneForm(false);
      await loadData();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setWorkflowSaving(false);
    }
  };

  const startEditMilestone = (milestone) => {
    setEditingMilestoneId(milestone.id);
    setMilestoneForm({
      title: milestone.title || '',
      description: milestone.description || '',
      dueDate: toLocalInputValue(milestone.dueDate)
    });
    setShowMilestoneForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelMilestoneForm = () => {
    if (workflowSaving) return;
    setEditingMilestoneId(null);
    setMilestoneForm(EMPTY_MILESTONE_FORM);
    setShowMilestoneForm(false);
  };

  const closeConfirm = () => {
    setConfirmState({ open: false, title: '', message: '', onConfirm: null, danger: true });
  };

  const askConfirm = ({ title, message, onConfirm, danger = true }) => {
    setConfirmState({ open: true, title, message, onConfirm, danger });
  };

  const deleteMilestone = async (milestone) => {
    askConfirm({
      title: 'Supprimer la milestone',
      message: `Supprimer la milestone "${milestone.title}" ?\nLes tickets resteront dans le projet sans milestone.`,
      onConfirm: async () => {
        closeConfirm();
        setWorkflowSaving(true);
        try {
          await authRequest(`/projects/${projectId}/milestones/${milestone.id}`, token, { method: 'DELETE' });
          toast.success('Milestone supprimee.');
          if (editingMilestoneId === milestone.id) cancelMilestoneForm();
          await loadData();
        } catch (error) {
          toast.error(error.message);
        } finally {
          setWorkflowSaving(false);
        }
      }
    });
  };

  const markMilestoneReadyForPayment = async (milestoneId) => {
    const validationMeetingId = milestoneValidationMeetings[milestoneId];
    if (!validationMeetingId) { toast.warning('Selectionnez un meeting de validation complete.'); return; }
    setWorkflowSaving(true);
    try {
      await authRequest(`/projects/${projectId}/milestones/${milestoneId}/ready`, token, {
        method: 'PUT',
        body: JSON.stringify({ validationMeetingId })
      });
      toast.success('Milestone valide pour paiement client.');
      await loadData();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setWorkflowSaving(false);
    }
  };

  const payMilestone = async (milestoneId) => {
    setWorkflowSaving(true);
    try {
      const res = await authRequest(`/projects/${projectId}/milestones/${milestoneId}/pay`, token, { method: 'POST' });
      if (res.checkoutUrl) { window.location.href = res.checkoutUrl; return; }
      toast.error('URL de paiement indisponible.');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setWorkflowSaving(false);
    }
  };

  const openTaskModal = (milestoneId = '', task = null) => {
    if (task) {
      setEditingTaskId(task.id);
      setTaskForm({
        title: task.title || '',
        description: task.description || '',
        status: task.status || 'TO_DO',
        assignedEmployeeId: task.assignedEmployeeId || assignees[0]?.id || '',
        milestoneId: task.milestoneId || milestoneId,
        deadline: toLocalInputValue(task.deadline)
      });
    } else {
      setEditingTaskId(null);
      setTaskForm({ ...EMPTY_TASK_FORM, milestoneId: milestoneId || selectedMilestone?.id || '', assignedEmployeeId: assignees[0]?.id || '' });
    }
    setTaskModalOpen(true);
  };

  const closeTaskModal = () => {
    if (saving) return;
    setTaskModalOpen(false);
    setEditingTaskId(null);
    setTaskForm(EMPTY_TASK_FORM);
  };

  const saveTask = async () => {
    if (!taskForm.title.trim() || !taskForm.assignedEmployeeId) {
      toast.warning('Titre et employe assigne sont requis.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        projectId,
        title: taskForm.title.trim(),
        description: taskForm.description.trim(),
        status: taskForm.status,
        assignedEmployeeId: taskForm.assignedEmployeeId,
        milestoneId: taskForm.milestoneId || null,
        deadline: taskForm.deadline ? new Date(taskForm.deadline).toISOString() : null
      };
      if (editingTaskId) {
        const res = await authRequest(`/tasks/${editingTaskId}`, token, { method: 'PUT', body: JSON.stringify(payload) });
        setTasks((prev) => prev.map((t) => (t.id === editingTaskId ? res.task : t)));
        toast.success('Ticket mis a jour.');
      } else {
        const res = await authRequest('/tasks', token, { method: 'POST', body: JSON.stringify(payload) });
        setTasks((prev) => [res.task, ...prev]);
        toast.success('Ticket cree.');
      }
      closeTaskModal();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteTask = async (task) => {
    askConfirm({
      title: 'Supprimer le ticket',
      message: `Supprimer le ticket "${task.title}" ?`,
      onConfirm: async () => {
        closeConfirm();
        setSaving(true);
        try {
          await authRequest(`/tasks/${task.id}`, token, { method: 'DELETE' });
          setTasks((prev) => prev.filter((t) => t.id !== task.id));
          toast.success('Ticket supprime.');
        } catch (error) {
          toast.error(error.message);
        } finally {
          setSaving(false);
        }
      }
    });
  };

  const content = (
    <main className="mx-auto w-full max-w-[120rem] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to={backUrl} className="inline-flex items-center gap-1 text-sm font-semibold text-blue-900 hover:underline">
            ← Retour au projet
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-on-surface">
            Milestones — <span className="text-blue-900">{project?.name || project?.id || '...'}</span>
          </h1>
          <p className="text-sm text-on-surface-variant">Gestion des milestones, tickets et validation de paiement.</p>
        </div>
        {permissions.canManageWorkflow && (
          <button
            type="button"
            onClick={() => { cancelMilestoneForm(); setShowMilestoneForm(true); }}
            className="rounded-xl bg-blue-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
          >
            + Nouvelle milestone
          </button>
        )}
      </header>

      {loading ? (
        <div className="rounded-2xl border border-outline-variant/20 bg-white p-6 text-sm text-on-surface-variant">
          Chargement des milestones...
        </div>
      ) : (
        <>
          {isClient && (
            <section className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4">
              <h2 className="text-base font-bold text-blue-900">Comment payer vos milestones</h2>
              <div className="mt-2 space-y-1 text-sm text-slate-700">
                <p>1. Une milestone doit etre d'abord "Pret pour paiement" par l'equipe.</p>
                <p>2. Si un bouton "Payer ce milestone" apparait, vous pouvez payer immediatement.</p>
                <p>3. Si le bouton n'apparait pas, attendez la validation du meeting correspondant.</p>
              </div>
            </section>
          )}

          {(showMilestoneForm || editingMilestoneId) && permissions.canManageWorkflow && (
            <section className="rounded-2xl border border-blue-200 bg-blue-50/60 p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-base font-bold text-on-surface">
                  {editingMilestoneId ? 'Modifier la milestone' : 'Nouvelle milestone'}
                </p>
                <button type="button" onClick={cancelMilestoneForm} className="text-xs font-semibold text-slate-500 hover:text-slate-800">
                  Annuler
                </button>
              </div>
              <p className="mt-0.5 text-xs text-on-surface-variant">
                Le montant est calcule automatiquement : 70% du devis divise par le nombre de milestones.
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                <div>
                  <label className="text-xs font-medium text-on-surface-variant">Titre *</label>
                  <input
                    type="text"
                    value={milestoneForm.title}
                    onChange={(event) => setMilestoneForm((prev) => ({ ...prev, title: event.target.value }))}
                    placeholder="Ex: Phase 1 - Design"
                    className="mt-1 w-full rounded-lg border border-outline-variant/30 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-on-surface-variant">Echeance (optionnel)</label>
                  <input
                    type="datetime-local"
                    value={milestoneForm.dueDate}
                    onChange={(event) => setMilestoneForm((prev) => ({ ...prev, dueDate: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-outline-variant/30 px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex items-end pb-0">
                  <button
                    type="button"
                    disabled={workflowSaving}
                    onClick={createMilestone}
                    className="min-w-[120px] rounded-lg bg-blue-900 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                  >
                    {workflowSaving ? '...' : editingMilestoneId ? 'Enregistrer' : 'Ajouter'}
                  </button>
                </div>
              </div>
              <div className="mt-2">
                <label className="text-xs font-medium text-on-surface-variant">Description (optionnel)</label>
                <textarea
                  rows={2}
                  value={milestoneForm.description}
                  onChange={(event) => setMilestoneForm((prev) => ({ ...prev, description: event.target.value }))}
                  placeholder="Objectif de cette milestone"
                  className="mt-1 w-full rounded-lg border border-outline-variant/30 px-3 py-2 text-sm"
                />
              </div>
            </section>
          )}

          <section className="grid gap-5 xl:grid-cols-[300px_1fr]">
            <div className="rounded-2xl border border-outline-variant/20 bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                  {milestones.length} milestone{milestones.length !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="mt-3 space-y-2">
                {milestones.map((milestone) => {
                  const count = tasks.filter((t) => t.milestoneId === milestone.id).length;
                  const isSelected = milestone.id === selectedMilestone?.id;
                  return (
                    <button
                      key={milestone.id}
                      type="button"
                      onClick={() => setSelectedMilestoneId(milestone.id)}
                      className={`w-full rounded-xl border p-3 text-left transition ${isSelected ? 'border-blue-300 bg-blue-50 shadow-sm' : 'border-outline-variant/20 bg-surface-container-lowest hover:bg-slate-50'}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-on-surface">{milestone.title}</p>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${MILESTONE_STATUS_COLOR[milestone.status] || 'bg-slate-100 text-slate-600'}`}>
                          {MILESTONE_STATUS_LABEL[milestone.status] || milestone.status}
                        </span>
                      </div>
                      {milestone.description && (
                        <p className="mt-1 line-clamp-2 text-[11px] text-on-surface-variant">{milestone.description}</p>
                      )}
                      <div className="mt-2 flex items-center gap-3 text-[11px] text-on-surface-variant">
                        <span>{count} ticket{count !== 1 ? 's' : ''}</span>
                        {showPrices && milestone.amountCents > 0 && (
                          <span className="font-medium text-slate-700">{formatCurrency(milestone.amountCents)}</span>
                        )}
                        {milestone.dueDate && <span>{new Date(milestone.dueDate).toLocaleDateString('fr-FR')}</span>}
                      </div>
                    </button>
                  );
                })}
                {milestones.length === 0 && (
                  <div className="rounded-xl border border-dashed border-outline-variant/30 p-5 text-center text-xs text-on-surface-variant">
                    {permissions.canManageWorkflow
                      ? 'Aucune milestone. Cliquez sur "+ Nouvelle milestone" pour commencer.'
                      : 'Aucune milestone definie pour ce projet.'}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              {selectedMilestone ? (
                <>
                  <div className="rounded-2xl border border-outline-variant/20 bg-white p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-xl font-bold text-on-surface">{selectedMilestone.title}</h2>
                        {selectedMilestone.description && (
                          <p className="mt-1 text-sm text-on-surface-variant">{selectedMilestone.description}</p>
                        )}
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${MILESTONE_STATUS_COLOR[selectedMilestone.status] || 'bg-slate-100 text-slate-600'}`}>
                        {MILESTONE_STATUS_LABEL[selectedMilestone.status] || selectedMilestone.status}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-xl bg-surface-container-lowest p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">Tickets</p>
                        <p className="mt-1 text-lg font-bold text-on-surface">{selectedMilestoneTasks.length}</p>
                      </div>
                      <div className="rounded-xl bg-surface-container-lowest p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">Echeance</p>
                        <p className="mt-1 text-sm font-semibold text-on-surface">
                          {selectedMilestone.dueDate ? new Date(selectedMilestone.dueDate).toLocaleDateString('fr-FR') : 'Non definie'}
                        </p>
                      </div>
                      <div className="rounded-xl bg-surface-container-lowest p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">Montant</p>
                        <p className="mt-1 text-sm font-semibold text-on-surface">
                          {showPrices ? formatCurrency(selectedMilestone.amountCents) : '— (visible admin/client)'}
                        </p>
                      </div>
                    </div>

                    {permissions.canManageWorkflow && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={workflowSaving}
                          onClick={() => startEditMilestone(selectedMilestone)}
                          className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-900 hover:bg-blue-100 disabled:opacity-50"
                        >
                          Modifier
                        </button>
                        {!['PAID', 'PENDING'].includes(selectedMilestone.status) && (
                          <button
                            type="button"
                            disabled={workflowSaving}
                            onClick={() => deleteMilestone(selectedMilestone)}
                            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                          >
                            Supprimer
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openTaskModal(selectedMilestone.id)}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          + Ajouter ticket
                        </button>
                      </div>
                    )}

                    {permissions.canManageWorkflow && !['PAID', 'PENDING'].includes(selectedMilestone.status) && (
                      <div className="mt-4 grid gap-2 rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-3 md:grid-cols-[1fr_auto]">
                        <div>
                          <p className="text-xs font-medium text-on-surface-variant">
                            Valider pour paiement — choisir un meeting COMPLETED comme preuve de livraison
                          </p>
                          <select
                            value={milestoneValidationMeetings[selectedMilestone.id] || ''}
                            onChange={(event) => setMilestoneValidationMeetings((prev) => ({ ...prev, [selectedMilestone.id]: event.target.value }))}
                            className="mt-1.5 w-full rounded-lg border border-outline-variant/30 px-3 py-2 text-xs"
                          >
                            <option value="">Choisir le meeting de validation...</option>
                            {meetings.filter((m) => m.status === 'COMPLETED').map((m) => (
                              <option key={m.id} value={m.id}>{m.title} — {new Date(m.start).toLocaleDateString('fr-FR')}</option>
                            ))}
                          </select>
                          {meetings.filter((m) => m.status === 'COMPLETED').length === 0 && (
                            <p className="mt-1 text-[11px] text-amber-600">
                              Aucun meeting complete pour ce projet. Allez dans Meetings pour marquer un meeting comme complete.
                            </p>
                          )}
                        </div>
                        <div className="flex items-end">
                          <button
                            type="button"
                            disabled={workflowSaving}
                            onClick={() => markMilestoneReadyForPayment(selectedMilestone.id)}
                            className="rounded-lg bg-blue-900 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                          >
                            Valider pour paiement
                          </button>
                        </div>
                      </div>
                    )}

                    {permissions.canPayMilestones && selectedMilestone.status === 'READY_FOR_PAYMENT' && (
                      <button
                        type="button"
                        disabled={workflowSaving}
                        onClick={() => payMilestone(selectedMilestone.id)}
                        className="mt-4 rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
                      >
                        Payer ce milestone — {showPrices ? formatCurrency(selectedMilestone.amountCents) : ''}
                      </button>
                    )}
                  </div>

                  <div className="rounded-2xl border border-outline-variant/20 bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-base font-bold text-on-surface">
                        Tickets — {selectedMilestone.title}
                      </h3>
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => openTaskModal(selectedMilestone.id)}
                          className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-900 hover:bg-blue-100"
                        >
                          + Nouveau ticket
                        </button>
                      )}
                    </div>

                    <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {selectedMilestoneTasks.map((task) => (
                        <article key={task.id} className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-3">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="text-sm font-semibold text-on-surface">{task.title}</h4>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${TASK_STATUS_COLOR[task.status] || 'bg-slate-100 text-slate-700'}`}>
                              {task.status}
                            </span>
                          </div>
                          {task.description && (
                            <p className="mt-1 line-clamp-2 text-xs text-on-surface-variant">{task.description}</p>
                          )}
                          <div className="mt-2 space-y-0.5 text-[11px] text-on-surface-variant">
                            <p><span className="font-medium">Assigne:</span> {task.assignedEmployeeName || '-'}</p>
                            {task.deadline && (
                              <p><span className="font-medium">Deadline:</span> {new Date(task.deadline).toLocaleDateString('fr-FR')}</p>
                            )}
                          </div>
                          {canManage && (
                            <div className="mt-3 grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => openTaskModal(selectedMilestone.id, task)}
                                className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1.5 text-xs font-semibold text-blue-900 hover:bg-blue-100"
                              >
                                Modifier
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteTask(task)}
                                className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                              >
                                Supprimer
                              </button>
                            </div>
                          )}
                        </article>
                      ))}
                      {selectedMilestoneTasks.length === 0 && (
                        <div className="rounded-xl border border-dashed border-outline-variant/30 p-5 text-center text-xs text-on-surface-variant md:col-span-2 xl:col-span-3">
                          {canManage ? 'Aucun ticket. Cliquez sur "+ Nouveau ticket" pour ajouter.' : 'Aucun ticket dans cette milestone.'}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-outline-variant/30 bg-white p-10 text-center text-sm text-on-surface-variant">
                  {milestones.length > 0
                    ? 'Selectionnez une milestone dans la liste a gauche.'
                    : 'Aucune milestone dans ce projet.'}
                </div>
              )}
            </div>
          </section>
        </>
      )}

      {taskModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-on-surface">{editingTaskId ? 'Modifier le ticket' : 'Nouveau ticket'}</h3>
            <div className="grid gap-3">
              <input
                type="text"
                placeholder="Titre *"
                value={taskForm.title}
                onChange={(event) => setTaskForm((prev) => ({ ...prev, title: event.target.value }))}
                className="rounded-xl border border-outline-variant/30 px-3 py-2 text-sm"
              />
              <textarea
                rows={3}
                placeholder="Description"
                value={taskForm.description}
                onChange={(event) => setTaskForm((prev) => ({ ...prev, description: event.target.value }))}
                className="rounded-xl border border-outline-variant/30 px-3 py-2 text-sm"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-on-surface-variant">Statut</label>
                  <select
                    value={taskForm.status}
                    onChange={(event) => setTaskForm((prev) => ({ ...prev, status: event.target.value }))}
                    className="mt-1 w-full rounded-xl border border-outline-variant/30 px-3 py-2 text-sm"
                  >
                    {COLUMNS.map((col) => <option key={col.key} value={col.key}>{col.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-on-surface-variant">Assigne a *</label>
                  <select
                    value={taskForm.assignedEmployeeId}
                    onChange={(event) => setTaskForm((prev) => ({ ...prev, assignedEmployeeId: event.target.value }))}
                    className="mt-1 w-full rounded-xl border border-outline-variant/30 px-3 py-2 text-sm"
                  >
                    <option value="">Choisir employe...</option>
                    {assignees.map((a) => <option key={a.id} value={a.id}>{a.username} ({a.email})</option>)}
                  </select>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-on-surface-variant">Milestone</label>
                  <select
                    value={taskForm.milestoneId}
                    onChange={(event) => setTaskForm((prev) => ({ ...prev, milestoneId: event.target.value }))}
                    className="mt-1 w-full rounded-xl border border-outline-variant/30 px-3 py-2 text-sm"
                  >
                    <option value="">Sans milestone</option>
                    {milestones.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-on-surface-variant">Deadline</label>
                  <input
                    type="datetime-local"
                    value={taskForm.deadline}
                    onChange={(event) => setTaskForm((prev) => ({ ...prev, deadline: event.target.value }))}
                    className="mt-1 w-full rounded-xl border border-outline-variant/30 px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={closeTaskModal} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Fermer</button>
              <button type="button" onClick={saveTask} disabled={saving} className="rounded-xl bg-blue-900 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
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

export default ProjectMilestonesPage;
