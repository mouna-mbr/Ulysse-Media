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

function AdminServicesPage() {
  const { token } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('TOUTES');
  const [page, setPage] = useState(1);
  const [confirmState, setConfirmState] = useState({ open: false, title: '', message: '', onConfirm: null, danger: true });

  useEffect(() => {
    setLoading(true);
    authRequest('/services', token)
      .then((result) => setServices(result.services || []))
      .catch((error) => toast.error(error.message))
      .finally(() => setLoading(false));
  }, [token, toast]);

  const categories = useMemo(() => ['TOUTES', ...Array.from(new Set(services.map((service) => service.category).filter(Boolean)))], [services]);

  const filteredServices = useMemo(() => services.filter((service) => {
    const matchesQuery = `${service.name} ${service.description}`.toLowerCase().includes(query.toLowerCase());
    const matchesCategory = category === 'TOUTES' || service.category === category;
    return matchesQuery && matchesCategory;
  }), [services, query, category]);

  const totalPages = Math.max(1, Math.ceil(filteredServices.length / PAGE_SIZE));
  const paginatedServices = filteredServices.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const closeConfirm = () => {
    setConfirmState({ open: false, title: '', message: '', onConfirm: null, danger: true });
  };

  const askConfirm = ({ title, message, onConfirm, danger = true }) => {
    setConfirmState({ open: true, title, message, onConfirm, danger });
  };

  const deleteService = async (serviceId) => {
    askConfirm({
      title: 'Supprimer le service',
      message: 'Supprimer ce service ? Cette action est irreversible.',
      onConfirm: async () => {
        closeConfirm();
        try {
          await authRequest(`/services/${serviceId}`, token, { method: 'DELETE' });
          setServices((prev) => prev.filter((service) => service.id !== serviceId));
          toast.success('Service supprime.');
        } catch (error) {
          toast.error(error.message);
        }
      }
    });
  };

  const exportPdf = () => {
    if (filteredServices.length === 0) {
      toast.warning('Aucun service a exporter.');
      return;
    }

    const tableBody = [
      [
        { text: 'Nom', fontSize: 10, bold: true, color: '#00266f' },
        { text: 'Categorie', fontSize: 10, bold: true, color: '#00266f' },
        { text: 'Prix', fontSize: 10, bold: true, color: '#00266f' },
        { text: 'Portfolio', fontSize: 10, bold: true, color: '#00266f' }
      ]
    ];

    filteredServices.forEach((service) => {
      tableBody.push([
        { text: service.name || '', fontSize: 9, color: '#131b2e' },
        { text: service.category || '-', fontSize: 9, color: '#131b2e' },
        { text: `${service.priceNote || 'A partir de'} ${service.startingPrice || ''}`, fontSize: 9, color: '#131b2e' },
        { text: service.portfolio?.title || '-', fontSize: 9, color: '#131b2e' }
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
          text: 'Liste des services',
          fontSize: 13,
          bold: true,
          color: '#000000',
          alignment: 'center',
          marginBottom: 20
        },
        {
          table: {
            headerRows: 1,
            widths: ['*', 110, 130, '*'],
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

    pdfMake.createPdf(docDefinition).download(`services_${now.getTime()}.pdf`);
    toast.success('PDF exporte avec succes.');
  };

  return (
    <section className="space-y-8">
      <header className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-primary tracking-tight">Services</h1>
          <p className="mt-2 text-on-surface-variant">Liste des services dans une interface separee de l'ajout et du portfolio.</p>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={exportPdf} className="px-4 py-3 rounded-xl border-2 border-blue-500 bg-blue-50 text-blue-600 font-semibold hover:bg-blue-100 transition-colors flex items-center gap-2"><span className="material-symbols-outlined text-lg">download</span>Télécharger en PDF</button>
          <Link to="/backoffice/admin/services/nouveau" className="px-4 py-3 rounded-xl bg-primary text-white font-semibold">Ajouter service</Link>
        </div>
      </header>

      <section className="bg-white border border-outline-variant/20 rounded-3xl p-5 md:p-6 space-y-5">
        <div className="grid md:grid-cols-[1fr_auto_auto] gap-3">
          <input className="rounded-xl bg-surface-container-highest border-none" placeholder="Recherche service..." value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} />
          <select className="rounded-xl bg-surface-container-highest border-none" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>
            {categories.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <div className="px-4 py-3 rounded-xl bg-surface-container-low text-sm text-on-surface-variant">{filteredServices.length} resultat(s)</div>
        </div>

        {loading ? <p className="text-on-surface-variant">Chargement...</p> : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {paginatedServices.map((service) => (
              <AdminCatalogCard
                key={service.id}
                title={service.name}
                subtitle={`${service.category || 'Sans categorie'} • ${service.timelineRange || 'Delai a definir'}`}
                description={service.description}
                image={service.coverImage}
                accentLabel={service.portfolio ? `${service.portfolio.title} • ${service.portfolio.assets.length} assets` : 'Sans portfolio'}
                onEdit={() => navigate(`/backoffice/admin/services/${service.id}/modifier`)}
                onDelete={() => deleteService(service.id)}
                onClick={() => navigate(`/backoffice/admin/services/${service.id}`)}
              >
                <span className="text-[11px] font-semibold text-primary whitespace-nowrap">{service.startingPrice || 0} EUR</span>
              </AdminCatalogCard>
            ))}
            <AdminAddCard to="/backoffice/admin/services/nouveau" label="Ajouter un autre service" />
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

export default AdminServicesPage;
