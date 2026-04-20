import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { authRequest, getUploadUrl } from '../api';
import { useAuth } from '../auth-context';
import { useToast } from '../toast-context';
import ImageLightbox from '../components/ImageLightbox';

const COMPLEXITY_LABELS = ['Minimaliste', 'Simple', 'Modere', 'Complexe', 'Maximaliste'];

function ComplexitySlider({ value, onChange, disabled }) {
  const index = Math.min(4, Math.round(value / 25));
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs font-semibold text-primary">
        <span>Minimaliste</span>
        <span>Maximaliste</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={25}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="w-full accent-primary"
        style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
      />
      <p className="text-center text-sm font-semibold text-primary">{COMPLEXITY_LABELS[index]}</p>
    </div>
  );
}

function BackOfficeQuoteRequestDetailPage() {
  const { quoteId } = useParams();
  const { user, token } = useAuth();
  const toast = useToast();

  const [quote, setQuote] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [submittingStudy, setSubmittingStudy] = useState(false);
  const [submittingFinal, setSubmittingFinal] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(null);

  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');

  // Study form state
  const [studyTasks, setStudyTasks] = useState([{ name: '', hours: '', days: '' }]);
  const [studyComplexity, setStudyComplexity] = useState(50);
  const [studyNotes, setStudyNotes] = useState('');
  const [studyPdfFile, setStudyPdfFile] = useState(null);
  const studyPdfRef = useRef(null);

  const [finalForm, setFinalForm] = useState({ amount: '', breakdown: '', deliveryDays: '', currency: 'EUR' });

  const isAdmin = user?.role === 'ADMIN';
  const isEmployee = user?.role === 'EMPLOYE';
  const navigate = useNavigate();

  const imageFiles = useMemo(
    () => (quote?.files || []).filter((f) => String(f.mimetype || '').startsWith('image/')),
    [quote]
  );
  const otherFiles = useMemo(
    () => (quote?.files || []).filter((f) => !String(f.mimetype || '').startsWith('image/')),
    [quote]
  );
  const paletteSwatches = useMemo(
    () =>
      (quote?.paletteColors || []).map((item) => {
        const match = String(item).match(/#(?:[0-9a-fA-F]{3}){1,2}/);
        return { label: item, color: match ? match[0] : null };
      }),
    [quote]
  );

  const loadDetails = useCallback(() => {
    setLoading(true);
    const calls = [authRequest(`/quote-requests/${quoteId}`, token)];
    if (isAdmin) calls.push(authRequest('/users?role=EMPLOYE', token));
    Promise.all(calls)
      .then(([quoteResult, employeesResult]) => {
        setQuote(quoteResult.quoteRequest || null);
        if (employeesResult?.users) setEmployees(employeesResult.users || []);
      })
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  }, [quoteId, token, isAdmin, toast]);

  useEffect(() => {
    loadDetails();
  }, [loadDetails]);

  const suggestedEmployees = useMemo(
    () => [...employees].sort((a, b) => (a.disponibilite ? 0 : 1) - (b.disponibilite ? 0 : 1)),
    [employees]
  );

  const assignQuote = async (auto = false) => {
    try {
      setAssigning(true);
      await authRequest(`/quote-requests/${quoteId}/assign`, token, {
        method: 'PATCH',
        body: JSON.stringify(auto ? {} : { employeeId: selectedEmployeeId }),
      });
      toast.success('Demande affectee avec succes.');
      loadDetails();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAssigning(false);
    }
  };

  const submitStudy = async () => {
    if (quote?.study) {
      toast.error('Une etude a deja ete soumise.');
      return;
    }
    const validTasks = studyTasks.filter((t) => t.name.trim());
    if (!validTasks.length) {
      toast.error('Ajoutez au moins une tache.');
      return;
    }
    try {
      setSubmittingStudy(true);
      const fd = new FormData();
      fd.append('tasks', JSON.stringify(validTasks));
      fd.append('complexity', String(studyComplexity));
      fd.append('notes', studyNotes);
      if (studyPdfFile) fd.append('studyPdf', studyPdfFile);
      await authRequest(`/quote-requests/${quoteId}/study`, token, { method: 'PATCH', body: fd });
      toast.success("Etude envoyee a l'administrateur.");
      loadDetails();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmittingStudy(false);
    }
  };

  const submitFinalEstimation = async () => {
    if (quote?.finalEstimation) {
      toast.error('Une estimation a deja ete envoyee.');
      return;
    }
    try {
      setSubmittingFinal(true);
      await authRequest(`/quote-requests/${quoteId}/final-estimation`, token, {
        method: 'PATCH',
        body: JSON.stringify(finalForm),
      });
      toast.success('Estimation finale envoyee au client.');
      loadDetails();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmittingFinal(false);
    }
  };

  const addTask = () => setStudyTasks((prev) => [...prev, { name: '', hours: '', days: '' }]);
  const removeTask = (i) => setStudyTasks((prev) => prev.filter((_, idx) => idx !== i));
  const updateTask = (i, field, val) =>
    setStudyTasks((prev) => prev.map((t, idx) => (idx === i ? { ...t, [field]: val } : t)));

  if (loading) return <p className="text-on-surface-variant">Chargement...</p>;
  if (!quote) return <p className="text-on-surface-variant">Demande introuvable.</p>;

  return (
    <>
      <section className="space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <Link to="/backoffice/devis" className="text-sm font-semibold text-primary">
              ← Retour aux demandes
            </Link>
            <h1 className="text-3xl font-bold text-primary mt-2">Demande {quote.id}</h1>
          </div>
        </header>

        <section className="grid xl:grid-cols-[1.15fr_0.85fr] gap-6">
          {/* ── Left column: brief ── */}
          <article className="space-y-6">
            {/* 1 – Brief */}
            <section className="bg-white border border-outline-variant/20 rounded-2xl p-6 space-y-4">
              <div className="flex items-center space-x-4">
                <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-primary font-bold">1</div>
                <h2 className="text-xl font-bold">Brief Client</h2>
              </div>
              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <p><span className="font-semibold">Client:</span> {quote.clientName || quote.clientId}</p>
                <p><span className="font-semibold">Service:</span> {quote.serviceName || quote.serviceType}</p>
                <p><span className="font-semibold">Budget:</span> {quote.budget || '-'}</p>
                <p><span className="font-semibold">Deadline:</span> {quote.deadline || '-'}</p>
              </div>
            </section>

            {/* 2 – Coeur du projet */}
            <section className="bg-white border border-outline-variant/20 rounded-2xl p-6 space-y-4">
              <div className="flex items-center space-x-4">
                <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-primary font-bold">2</div>
                <h2 className="text-xl font-bold">Coeur du projet</h2>
              </div>
              <div>
                <p className="font-semibold text-on-surface mb-2">Description detaillee</p>
                <p className="text-on-surface-variant whitespace-pre-wrap">{quote.description}</p>
              </div>
            </section>

            {/* 3 – Identite visuelle */}
            <section className="bg-white border border-outline-variant/20 rounded-2xl p-6 space-y-4">
              <div className="flex items-center space-x-4">
                <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-primary font-bold">3</div>
                <h2 className="text-xl font-bold">Identite visuelle</h2>
              </div>
              <div>
                <p className="font-semibold mb-3">Couleurs selectionnees</p>
                {paletteSwatches.length ? (
                  <div className="flex flex-wrap gap-3">
                    {paletteSwatches.map((swatch) => (
                      <div key={swatch.label} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-container-low">
                        <div
                          className="w-8 h-8 rounded-lg border border-outline-variant/20"
                          style={{ background: swatch.color || '#ffffff' }}
                        />
                        <span className="text-sm font-medium">{swatch.label}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-on-surface-variant">Aucune couleur selectionnee.</p>
                )}
              </div>
              <div>
                <p className="font-semibold mb-2">Precisions palette</p>
                <p className="text-on-surface-variant whitespace-pre-wrap">{quote.paletteCouleur || '-'}</p>
              </div>
            </section>

            {/* 4 – Ressources */}
            <section className="bg-white border border-outline-variant/20 rounded-2xl p-6 space-y-4">
              <div className="flex items-center space-x-4">
                <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-primary font-bold">4</div>
                <h2 className="text-xl font-bold">Ressources et references</h2>
              </div>
              <div>
                <p className="font-semibold mb-2">Lien d'inspiration</p>
                {quote.inspirationLink ? (
                  <a href={quote.inspirationLink} target="_blank" rel="noreferrer" className="text-primary underline break-all">
                    {quote.inspirationLink}
                  </a>
                ) : (
                  <p className="text-on-surface-variant">Aucun lien.</p>
                )}
              </div>
              <div>
                <p className="font-semibold mb-2">Inspirations et references</p>
                <p className="text-on-surface-variant whitespace-pre-wrap">{quote.inspiration || '-'}</p>
              </div>
              <div>
                <p className="font-semibold mb-2">Contraintes</p>
                <p className="text-on-surface-variant whitespace-pre-wrap">{quote.contraintes || '-'}</p>
              </div>
              <div>
                <p className="font-semibold mb-3">Images de reference</p>
                {imageFiles.length ? (
                  <div className="grid grid-cols-2 gap-3">
                    {imageFiles.map((file, index) => (
                      <button
                        key={file.id || file.url}
                        type="button"
                        onClick={() => setActiveImageIndex(index)}
                        className="rounded-xl overflow-hidden border border-outline-variant/20 text-left"
                      >
                        <img
                          src={getUploadUrl(file.url)}
                          alt={file.name}
                          className="w-full h-36 object-cover hover:scale-105 transition-transform"
                        />
                        <p className="p-2 text-xs font-medium truncate">{file.name}</p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-on-surface-variant">Aucune image de reference.</p>
                )}
              </div>
              <div>
                <p className="font-semibold mb-3">Documents et autres fichiers</p>
                {otherFiles.length ? (
                  <div className="space-y-2">
                    {otherFiles.map((file) => (
                      <a
                        key={file.id || file.url}
                        href={getUploadUrl(file.url)}
                        target="_blank"
                        rel="noreferrer"
                        className="block text-primary underline break-all"
                      >
                        {file.name || file.url}
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="text-on-surface-variant">Aucun document.</p>
                )}
              </div>
            </section>
          </article>

          {/* ── Right column: workflow ── */}
          <article className="bg-white border border-outline-variant/20 rounded-2xl p-6 space-y-6">
            {/* Status badge */}
            <div className="rounded-xl bg-surface-container-low p-4 space-y-1 text-sm">
              <p><span className="font-semibold">Statut:</span> {quote.statut}</p>
              <p><span className="font-semibold">Employe affecte:</span> {quote.assignedEmployeeName || 'Non affecte'}</p>
            </div>

            {/* Assignment (admin only) */}
            {isAdmin && (
              <div className="space-y-3">
                <h3 className="text-lg font-bold">Affecter a un employe</h3>
                {quote.assignedEmployeeId ? (
                  <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 text-sm text-blue-800">
                    Cette demande est deja affectee a{' '}
                    <span className="font-semibold">{quote.assignedEmployeeName}</span>. La reaffectation est verrouillee.
                  </div>
                ) : (
                  <div className="grid gap-3">
                    <select
                      className="rounded-xl bg-surface-container-highest border-none"
                      value={selectedEmployeeId}
                      onChange={(e) => setSelectedEmployeeId(e.target.value)}
                    >
                      <option value="">Selectionner un employe</option>
                      {suggestedEmployees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.username} — {emp.specialite || 'Sans specialite'} — {emp.disponibilite ? 'Disponible' : 'Indisponible'}
                        </option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => assignQuote(false)}
                        disabled={assigning || !selectedEmployeeId}
                        className="px-4 py-2 rounded-xl bg-primary text-white font-semibold disabled:opacity-50"
                      >
                        Affecter
                      </button>
                      <button
                        type="button"
                        onClick={() => assignQuote(true)}
                        disabled={assigning}
                        className="px-4 py-2 rounded-xl bg-blue-50 border border-blue-300 text-blue-700 font-semibold"
                      >
                        Auto (specialite/dispo)
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Employee study section */}
            <div className="space-y-4 border-t border-outline-variant/20 pt-4">
              <h3 className="text-lg font-bold">Etude employe</h3>

              {/* Display submitted study */}
              {quote.study ? (
                <div className="rounded-xl bg-surface-container-low p-4 text-sm space-y-4">
                  {/* Tasks table */}
                  {Array.isArray(quote.study.tasks) && quote.study.tasks.length > 0 && (
                    <div>
                      <p className="font-semibold mb-2">Taches</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="bg-blue-50 text-primary">
                              <th className="text-left p-2 rounded-tl-lg">Tache</th>
                              <th className="text-center p-2">Heures</th>
                              <th className="text-center p-2 rounded-tr-lg">Jours</th>
                            </tr>
                          </thead>
                          <tbody>
                            {quote.study.tasks.map((t, i) => (
                              <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-surface-container-lowest'}>
                                <td className="p-2">{t.name}</td>
                                <td className="p-2 text-center">{t.hours || '-'}</td>
                                <td className="p-2 text-center">{t.days || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {/* Summary */}
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <div className="rounded-lg bg-blue-50 p-3">
                          <p className="text-xs font-semibold text-primary">Nombre de taches</p>
                          <p className="text-lg font-bold text-primary mt-1">{quote.study.tasks.length}</p>
                        </div>
                        <div className="rounded-lg bg-emerald-50 p-3">
                          <p className="text-xs font-semibold text-emerald-700">Nombre de jours de travail</p>
                          <p className="text-lg font-bold text-emerald-700 mt-1">
                            {Math.round(((quote.study.tasks.reduce((sum, t) => sum + (Number(t.hours) || 0), 0) / 8) + quote.study.tasks.reduce((sum, t) => sum + (Number(t.days) || 0), 0)) * 10) / 10}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* Complexity */}
                  <div>
                    <p className="font-semibold mb-2">Complexite du projet</p>
                    <ComplexitySlider value={quote.study.complexity ?? 50} onChange={() => {}} disabled />
                  </div>
                  {/* Notes */}
                  {quote.study.notes && (
                    <div>
                      <p className="font-semibold mb-1">Notes</p>
                      <p className="text-on-surface-variant whitespace-pre-wrap">{quote.study.notes}</p>
                    </div>
                  )}
                  {/* Study PDF */}
                  {quote.study.studyPdfUrl && (
                    <a
                      href={getUploadUrl(quote.study.studyPdfUrl)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 text-primary underline text-sm"
                    >
                      <span className="material-symbols-outlined text-base">picture_as_pdf</span>
                      Rapport PDF joint
                    </a>
                  )}
                </div>
              ) : (
                <p className="text-on-surface-variant text-sm">Aucune etude envoyee.</p>
              )}

              {/* Study form (employee only) */}
              {isEmployee && !quote.study && (
                <div className="space-y-4 border border-outline-variant/20 rounded-2xl p-4">
                  <p className="font-semibold text-sm">Remplir l'etude</p>

                  {/* Tasks */}
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Taches</p>
                    {studyTasks.map((task, i) => (
                      <div key={i} className="grid grid-cols-[1fr_80px_80px_32px] gap-2 items-center">
                        <input
                          className="rounded-xl bg-surface-container-highest border-none text-sm px-3 py-2"
                          placeholder={`Tache ${i + 1}`}
                          value={task.name}
                          onChange={(e) => updateTask(i, 'name', e.target.value)}
                        />
                        <input
                          type="number"
                          min="0"
                          className="rounded-xl bg-surface-container-highest border-none text-sm px-2 py-2 text-center"
                          placeholder="h"
                          value={task.hours}
                          onChange={(e) => updateTask(i, 'hours', e.target.value)}
                        />
                        <input
                          type="number"
                          min="0"
                          className="rounded-xl bg-surface-container-highest border-none text-sm px-2 py-2 text-center"
                          placeholder="j"
                          value={task.days}
                          onChange={(e) => updateTask(i, 'days', e.target.value)}
                        />
                        {studyTasks.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeTask(i)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 text-red-500 hover:bg-red-100"
                          >
                            <span className="material-symbols-outlined text-base">close</span>
                          </button>
                        )}
                      </div>
                    ))}
                    <div className="flex gap-2 text-xs text-on-surface-variant ml-1">
                      <span className="w-full">Tache</span>
                      <span className="w-20 text-center">Heures</span>
                      <span className="w-20 text-center">Jours</span>
                    </div>
                    <button
                      type="button"
                      onClick={addTask}
                      className="flex items-center gap-1 text-sm text-primary font-semibold"
                    >
                      <span className="material-symbols-outlined text-base">add_circle</span>
                      Ajouter une tache
                    </button>
                  </div>

                  {/* Complexity slider */}
                  <div>
                    <p className="text-sm font-medium mb-3">Complexite du projet</p>
                    <ComplexitySlider value={studyComplexity} onChange={setStudyComplexity} />
                  </div>

                  {/* Notes */}
                  <div>
                    <p className="text-sm font-medium mb-1">Note explicative</p>
                    <textarea
                      rows={3}
                      className="w-full rounded-xl bg-surface-container-highest border-none text-sm px-3 py-2"
                      placeholder="Observations, remarques, context technique..."
                      value={studyNotes}
                      onChange={(e) => setStudyNotes(e.target.value)}
                    />
                  </div>

                  {/* Optional PDF */}
                  <div>
                    <p className="text-sm font-medium mb-1">Rapport PDF (facultatif)</p>
                    <input
                      ref={studyPdfRef}
                      type="file"
                      accept=".pdf"
                      className="hidden"
                      onChange={(e) => setStudyPdfFile(e.target.files?.[0] || null)}
                    />
                    <button
                      type="button"
                      onClick={() => studyPdfRef.current?.click()}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl border border-outline-variant/30 bg-surface-container-low text-sm font-medium hover:bg-surface-container"
                    >
                      <span className="material-symbols-outlined text-base">upload_file</span>
                      {studyPdfFile ? studyPdfFile.name : 'Choisir un PDF'}
                    </button>
                    {studyPdfFile && (
                      <button
                        type="button"
                        onClick={() => { setStudyPdfFile(null); if (studyPdfRef.current) studyPdfRef.current.value = ''; }}
                        className="mt-1 text-xs text-red-500 underline"
                      >
                        Supprimer
                      </button>
                    )}
                  </div>

                  {/* Total working days display */}
                  <div className="rounded-lg bg-blue-50 p-3 border border-blue-200">
                    <p className="text-xs font-semibold text-primary">Total des jours de travail</p>
                    <div className="flex items-baseline gap-1 mt-2">
                      <p className="text-2xl font-bold text-primary">
                        {Math.round(((studyTasks.reduce((sum, t) => sum + (Number(t.hours) || 0), 0) / 8) + studyTasks.reduce((sum, t) => sum + (Number(t.days) || 0), 0)) * 10) / 10}
                      </p>
                      <p className="text-sm text-primary font-medium">jour(s)</p>
                    </div>
                    <p className="text-xs text-on-surface-variant mt-1">
                      ({studyTasks.reduce((sum, t) => sum + (Number(t.hours) || 0), 0)}h ÷ 8 + {studyTasks.reduce((sum, t) => sum + (Number(t.days) || 0), 0)}j)
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={submitStudy}
                    disabled={submittingStudy}
                    className="w-full px-4 py-2 rounded-xl bg-primary text-white font-semibold disabled:opacity-50"
                  >
                    {submittingStudy ? 'Envoi...' : 'Traiter le devis'}
                  </button>
                </div>
              )}
              {isEmployee && quote.study && (
                <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 text-sm text-blue-800 space-y-1">
                  <p className="font-semibold">✓ Etude deja envoyee</p>
                  <p className="text-xs">Vous avez deja soumis une etude pour cette demande. Une nouvelle soumission n'est pas autorisee.</p>
                </div>
              )}
            </div>

            {/* Final estimation (admin only) */}
            {isAdmin && (
              <div className="space-y-3 border-t border-outline-variant/20 pt-4">
                <h3 className="text-lg font-bold">Estimation financiere finale</h3>
                {quote.finalEstimation ? (
                  <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm space-y-1">
                    <p><span className="font-semibold">Montant:</span> {quote.finalEstimation.amount} {quote.finalEstimation.currency}</p>
                    <p><span className="font-semibold">Delai:</span> {quote.finalEstimation.deliveryDays || '-'} jours</p>
                    <p><span className="font-semibold">Detail:</span> {quote.finalEstimation.breakdown || '-'}</p>
                  </div>
                ) : null}
                {!quote.finalEstimation && (
                <div className="grid gap-2">
                  <input
                    type="number"
                    min="1"
                    className="rounded-xl bg-surface-container-highest border-none"
                    placeholder="Montant"
                    value={finalForm.amount}
                    onChange={(e) => setFinalForm((p) => ({ ...p, amount: e.target.value }))}
                  />
                  <input
                    className="rounded-xl bg-surface-container-highest border-none"
                    placeholder="Devise (EUR)"
                    value={finalForm.currency}
                    onChange={(e) => setFinalForm((p) => ({ ...p, currency: e.target.value }))}
                  />
                  <input
                    type="number"
                    min="1"
                    className="rounded-xl bg-surface-container-highest border-none"
                    placeholder="Delai de livraison (jours)"
                    value={finalForm.deliveryDays}
                    onChange={(e) => setFinalForm((p) => ({ ...p, deliveryDays: e.target.value }))}
                  />
                  <textarea
                    rows={4}
                    className="rounded-xl bg-surface-container-highest border-none"
                    placeholder="Detail de l'estimation..."
                    value={finalForm.breakdown}
                    onChange={(e) => setFinalForm((p) => ({ ...p, breakdown: e.target.value }))}
                  />
                  <button
                    type="button"
                    onClick={submitFinalEstimation}
                    disabled={submittingFinal}
                    className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-semibold disabled:opacity-50"
                  >
                    {submittingFinal ? 'Envoi...' : 'Envoyer au client'}
                  </button>
                </div>
                )}
                {quote.finalEstimation && (
                  <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800 space-y-1">
                    <p className="font-semibold">✓ Estimation deja envoyee</p>
                    <p className="text-xs">Une estimation a deja ete envoyee au client. Une nouvelle soumission n'est pas autorisee.</p>
                  </div>
                )}
              </div>
            )}
            </article>

              {/* Chat button when project is started */}
              {quote.depositPaid && (
                <div className="bg-white border border-outline-variant/20 rounded-2xl p-4 mt-0">
                  <button
                    type="button"
                    onClick={() => navigate(`/backoffice/devis/${quoteId}/chat`)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-white font-semibold hover:opacity-90 transition-colors"
                  >
                    <span className="material-symbols-outlined text-base">chat</span>
                    Ouvrir le chat projet
                  </button>
                </div>
              )}
        </section>
      </section>

      {activeImageIndex !== null && (
        <ImageLightbox
          images={imageFiles.map((f) => ({ id: f.id || f.url, label: f.name, url: getUploadUrl(f.url) }))}
          currentIndex={activeImageIndex}
          onClose={() => setActiveImageIndex(null)}
          onPrev={() => setActiveImageIndex((prev) => (prev - 1 + imageFiles.length) % imageFiles.length)}
          onNext={() => setActiveImageIndex((prev) => (prev + 1) % imageFiles.length)}
        />
      )}
    </>
  );
}

export default BackOfficeQuoteRequestDetailPage;
