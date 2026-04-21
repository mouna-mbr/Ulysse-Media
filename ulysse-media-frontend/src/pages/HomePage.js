import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { request } from '../api';
import MainNav from '../components/MainNav';

function HomePage() {
  const navigate = useNavigate();
  const [reviews, setReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviewsError, setReviewsError] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searchCategory, setSearchCategory] = useState('');

  useEffect(() => {
    const loadReviews = async () => {
      setReviewsLoading(true);
      setReviewsError(false);
      try {
        const res = await request('/reviews/public?limit=6');
        setReviews(res.reviews || []);
      } catch (_error) {
        setReviews([]);
        setReviewsError(true);
      } finally {
        setReviewsLoading(false);
      }
    };

    loadReviews();
  }, []);

  const submitSearch = (event) => {
    event.preventDefault();
    const params = new URLSearchParams();
    if (searchText.trim()) params.set('q', searchText.trim());
    if (searchCategory) params.set('category', searchCategory);
    const query = params.toString();
    navigate(query ? `/services?${query}` : '/services');
  };

  return (
    <div className="bg-surface text-on-surface antialiased">
      <MainNav />

      <header className="relative pt-32 pb-20 px-8 overflow-hidden">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center gap-12">
          <div className="flex-1 z-10">
            <span className="text-primary font-bold tracking-widest text-xs uppercase mb-4 block">Digital Excellence Studio</span>
            <h1 className="text-5xl md:text-7xl font-extrabold text-on-background leading-tight tracking-tight mb-6">
              Élevez la <span className="text-primary">voix de votre marque</span> avec une précision cinématographique.
            </h1>
            <p className="text-lg text-secondary max-w-lg mb-10 leading-relaxed">
              Ulysse Media fusionne marketing stratégique et production multimédia haut de gamme pour transformer votre vision en écosystème digital immersif.
            </p>

            <form onSubmit={submitSearch} className="bg-surface-container-lowest p-2 rounded-2xl shadow-xl flex flex-col md:flex-row gap-2 max-w-2xl border border-outline-variant/15">
              <div className="flex-1 flex items-center px-4 gap-3 bg-surface-container-low rounded-xl">
                <span className="material-symbols-outlined text-slate-400">search</span>
                <input
                  className="bg-transparent border-none focus:ring-0 w-full py-4 text-on-surface placeholder:text-slate-400"
                  placeholder="Quel service recherchez-vous ?"
                  type="text"
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                />
              </div>
              <div className="hidden lg:flex items-center px-4 border-l border-outline-variant/20">
                <select
                  className="bg-transparent border-none focus:ring-0 font-medium text-slate-600"
                  value={searchCategory}
                  onChange={(event) => setSearchCategory(event.target.value)}
                >
                  <option value="">Toutes les catégories</option>
                  <option value="Production Video">Production Vidéo</option>
                  <option value="Design Graphique">Design Graphique</option>
                  <option value="Marketing">Marketing</option>
                </select>
              </div>
              <button className="bg-primary text-white px-8 py-4 rounded-xl font-bold hover:bg-primary-container transition-all" type="submit">
                Rechercher
              </button>
            </form>
          </div>

          <div className="flex-1 relative">
            <div className="w-full aspect-[4/5] rounded-2xl overflow-hidden shadow-2xl relative">
              <img
                className="w-full h-full object-cover"
                alt="Modern high-end camera equipment on a gimbal in a minimalist studio with soft blue ambient lighting and cinematic atmosphere"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuBXCl0ZDm906s_zSn0PsnHTZZfe5VjxCOMmD3WS93nMXNkxF2toXIlFAc4ILh-kTpbuqoU0-1oC9xyaC1MlVy9-Auj1lrMNEUsQOHEEgLIrzWdm706huCWbSltFvUK_ApkCWLPZj6vS5ZCA8UJ46A0l5nH_wWVaTQEv0tf71WYf4mKO0DE4s9UHukLta4GWsU-z4pD7-XSD3A3odgeYsIXmugOOMDEtGz8U4AbOuSII3BRhNHeEiRyc-A3ukjOR1R0fkYj7pjtMqNp3"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-primary/40 to-transparent" />
            </div>

            <div className="absolute -bottom-6 -left-6 bg-surface-container-lowest p-6 rounded-2xl shadow-2xl border border-outline-variant/15 max-w-[200px]">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-yellow-500" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                <span className="font-bold text-on-background">4.9/5.0</span>
              </div>
              <p className="text-xs text-secondary leading-tight">Satisfaction client sur plus de 500 projets premium.</p>
            </div>
          </div>
        </div>
      </header>

      <section className="py-12 bg-surface-container-low" id="portfolio">
        <div className="max-w-7xl mx-auto px-8">
          <p className="text-center text-xs font-bold tracking-[0.2em] text-secondary uppercase mb-8 opacity-60">Ils nous font confiance</p>

          {reviewsLoading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {[1, 2, 3].map((item) => (
                <div key={item} className="h-36 animate-pulse rounded-2xl bg-slate-200" />
              ))}
            </div>
          ) : reviews.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {reviews.map((review) => (
                <article key={review.id} className="rounded-2xl border border-outline-variant/20 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-on-surface">{review.clientName || 'Client Ulysse'}</p>
                    <p className="text-xs font-semibold text-amber-600">{'★'.repeat(Number(review.rating || 0))}</p>
                  </div>
                  <p className="mt-2 text-sm text-slate-600 line-clamp-4">"{review.comment}"</p>
                  <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                    <span>{review.serviceName || 'Projet multimedia'}</span>
                    <span>{review.createdAt ? new Date(review.createdAt).toLocaleDateString('fr-FR') : ''}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : reviewsError ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
              Impossible de charger les avis clients pour le moment.
            </div>
          ) : (
            <div className="rounded-2xl border border-outline-variant/20 bg-white p-5 text-sm text-slate-500">
              Les avis clients seront bientot affiches ici.
            </div>
          )}
        </div>
      </section>

      <section className="py-24 px-8 bg-surface" id="services">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-end mb-16">
            <div className="max-w-2xl">
              <h2 className="text-4xl font-extrabold text-on-background mb-4">
                Nous créons des identités digitales qui <br /><span className="text-primary">captent l’attention.</span>
              </h2>
              <p className="text-secondary leading-relaxed">Nous proposons un éventail complet de solutions multimédia adaptées aux entreprises modernes.</p>
            </div>
            <Link to="/services" className="hidden md:flex items-center gap-2 text-primary font-bold group">
              Voir tous les services
              <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">arrow_forward</span>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            <div className="md:col-span-8 bg-surface-container-lowest rounded-2xl overflow-hidden border border-outline-variant/10 shadow-sm hover:shadow-xl transition-shadow group">
              <div className="h-80 overflow-hidden relative">
                <img
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  alt="Professional cinematographer filming a commercial with high-end production gear and creative studio lighting"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuB5VyQ9LwEfjrSPdQN9mzE3FaUEsH9T9jdS5A-R-Z87IWKrbP1Q8IfxeWxKt-W-NtmnyHTxuRM3CXBvP5S9JXt3Yw353rQfXtZGWQ84qJpply_YyHsZbm6jJuJAfwvRql1d0eCR28deRXpN68OKjksL7Og849pKMnlsItzrAm5ZA4hGWoi-Cnv8qLDPWXm5EkIjLA79YGGHWc96xRGmuxeZCyK92NxTMeky5YQMZLRA73KYeH4h94Y4O9WmRPju4XlpyOZ9K0s6OHv7"
                />
              </div>
              <div className="p-8">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-2xl font-bold text-on-background mb-2">Production Vidéo</h3>
                    <p className="text-secondary">Storytelling cinématographique de l’idée à la post-production. Nous réalisons publicités, documentaires et contenus sociaux.</p>
                  </div>
                  <span className="material-symbols-outlined text-primary text-4xl">movie</span>
                </div>
              </div>
            </div>

            <div className="md:col-span-4 bg-primary-container rounded-2xl p-8 flex flex-col justify-between text-white group cursor-pointer">
              <div>
                <span className="material-symbols-outlined text-4xl mb-6">brush</span>
                <h3 className="text-2xl font-bold mb-4">Design Graphique</h3>
                <p className="text-primary-fixed/70 leading-relaxed mb-6">Identités visuelles stratégiques, interfaces UX/UI et supports print sur mesure conçus pour durer.</p>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-bold">Explorer les créations</span>
                <span className="material-symbols-outlined">trending_flat</span>
              </div>
            </div>

            <div className="md:col-span-6 bg-surface-container-low rounded-2xl p-8 border border-outline-variant/10 group hover:bg-surface-container-high transition-colors">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary">campaign</span>
                </div>
                <h3 className="text-xl font-bold">Marketing Digital</h3>
              </div>
              <p className="text-secondary leading-relaxed mb-6">Stratégies de croissance pilotées par la donnée incluant SEO, publicité payante et campagnes sociales à forte conversion.</p>
              <div className="flex gap-2">
                <span className="px-3 py-1 bg-surface-container-lowest rounded-full text-xs font-semibold text-primary">SEO</span>
                <span className="px-3 py-1 bg-surface-container-lowest rounded-full text-xs font-semibold text-primary">Ads</span>
                <span className="px-3 py-1 bg-surface-container-lowest rounded-full text-xs font-semibold text-primary">Social</span>
              </div>
            </div>

            <div className="md:col-span-6 bg-surface-container-low rounded-2xl p-8 border border-outline-variant/10 group hover:bg-surface-container-high transition-colors">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary">camera_alt</span>
                </div>
                <h3 className="text-xl font-bold">Photographie Commerciale</h3>
              </div>
              <p className="text-secondary leading-relaxed mb-6">Photographie produit, portraits corporate et couverture événementielle qui capturent l’essence de votre marque.</p>
              <div className="flex gap-2">
                <span className="px-3 py-1 bg-surface-container-lowest rounded-full text-xs font-semibold text-primary">Product</span>
                <span className="px-3 py-1 bg-surface-container-lowest rounded-full text-xs font-semibold text-primary">Portraits</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-24 bg-surface-container-low" id="about">
        <div className="max-w-7xl mx-auto px-8">
          <div className="text-center mb-20">
            <h2 className="text-4xl font-extrabold text-on-background mb-4">Comment nous donnons vie à votre vision</h2>
            <p className="text-secondary">Un processus fluide pensé pour l’efficacité et l’excellence créative.</p>
          </div>
          <div className="relative">
            <div className="absolute top-1/2 left-0 w-full h-0.5 bg-outline-variant/20 -translate-y-1/2 hidden md:block" />
            <div className="grid grid-cols-1 md:grid-cols-4 gap-12 relative z-10">
              {[
                ['01', 'Découverte', 'Nous analysons votre ADN de marque et vos objectifs afin de définir une trajectoire stratégique claire.'],
                ['02', 'Concept', 'Nos équipes créatives imaginent et proposent des directions visuelles et stratégiques uniques.'],
                ['03', 'Exécution', 'Production, design et mise en place des campagnes sont menés avec précision.'],
                ['04', 'Livraison', 'Les livrables sont finalisés, lancés puis suivis avec une analyse d’impact rigoureuse.']
              ].map(([id, title, desc]) => (
                <div key={id} className="bg-surface p-8 rounded-2xl shadow-sm border border-outline-variant/10 text-center flex flex-col items-center">
                  <div className="w-16 h-16 bg-primary text-white rounded-2xl flex items-center justify-center text-2xl font-bold mb-6 shadow-xl shadow-primary/20">{id}</div>
                  <h4 className="text-xl font-bold mb-2">{title}</h4>
                  <p className="text-sm text-secondary leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-24 px-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-primary-container rounded-[3rem] p-12 md:p-24 relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-12">
            <div className="absolute top-0 right-0 w-96 h-96 bg-primary/20 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-400/10 rounded-full translate-y-1/2 -translate-x-1/2 blur-3xl" />
            <div className="z-10 max-w-xl text-center md:text-left">
              <h2 className="text-4xl md:text-5xl font-extrabold text-white mb-6 leading-tight">Prêt à transformer votre identité de marque ?</h2>
              <p className="text-primary-fixed/80 text-lg mb-8">Rejoignez les entreprises en forte croissance qui utilisent Ulysse Media pour dominer leur marché.</p>
              <div className="flex flex-wrap gap-4 justify-center md:justify-start">
                <Link to="/services" className="bg-white text-primary px-10 py-5 rounded-2xl font-black text-lg hover:scale-105 transition-transform shadow-2xl">
                  Explorer les services
                </Link>
                <Link className="border-2 border-primary-fixed/30 text-white px-10 py-5 rounded-2xl font-bold hover:bg-white/10 transition-colors" to="/contact">
                  Nous contacter
                </Link>
              </div>
            </div>
            <div className="z-10 bg-surface-container-lowest/10 backdrop-blur-md p-8 rounded-2xl border border-white/10 hidden lg:block">
              <div className="flex items-center gap-4 mb-4">
                <img
                  className="w-12 h-12 rounded-full object-cover"
                  alt="Portrait of a professional creative director with a warm expression"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuAVfgAiWkjX79RqkFc1YSvZ4xH4ygEbMEz6YE4Yretf3iljLoWfqLZ8SQlCgnTvwId-J851O5z4QzXrWkU3tbc8s3SB_sj75xmLsWCnPf0FoU-XOeuW4Cf0bE_dQCz4TYCfH7HdssAWycFLT1NbyX_3oPAVzR0cRquUgs5kKyJ2Iepujew99eCMCbqOzm9IsBnNmKztlxaZYbbRI5aC_Xbb4nk7L9yBFpbu6znGGuFmw5Eq89AZ3Ekc5VIhUl_rfc_ZeOZnuzJCK_aq"
                />
                <div>
                  <p className="font-bold text-white">Directeur Créatif</p>
                </div>
              </div>
              <p className="text-white italic leading-relaxed">"Nous ne créons pas seulement du contenu ; nous créons des impressions durables."</p>
            </div>
          </div>
        </div>
      </section>

      <footer className="w-full py-12 border-t border-slate-200/15 bg-slate-50">
        <div className="flex flex-col md:flex-row justify-between items-center px-12 max-w-7xl mx-auto">
          <p className="text-xs uppercase tracking-widest text-slate-400">© 2024 Ulysse Media. Tous droits réservés.</p>
          <div className="flex gap-8 my-6 md:my-0">
            <a className="text-xs uppercase tracking-widest text-slate-400 hover:text-blue-600 transition-colors" href="#privacy">Confidentialité</a>
            <a className="text-xs uppercase tracking-widest text-slate-400 hover:text-blue-600 transition-colors" href="#terms">Conditions</a>
            <a className="text-xs uppercase tracking-widest text-slate-400 hover:text-blue-600 transition-colors" href="#careers">Carrières</a>
          </div>
          <div className="flex gap-4">
            <span className="material-symbols-outlined text-slate-400 hover:text-primary cursor-pointer">public</span>
            <span className="material-symbols-outlined text-slate-400 hover:text-primary cursor-pointer">share</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default HomePage;
