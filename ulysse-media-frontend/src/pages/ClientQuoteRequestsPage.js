import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import MainNav from '../components/MainNav';
import { authRequest } from '../api';
import { useAuth } from '../auth-context';
import { useToast } from '../toast-context';

pdfMake.vfs = pdfFonts.pdfMake ? pdfFonts.pdfMake.vfs : pdfFonts.vfs;

const statusLabel = {
  EN_ATTENTE: 'En attente',
  AFFECTE: 'Affecte',
  ETUDE_ENVOYEE: 'Etude en cours',
  REPONDU: 'Repondu'
};

function ClientQuoteRequestsPage() {
  const { token } = useAuth();
  const toast = useToast();

  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      authRequest('/quote-requests', token),
      authRequest('/quote-requests/mark-seen-all', token, { method: 'PATCH' })
    ])
      .then(([result]) => setQuotes(result.quoteRequests || []))
      .catch((error) => toast.error(error.message))
      .finally(() => setLoading(false));
  }, [token, toast]);

  const ordered = useMemo(() => [...quotes].sort((a, b) => new Date(b.dateCreation) - new Date(a.dateCreation)), [quotes]);

  const downloadPdf = (quote) => {
    if (!quote.finalEstimation) {
      toast.warning('Ce devis n\'est pas encore repondu.');
      return;
    }

    const now = new Date();
    const docDefinition = {
      pageMargins: [40, 80, 40, 60],
      header: {
        margin: [40, 20, 40, 0],
        columns: [
          { text: 'Ulysse Media', fontSize: 24, bold: true, color: '#00266f' },
          { text: 'Devis client', fontSize: 9, alignment: 'right', color: '#747683' }
        ]
      },
      footer: (currentPage, pageCount) => ({
        margin: [40, 0, 40, 20],
        columns: [
          { text: `Genere le ${now.toLocaleDateString('fr-FR')}`, fontSize: 9, color: '#747683' },
          { text: `${currentPage}/${pageCount}`, fontSize: 9, alignment: 'right', color: '#747683' }
        ]
      }),
      content: [
        { text: `Devis #${quote.id}`, fontSize: 18, bold: true, margin: [0, 0, 0, 12] },
        { text: `Service: ${quote.serviceName || quote.serviceType}`, margin: [0, 0, 0, 6] },
        { text: `Statut: ${statusLabel[quote.statut] || quote.statut}`, margin: [0, 0, 0, 16] },
        {
          table: {
            widths: ['*', '*'],
            body: [
              ['Montant', `${quote.finalEstimation.amount} ${quote.finalEstimation.currency || 'EUR'}`],
              ['Delai (jours)', String(quote.finalEstimation.deliveryDays || '-')],
              ['Detail', quote.finalEstimation.breakdown || '-']
            ]
          },
          layout: {
            fillColor: (rowIndex) => (rowIndex % 2 === 0 ? '#f4f7ff' : null),
            hLineColor: () => '#b4c5ff',
            vLineColor: () => '#b4c5ff'
          }
        }
      ]
    };

    pdfMake.createPdf(docDefinition).download(`devis_${quote.id}.pdf`);
  };

  return (
    <div className="min-h-screen bg-surface">
      <MainNav />
      <main className="pt-28 pb-16 px-4 md:px-8 max-w-6xl mx-auto space-y-6">
        <header className="bg-white border border-outline-variant/20 rounded-2xl p-6">
          <h1 className="text-3xl font-bold text-primary">Mes demandes de devis</h1>
          <p className="mt-2 text-on-surface-variant">Consultez le statut et telechargez vos devis repondus.</p>
        </header>

        <section className="bg-white border border-outline-variant/20 rounded-2xl p-6">
          {loading ? (
            <p className="text-on-surface-variant">Chargement...</p>
          ) : ordered.length === 0 ? (
            <p className="text-on-surface-variant">Aucune demande de devis pour le moment.</p>
          ) : (
            <div className="space-y-4">
              {ordered.map((quote) => (
                <article key={quote.id} className="border border-outline-variant/20 rounded-xl p-4 space-y-3">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold">{quote.serviceName || quote.serviceType}</h2>
                      <p className="text-sm text-on-surface-variant">{new Date(quote.dateCreation).toLocaleDateString('fr-FR')}</p>
                    </div>
                    <span className="inline-flex px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 w-fit">
                      {statusLabel[quote.statut] || quote.statut}
                    </span>
                  </div>

                  <p className="text-sm text-on-surface-variant line-clamp-3">{quote.description}</p>

                  {quote.finalEstimation ? (
                    <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm">
                      <p><span className="font-semibold">Montant:</span> {quote.finalEstimation.amount} {quote.finalEstimation.currency || 'EUR'}</p>
                      <p><span className="font-semibold">Delai:</span> {quote.finalEstimation.deliveryDays || '-'} jours</p>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    {(quote.files || []).map((file) => (
                      <a key={file.id || file.url} href={file.url} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-lg bg-surface-container-low text-primary text-sm underline">
                        {file.name || 'Fichier'}
                      </a>
                    ))}
                  </div>

                  <div className="pt-1">
                    <div className="flex flex-wrap gap-2">
                      <Link to={`/mes-devis/${quote.id}`} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white font-semibold">
                        <span className="material-symbols-outlined text-base">visibility</span>
                        Consulter
                      </Link>
                      <button
                        type="button"
                        onClick={() => downloadPdf(quote)}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-blue-300 bg-blue-50 text-blue-700 font-semibold"
                      >
                        <span className="material-symbols-outlined text-base">download</span>
                        Telecharger PDF
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default ClientQuoteRequestsPage;
