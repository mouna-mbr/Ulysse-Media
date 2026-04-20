import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { API_BASE_URL, authRequest } from '../api';
import { useAuth } from '../auth-context';
import { useToast } from '../toast-context';

const initialService = {
  name: '',
  category: '',
  description: '',
  startingPrice: 0,
  priceNote: 'A partir de',
  timelineRange: '',
  includedText: '',
  portfolioId: ''
};

const initialQuickPortfolio = {
  title: '',
  description: '',
  linkLabel: '',
  linkUrl: ''
};

function AdminServiceFormPage() {
  const { token } = useAuth();
  const { serviceId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const isEdit = Boolean(serviceId);

  const [form, setForm] = useState(initialService);
  const [coverFile, setCoverFile] = useState(null);
  const [portfolios, setPortfolios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showQuickPortfolio, setShowQuickPortfolio] = useState(false);
  const [quickPortfolio, setQuickPortfolio] = useState(initialQuickPortfolio);
  const [quickFiles, setQuickFiles] = useState([]);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      authRequest('/portfolios', token),
      isEdit ? authRequest(`/services/${serviceId}`, token) : Promise.resolve({ service: null })
    ])
      .then(([portfolioResult, serviceResult]) => {
        if (!mounted) return;
        setPortfolios(portfolioResult.portfolios || []);
        if (serviceResult.service) {
          setForm({
            name: serviceResult.service.name,
            category: serviceResult.service.category || '',
            description: serviceResult.service.description,
            startingPrice: serviceResult.service.startingPrice || 0,
            priceNote: serviceResult.service.priceNote || 'A partir de',
            timelineRange: serviceResult.service.timelineRange || '',
            includedText: (serviceResult.service.included || []).join(', '),
            portfolioId: serviceResult.service.portfolioId || ''
          });
        }
      })
      .catch((error) => toast.error(error.message))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [token, isEdit, serviceId, toast]);

  const selectedPortfolio = useMemo(
    () => portfolios.find((portfolio) => portfolio.id === form.portfolioId) || null,
    [portfolios, form.portfolioId]
  );

  const submitService = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const data = new FormData();
      data.append('name', form.name);
      data.append('category', form.category);
      data.append('description', form.description);
      data.append('startingPrice', String(form.startingPrice || 0));
      data.append('priceNote', form.priceNote);
      data.append('timelineRange', form.timelineRange);
      data.append('included', JSON.stringify(form.includedText.split(',').map((item) => item.trim()).filter(Boolean)));
      data.append('portfolioId', form.portfolioId || '');
      if (coverFile) data.append('coverImageFile', coverFile);

      const response = await fetch(`${API_BASE_URL}/services${isEdit ? `/${serviceId}` : ''}`, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: data
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || 'Impossible de sauvegarder le service.');

      toast.success(isEdit ? 'Service modifie.' : 'Service ajoute.');
      navigate('/backoffice/admin/services');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const createQuickPortfolio = async () => {
    if (!quickPortfolio.title.trim()) {
      toast.warning('Le titre du portfolio est requis.');
      return;
    }

    try {
      const data = new FormData();
      data.append('title', quickPortfolio.title);
      data.append('description', quickPortfolio.description);
      const assets = [];
      if (quickPortfolio.linkUrl.trim()) {
        assets.push({
          id: `tmp-${Date.now()}`,
          label: quickPortfolio.linkLabel || 'Lien externe',
          type: 'link',
          url: quickPortfolio.linkUrl
        });
      }
      data.append('assets', JSON.stringify(assets));
      quickFiles.forEach((file) => data.append('assetFiles', file));

      const response = await fetch(`${API_BASE_URL}/portfolios`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: data
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || 'Impossible de creer le portfolio.');

      const nextPortfolios = [result.portfolio, ...portfolios];
      setPortfolios(nextPortfolios);
      setForm((prev) => ({ ...prev, portfolioId: result.portfolio.id }));
      setQuickPortfolio(initialQuickPortfolio);
      setQuickFiles([]);
      setShowQuickPortfolio(false);
      toast.success('Portfolio cree et selectionne.');
    } catch (error) {
      toast.error(error.message);
    }
  };

  if (loading) {
    return <p className="text-on-surface-variant">Chargement...</p>;
  }

  return (
    <section className="space-y-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <Link to="/backoffice/admin/services" className="text-sm font-semibold text-primary">← Retour aux services</Link>
          <h1 className="text-3xl font-bold text-primary tracking-tight mt-2">{isEdit ? 'Modifier le service' : 'Ajouter un service'}</h1>
          <p className="mt-2 text-on-surface-variant">Le portfolio est choisi en bas du formulaire et reste distinct du service.</p>
        </div>
        <Link to="/backoffice/admin/portfolios/nouveau" className="px-4 py-3 rounded-xl bg-primary text-white font-semibold">Ajouter un portfolio</Link>
      </header>

      <form onSubmit={submitService} className="grid xl:grid-cols-[1.2fr_0.8fr] gap-6">
        <article className="bg-white border border-outline-variant/20 rounded-3xl p-6 md:p-8 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-on-surface-variant mb-2">Nom du service</label>
            <input className="w-full rounded-xl bg-surface-container-highest border-none" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} required />
          </div>
          <div>
            <label className="block text-sm font-semibold text-on-surface-variant mb-2">Categorie</label>
            <input className="w-full rounded-xl bg-surface-container-highest border-none" value={form.category} onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-on-surface-variant mb-2">Description</label>
            <textarea className="w-full rounded-xl bg-surface-container-highest border-none" rows={4} value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} required />
          </div>
          <div>
            <label className="block text-sm font-semibold text-on-surface-variant mb-2">Image de couverture</label>
            <input type="file" accept="image/*" className="w-full rounded-xl bg-blue-100 border border-blue-300 text-blue-900 file:mr-4 file:rounded-lg file:border-0 file:bg-blue-700 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-blue-800" onChange={(e) => setCoverFile(e.target.files?.[0] || null)} />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-on-surface-variant mb-2">Prix</label>
              <input type="number" className="w-full rounded-xl bg-surface-container-highest border-none" value={form.startingPrice} onChange={(e) => setForm((prev) => ({ ...prev, startingPrice: Number(e.target.value || 0) }))} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-on-surface-variant mb-2">Texte du prix</label>
              <input className="w-full rounded-xl bg-surface-container-highest border-none" value={form.priceNote} onChange={(e) => setForm((prev) => ({ ...prev, priceNote: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-on-surface-variant mb-2">Intervalle de delai</label>
            <input className="w-full rounded-xl bg-surface-container-highest border-none" value={form.timelineRange} onChange={(e) => setForm((prev) => ({ ...prev, timelineRange: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-on-surface-variant mb-2">Ce qui est inclus</label>
            <textarea className="w-full rounded-xl bg-surface-container-highest border-none" rows={3} placeholder="Logo, Carte de visite, Charte graphique" value={form.includedText} onChange={(e) => setForm((prev) => ({ ...prev, includedText: e.target.value }))} />
          </div>

          <div className="pt-3 flex gap-3">
            <button type="submit" disabled={submitting} className="px-5 py-3 rounded-xl bg-primary text-white font-semibold disabled:opacity-70">{submitting ? 'Enregistrement...' : isEdit ? 'Modifier le service' : 'Ajouter le service'}</button>
            <Link to="/backoffice/admin/services" className="px-5 py-3 rounded-xl bg-surface-container text-on-surface font-semibold">Annuler</Link>
          </div>
        </article>

        <article className="bg-white border border-outline-variant/20 rounded-3xl p-6 md:p-8 space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">Selection du portfolio</h2>
              <p className="text-sm text-on-surface-variant mt-1">Un service pointe vers un seul portfolio.</p>
            </div>
            <button type="button" onClick={() => setShowQuickPortfolio((prev) => !prev)} className="text-sm font-semibold text-primary">{showQuickPortfolio ? 'Fermer' : 'Creation rapide'}</button>
          </div>

          {showQuickPortfolio && (
            <div className="rounded-2xl bg-surface-container-low p-4 space-y-3 border border-outline-variant/20">
              <input className="w-full rounded-xl bg-white border-none" placeholder="Titre du portfolio" value={quickPortfolio.title} onChange={(e) => setQuickPortfolio((prev) => ({ ...prev, title: e.target.value }))} />
              <textarea className="w-full rounded-xl bg-white border-none" rows={3} placeholder="Description" value={quickPortfolio.description} onChange={(e) => setQuickPortfolio((prev) => ({ ...prev, description: e.target.value }))} />
              <input className="w-full rounded-xl bg-white border-none" placeholder="Libelle du lien" value={quickPortfolio.linkLabel} onChange={(e) => setQuickPortfolio((prev) => ({ ...prev, linkLabel: e.target.value }))} />
              <input className="w-full rounded-xl bg-white border-none" placeholder="https://" value={quickPortfolio.linkUrl} onChange={(e) => setQuickPortfolio((prev) => ({ ...prev, linkUrl: e.target.value }))} />
              <input type="file" multiple className="w-full rounded-xl bg-blue-100 border border-blue-300 text-blue-900 file:mr-4 file:rounded-lg file:border-0 file:bg-blue-700 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-blue-800" onChange={(e) => setQuickFiles(Array.from(e.target.files || []))} />
              <button type="button" onClick={createQuickPortfolio} className="w-full px-4 py-3 rounded-xl bg-primary text-white font-semibold">Creer ce portfolio maintenant</button>
            </div>
          )}

          <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
            {portfolios.map((portfolio) => (
              <label key={portfolio.id} className={`block rounded-2xl border p-4 cursor-pointer transition ${form.portfolioId === portfolio.id ? 'border-primary bg-primary/5' : 'border-outline-variant/20 bg-surface-container-lowest'}`}>
                <input type="radio" name="portfolioId" className="sr-only" checked={form.portfolioId === portfolio.id} onChange={() => setForm((prev) => ({ ...prev, portfolioId: portfolio.id }))} />
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-on-surface">{portfolio.title}</p>
                    <p className="text-xs text-on-surface-variant mt-1">{portfolio.assets.length} ressource(s)</p>
                    <p className="text-xs text-on-surface-variant mt-2 line-clamp-3">{portfolio.description || 'Aucune description'}</p>
                  </div>
                  {form.portfolioId === portfolio.id && <span className="material-symbols-outlined text-primary">check_circle</span>}
                </div>
              </label>
            ))}
            {portfolios.length === 0 && <p className="text-sm text-on-surface-variant">Aucun portfolio existant.</p>}
          </div>

          <div className="rounded-2xl bg-surface-container-low p-4">
            <p className="text-sm font-semibold text-on-surface">Portfolio selectionne</p>
            <p className="text-sm text-on-surface-variant mt-1">{selectedPortfolio ? selectedPortfolio.title : 'Aucun portfolio choisi'}</p>
          </div>
        </article>
      </form>
    </section>
  );
}

export default AdminServiceFormPage;
