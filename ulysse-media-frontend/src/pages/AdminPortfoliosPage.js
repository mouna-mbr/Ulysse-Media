import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { authRequest } from '../api';
import { useAuth } from '../auth-context';
import { useToast } from '../toast-context';
import AdminCatalogCard from '../components/admin/AdminCatalogCard';
import AdminAddCard from '../components/admin/AdminAddCard';
import ConfirmDialog from '../components/ConfirmDialog';

pdfMake.vfs = pdfFonts.pdfMake ? pdfFonts.pdfMake.vfs : pdfFonts.vfs;
const PAGE_SIZE = 6;

function AdminPortfoliosPage() {
  const { token } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [portfolios, setPortfolios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [filterType, setFilterType] = useState('TOUS');
  const [page, setPage] = useState(1);
  const [confirmState, setConfirmState] = useState({ open: false, title: '', message: '', onConfirm: null, danger: true });

  useEffect(() => {
    setLoading(true);
    authRequest('/portfolios', token)
      .then((result) => setPortfolios(result.portfolios || []))
      .catch((error) => toast.error(error.message))
      .finally(() => setLoading(false));
  }, [token, toast]);

  const filteredPortfolios = useMemo(() => portfolios.filter((portfolio) => {
    const matchesQuery = `${portfolio.title} ${portfolio.description}`.toLowerCase().includes(query.toLowerCase());
    const matchesType = filterType === 'TOUS' || portfolio.assets.some((asset) => asset.type === filterType.toLowerCase());
    return matchesQuery && matchesType;
  }), [portfolios, query, filterType]);

  const paginated = filteredPortfolios.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filteredPortfolios.length / PAGE_SIZE));

  const closeConfirm = () => {
    setConfirmState({ open: false, title: '', message: '', onConfirm: null, danger: true });
  };

  const askConfirm = ({ title, message, onConfirm, danger = true }) => {
    setConfirmState({ open: true, title, message, onConfirm, danger });
  };

  const deletePortfolio = async (portfolioId) => {
    askConfirm({
      title: 'Supprimer le portfolio',
      message: 'Supprimer ce portfolio ? Cette action est irreversible.',
      onConfirm: async () => {
        closeConfirm();
        try {
          await authRequest(`/portfolios/${portfolioId}`, token, { method: 'DELETE' });
          setPortfolios((prev) => prev.filter((portfolio) => portfolio.id !== portfolioId));
          toast.success('Portfolio supprime.');
        } catch (error) {
          toast.error(error.message);
        }
      }
    });
  };

  const exportPdf = () => {
    if (filteredPortfolios.length === 0) {
      toast.warning('Aucun portfolio a exporter.');
      return;
    }

    const tableBody = [
      [
        { text: 'Titre', fontSize: 10, bold: true, color: '#00266f' },
        { text: 'Description', fontSize: 10, bold: true, color: '#00266f' },
        { text: 'Ressources', fontSize: 10, bold: true, color: '#00266f' }
      ]
    ];

    filteredPortfolios.forEach((portfolio) => {
      tableBody.push([
        { text: portfolio.title || '', fontSize: 9, color: '#131b2e' },
        { text: portfolio.description || '-', fontSize: 9, color: '#131b2e' },
        { text: String(portfolio.assets.length), fontSize: 9, color: '#131b2e' }
      ]);
    });

    const now = new Date();
    const docDefinition = {
      pageMargins: [40, 80, 40, 60],
      header: (currentPage) => ({
        margin: [40, 20, 40, 0],
        columns: [
          {
            text: 'Ulysse Media',
            fontSize: 24,
            bold: true,
            color: '#00266f'
          },
          {
            text: `Page ${currentPage}`,
            fontSize: 9,
            alignment: 'right',
            color: '#747683'
          }
        ]
      }),
      footer: (currentPage, pageCount) => ({
        margin: [40, 0, 40, 20],
        columns: [
          {
            text: `Genere le ${now.toLocaleDateString('fr-FR')} a ${now.toLocaleTimeString('fr-FR')}`,
            fontSize: 9,
            color: '#747683'
          },
          {
            text: `${currentPage}/${pageCount}`,
            fontSize: 9,
            alignment: 'right',
            color: '#747683'
          }
        ]
      }),
      content: [
        {
          text: 'Liste des portfolios',
          fontSize: 13,
          bold: true,
          color: '#000000',
          alignment: 'center',
          marginBottom: 20
        },
        {
          table: {
            headerRows: 1,
            widths: ['*', '*', 90],
            body: tableBody
          },
          layout: {
            fillColor: (rowIndex) => (rowIndex === 0 ? '#dbe1ff' : null),
            hLineColor: () => '#b4c5ff',
            vLineColor: () => '#b4c5ff',
            hLineWidth: () => 1,
            vLineWidth: () => 1,
            paddingLeft: () => 8,
            paddingRight: () => 8,
            paddingTop: () => 6,
            paddingBottom: () => 6
          }
        }
      ]
    };

    pdfMake.createPdf(docDefinition).download(`portfolios_${now.getTime()}.pdf`);
    toast.success('PDF exporte avec succes.');
  };

  return (
    <section className="space-y-8">
      <header className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-primary tracking-tight">Portfolios</h1>
          <p className="mt-2 text-on-surface-variant">Liste separee des portfolios avec recherche, filtres et pagination.</p>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={exportPdf} className="px-4 py-3 rounded-xl border-2 border-blue-500 bg-blue-50 text-blue-600 font-semibold hover:bg-blue-100 transition-colors flex items-center gap-2"><span className="material-symbols-outlined text-lg">download</span>Télécharger en PDF</button>
          <Link to="/backoffice/admin/portfolios/nouveau" className="px-4 py-3 rounded-xl bg-primary text-white font-semibold">Ajouter portfolio</Link>
        </div>
      </header>

      <section className="bg-white border border-outline-variant/20 rounded-3xl p-5 md:p-6 space-y-5">
        <div className="grid md:grid-cols-[1fr_auto_auto] gap-3">
          <input className="rounded-xl bg-surface-container-highest border-none" placeholder="Recherche portfolio..." value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} />
          <select className="rounded-xl bg-surface-container-highest border-none" value={filterType} onChange={(e) => { setFilterType(e.target.value); setPage(1); }}>
            <option value="TOUS">Tous les types</option>
            <option value="IMAGE">Images</option>
            <option value="PDF">PDF</option>
            <option value="LINK">Liens</option>
            <option value="FILE">Fichiers</option>
          </select>
          <div className="px-4 py-3 rounded-xl bg-surface-container-low text-sm text-on-surface-variant">{filteredPortfolios.length} resultat(s)</div>
        </div>

        {loading ? <p className="text-on-surface-variant">Chargement...</p> : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {paginated.map((portfolio) => (
              <AdminCatalogCard
                key={portfolio.id}
                title={portfolio.title}
                subtitle={`${portfolio.assets.length} ressource(s)`}
                description={portfolio.description || 'Portfolio sans description'}
                image={portfolio.assets.find((asset) => asset.type === 'image')?.url || ''}
                accentLabel={portfolio.assets.map((asset) => asset.type).slice(0, 2).join(' / ') || 'Sans media'}
                onEdit={() => navigate(`/backoffice/admin/portfolios/${portfolio.id}/modifier`)}
                onDelete={() => deletePortfolio(portfolio.id)}
                onClick={() => navigate(`/backoffice/admin/portfolios/${portfolio.id}`)}
              />
            ))}
            <AdminAddCard to="/backoffice/admin/portfolios/nouveau" label="Ajouter un autre portfolio" />
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <button type="button" disabled={page <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))} className="px-4 py-2 rounded-xl bg-surface-container disabled:opacity-50">Précédent</button>
          <p className="text-sm text-on-surface-variant">Page {page} / {totalPages}</p>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))} className="px-4 py-2 rounded-xl bg-surface-container disabled:opacity-50">Suivant</button>
        </div>
      </section>

      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        onCancel={closeConfirm}
        onConfirm={() => confirmState.onConfirm && confirmState.onConfirm()}
        confirmText="Supprimer"
        cancelText="Annuler"
        danger={confirmState.danger}
      />
    </section>
  );
}

export default AdminPortfoliosPage;
