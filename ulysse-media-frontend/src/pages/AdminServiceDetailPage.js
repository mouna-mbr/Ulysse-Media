import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { authRequest } from '../api';
import { useAuth } from '../auth-context';
import { useToast } from '../toast-context';
import ImageLightbox from '../components/ImageLightbox';

function AdminServiceDetailPage() {
  const { serviceId } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const toast = useToast();

  const [service, setService] = useState(null);
  const [loading, setLoading] = useState(true);
  const [coverOpen, setCoverOpen] = useState(false);

  const coverImage = service?.coverImage || 'https://images.unsplash.com/photo-1517048676732-d65bc937f952?w=1200';

  useEffect(() => {
    setLoading(true);
    authRequest(`/services/${serviceId}`, token)
      .then((result) => setService(result.service || null))
      .catch((error) => toast.error(error.message))
      .finally(() => setLoading(false));
  }, [serviceId, token, toast]);

  if (loading) {
    return <p className="text-on-surface-variant">Chargement...</p>;
  }

  if (!service) {
    return (
      <section className="space-y-4">
        <Link to="/backoffice/admin/services" className="text-sm font-semibold text-primary">← Retour aux services</Link>
        <p className="text-on-surface-variant">Service introuvable.</p>
      </section>
    );
  }

  return (
    <section className="space-y-8">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <Link to="/backoffice/admin/services" className="text-sm font-semibold text-primary">← Retour aux services</Link>
          <h1 className="text-3xl font-bold text-primary tracking-tight mt-2">{service.name}</h1>
          <p className="text-on-surface-variant mt-1">Consultation du service en lecture seule.</p>
        </div>
        <button
          type="button"
          onClick={() => navigate(`/backoffice/admin/services/${service.id}/modifier`)}
          className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-primary text-white font-semibold"
        >
          <span className="material-symbols-outlined">edit</span>
          Modifier
        </button>
      </header>

      <section className="grid lg:grid-cols-2 gap-6">
        <article className="bg-white border border-outline-variant/20 rounded-3xl overflow-hidden">
          <div className="h-64 bg-surface-container-low">
            <button type="button" className="w-full h-full" onClick={() => setCoverOpen(true)}>
              <img
                src={coverImage}
                alt={service.name}
                className="w-full h-full object-cover hover:scale-105 transition-transform"
              />
            </button>
          </div>
          <div className="p-6 space-y-3">
            <p className="text-sm text-on-surface-variant">Categorie: <span className="font-semibold text-on-surface">{service.category || '-'}</span></p>
            <p className="text-sm text-on-surface-variant">Prix: <span className="font-semibold text-on-surface">{service.priceNote || 'A partir de'} {service.startingPrice || ''} EUR</span></p>
            <p className="text-sm text-on-surface-variant">Delai: <span className="font-semibold text-on-surface">{service.timelineRange || 'A definir'}</span></p>
            <p className="text-sm text-on-surface-variant">Description</p>
            <p className="text-on-surface">{service.description}</p>
          </div>
        </article>

        <article className="bg-white border border-outline-variant/20 rounded-3xl p-6 space-y-5">
          <div>
            <h2 className="text-xl font-bold text-primary">Livrables inclus</h2>
            <ul className="mt-3 space-y-2">
              {(service.included || []).length ? (service.included || []).map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-on-surface">
                  <span className="material-symbols-outlined text-primary text-lg">check_circle</span>
                  <span>{feature}</span>
                </li>
              )) : <li className="text-on-surface-variant">Aucun livrable defini.</li>}
            </ul>
          </div>

          <div className="border-t border-outline-variant/20 pt-5 space-y-3">
            <h2 className="text-xl font-bold text-primary">Portfolio lie</h2>
            {!service.portfolio ? (
              <p className="text-on-surface-variant">Aucun portfolio lie.</p>
            ) : (
              <>
                <p className="font-semibold text-on-surface">{service.portfolio.title}</p>
                <p className="text-sm text-on-surface-variant">{service.portfolio.description || 'Portfolio sans description.'}</p>
                <button
                  type="button"
                  onClick={() => navigate(`/backoffice/admin/portfolios/${service.portfolio.id}`)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-50 border border-blue-300 text-blue-700 font-semibold"
                >
                  <span className="material-symbols-outlined text-base">visibility</span>
                  Consulter le portfolio
                </button>
              </>
            )}
          </div>
        </article>
      </section>

      {coverOpen && (
        <ImageLightbox
          images={[{ id: 'cover', label: service.name, url: coverImage }]}
          currentIndex={0}
          onClose={() => setCoverOpen(false)}
          onPrev={() => {}}
          onNext={() => {}}
        />
      )}
    </section>
  );
}

export default AdminServiceDetailPage;
