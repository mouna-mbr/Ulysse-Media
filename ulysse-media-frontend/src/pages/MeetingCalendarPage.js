import { useCallback, useEffect, useMemo, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import MainNav from '../components/MainNav';
import { authRequest } from '../api';
import { useAuth } from '../auth-context';
import { useToast } from '../toast-context';

function toLocalInputValue(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseApiEvent(evt) {
  return {
    id: evt.id,
    title: evt.title,
    start: evt.start,
    end: evt.end,
    backgroundColor: evt.status === 'CANCELED' ? '#94a3b8' : '#1d4ed8',
    borderColor: evt.status === 'CANCELED' ? '#64748b' : '#1e40af',
    extendedProps: {
      description: evt.description || '',
      meetLink: evt.meetLink || null,
      clientName: evt.clientName || '',
      clientEmail: evt.clientEmail || '',
      status: evt.status,
      timezone: evt.timezone || 'Europe/Paris',
      syncStatus: evt.syncStatus || 'PENDING'
    }
  };
}

const EMPTY_FORM = {
  title: '',
  description: '',
  start: '',
  end: '',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris',
  clientUserId: '',
  projectId: ''
};

function getExtendedProps(eventLike) {
  return eventLike?.extendedProps || {};
}

function MeetingCalendarPage() {
  const { user, token } = useAuth();
  const toast = useToast();

  const [events, setEvents] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [paidProjects, setPaidProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [editingEventId, setEditingEventId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const isBackoffice = user?.role === 'ADMIN' || user?.role === 'EMPLOYE';
  const canManage = isBackoffice;

  const loadEvents = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await authRequest('/events', token);
      const parsed = (res.events || []).map(parseApiEvent);
      setEvents(parsed);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  const loadParticipants = useCallback(async () => {
    if (!token || !canManage) return;
    try {
      const [partRes, projRes] = await Promise.all([
        authRequest('/events/participants', token),
        authRequest('/events/paid-projects', token)
      ]);
      setParticipants(partRes.participants || []);
      setPaidProjects(projRes.projects || []);
    } catch (error) {
      toast.error(error.message);
    }
  }, [token, canManage, toast]);

  useEffect(() => {
    loadEvents();
    loadParticipants();
  }, [loadEvents, loadParticipants]);

  const openCreateModal = () => {
    setEditingEventId(null);
    setSelectedEvent(null);
    setForm({
      ...EMPTY_FORM,
      start: toLocalInputValue(new Date()),
      end: toLocalInputValue(new Date(Date.now() + 60 * 60 * 1000))
    });
    setModalOpen(true);
  };

  const openEditModal = (event) => {
    const extendedProps = getExtendedProps(event);
    setEditingEventId(event.id);
    setForm({
      title: event.title,
      description: extendedProps.description || '',
      start: toLocalInputValue(event.start),
      end: toLocalInputValue(event.end),
      timezone: extendedProps.timezone || 'Europe/Paris',
      clientUserId: participants.find((p) => p.email === extendedProps.clientEmail)?.id || ''
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingEventId(null);
    setForm(EMPTY_FORM);
  };

  const openCancelModal = () => {
    if (!selectedEvent || submitting) return;
    setConfirmCancelOpen(true);
  };

  const closeCancelModal = () => {
    if (submitting) return;
    setConfirmCancelOpen(false);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.start || !form.end) {
      toast.warning('Titre, date de debut et date de fin sont requis.');
      return;
    }
    if (!editingEventId && !form.clientUserId) {
      toast.warning('Selectionnez un client.');
      return;
    }

    setSubmitting(true);
    try {
      if (editingEventId) {
        const res = await authRequest(`/events/${editingEventId}`, token, {
          method: 'PUT',
          body: JSON.stringify({
            title: form.title.trim(),
            description: form.description.trim(),
            start: new Date(form.start).toISOString(),
            end: new Date(form.end).toISOString(),
            timezone: form.timezone
          })
        });
        const updated = parseApiEvent(res.event);
        setEvents((prev) => prev.map((evt) => (evt.id === updated.id ? updated : evt)));
        toast.success('Reunion mise a jour.');
      } else {
        const res = await authRequest('/events', token, {
          method: 'POST',
          body: JSON.stringify({
            title: form.title.trim(),
            description: form.description.trim(),
            start: new Date(form.start).toISOString(),
            end: new Date(form.end).toISOString(),
            timezone: form.timezone,
            clientUserId: form.clientUserId
          })
        });
        setEvents((prev) => [...prev, parseApiEvent(res.event)]);
        toast.success('Reunion planifiee avec succes.');
      }
      closeModal();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedEvent) return;

    setSubmitting(true);
    try {
      await authRequest(`/events/${selectedEvent.id}`, token, { method: 'DELETE' });
      setEvents((prev) => prev.map((evt) => (
        evt.id === selectedEvent.id
          ? {
            ...evt,
            backgroundColor: '#94a3b8',
            borderColor: '#64748b',
            extendedProps: { ...evt.extendedProps, status: 'CANCELED' }
          }
          : evt
      )));
      setSelectedEvent((prev) => prev ? {
        ...prev,
        backgroundColor: '#94a3b8',
        borderColor: '#64748b',
        extendedProps: { ...prev.extendedProps, status: 'CANCELED' }
      } : prev);
      setConfirmCancelOpen(false);
      toast.success('Reunion annulee.');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEventDrop = async (changeInfo) => {
    try {
      const extendedProps = getExtendedProps(changeInfo.event);
      const payload = {
        start: changeInfo.event.start?.toISOString(),
        end: changeInfo.event.end?.toISOString(),
        title: changeInfo.event.title,
        timezone: extendedProps.timezone || 'Europe/Paris'
      };
      const res = await authRequest(`/events/${changeInfo.event.id}`, token, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      const updated = parseApiEvent(res.event);
      setEvents((prev) => prev.map((evt) => (evt.id === updated.id ? updated : evt)));
      if (selectedEvent?.id === updated.id) setSelectedEvent(updated);
      toast.success('Reunion replanifiee.');
    } catch (error) {
      changeInfo.revert();
      toast.error(error.message);
    }
  };

  const selectedSummary = useMemo(() => {
    if (!selectedEvent) return null;
    const extendedProps = getExtendedProps(selectedEvent);
    return {
      ...selectedEvent,
      extendedProps,
      startText: new Date(selectedEvent.start).toLocaleString('fr-FR'),
      endText: new Date(selectedEvent.end).toLocaleString('fr-FR')
    };
  }, [selectedEvent]);

  const content = (
    <main className="meeting-calendar-page mx-auto w-full max-w-[110rem] px-4 py-6 sm:px-6 lg:px-8 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Calendrier des reunions</h1>
          <p className="text-sm text-on-surface-variant">Planifiez, mettez a jour et rejoignez vos reunions Google Meet.</p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={openCreateModal}
            className="rounded-xl bg-blue-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800"
          >
            Nouvelle reunion
          </button>
        )}
      </div>

      {loading ? (
        <div className="rounded-2xl border border-outline-variant/20 bg-white p-6 text-sm text-on-surface-variant">
          Chargement du calendrier...
        </div>
      ) : (
        <div className="space-y-4">
          <section className="meeting-calendar-shell rounded-2xl border border-outline-variant/20 bg-white p-4">
            <FullCalendar
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
              initialView="timeGridWeek"
              headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' }}
              editable={canManage}
              eventDurationEditable={canManage}
              eventStartEditable={canManage}
              droppable={canManage}
              eventDrop={canManage ? handleEventDrop : undefined}
              eventResize={canManage ? handleEventDrop : undefined}
              eventClick={(info) => {
                setSelectedEvent(info.event);
              }}
              events={events}
              height="78vh"
              stickyHeaderDates
              expandRows
              locale="fr"
            />
          </section>

          <aside className="rounded-2xl border border-outline-variant/20 bg-white p-4 space-y-3">
            {!selectedSummary && <p className="text-sm text-on-surface-variant">Selectionnez une reunion dans le calendrier pour afficher les details.</p>}
            {selectedSummary && (
              <>
                <h2 className="text-lg font-bold text-on-surface">{selectedSummary.title}</h2>
                <p className="text-sm text-slate-500">{selectedSummary.extendedProps.description || 'Sans description'}</p>
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                  <div className="rounded-xl bg-surface-container-low p-3 text-sm space-y-1">
                  <p><span className="font-semibold">Debut:</span> {selectedSummary.startText}</p>
                  <p><span className="font-semibold">Fin:</span> {selectedSummary.endText}</p>
                  <p><span className="font-semibold">Fuseau:</span> {selectedSummary.extendedProps.timezone}</p>
                  <p><span className="font-semibold">Client:</span> {selectedSummary.extendedProps.clientName || '-'}</p>
                  <p><span className="font-semibold">Statut:</span> {selectedSummary.extendedProps.status}</p>
                  <p><span className="font-semibold">Sync:</span> {selectedSummary.extendedProps.syncStatus}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-sm space-y-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Google Meet</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {selectedSummary.extendedProps.meetLink && selectedSummary.extendedProps.status !== 'CANCELED'
                          ? 'Lien de reunion disponible.'
                          : 'Aucun lien Meet disponible.'}
                      </p>
                    </div>
                    {selectedSummary.extendedProps.meetLink && selectedSummary.extendedProps.status !== 'CANCELED' && (
                      <a
                        href={selectedSummary.extendedProps.meetLink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex w-full items-center justify-center rounded-xl bg-blue-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800"
                      >
                        Rejoindre Meeting
                      </a>
                    )}
                    {canManage && selectedSummary.extendedProps.status !== 'CANCELED' && (
                      <div className="grid gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(selectedSummary)}
                          className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-900 transition hover:bg-blue-100"
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          onClick={openCancelModal}
                          disabled={submitting}
                          className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                        >
                          Annuler la reunion
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </aside>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-on-surface">{editingEventId ? 'Modifier la reunion' : 'Planifier une reunion'}</h3>

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
              {!editingEventId && (
                <>
                  <select
                    value={form.projectId}
                    onChange={(event) => {
                      const selected = paidProjects.find((p) => p.id === event.target.value);
                      setForm((prev) => ({
                        ...prev,
                        projectId: event.target.value,
                        clientUserId: selected ? selected.clientId : prev.clientUserId
                      }));
                    }}
                    className="rounded-xl border border-outline-variant/30 px-3 py-2 text-sm"
                  >
                    <option value="">Lier a un projet (optionnel)</option>
                    {paidProjects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name} — {project.clientName || project.clientEmail || ''}
                      </option>
                    ))}
                  </select>
                  <select
                    value={form.clientUserId}
                    onChange={(event) => setForm((prev) => ({ ...prev, clientUserId: event.target.value, projectId: '' }))}
                    className="rounded-xl border border-outline-variant/30 px-3 py-2 text-sm"
                  >
                    <option value="">Selectionnez un client</option>
                    {participants.map((participant) => (
                      <option key={participant.id} value={participant.id}>
                        {participant.username} ({participant.email})
                      </option>
                    ))}
                  </select>
                </>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  type="datetime-local"
                  value={form.start}
                  onChange={(event) => setForm((prev) => ({ ...prev, start: event.target.value }))}
                  className="rounded-xl border border-outline-variant/30 px-3 py-2 text-sm"
                />
                <input
                  type="datetime-local"
                  value={form.end}
                  onChange={(event) => setForm((prev) => ({ ...prev, end: event.target.value }))}
                  className="rounded-xl border border-outline-variant/30 px-3 py-2 text-sm"
                />
              </div>
              <input
                type="text"
                placeholder="Europe/Paris"
                value={form.timezone}
                onChange={(event) => setForm((prev) => ({ ...prev, timezone: event.target.value }))}
                className="rounded-xl border border-outline-variant/30 px-3 py-2 text-sm"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
              >
                Fermer
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={submitting}
                className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:opacity-50"
              >
                {submitting ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmCancelOpen && selectedSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
              <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
                <path d="M12 8v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <circle cx="12" cy="16.5" r="1" fill="currentColor" />
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.72 3h16.92a2 2 0 0 0 1.72-3L13.71 3.86a2 2 0 0 0-3.42 0Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-slate-900">Annuler cette reunion ?</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Les participants seront notifies de l'annulation de
              <span className="font-semibold text-slate-900"> {selectedSummary.title}</span>.
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={closeCancelModal}
                disabled={submitting}
                className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 disabled:opacity-50"
              >
                Retour
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={submitting}
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
              >
                {submitting ? 'Annulation...' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );

  if (isBackoffice) {
    return content;
  }

  return (
    <div className="min-h-screen bg-surface-container-lowest">
      <MainNav />
      {content}
    </div>
  );
}

export default MeetingCalendarPage;
