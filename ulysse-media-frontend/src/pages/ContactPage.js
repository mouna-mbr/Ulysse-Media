import { useState } from 'react';
import { request } from '../api';
import MainNav from '../components/MainNav';

const initialForm = {
  nomComplet: '',
  email: '',
  sujet: 'Production Vidéo',
  message: ''
};

function ContactPage() {
  const [form, setForm] = useState(initialForm);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  const onChange = (event) => {
    setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setStatus('loading');
    setError('');
    try {
      await request('/contact', {
        method: 'POST',
        body: JSON.stringify(form)
      });
      setStatus('success');
      setForm(initialForm);
    } catch (submissionError) {
      setStatus('error');
      setError(submissionError.message);
    }
  };

  return (
    <div className="bg-surface text-on-surface selection:bg-primary-fixed selection:text-on-primary-fixed min-h-screen">
      <MainNav />

      <main>
        <section className="relative px-8 py-16 md:py-24 max-w-screen-2xl mx-auto overflow-hidden pt-32" id="contact">
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
          <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-blue-900/10 rounded-full blur-3xl" />
          <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-16 items-start">
            <div className="lg:col-span-7 space-y-12">
              <div className="space-y-4">
                <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight text-primary">Parlons de votre prochain projet.</h1>
                <p className="text-lg text-on-surface-variant max-w-2xl leading-relaxed">
                  Que vous soyez une startup en pleine croissance ou une entreprise établie, nous sommes là pour transformer votre vision en réalité multimédia.
                </p>
              </div>

              <div className="bg-surface-container-lowest p-8 md:p-12 rounded-2xl shadow-sm">
                <form className="grid grid-cols-1 md:grid-cols-2 gap-6" onSubmit={onSubmit}>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-on-surface-variant ml-1">Nom complet</label>
                    <input
                      className="w-full bg-surface-container-highest border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary/30 transition-all placeholder:text-outline-variant"
                      placeholder="Jean Dupont"
                      type="text"
                      name="nomComplet"
                      value={form.nomComplet}
                      onChange={onChange}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-on-surface-variant ml-1">Email professionnel</label>
                    <input
                      className="w-full bg-surface-container-highest border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary/30 transition-all placeholder:text-outline-variant"
                      placeholder="jean@entreprise.com"
                      type="email"
                      name="email"
                      value={form.email}
                      onChange={onChange}
                      required
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-semibold text-on-surface-variant ml-1">Sujet</label>
                    <select
                      className="w-full bg-surface-container-highest border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary/30 transition-all text-on-surface-variant"
                      name="sujet"
                      value={form.sujet}
                      onChange={onChange}
                    >
                      <option>Production Vidéo</option>
                      <option>Stratégie Social Media</option>
                      <option>Design & Branding</option>
                      <option>Autre demande</option>
                    </select>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-semibold text-on-surface-variant ml-1">Message</label>
                    <textarea
                      className="w-full bg-surface-container-highest border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary/30 transition-all placeholder:text-outline-variant"
                      placeholder="Dites-nous en plus sur vos besoins..."
                      rows="4"
                      name="message"
                      value={form.message}
                      onChange={onChange}
                      required
                    />
                  </div>
                  <div className="md:col-span-2 pt-4">
                    <button className="w-full md:w-auto bg-gradient-to-br from-primary to-primary-container text-white px-10 py-4 rounded-xl font-bold text-lg shadow-xl shadow-primary/20 transition-all hover:-translate-y-1 active:scale-95" type="submit" disabled={status === 'loading'}>
                      {status === 'loading' ? 'Envoi...' : 'Envoyer le message'}
                    </button>
                  </div>
                  {status === 'success' && <p className="md:col-span-2 text-green-700 text-sm">Message envoyé avec succès.</p>}
                  {status === 'error' && <p className="md:col-span-2 text-red-700 text-sm">{error}</p>}
                </form>
              </div>
            </div>

            <div className="lg:col-span-5 space-y-8">
              <div className="bg-primary text-white p-10 rounded-2xl space-y-8 shadow-2xl shadow-primary/30">
                <h3 className="text-2xl font-bold">Nos coordonnées</h3>
                <div className="space-y-6">
                  <div className="flex items-start gap-4">
                    <div className="bg-white/10 p-3 rounded-lg">
                      <span className="material-symbols-outlined">location_on</span>
                    </div>
                    <div>
                      <p className="font-bold text-primary-fixed">Adresse</p>
                      <p className="text-white/80">42 Rue de la Paix, 75002 Paris, France</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="bg-white/10 p-3 rounded-lg">
                      <span className="material-symbols-outlined">call</span>
                    </div>
                    <div>
                      <p className="font-bold text-primary-fixed">Téléphone</p>
                      <p className="text-white/80">+33 (0) 1 23 45 67 89</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="bg-white/10 p-3 rounded-lg">
                      <span className="material-symbols-outlined">mail</span>
                    </div>
                    <div>
                      <p className="font-bold text-primary-fixed">Email</p>
                      <p className="text-white/80">hello@ulysse-media.fr</p>
                    </div>
                  </div>
                </div>
                <div className="pt-6 border-t border-white/10 flex gap-4">
                  <a className="bg-white/10 p-3 rounded-full hover:bg-white/20 transition-colors" href="#share"><span className="material-symbols-outlined text-lg">share</span></a>
                  <a className="bg-white/10 p-3 rounded-full hover:bg-white/20 transition-colors" href="#public"><span className="material-symbols-outlined text-lg">public</span></a>
                  <a className="bg-white/10 p-3 rounded-full hover:bg-white/20 transition-colors" href="#group"><span className="material-symbols-outlined text-lg">group</span></a>
                </div>
              </div>

              <div className="group relative rounded-2xl overflow-hidden h-80 shadow-sm">
                <img
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                  alt="stylized map of central Paris with a custom dark blue pin marker on a minimalist street background"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuCO-ZLP3csIuipr27rsdw4jWYi6neiPwQ2ScZqenwP8C4HN4xPTyRwyaWhvyEDUPM5HJheqQ-XoNm0zmfMHseFBAapFZOopHMiWtiTUXSt_QE7nie2clk9h1skFwjiDh7GbrFWLypUywRA2BarZ36kk8LTA0CNgcGJ7hb-6-lDQd9nKEpBOFD8-xKx-X4tAWTJdKJLSgB9bymCGTB3hF3vZ7jX1LSgYfzjBEsMSzeomj11Vz7tJ5vMtQffv4qVE-4rGVe_f_Rdv4Cpt"
                />
                <div className="absolute inset-0 bg-primary/20 mix-blend-multiply transition-opacity group-hover:opacity-0" />
                <div className="absolute bottom-6 left-6 bg-surface-container-lowest/90 backdrop-blur-md px-5 py-3 rounded-xl border border-outline-variant/15">
                  <p className="text-xs font-bold text-primary uppercase tracking-widest mb-1">Notre agence</p>
                  <p className="text-sm font-medium text-on-surface">Cœur du 2ème Arrondissement</p>
                </div>
                <button className="absolute top-6 right-6 bg-surface-container-lowest p-3 rounded-full shadow-lg hover:bg-primary hover:text-white transition-all active:scale-90" type="button">
                  <span className="material-symbols-outlined">open_in_new</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-surface-container-low py-24">
          <div className="max-w-screen-2xl mx-auto px-8">
            <div className="text-center mb-16 space-y-4">
              <h2 className="text-4xl font-bold text-primary">Questions Fréquentes</h2>
              <p className="text-on-surface-variant max-w-xl mx-auto">Tout ce que vous devez savoir pour démarrer votre collaboration avec Ulysse Media.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="bg-surface-container-lowest p-8 rounded-2xl shadow-sm border border-outline-variant/10 hover:shadow-md transition-shadow">
                <div className="w-10 h-10 bg-primary-fixed text-on-primary-fixed rounded-lg flex items-center justify-center mb-6">
                  <span className="material-symbols-outlined">timer</span>
                </div>
                <h4 className="text-lg font-bold text-primary mb-3">Quels sont vos délais moyens ?</h4>
                <p className="text-on-surface-variant text-sm leading-relaxed">Pour une production vidéo standard, comptez 3 à 4 semaines de la pré-production au montage final. Les projets digitaux varient selon la complexité.</p>
              </div>

              <div className="bg-surface-container-lowest p-8 rounded-2xl shadow-sm border border-outline-variant/10 hover:shadow-md transition-shadow">
                <div className="w-10 h-10 bg-secondary-fixed text-on-secondary-fixed rounded-lg flex items-center justify-center mb-6">
                  <span className="material-symbols-outlined">payments</span>
                </div>
                <h4 className="text-lg font-bold text-primary mb-3">Comment se passe le paiement ?</h4>
                <p className="text-on-surface-variant text-sm leading-relaxed">Nous fonctionnons généralement avec un acompte de 30% au lancement, 40% en milieu de projet et le solde à la livraison finale.</p>
              </div>

              <div className="bg-surface-container-lowest p-8 rounded-2xl shadow-sm border border-outline-variant/10 hover:shadow-md transition-shadow">
                <div className="w-10 h-10 bg-sky-100 text-blue-900 rounded-lg flex items-center justify-center mb-6">
                  <span className="material-symbols-outlined">videocam</span>
                </div>
                <h4 className="text-lg font-bold text-primary mb-3">Travaillez-vous à distance ?</h4>
                <p className="text-on-surface-variant text-sm leading-relaxed">Absolument. Si nos bureaux sont à Paris, nous gérons des tournages et des campagnes pour des clients dans toute l'Europe via des outils collaboratifs modernes.</p>
              </div>

              <div className="md:col-span-2 lg:col-span-1 bg-gradient-to-br from-primary-container to-primary p-8 rounded-2xl text-white shadow-xl">
                <h4 className="text-xl font-bold mb-4">Une demande spécifique ?</h4>
                <p className="opacity-80 text-sm mb-6">Vous ne trouvez pas la réponse à votre question ? Nos experts sont disponibles pour une session de conseil gratuite de 15 minutes.</p>
                <a className="inline-flex items-center gap-2 font-bold hover:underline decoration-2 underline-offset-4" href="#rendezvous">
                  Prendre rendez-vous <span className="material-symbols-outlined text-sm">arrow_forward</span>
                </a>
              </div>

              <div className="bg-surface-container-lowest p-8 rounded-2xl shadow-sm border border-outline-variant/10 hover:shadow-md transition-shadow">
                <div className="w-10 h-10 bg-secondary-fixed text-on-secondary-fixed rounded-lg flex items-center justify-center mb-6">
                  <span className="material-symbols-outlined">edit_note</span>
                </div>
                <h4 className="text-lg font-bold text-primary mb-3">Accompagnez-vous la rédaction ?</h4>
                <p className="text-on-surface-variant text-sm leading-relaxed">Oui, notre pôle créatif inclut des copywriters qui travaillent sur vos scripts, vos slogans et votre storytelling de marque.</p>
              </div>

              <div className="bg-surface-container-lowest p-8 rounded-2xl shadow-sm border border-outline-variant/10 hover:shadow-md transition-shadow">
                <div className="w-10 h-10 bg-primary-fixed text-on-primary-fixed rounded-lg flex items-center justify-center mb-6">
                  <span className="material-symbols-outlined">update</span>
                </div>
                <h4 className="text-lg font-bold text-primary mb-3">Maintenance post-projet ?</h4>
                <p className="text-on-surface-variant text-sm leading-relaxed">Nous proposons des forfaits d'accompagnement mensuels pour mettre à jour vos contenus ou optimiser vos campagnes publicitaires.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="py-24 px-8 max-w-screen-xl mx-auto">
          <div className="bg-surface-container-highest rounded-2xl p-12 text-center space-y-8">
            <h2 className="text-3xl font-bold text-primary">Prêt à décoller avec Ulysse Media ?</h2>
            <div className="flex flex-wrap justify-center gap-4">
              <button className="bg-primary text-white px-8 py-4 rounded-xl font-bold transition-all hover:scale-105" type="button">Commencer un projet</button>
              <button className="text-primary px-8 py-4 rounded-xl font-bold border border-primary/20 hover:bg-primary/5 transition-all" type="button">Consulter nos tarifs</button>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-slate-50 border-t border-slate-200/15">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full px-8 py-12 max-w-screen-2xl mx-auto">
          <div className="space-y-4">
            <div className="text-xl font-bold text-blue-900">Ulysse Media</div>
            <p className="text-slate-500 text-sm max-w-xs">L'agence qui navigue entre créativité et stratégie pour propulser votre image de marque.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3">
              <h5 className="text-sm font-bold text-blue-900 uppercase tracking-wider">Agence</h5>
              <ul className="space-y-2">
                <li><a className="text-slate-500 hover:text-blue-800 transition-colors text-sm hover:underline decoration-blue-900/30 underline-offset-4" href="#services">Services</a></li>
                <li><a className="text-slate-500 hover:text-blue-800 transition-colors text-sm hover:underline decoration-blue-900/30 underline-offset-4" href="#portfolio">Portfolio</a></li>
                <li><a className="text-slate-500 hover:text-blue-800 transition-colors text-sm hover:underline decoration-blue-900/30 underline-offset-4" href="#about">À propos</a></li>
              </ul>
            </div>
            <div className="space-y-3">
              <h5 className="text-sm font-bold text-blue-900 uppercase tracking-wider">Légal</h5>
              <ul className="space-y-2">
                <li><a className="text-slate-500 hover:text-blue-800 transition-colors text-sm hover:underline decoration-blue-900/30 underline-offset-4" href="#mentions">Mentions Légales</a></li>
                <li><a className="text-slate-500 hover:text-blue-800 transition-colors text-sm hover:underline decoration-blue-900/30 underline-offset-4" href="#confidentialite">Confidentialité</a></li>
                <li><a className="text-slate-500 hover:text-blue-800 transition-colors text-sm hover:underline decoration-blue-900/30 underline-offset-4" href="#conditions">Conditions</a></li>
              </ul>
            </div>
          </div>
          <div className="space-y-4">
            <h5 className="text-sm font-bold text-blue-900 uppercase tracking-wider">Suivez-nous</h5>
            <div className="flex gap-4">
              <a className="text-slate-500 hover:text-blue-900 transition-colors" href="#linkedin">LinkedIn</a>
              <a className="text-slate-500 hover:text-blue-900 transition-colors" href="#instagram">Instagram</a>
              <a className="text-slate-500 hover:text-blue-900 transition-colors" href="#facebook">Facebook</a>
            </div>
            <p className="text-xs text-slate-500 pt-8">© 2024 Ulysse Media. Tous droits réservés.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default ContactPage;
