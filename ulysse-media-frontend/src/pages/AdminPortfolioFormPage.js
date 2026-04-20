import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { API_BASE_URL, authRequest } from '../api';
import { useAuth } from '../auth-context';
import { useToast } from '../toast-context';

const initialForm = {
  title: '',
  description: ''
};

const initialLink = {
  label: '',
  url: '',
  type: 'link'
};

function AdminPortfolioFormPage() {
  const { token } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { portfolioId } = useParams();
  const isEdit = Boolean(portfolioId);

  const [form, setForm] = useState(initialForm);
  const [assets, setAssets] = useState([]);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [newLink, setNewLink] = useState(initialLink);
  const [relatedServices, setRelatedServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      authRequest('/services', token),
      isEdit ? authRequest(`/portfolios/${portfolioId}`, token) : Promise.resolve({ portfolio: null })
    ])
      .then(([servicesResult, portfolioResult]) => {
        if (!mounted) return;
        setRelatedServices((servicesResult.services || []).filter((service) => service.portfolioId === portfolioId));
        if (portfolioResult.portfolio) {
          setForm({
            title: portfolioResult.portfolio.title,
            description: portfolioResult.portfolio.description || ''
          });
          setAssets(portfolioResult.portfolio.assets || []);
        }
      })
      .catch((error) => toast.error(error.message))
      .finally(() => mounted && setLoading(false));

    return () => {
      mounted = false;
    };
  }, [token, isEdit, portfolioId, toast]);

  const addLinkAsset = () => {
    if (!newLink.url.trim()) {
      toast.warning('Ajoutez une URL valide.');
      return;
    }
    setAssets((prev) => [
      ...prev,
      {
        id: `tmp-${Date.now()}`,
        label: newLink.label || 'Ressource',
        type: newLink.type,
        url: newLink.url
      }
    ]);
    setNewLink(initialLink);
  };

  const removeAsset = (assetId) => {
    setAssets((prev) => prev.filter((asset) => asset.id !== assetId));
  };

  const submitPortfolio = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const data = new FormData();
      data.append('title', form.title);
      data.append('description', form.description);
      data.append('assets', JSON.stringify(assets));
      pendingFiles.forEach((file) => data.append('assetFiles', file));

      const response = await fetch(`${API_BASE_URL}/portfolios${isEdit ? `/${portfolioId}` : ''}`, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: data
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || 'Impossible de sauvegarder le portfolio.');
      toast.success(isEdit ? 'Portfolio modifie.' : 'Portfolio ajoute.');
      navigate('/backoffice/admin/portfolios');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const groupedStats = useMemo(() => ({
    images: assets.filter((asset) => asset.type === 'image').length + pendingFiles.filter((file) => file.type.startsWith('image/')).length,
    pdfs: assets.filter((asset) => asset.type === 'pdf').length + pendingFiles.filter((file) => file.type === 'application/pdf').length,
    links: assets.filter((asset) => asset.type === 'link').length,
    files: assets.filter((asset) => asset.type === 'file').length + pendingFiles.filter((file) => !file.type.startsWith('image/') && file.type !== 'application/pdf').length
  }), [assets, pendingFiles]);

  if (loading) {
    return <p className="text-on-surface-variant">Chargement...</p>;
  }

  return (
    <section className="space-y-8">
      <header>
        <Link to="/backoffice/admin/portfolios" className="text-sm font-semibold text-primary">← Retour aux portfolios</Link>
        <h1 className="text-3xl font-bold text-primary tracking-tight mt-2">{isEdit ? 'Modifier le portfolio' : 'Ajouter un portfolio'}</h1>
      </header>

      <form onSubmit={submitPortfolio} className="grid xl:grid-cols-[1.15fr_0.85fr] gap-6">
        <article className="bg-white border border-outline-variant/20 rounded-3xl p-6 md:p-8 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-on-surface-variant mb-2">Titre du portfolio</label>
            <input className="w-full rounded-xl bg-surface-container-highest border-none" value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} required />
          </div>
          <div>
            <label className="block text-sm font-semibold text-on-surface-variant mb-2">Description</label>
            <textarea className="w-full rounded-xl bg-surface-container-highest border-none" rows={4} value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} />
          </div>

          <div className="rounded-2xl bg-surface-container-low p-4 space-y-4">
            <h2 className="text-lg font-bold">Ajouter des liens / PDFs externes</h2>
            <div className="grid md:grid-cols-3 gap-3">
              <input className="rounded-xl bg-white border-none" placeholder="Libelle" value={newLink.label} onChange={(e) => setNewLink((prev) => ({ ...prev, label: e.target.value }))} />
              <input className="rounded-xl bg-white border-none" placeholder="https://..." value={newLink.url} onChange={(e) => setNewLink((prev) => ({ ...prev, url: e.target.value }))} />
              <select className="rounded-xl bg-white border-none" value={newLink.type} onChange={(e) => setNewLink((prev) => ({ ...prev, type: e.target.value }))}>
                <option value="link">Lien</option>
                <option value="pdf">PDF externe</option>
              </select>
            </div>
            <button type="button" onClick={addLinkAsset} className="px-4 py-3 rounded-xl bg-primary text-white font-semibold">Ajouter cette ressource</button>
          </div>

          <div>
            <label className="block text-sm font-semibold text-on-surface-variant mb-2">Uploader plusieurs fichiers</label>
            <input type="file" multiple className="w-full rounded-xl bg-blue-100 border border-blue-300 text-blue-900 file:mr-4 file:rounded-lg file:border-0 file:bg-blue-700 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-blue-800" onChange={(e) => setPendingFiles(Array.from(e.target.files || []))} />
          </div>

          <div className="pt-3 flex gap-3">
            <button type="submit" disabled={submitting} className="px-5 py-3 rounded-xl bg-primary text-white font-semibold disabled:opacity-70">{submitting ? 'Enregistrement...' : isEdit ? 'Modifier le portfolio' : 'Ajouter le portfolio'}</button>
            <Link to="/backoffice/admin/portfolios" className="px-5 py-3 rounded-xl bg-surface-container text-on-surface font-semibold">Annuler</Link>
          </div>
        </article>

        <article className="bg-white border border-outline-variant/20 rounded-3xl p-6 md:p-8 space-y-5">
          <div>
            <h2 className="text-xl font-bold">Ressources du portfolio</h2>
            <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
              <div className="rounded-2xl bg-surface-container-low p-4">Images: <span className="font-bold">{groupedStats.images}</span></div>
              <div className="rounded-2xl bg-surface-container-low p-4">PDF: <span className="font-bold">{groupedStats.pdfs}</span></div>
              <div className="rounded-2xl bg-surface-container-low p-4">Liens: <span className="font-bold">{groupedStats.links}</span></div>
              <div className="rounded-2xl bg-surface-container-low p-4">Fichiers: <span className="font-bold">{groupedStats.files}</span></div>
            </div>
          </div>

          <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
            {assets.map((asset) => (
              <div key={asset.id} className="rounded-2xl border border-outline-variant/20 p-4 flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{asset.label}</p>
                  <p className="text-xs text-on-surface-variant uppercase tracking-wider mt-1">{asset.type}</p>
                  <a href={asset.url} target="_blank" rel="noreferrer" className="text-xs text-primary break-all mt-2 block">{asset.url}</a>
                </div>
                <button type="button" onClick={() => removeAsset(asset.id)} className="text-xs px-3 py-1.5 rounded-lg bg-error-container text-on-error-container">Supprimer</button>
              </div>
            ))}
            {pendingFiles.map((file) => (
              <div key={file.name} className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                <p className="font-semibold text-primary">Fichier en attente</p>
                <p className="text-sm text-on-surface-variant mt-1">{file.name}</p>
              </div>
            ))}
            {assets.length === 0 && pendingFiles.length === 0 && <p className="text-sm text-on-surface-variant">Aucune ressource ajoutee.</p>}
          </div>

          {isEdit && (
            <div className="rounded-2xl bg-surface-container-low p-4">
              <p className="font-semibold text-on-surface">Services relies</p>
              <p className="text-sm text-on-surface-variant mt-2">{relatedServices.length ? relatedServices.map((service) => service.name).join(', ') : 'Aucun service ne reference encore ce portfolio.'}</p>
            </div>
          )}
        </article>
      </form>
    </section>
  );
}

export default AdminPortfolioFormPage;
