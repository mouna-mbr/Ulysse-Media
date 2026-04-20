import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { authRequest } from '../api';
import { useAuth } from '../auth-context';
import { useToast } from '../toast-context';
import ImageLightbox from '../components/ImageLightbox';

function AdminPortfolioDetailPage() {
  const { portfolioId } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const toast = useToast();

  const [portfolio, setPortfolio] = useState(null);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeImageIndex, setActiveImageIndex] = useState(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      authRequest(`/portfolios/${portfolioId}`, token),
      authRequest('/services', token)
    ])
      .then(([portfolioResult, servicesResult]) => {
        setPortfolio(portfolioResult.portfolio || null);
        setServices((servicesResult.services || []).filter((service) => service.portfolioId === portfolioId));
      })
      .catch((error) => toast.error(error.message))
      .finally(() => setLoading(false));
  }, [portfolioId, token, toast]);

  const imageAssets = useMemo(() => (portfolio?.assets || []).filter((asset) => asset.type === 'image'), [portfolio]);
  const fileAssets = useMemo(() => (portfolio?.assets || []).filter((asset) => asset.type !== 'image'), [portfolio]);
  const closeLightbox = () => setActiveImageIndex(null);
  const goPrevImage = () => {
    if (activeImageIndex === null || imageAssets.length === 0) return;
    setActiveImageIndex((prev) => (prev - 1 + imageAssets.length) % imageAssets.length);
  };
  const goNextImage = () => {
    if (activeImageIndex === null || imageAssets.length === 0) return;
    setActiveImageIndex((prev) => (prev + 1) % imageAssets.length);
  };

  if (loading) {
    return <p className="text-on-surface-variant">Chargement...</p>;
  }

  if (!portfolio) {
    return (
      <section className="space-y-4">
        <Link to="/backoffice/admin/portfolios" className="text-sm font-semibold text-primary">← Retour aux portfolios</Link>
        <p className="text-on-surface-variant">Portfolio introuvable.</p>
      </section>
    );
  }

  return (
    <section className="space-y-8">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <Link to="/backoffice/admin/portfolios" className="text-sm font-semibold text-primary">← Retour aux portfolios</Link>
          <h1 className="text-3xl font-bold text-primary tracking-tight mt-2">{portfolio.title}</h1>
          <p className="text-on-surface-variant mt-1">Consultation du portfolio en lecture seule.</p>
        </div>
        <button
          type="button"
          onClick={() => navigate(`/backoffice/admin/portfolios/${portfolio.id}/modifier`)}
          className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-primary text-white font-semibold"
        >
          <span className="material-symbols-outlined">edit</span>
          Modifier
        </button>
      </header>

      <section className="grid lg:grid-cols-[1.2fr_0.8fr] gap-6">
        <article className="bg-white border border-outline-variant/20 rounded-3xl p-6 space-y-5">
          <div>
            <h2 className="text-xl font-bold text-primary">Description</h2>
            <p className="text-on-surface mt-2">{portfolio.description || 'Portfolio sans description.'}</p>
          </div>

          <div className="border-t border-outline-variant/20 pt-5">
            <h2 className="text-xl font-bold text-primary mb-4">Images ({imageAssets.length})</h2>
            {imageAssets.length ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {imageAssets.map((asset, index) => (
                  <button key={asset.id} type="button" onClick={() => setActiveImageIndex(index)} className="block rounded-2xl overflow-hidden border border-outline-variant/20 text-left">
                    <img src={asset.url} alt={asset.label} className="w-full h-44 object-cover hover:scale-105 transition-transform" />
                    <p className="p-3 text-sm font-semibold">{asset.label}</p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-on-surface-variant">Aucune image.</p>
            )}
          </div>

          <div className="border-t border-outline-variant/20 pt-5">
            <h2 className="text-xl font-bold text-primary mb-4">Documents et liens ({fileAssets.length})</h2>
            {fileAssets.length ? (
              <div className="space-y-3">
                {fileAssets.map((asset) => (
                  <a key={asset.id} href={asset.url} target="_blank" rel="noreferrer" className="flex items-center justify-between p-3 rounded-xl border border-outline-variant/20 hover:bg-surface-container-low transition-colors">
                    <span className="text-sm font-semibold">{asset.label}</span>
                    <span className="text-xs uppercase tracking-wide text-primary">{asset.type}</span>
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-on-surface-variant">Aucun document ou lien.</p>
            )}
          </div>
        </article>

        <article className="bg-white border border-outline-variant/20 rounded-3xl p-6 space-y-4 h-fit">
          <h2 className="text-xl font-bold text-primary">Services relies ({services.length})</h2>
          {services.length ? (
            <div className="space-y-2">
              {services.map((service) => (
                <button
                  key={service.id}
                  type="button"
                  onClick={() => navigate(`/backoffice/admin/services/${service.id}`)}
                  className="w-full text-left p-3 rounded-xl border border-outline-variant/20 hover:bg-surface-container-low transition-colors"
                >
                  <p className="font-semibold text-on-surface">{service.name}</p>
                  <p className="text-xs text-on-surface-variant mt-1">{service.category || 'Sans categorie'}</p>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-on-surface-variant">Aucun service ne reference ce portfolio.</p>
          )}
        </article>
      </section>

      {activeImageIndex !== null && (
        <ImageLightbox
          images={imageAssets}
          currentIndex={activeImageIndex}
          onClose={closeLightbox}
          onPrev={goPrevImage}
          onNext={goNextImage}
        />
      )}
    </section>
  );
}

export default AdminPortfolioDetailPage;
