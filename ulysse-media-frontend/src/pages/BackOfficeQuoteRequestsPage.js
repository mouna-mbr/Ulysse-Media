import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { authRequest } from '../api';
import { useAuth } from '../auth-context';
import { useToast } from '../toast-context';

pdfMake.vfs = pdfFonts.pdfMake ? pdfFonts.pdfMake.vfs : pdfFonts.vfs;
const PAGE_SIZE = 8;

const statusLabel = {
  EN_ATTENTE: 'En attente',
  AFFECTE: 'Affecte',
  ETUDE_ENVOYEE: 'Etude envoyee',
  REPONDU: 'Repondu',
  EN_ATTENTE_PAIEMENT: 'Attente paiement',
  ACCEPTE: 'Accepte',
  REFUSE: 'Refuse'
};

const statusClass = {
  EN_ATTENTE: 'bg-amber-100 text-amber-700',
  AFFECTE: 'bg-blue-100 text-blue-700',
  ETUDE_ENVOYEE: 'bg-violet-100 text-violet-700',
  REPONDU: 'bg-emerald-100 text-emerald-700',
  EN_ATTENTE_PAIEMENT: 'bg-orange-100 text-orange-700',
  ACCEPTE: 'bg-emerald-100 text-emerald-700',
  REFUSE: 'bg-red-100 text-red-700'
};

function BackOfficeQuoteRequestsPage() {
  const { user, token } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [quoteRequests, setQuoteRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [serviceFilter, setServiceFilter] = useState('TOUS');
  const [statusFilter, setStatusFilter] = useState('TOUS');
  const [employeeFilter, setEmployeeFilter] = useState('TOUS');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    authRequest('/quote-requests', token)
      .then((result) => setQuoteRequests(result.quoteRequests || []))
      .catch((error) => toast.error(error.message))
      .finally(() => setLoading(false));
  }, [token, toast]);

  const filteredQuotes = useMemo(() => {
    const q = query.toLowerCase();
    return quoteRequests.filter((item) => {
      const matchesQuery = `${item.clientName || ''} ${item.serviceType || ''} ${item.statut || ''}`.toLowerCase().includes(q);
      const matchesService = serviceFilter === 'TOUS' || (item.serviceName || item.serviceType) === serviceFilter;
      const matchesStatus = statusFilter === 'TOUS' || item.statut === statusFilter;
      const matchesEmployee = employeeFilter === 'TOUS' || (item.assignedEmployeeName || 'Non affecte') === employeeFilter;
      return matchesQuery && matchesService && matchesStatus && matchesEmployee;
    });
  }, [quoteRequests, query, serviceFilter, statusFilter, employeeFilter]);

  const services = useMemo(() => ['TOUS', ...Array.from(new Set(quoteRequests.map((item) => item.serviceName || item.serviceType).filter(Boolean)))], [quoteRequests]);
  const employees = useMemo(() => ['TOUS', ...Array.from(new Set(quoteRequests.map((item) => item.assignedEmployeeName || 'Non affecte').filter(Boolean)))], [quoteRequests]);
  const totalPages = Math.max(1, Math.ceil(filteredQuotes.length / PAGE_SIZE));
  const paginatedQuotes = filteredQuotes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const exportPdf = () => {
    if (filteredQuotes.length === 0) {
      toast.warning('Aucune demande a exporter.');
      return;
    }

    const tableBody = [[
      { text: 'Client', fontSize: 10, bold: true, color: '#00266f' },
      { text: 'Service', fontSize: 10, bold: true, color: '#00266f' },
      { text: 'Statut', fontSize: 10, bold: true, color: '#00266f' },
      { text: 'Employe', fontSize: 10, bold: true, color: '#00266f' },
      { text: 'Date', fontSize: 10, bold: true, color: '#00266f' }
    ]];

    filteredQuotes.forEach((quote) => {
      tableBody.push([
        { text: quote.clientName || quote.clientId, fontSize: 9, color: '#131b2e' },
        { text: quote.serviceName || quote.serviceType, fontSize: 9, color: '#131b2e' },
        { text: statusLabel[quote.statut] || quote.statut, fontSize: 9, color: '#131b2e' },
        { text: quote.assignedEmployeeName || 'Non affecte', fontSize: 9, color: '#131b2e' },
        { text: new Date(quote.dateCreation).toLocaleDateString('fr-FR'), fontSize: 9, color: '#131b2e' }
      ]);
    });

    const now = new Date();
    pdfMake.createPdf({
      pageMargins: [40, 80, 40, 60],
      header: (currentPage) => ({
        margin: [40, 20, 40, 0],
        columns: [
          { text: 'Ulysse Media', fontSize: 24, bold: true, color: '#00266f' },
          { text: `Page ${currentPage}`, fontSize: 9, alignment: 'right', color: '#747683' }
        ]
      }),
      footer: (currentPage, pageCount) => ({
        margin: [40, 0, 40, 20],
        columns: [
          { text: `Genere le ${now.toLocaleDateString('fr-FR')} a ${now.toLocaleTimeString('fr-FR')}`, fontSize: 9, color: '#747683' },
          { text: `${currentPage}/${pageCount}`, fontSize: 9, alignment: 'right', color: '#747683' }
        ]
      }),
      content: [
        { text: 'Demandes de devis', fontSize: 13, bold: true, alignment: 'center', marginBottom: 20 },
        {
          table: { headerRows: 1, widths: ['*', '*', 80, '*', 70], body: tableBody },
          layout: {
            fillColor: (rowIndex) => (rowIndex === 0 ? '#dbe1ff' : null),
            hLineColor: () => '#b4c5ff',
            vLineColor: () => '#b4c5ff',
            paddingLeft: () => 8,
            paddingRight: () => 8,
            paddingTop: () => 6,
            paddingBottom: () => 6
          }
        }
      ]
    }).download(`demandes_devis_${now.getTime()}.pdf`);
  };

  return (
    <section className="space-y-6">
      <header className="rounded-2xl">
        <h1 className="text-3xl font-bold text-primary">Demandes de devis</h1>
        <p className="mt-2 text-on-surface-variant">
          {user?.role === 'ADMIN' ? 'Vue globale de toutes les demandes clients.' : 'Demandes qui vous sont assignees.'}
        </p>
      </header>

      <section className="bg-white border border-outline-variant/20 rounded-2xl p-6 space-y-4">
        <div className="grid lg:grid-cols-[1fr_auto_auto_auto_auto] gap-3">
          <input
            className="rounded-xl bg-surface-container-highest border-none"
            placeholder="Rechercher une demande..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
          />
          <select className="rounded-xl bg-surface-container-highest border-none" value={serviceFilter} onChange={(e) => { setServiceFilter(e.target.value); setPage(1); }}>
            {services.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select className="rounded-xl bg-surface-container-highest border-none" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="TOUS">Tous les statuts</option>
            {Object.keys(statusLabel).map((item) => <option key={item} value={item}>{statusLabel[item]}</option>)}
          </select>
          {user?.role === 'ADMIN' ? (
            <select className="rounded-xl bg-surface-container-highest border-none" value={employeeFilter} onChange={(e) => { setEmployeeFilter(e.target.value); setPage(1); }}>
              {employees.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          ) : <div className="rounded-xl bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">{filteredQuotes.length} demande(s)</div>}
          <button type="button" onClick={exportPdf} className="px-4 py-3 rounded-xl border border-blue-300 bg-blue-50 text-blue-700 font-semibold">Exporter PDF</button>
        </div>

        {loading ? (
          <p className="text-on-surface-variant py-6">Chargement...</p>
        ) : filteredQuotes.length === 0 ? (
          <p className="text-on-surface-variant py-6">Aucune demande a afficher.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-outline-variant/30 bg-surface-container-low">
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Service</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Affectation</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedQuotes.map((quote) => (
                  <tr key={quote.id} className="border-b border-outline-variant/20 hover:bg-surface-container-low transition-colors">
                    <td className="px-4 py-3">{quote.clientName || quote.clientId}</td>
                    <td className="px-4 py-3">{quote.serviceName || quote.serviceType}</td>
                    <td className="px-4 py-3">{new Date(quote.dateCreation).toLocaleDateString('fr-FR')}</td>
                    <td className="px-4 py-3">{quote.assignedEmployeeName || 'Non affecte'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${statusClass[quote.statut] || 'bg-slate-100 text-slate-700'}`}>
                        {statusLabel[quote.statut] || quote.statut}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => navigate(`/backoffice/devis/${quote.id}`)}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-300 text-blue-700 font-semibold"
                      >
                        <span className="material-symbols-outlined text-base">visibility</span>
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <button type="button" disabled={page <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))} className="px-4 py-2 rounded-xl bg-surface-container disabled:opacity-50">Precedent</button>
          <p className="text-sm text-on-surface-variant">Page {page} / {totalPages}</p>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))} className="px-4 py-2 rounded-xl bg-surface-container disabled:opacity-50">Suivant</button>
        </div>
      </section>
    </section>
  );
}

export default BackOfficeQuoteRequestsPage;
