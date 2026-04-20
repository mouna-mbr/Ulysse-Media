import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import MainNav from '../components/MainNav';
import { authRequest } from '../api';
import { useAuth } from '../auth-context';
import { useToast } from '../toast-context';

const EMPTY_REPORT_FORM = {
  summary: '',
  decisions: '',
  blockers: '',
  actionItems: '',
  nextSteps: '',
  attachments: null
};

const EMPTY_NEXT_MEETING_FORM = {
  title: '',
  description: '',
  start: '',
  end: '',
  timezone: 'Europe/Paris'
};

const MEETING_STATUS_LABEL = {
  SCHEDULED: 'Planifie',
  COMPLETED: 'Complete',
  CANCELED: 'Annule'
};

const MEETING_STATUS_COLOR = {
  SCHEDULED: 'bg-blue-100 text-blue-800',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  CANCELED: 'bg-slate-100 text-slate-400'
};

function dateToInputValue(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function ProjectMeetingsPage() {
  const { projectId } = useParams();
  const { user, token } = useAuth();
  const toast = useToast();

  const isBackoffice = user?.role === 'ADMIN' || user?.role === 'EMPLOYE';
  const isClient = user?.role === 'CLIENT';
  const backUrl = isClient ? `/mes-projets/${projectId}` : `/backoffice/projects/${projectId}`;

  const [project, setProject] = useState(null);
  const [meetings, setMeetings] = useState([]);
  const [reports, setReports] = useState([]);
  const [permissions, setPermissions] = useState({});
  const [loading, setLoading] = useState(true);
  const [workflowSaving, setWorkflowSaving] = useState(false);

  const [reportMeetingId, setReportMeetingId] = useState('');
  const [reportForm, setReportForm] = useState(EMPTY_REPORT_FORM);
  const [nextMeetingSourceId, setNextMeetingSourceId] = useState('');
  const [nextMeetingForm, setNextMeetingForm] = useState(EMPTY_NEXT_MEETING_FORM);

  const [selectedReport, setSelectedReport] = useState(null);

  const loadData = async () => {
    if (!token || !projectId) return;
    setLoading(true);
    try {
      const folderRes = await authRequest(`/projects/${projectId}`, token);
      setProject(folderRes.project || null);
      setMeetings((folderRes.meetings || []).filter((m) => m.status !== 'CANCELED'));
      setReports(folderRes.reports || []);
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

  const completeMeeting = async (meetingId) => {
    setWorkflowSaving(true);
    try {
      await authRequest(`/meetings/${meetingId}/complete`, token, {
        method: 'PUT',
        body: JSON.stringify({ projectId })
      });
      toast.success('Meeting marque comme complete.');
      await loadData();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setWorkflowSaving(false);
    }
  };

  const submitReport = async () => {
    if (!reportMeetingId || !reportForm.summary.trim()) {
      toast.warning('Meeting et resume sont requis.');
      return;
    }
    setWorkflowSaving(true);
    try {
      const formData = new FormData();
      formData.append('summary', reportForm.summary.trim());
      formData.append('decisions', reportForm.decisions);
      formData.append('blockers', reportForm.blockers);
      formData.append('actionItems', reportForm.actionItems);
      formData.append('nextSteps', reportForm.nextSteps);
      formData.append('projectId', projectId);
      const files = reportForm.attachments ? Array.from(reportForm.attachments) : [];
      files.forEach((f) => formData.append('attachments', f));
      await authRequest(`/meetings/${reportMeetingId}/report`, token, { method: 'POST', body: formData });
      toast.success('Compte-rendu enregistre.');
      setReportForm(EMPTY_REPORT_FORM);
      await loadData();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setWorkflowSaving(false);
    }
  };

  const scheduleNextMeeting = async () => {
    if (!nextMeetingSourceId || !nextMeetingForm.title.trim() || !nextMeetingForm.start || !nextMeetingForm.end) {
      toast.warning('Meeting source, titre, start et end sont requis.');
      return;
    }
    setWorkflowSaving(true);
    try {
      await authRequest(`/meetings/${nextMeetingSourceId}/next`, token, {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          title: nextMeetingForm.title.trim(),
          description: nextMeetingForm.description.trim(),
          start: new Date(nextMeetingForm.start).toISOString(),
          end: new Date(nextMeetingForm.end).toISOString(),
          timezone: nextMeetingForm.timezone
        })
      });
      toast.success('Prochain meeting programme.');
      setNextMeetingForm(EMPTY_NEXT_MEETING_FORM);
      await loadData();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setWorkflowSaving(false);
    }
  };

  const scrollTo = (id) => {
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  };

  const content = (
    <main className="mx-auto w-full max-w-[100rem] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <header>
        <Link to={backUrl} className="inline-flex items-center gap-1 text-sm font-semibold text-blue-900 hover:underline">
          ← Retour au projet
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-on-surface">
          Meetings — <span className="text-blue-900">{project?.name || project?.id || '...'}</span>
        </h1>
        <p className="text-sm text-on-surface-variant">Suivi des reunions, comptes-rendus et planification.</p>
      </header>

      {loading ? (
        <div className="rounded-2xl border border-outline-variant/20 bg-white p-6 text-sm text-on-surface-variant">
          Chargement des meetings...
        </div>
      ) : (
        <>
          <section className="rounded-2xl border border-outline-variant/20 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-bold text-on-surface">Meetings</h2>
              <span className="text-xs text-on-surface-variant">{meetings.length} reunion{meetings.length !== 1 ? 's' : ''}</span>
            </div>

            <div className="mt-3 space-y-3">
              {meetings.map((meeting) => (
                <article key={meeting.id} className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-on-surface">{meeting.title}</p>
                      <p className="mt-0.5 text-xs text-on-surface-variant">
                        {new Date(meeting.start).toLocaleString('fr-FR')} — {new Date(meeting.end).toLocaleString('fr-FR')}
                      </p>
                      {meeting.meetLink && (
                        <a
                          href={meeting.meetLink}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-block text-xs font-semibold text-blue-700 hover:underline"
                        >
                          Rejoindre Google Meet →
                        </a>
                      )}
                    </div>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${MEETING_STATUS_COLOR[meeting.status] || 'bg-slate-100 text-slate-700'}`}>
                      {MEETING_STATUS_LABEL[meeting.status] || meeting.status}
                    </span>
                  </div>

                  {permissions.canManageWorkflow && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {meeting.status !== 'COMPLETED' && (
                        <button
                          type="button"
                          disabled={workflowSaving}
                          onClick={() => completeMeeting(meeting.id)}
                          className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
                        >
                          Marquer complete
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => { setReportMeetingId(meeting.id); scrollTo('report-form'); }}
                        className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-900 hover:bg-blue-100"
                      >
                        Rediger rapport
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNextMeetingSourceId(meeting.id);
                          const now = new Date();
                          const startDate = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
                          const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
                          setNextMeetingForm((prev) => ({
                            ...prev,
                            title: `Suivi - ${meeting.title}`,
                            start: dateToInputValue(startDate),
                            end: dateToInputValue(endDate)
                          }));
                          scrollTo('next-meeting-form');
                        }}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Programmer meeting suivant
                      </button>
                    </div>
                  )}
                </article>
              ))}

              {meetings.length === 0 && (
                <div className="rounded-xl border border-dashed border-outline-variant/30 p-5 text-center text-xs text-on-surface-variant">
                  Aucun meeting pour ce projet. Utilisez le calendrier pour creer un meeting en selectionnant ce projet.
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-outline-variant/20 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-bold text-on-surface">Rapports meeting</h2>
              <span className="text-xs text-on-surface-variant">{reports.length > 0 ? 'Cliquez pour voir le detail' : ''}</span>
            </div>

            {reports.length > 0 ? (
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {reports.map((report) => (
                  <button
                    key={report.id}
                    type="button"
                    onClick={() => setSelectedReport(report)}
                    className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-3 text-left transition hover:border-blue-200 hover:bg-blue-50 hover:shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-700">{report.createdByName || 'Equipe'}</p>
                      <p className="text-[11px] text-on-surface-variant">{new Date(report.createdAt).toLocaleDateString('fr-FR')}</p>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-on-surface">{report.summary}</p>
                    {report.attachments?.length > 0 && (
                      <p className="mt-1.5 text-[11px] text-on-surface-variant">
                        {report.attachments.length} piece{report.attachments.length > 1 ? 's' : ''} jointe{report.attachments.length > 1 ? 's' : ''}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-on-surface-variant">Aucun rapport disponible pour ce projet.</p>
            )}
          </section>

          {!isClient && (
            <div className="grid gap-4 lg:grid-cols-2">
              <section id="report-form" className="rounded-2xl border border-outline-variant/20 bg-white p-4">
                <h2 className="text-base font-bold text-on-surface">Nouveau rapport meeting</h2>
                {meetings.length === 0 && (
                  <p className="mt-2 text-xs text-amber-600">Aucun meeting disponible. Creez d'abord un meeting via le calendrier.</p>
                )}
                <div className="mt-3 grid gap-2">
                  <select
                    value={reportMeetingId}
                    onChange={(event) => setReportMeetingId(event.target.value)}
                    className="rounded-lg border border-outline-variant/30 px-3 py-2 text-xs"
                  >
                    <option value="">Selectionner un meeting...</option>
                    {meetings.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title} — {new Date(m.start).toLocaleDateString('fr-FR')} [{MEETING_STATUS_LABEL[m.status] || m.status}]
                      </option>
                    ))}
                  </select>
                  <textarea
                    rows={3}
                    value={reportForm.summary}
                    onChange={(event) => setReportForm((prev) => ({ ...prev, summary: event.target.value }))}
                    placeholder="Resume *"
                    className="rounded-lg border border-outline-variant/30 px-3 py-2 text-xs"
                  />
                  <textarea
                    rows={2}
                    value={reportForm.decisions}
                    onChange={(event) => setReportForm((prev) => ({ ...prev, decisions: event.target.value }))}
                    placeholder="Decisions prises (une decision par ligne)"
                    className="rounded-lg border border-outline-variant/30 px-3 py-2 text-xs"
                  />
                  <textarea
                    rows={2}
                    value={reportForm.blockers}
                    onChange={(event) => setReportForm((prev) => ({ ...prev, blockers: event.target.value }))}
                    placeholder="Blocages identifies"
                    className="rounded-lg border border-outline-variant/30 px-3 py-2 text-xs"
                  />
                  <textarea
                    rows={2}
                    value={reportForm.actionItems}
                    onChange={(event) => setReportForm((prev) => ({ ...prev, actionItems: event.target.value }))}
                    placeholder="Actions a realiser"
                    className="rounded-lg border border-outline-variant/30 px-3 py-2 text-xs"
                  />
                  <textarea
                    rows={2}
                    value={reportForm.nextSteps}
                    onChange={(event) => setReportForm((prev) => ({ ...prev, nextSteps: event.target.value }))}
                    placeholder="Prochaines etapes"
                    className="rounded-lg border border-outline-variant/30 px-3 py-2 text-xs"
                  />
                  <input
                    type="file"
                    multiple
                    onChange={(event) => setReportForm((prev) => ({ ...prev, attachments: event.target.files }))}
                    className="text-xs"
                  />
                  <button
                    type="button"
                    disabled={workflowSaving || !permissions.canManageWorkflow}
                    onClick={submitReport}
                    className="rounded-lg bg-blue-900 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                  >
                    Enregistrer rapport
                  </button>
                </div>
              </section>

              <section id="next-meeting-form" className="rounded-2xl border border-outline-variant/20 bg-white p-4">
                <h2 className="text-base font-bold text-on-surface">Programmer meeting suivant</h2>
                {meetings.length === 0 && (
                  <p className="mt-2 text-xs text-amber-600">Utilisez le calendrier pour creer un premier meeting lie a ce projet.</p>
                )}
                <div className="mt-3 grid gap-2">
                  <select
                    value={nextMeetingSourceId}
                    onChange={(event) => setNextMeetingSourceId(event.target.value)}
                    className="rounded-lg border border-outline-variant/30 px-3 py-2 text-xs"
                  >
                    <option value="">Meeting de reference...</option>
                    {meetings.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title} [{MEETING_STATUS_LABEL[m.status] || m.status}]
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={nextMeetingForm.title}
                    onChange={(event) => setNextMeetingForm((prev) => ({ ...prev, title: event.target.value }))}
                    placeholder="Titre du prochain meeting *"
                    className="rounded-lg border border-outline-variant/30 px-3 py-2 text-xs"
                  />
                  <textarea
                    rows={2}
                    value={nextMeetingForm.description}
                    onChange={(event) => setNextMeetingForm((prev) => ({ ...prev, description: event.target.value }))}
                    placeholder="Description (optionnel)"
                    className="rounded-lg border border-outline-variant/30 px-3 py-2 text-xs"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-medium text-on-surface-variant">Debut *</label>
                      <input
                        type="datetime-local"
                        value={nextMeetingForm.start}
                        onChange={(event) => setNextMeetingForm((prev) => ({ ...prev, start: event.target.value }))}
                        className="mt-0.5 w-full rounded-lg border border-outline-variant/30 px-3 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-on-surface-variant">Fin *</label>
                      <input
                        type="datetime-local"
                        value={nextMeetingForm.end}
                        onChange={(event) => setNextMeetingForm((prev) => ({ ...prev, end: event.target.value }))}
                        className="mt-0.5 w-full rounded-lg border border-outline-variant/30 px-3 py-2 text-xs"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={workflowSaving || !permissions.canManageWorkflow}
                    onClick={scheduleNextMeeting}
                    className="rounded-lg bg-blue-900 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                  >
                    Programmer
                  </button>
                </div>
              </section>
            </div>
          )}
        </>
      )}

      {selectedReport && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => setSelectedReport(null)}
        >
          <div
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Rapport meeting</p>
                <h3 className="mt-1 text-lg font-bold text-on-surface">{selectedReport.createdByName || 'Equipe'}</h3>
                <p className="text-xs text-on-surface-variant">{new Date(selectedReport.createdAt).toLocaleString('fr-FR')}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReport(null)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Fermer
              </button>
            </div>
            <div className="mt-5 space-y-4 text-sm text-on-surface">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Resume</p>
                <p className="mt-1 whitespace-pre-wrap">{selectedReport.summary}</p>
              </div>
              {(selectedReport.decisions || []).length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Decisions</p>
                  <ul className="mt-1 space-y-1">
                    {selectedReport.decisions.map((item, index) => <li key={`d-${index}`}>- {item}</li>)}
                  </ul>
                </div>
              )}
              {(selectedReport.actionItems || []).length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Actions</p>
                  <ul className="mt-1 space-y-1">
                    {selectedReport.actionItems.map((item, index) => <li key={`a-${index}`}>- {item}</li>)}
                  </ul>
                </div>
              )}
              {(selectedReport.blockers || []).length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Blocages</p>
                  <ul className="mt-1 space-y-1">
                    {selectedReport.blockers.map((item, index) => <li key={`b-${index}`}>- {item}</li>)}
                  </ul>
                </div>
              )}
              {(selectedReport.nextSteps || []).length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Prochaines etapes</p>
                  <ul className="mt-1 space-y-1">
                    {selectedReport.nextSteps.map((item, index) => <li key={`ns-${index}`}>- {item}</li>)}
                  </ul>
                </div>
              )}
              {selectedReport.attachments?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Pieces jointes</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedReport.attachments.map((att) => (
                      <a
                        key={att.id}
                        href={att.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-900 hover:bg-blue-100"
                      >
                        {att.fileName || 'Piece jointe'}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
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

export default ProjectMeetingsPage;
