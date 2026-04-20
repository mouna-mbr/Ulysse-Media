import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import MainNav from '../components/MainNav';
import ImageLightbox from '../components/ImageLightbox';
import { authRequest, getUploadUrl } from '../api';
import { useAuth } from '../auth-context';
import { useToast } from '../toast-context';

pdfMake.vfs = pdfFonts.pdfMake ? pdfFonts.pdfMake.vfs : pdfFonts.vfs;

const statusLabel = {
  EN_ATTENTE: 'En attente',
  AFFECTE: 'Affecté',
  ETUDE_ENVOYEE: 'Etude en cours',
  REPONDU: 'Répondu',
  EN_ATTENTE_PAIEMENT: 'En attente de paiement',
  ACCEPTE: 'Accepté — Projet en cours',
  REFUSE: 'Refusé',
};

const statusColor = {
  EN_ATTENTE: 'bg-yellow-100 text-yellow-800',
  AFFECTE: 'bg-blue-100 text-blue-800',
  ETUDE_ENVOYEE: 'bg-purple-100 text-purple-800',
  REPONDU: 'bg-emerald-100 text-emerald-800',
  EN_ATTENTE_PAIEMENT: 'bg-orange-100 text-orange-800',
  ACCEPTE: 'bg-emerald-100 text-emerald-800',
  REFUSE: 'bg-red-100 text-red-800',
};

function ClientQuoteRequestDetailPage() {
  const { quoteId } = useParams();
  const { token } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeImageIndex, setActiveImageIndex] = useState(null);
  const [responding, setResponding] = useState(false);
  const [paying, setPaying] = useState(false);

  const loadQuote = useCallback(() => {
    setLoading(true);
    authRequest(`/quote-requests/${quoteId}`, token)
      .then((result) => setQuote(result.quoteRequest || null))
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  }, [quoteId, token, toast]);

  useEffect(() => {
    loadQuote();
  }, [loadQuote]);

  const respondToQuote = async (response) => {
    setResponding(true);
    try {
      await authRequest(`/quote-requests/${quoteId}/client-response`, token, {
        method: 'PATCH',
        body: JSON.stringify({ response }),
      });
      toast.success(response === 'ACCEPTE' ? 'Devis accepté !' : 'Devis refusé.');
      loadQuote();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setResponding(false);
    }
  };

  const payDeposit = async () => {
    setPaying(true);
    try {
      const result = await authRequest(`/quote-requests/${quoteId}/pay-deposit`, token, { method: 'POST' });
      if (result.checkoutUrl) {
        window.location.assign(result.checkoutUrl);
        return;
      }

      throw new Error('Impossible de lancer le paiement Stripe. Verifiez la configuration Stripe.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setPaying(false);
    }
  };

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

  const downloadPdf = () => {
    if (!quote?.finalEstimation) {
      toast.warning("Ce devis n'est pas encore répondu.");
      return;
    }
    const now = new Date();
    pdfMake
      .createPdf({
        pageMargins: [40, 80, 40, 60],
        header: {
          margin: [40, 20, 40, 0],
          columns: [
            { text: 'Ulysse Media', fontSize: 24, bold: true, color: '#00266f' },
            { text: 'Devis client', fontSize: 9, alignment: 'right', color: '#747683' },
          ],
        },
        footer: (currentPage, pageCount) => ({
          margin: [40, 0, 40, 20],
          columns: [
            { text: `Généré le ${now.toLocaleDateString('fr-FR')}`, fontSize: 9, color: '#747683' },
            { text: `${currentPage}/${pageCount}`, fontSize: 9, alignment: 'right', color: '#747683' },
          ],
        }),
        content: [
          { text: `Devis #${quote.id}`, fontSize: 18, bold: true, margin: [0, 0, 0, 12] },
          { text: `Service: ${quote.serviceName || quote.serviceType}`, margin: [0, 0, 0, 6] },
          {
            table: {
              widths: ['*', '*'],
              body: [
                ['Montant', `${quote.finalEstimation.amount} ${quote.finalEstimation.currency || 'EUR'}`],
                ['Délai (jours)', String(quote.finalEstimation.deliveryDays || '-')],
                ['Détail', quote.finalEstimation.breakdown || '-'],
              ],
            },
            layout: {
              fillColor: (rowIndex) => (rowIndex % 2 === 0 ? '#f4f7ff' : null),
              hLineColor: () => '#b4c5ff',
              vLineColor: () => '#b4c5ff',
            },
          },
        ],
      })
      .download(`devis_${quote.id}.pdf`);
  };

  return (
    <div className="min-h-screen bg-surface">
      <MainNav />
      <main className="pt-28 pb-16 px-4 md:px-8 max-w-7xl mx-auto space-y-6">
        {/* Page header */}
        <header className="bg-white border border-outline-variant/20 rounded-2xl p-6">
          <Link to="/mes-devis" className="text-sm font-semibold text-primary">
            ← Retour à mes devis
          </Link>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-primary">Demande de devis</h1>
              <p className="text-sm text-on-surface-variant mt-1">
                {quote ? (quote.serviceName || quote.serviceType) : ''}
                {quote?.dateCreation
                  ? ` · ${new Date(quote.dateCreation).toLocaleDateString('fr-FR')}`
                  : ''}
              </p>
            </div>
            {quote && (
              <div className="flex items-center gap-3">
                <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${statusColor[quote.statut] || 'bg-surface-container text-on-surface'}`}>
                  {statusLabel[quote.statut] || quote.statut}
                </span>
                {quote.assignedEmployeeName && (
                  <span className="text-sm text-on-surface-variant">
                    Employé: <span className="font-semibold">{quote.assignedEmployeeName}</span>
                  </span>
                )}
              </div>
            )}
          </div>
        </header>

        {loading && <p className="text-on-surface-variant">Chargement...</p>}
        {!loading && !quote && <p className="text-on-surface-variant">Demande introuvable.</p>}

        {quote && (
          <div className="grid xl:grid-cols-[1.2fr_0.8fr] gap-6 items-start">
            {/* ── Left column: brief sections ── */}
            <div className="space-y-6">
              {/* 1 – Description */}
              <section className="bg-white border border-outline-variant/20 rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center text-primary font-bold text-sm">1</div>
                  <h2 className="text-lg font-bold">Cœur du projet</h2>
                </div>
                <p className="whitespace-pre-wrap text-on-surface-variant">{quote.description}</p>
                <div className="grid sm:grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl bg-surface-container-low p-3">
                    <p className="text-xs text-outline mb-1">Budget</p>
                    <p className="font-semibold">{quote.budget || '—'}</p>
                  </div>
                  <div className="rounded-xl bg-surface-container-low p-3">
                    <p className="text-xs text-outline mb-1">Deadline souhaitée</p>
                    <p className="font-semibold">{quote.deadline || '—'}</p>
                  </div>
                </div>
              </section>

              {/* 2 – Identité visuelle */}
              <section className="bg-white border border-outline-variant/20 rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center text-primary font-bold text-sm">2</div>
                  <h2 className="text-lg font-bold">Identité visuelle</h2>
                </div>
                <div>
                  <p className="text-sm font-semibold mb-3">Couleurs sélectionnées</p>
                  {paletteSwatches.length ? (
                    <div className="flex flex-wrap gap-2">
                      {paletteSwatches.map((s) => (
                        <div key={s.label} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-container-low">
                          <div
                            className="w-6 h-6 rounded-lg border border-outline-variant/20 flex-shrink-0"
                            style={{ background: s.color || '#ffffff' }}
                          />
                          <span className="text-sm">{s.label}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-on-surface-variant">Aucune couleur sélectionnée.</p>
                  )}
                </div>
                {quote.paletteCouleur && (
                  <div>
                    <p className="text-sm font-semibold mb-1">Précisions palette</p>
                    <p className="text-sm text-on-surface-variant whitespace-pre-wrap">{quote.paletteCouleur}</p>
                  </div>
                )}
              </section>

              {/* 3 – Inspiration */}
              <section className="bg-white border border-outline-variant/20 rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center text-primary font-bold text-sm">3</div>
                  <h2 className="text-lg font-bold">Inspiration & références</h2>
                </div>
                {quote.inspirationLink && (
                  <div>
                    <p className="text-sm font-semibold mb-1">Lien d'inspiration</p>
                    <a href={quote.inspirationLink} target="_blank" rel="noreferrer" className="text-primary underline text-sm break-all">
                      {quote.inspirationLink}
                    </a>
                  </div>
                )}
                {quote.inspiration && (
                  <div>
                    <p className="text-sm font-semibold mb-1">Description</p>
                    <p className="text-sm text-on-surface-variant whitespace-pre-wrap">{quote.inspiration}</p>
                  </div>
                )}
                {quote.contraintes && (
                  <div>
                    <p className="text-sm font-semibold mb-1">Contraintes</p>
                    <p className="text-sm text-on-surface-variant whitespace-pre-wrap">{quote.contraintes}</p>
                  </div>
                )}
              </section>

              {/* 4 – Fichiers */}
              {(imageFiles.length > 0 || otherFiles.length > 0) && (
                <section className="bg-white border border-outline-variant/20 rounded-2xl p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center text-primary font-bold text-sm">4</div>
                    <h2 className="text-lg font-bold">Fichiers envoyés</h2>
                  </div>
                  {imageFiles.length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {imageFiles.map((file, index) => (
                        <button
                          key={file.id || file.url}
                          type="button"
                          onClick={() => setActiveImageIndex(index)}
                          className="rounded-xl overflow-hidden border border-outline-variant/20 text-left hover:border-primary/40 transition-colors"
                        >
                          <img
                            src={getUploadUrl(file.url)}
                            alt={file.name}
                            className="w-full h-32 object-cover"
                          />
                          <p className="p-2 text-xs truncate text-on-surface-variant">{file.name}</p>
                        </button>
                      ))}
                    </div>
                  )}
                  {otherFiles.length > 0 && (
                    <div className="space-y-2">
                      {otherFiles.map((file) => (
                        <a
                          key={file.id || file.url}
                          href={getUploadUrl(file.url)}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 text-primary underline text-sm break-all"
                        >
                          <span className="material-symbols-outlined text-base flex-shrink-0">attach_file</span>
                          {file.name || file.url}
                        </a>
                      ))}
                    </div>
                  )}
                </section>
              )}
            </div>

            {/* ── Right column: Réponse au devis ── */}
            <div className="space-y-6 xl:sticky xl:top-28">
              {/* Status card */}
              <div className="bg-white border border-outline-variant/20 rounded-2xl p-5 space-y-3">
                <h3 className="text-base font-bold">Statut de la demande</h3>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex px-3 py-1.5 rounded-full text-sm font-semibold ${statusColor[quote.statut] || 'bg-surface-container text-on-surface'}`}>
                    {statusLabel[quote.statut] || quote.statut}
                  </span>
                </div>
                {quote.assignedEmployeeName && (
                  <p className="text-sm">
                    <span className="text-on-surface-variant">Chargé de dossier: </span>
                    <span className="font-semibold">{quote.assignedEmployeeName}</span>
                  </p>
                )}
              </div>

              {/* Response card */}
              <div className="bg-white border border-outline-variant/20 rounded-2xl p-5 space-y-4">
                <h3 className="text-base font-bold">Réponse au devis</h3>
                {quote.finalEstimation ? (
                  <>
                    <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 space-y-2">
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-extrabold text-emerald-700">
                          {quote.finalEstimation.amount}
                        </span>
                        <span className="text-sm text-emerald-600 font-medium">
                          {quote.finalEstimation.currency || 'EUR'}
                        </span>
                      </div>
                      {quote.finalEstimation.deliveryDays && (
                        <p className="text-sm text-emerald-800">
                          <span className="font-semibold">Délai:</span>{' '}
                          {quote.finalEstimation.deliveryDays} jours
                        </p>
                      )}
                      {quote.finalEstimation.breakdown && (
                        <div>
                          <p className="text-sm font-semibold text-emerald-800 mb-1">Détail</p>
                          <p className="text-sm text-emerald-700 whitespace-pre-wrap">
                            {quote.finalEstimation.breakdown}
                          </p>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={downloadPdf}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-blue-300 bg-blue-50 text-blue-700 font-semibold hover:bg-blue-100 transition-colors"
                    >
                      <span className="material-symbols-outlined text-base">download</span>
                      Télécharger le PDF
                    </button>

                    {/* Accept / Refuse buttons — only when status is REPONDU and no response yet */}
                    {quote.statut === 'REPONDU' && !quote.clientResponse && (
                      <div className="space-y-2 pt-1">
                        <p className="text-sm font-semibold text-on-surface">Votre décision :</p>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => respondToQuote('ACCEPTE')}
                            disabled={responding}
                            className="flex items-center justify-center gap-1 px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                          >
                            <span className="material-symbols-outlined text-base">check_circle</span>
                            Accepter
                          </button>
                          <button
                            type="button"
                            onClick={() => respondToQuote('REFUSE')}
                            disabled={responding}
                            className="flex items-center justify-center gap-1 px-4 py-2.5 rounded-xl bg-red-100 border border-red-300 text-red-700 font-semibold hover:bg-red-200 disabled:opacity-50 transition-colors"
                          >
                            <span className="material-symbols-outlined text-base">cancel</span>
                            Refuser
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Pending deposit payment */}
                    {quote.statut === 'EN_ATTENTE_PAIEMENT' && (
                      <div className="space-y-3 bg-orange-50 border border-orange-200 rounded-xl p-4">
                        <p className="text-sm font-bold text-orange-800">Acompte requis (10%)</p>
                        <p className="text-sm text-orange-700">
                          Pour démarrer votre projet, veuillez régler un acompte de{' '}
                          <span className="font-bold">
                            {Math.round(quote.finalEstimation.amount * 0.1 * 100) / 100} {quote.finalEstimation.currency || 'EUR'}
                          </span>
                          {' '}(10% de {quote.finalEstimation.amount} {quote.finalEstimation.currency || 'EUR'}).
                        </p>
                        <button
                          type="button"
                          onClick={payDeposit}
                          disabled={paying}
                          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-orange-600 text-white font-semibold hover:bg-orange-700 disabled:opacity-50 transition-colors"
                        >
                          <span className="material-symbols-outlined text-base">payment</span>
                          {paying ? 'Traitement...' : 'Payer l\'acompte'}
                        </button>
                      </div>
                    )}

                    {/* Chat open — project started */}
                    {quote.statut === 'ACCEPTE' && quote.depositPaid && (
                      <button
                        type="button"
                        onClick={() => navigate(`/mes-devis/${quoteId}/chat`)}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-white font-semibold hover:opacity-90 transition-colors"
                      >
                        <span className="material-symbols-outlined text-base">chat</span>
                        Ouvrir le chat projet
                      </button>
                    )}

                    {/* Refused */}
                    {quote.statut === 'REFUSE' && (
                      <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700 text-center">
                        Vous avez refusé ce devis.
                      </div>
                    )}
                  </>
                ) : (
                  <div className="rounded-xl bg-surface-container-low p-4 text-center space-y-2">
                    <span className="material-symbols-outlined text-3xl text-outline">hourglass_empty</span>
                    <p className="text-sm text-on-surface-variant">
                      Votre demande est en cours de traitement. Vous recevrez une notification dès qu'une réponse est disponible.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {activeImageIndex !== null && (
        <ImageLightbox
          images={imageFiles.map((f) => ({ id: f.id || f.url, label: f.name, url: getUploadUrl(f.url) }))}
          currentIndex={activeImageIndex}
          onClose={() => setActiveImageIndex(null)}
          onPrev={() => setActiveImageIndex((prev) => (prev - 1 + imageFiles.length) % imageFiles.length)}
          onNext={() => setActiveImageIndex((prev) => (prev + 1) % imageFiles.length)}
        />
      )}
    </div>
  );
}

export default ClientQuoteRequestDetailPage;
