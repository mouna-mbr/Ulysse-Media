import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import MainNav from '../components/MainNav';
import { request } from '../api';

function ServiceCard({ service }) {
  return (
    <article className="bg-surface-container-lowest rounded-2xl overflow-hidden border border-outline-variant/15 shadow-sm hover:shadow-xl transition-shadow">
      <div className="h-56 bg-slate-100">
        <img
          src={service.coverImage || 'https://images.unsplash.com/photo-1559028012-481c04fa702d?w=1200'}
          alt={service.name}
          className="w-full h-full object-cover"
        />
      </div>
      <div className="p-6 space-y-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-secondary font-semibold">{service.category}</p>
          <h3 className="text-2xl font-extrabold text-on-surface mt-2">{service.name}</h3>
          <p className="text-on-surface-variant mt-2 line-clamp-3">{service.description}</p>
        </div>

        <div className="flex flex-wrap gap-4 text-sm">
          <div>
            <p className="text-on-surface-variant">Prix</p>
            <p className="font-bold text-primary">{service.priceNote || 'A partir de'} {service.startingPrice ? `${service.startingPrice} EUR` : ''}</p>
          </div>
          <div>
            <p className="text-on-surface-variant">Delai</p>
            <p className="font-bold text-on-surface">{service.timelineRange || 'A definir'}</p>
          </div>
        </div>

        <Link
          to={`/services/${service.id}`}
          className="inline-flex items-center gap-2 rounded-xl bg-primary text-white px-5 py-3 font-semibold hover:bg-primary-container transition-colors"
        >
          Voir details
          <span className="material-symbols-outlined text-base">arrow_forward</span>
        </Link>
      </div>
    </article>
  );
}

function ServicesPage() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    request('/services')
      .then((result) => setServices(result.services || []))
      .catch((fetchError) => setError(fetchError.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="bg-surface min-h-screen text-on-surface">
      <MainNav />
      <main className="pt-28 pb-20 px-4 md:px-8 max-w-7xl mx-auto">
        <header className="mb-12 md:mb-16 max-w-3xl">
          <p className="text-xs uppercase tracking-[0.24em] font-bold text-secondary mb-4">Catalogue Services</p>
          <h1 className="text-4xl md:text-6xl font-extrabold text-primary tracking-tight">Choisissez votre service</h1>
          <p className="text-secondary mt-4 text-lg">Consultez nos offres, les livrables inclus et des exemples de projets pour lancer votre collaboration avec Ulysse Media.</p>
        </header>

        {loading && <p className="text-on-surface-variant">Chargement des services...</p>}
        {error && <p className="text-error">{error}</p>}

        {!loading && !error && services.length === 0 && (
          <div className="rounded-2xl bg-surface-container-low p-8 border border-outline-variant/15">
            <p className="text-on-surface-variant">Aucun service n'est disponible pour le moment.</p>
          </div>
        )}

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {services.map((service) => (
            <ServiceCard key={service.id} service={service} />
          ))}
        </section>
      </main>
    </div>
  );
}

export default ServicesPage;
