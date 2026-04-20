import { Link, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import MainNav from '../components/MainNav';
import ImageLightbox from '../components/ImageLightbox';
import { request } from '../api';

function ServiceDetailPage() {
  const { id } = useParams();
  const [service, setService] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeImageIndex, setActiveImageIndex] = useState(null);

  const imageAssets = (service?.portfolio?.assets || []).filter((asset) => asset.type === 'image');

  const closeLightbox = () => setActiveImageIndex(null);
  const goPrevImage = () => {
    if (activeImageIndex === null || imageAssets.length === 0) return;
    setActiveImageIndex((prev) => (prev - 1 + imageAssets.length) % imageAssets.length);
  };
  const goNextImage = () => {
    if (activeImageIndex === null || imageAssets.length === 0) return;
    setActiveImageIndex((prev) => (prev + 1) % imageAssets.length);
  };

  useEffect(() => {
    request(`/services/${id}`)
      .then((result) => setService(result.service || null))
      .catch((fetchError) => setError(fetchError.message))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <div className="min-h-screen bg-surface text-on-surface">
      <MainNav />
      <main className="pt-28 pb-20 px-4 md:px-8 max-w-7xl mx-auto">
        {loading && <p className="text-on-surface-variant">Chargement...</p>}
        {error && <p className="text-error">{error}</p>}

        {!loading && !error && !service && (
          <div className="text-center py-20">
            <h1 className="text-3xl font-bold text-primary mb-4">Service non trouve</h1>
            <Link to="/services" className="text-primary underline">Retour aux services</Link>
          </div>
        )}

        {service && (
          <>
            <section className="grid md:grid-cols-2 gap-8 mb-12">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-secondary font-bold mb-3">{service.category}</p>
                <h1 className="text-4xl font-extrabold text-primary mb-4">{service.name}</h1>
                <p className="text-lg text-on-surface-variant mb-6">{service.description}</p>

                <div className="flex gap-8 mb-8">
                  <div>
                    <p className="text-sm text-on-surface-variant">Prix</p>
                    <p className="font-bold text-xl">{service.priceNote || 'A partir de'} {service.startingPrice ? `${service.startingPrice} EUR` : ''}</p>
                  </div>
                  <div>
                    <p className="text-sm text-on-surface-variant">Delai</p>
                    <p className="font-bold text-xl">{service.timelineRange || 'A definir'}</p>
                  </div>
                </div>

                <Link
                  to={`/client/devis/${service.id}`}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary text-white px-6 py-3 font-bold hover:bg-primary-container transition-colors"
                >
                  Demander un devis
                  <span className="material-symbols-outlined text-base">arrow_forward</span>
                </Link>
              </div>

              <div className="rounded-2xl overflow-hidden shadow-xl">
                <img
                  src={service.coverImage || 'https://images.unsplash.com/photo-1517048676732-d65bc937f952?w=1200'}
                  alt={service.name}
                  className="w-full h-full object-cover"
                />
              </div>
            </section>

            <section className="grid lg:grid-cols-2 gap-8 mb-12">
              <article className="rounded-2xl bg-surface-container-lowest p-8 border border-outline-variant/15">
                <h2 className="text-2xl font-bold mb-5">Ce qui est inclus</h2>
                <ul className="space-y-3">
                  {(service.included || []).map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-on-surface">
                      <span className="material-symbols-outlined text-primary text-lg">check_circle</span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </article>

              <article className="rounded-2xl bg-surface-container-lowest p-8 border border-outline-variant/15">
                <h2 className="text-2xl font-bold mb-5">Portfolio</h2>
                {!service.portfolio ? (
                  <p className="text-on-surface-variant">Aucun portfolio associe a ce service.</p>
                ) : (
                  <div className="space-y-5">
                    <div>
                      <p className="font-semibold text-lg">{service.portfolio.title}</p>
                      <p className="text-sm text-on-surface-variant mt-1">{service.portfolio.description || 'Portfolio sans description.'}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {imageAssets.map((asset, index) => (
                        <div key={asset.id} className="space-y-2">
                          <button
                            type="button"
                            onClick={() => setActiveImageIndex(index)}
                            className="rounded-xl overflow-hidden aspect-square bg-slate-100 block w-full"
                          >
                            <img src={asset.url} alt={asset.label} className="w-full h-full object-cover hover:scale-105 transition-transform" />
                          </button>
                          <p className="text-sm font-semibold">{asset.label}</p>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-2">
                      {(service.portfolio.assets || []).filter((asset) => asset.type !== 'image').map((asset) => (
                        <a key={asset.id} href={asset.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-primary underline">
                          <span className="material-symbols-outlined text-base">attach_file</span>
                          {asset.label}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </article>
            </section>
          </>
        )}
      </main>

      {activeImageIndex !== null && (
        <ImageLightbox
          images={imageAssets}
          currentIndex={activeImageIndex}
          onClose={closeLightbox}
          onPrev={goPrevImage}
          onNext={goNextImage}
        />
      )}
    </div>
  );
}

export default ServiceDetailPage;
