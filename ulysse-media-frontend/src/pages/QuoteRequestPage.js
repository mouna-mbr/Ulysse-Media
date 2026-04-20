import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { request, API_BASE_URL } from '../api';
import { useAuth } from '../auth-context';
import { useToast } from '../toast-context';
import ImageLightbox from '../components/ImageLightbox';

const PALETTES = [
  { label: 'Bleu Ulysse', value: 'Bleu Ulysse (#00266F)', color: '#00266f' },
  { label: 'Bleu Clair', value: 'Bleu Clair (#1A3D8F)', color: '#1a3d8f' },
  { label: 'Slate', value: 'Slate (#515F74)', color: '#515f74' },
  { label: 'Turquoise', value: 'Turquoise (#004768)', color: '#004768' },
  { label: 'Neutre', value: 'Neutre (#D2D9F4)', color: '#d2d9f4' }
];

function QuoteRequestPage() {
  const { serviceId } = useParams();
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const toast = useToast();

  const [service, setService] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    description: '',
    paletteCouleur: '',
    inspiration: '',
    inspirationLink: '',
    contraintes: '',
    budget: '',
    deadline: ''
  });
  const [files, setFiles] = useState([]);
  const [customColors, setCustomColors] = useState([]);
  const [selectedColors, setSelectedColors] = useState([]);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [tempColor, setTempColor] = useState('#ffffff');
  const [activePreviewIndex, setActivePreviewIndex] = useState(null);

  const imagePreviewFiles = useMemo(() => files
    .filter((item) => item.type.startsWith('image/'))
    .map((item) => ({
      id: `${item.name}-${item.size}`,
      label: item.name,
      url: URL.createObjectURL(item)
    })), [files]);

  useEffect(() => {
    request(`/services/${serviceId}`)
      .then((result) => setService(result.service || null))
      .catch((error) => toast.error(error.message))
      .finally(() => setLoading(false));
  }, [serviceId, toast]);

  useEffect(() => () => {
    imagePreviewFiles.forEach((item) => URL.revokeObjectURL(item.url));
  }, [imagePreviewFiles]);

  const syncPaletteText = (nextColors) => {
    setForm((prev) => ({ ...prev, paletteCouleur: nextColors.join(', ') }));
  };

  const toggleColor = (colorValue) => {
    setSelectedColors((prev) => {
      const nextColors = prev.includes(colorValue)
        ? prev.filter((item) => item !== colorValue)
        : [...prev, colorValue];
      syncPaletteText(nextColors);
      return nextColors;
    });
  };

  const selectCustomColor = (color) => {
    toggleColor(`Custom (${color})`);
  };

  const addCustomColor = () => {
    if (tempColor && !customColors.includes(tempColor)) {
      setCustomColors((prev) => [...prev, tempColor]);
      toggleColor(`Custom (${tempColor})`);
      setTempColor('#ffffff');
      setShowColorPicker(false);
    }
  };

  const removeCustomColor = (color) => {
    setCustomColors((prev) => prev.filter((c) => c !== color));
    setSelectedColors((prev) => {
      const nextColors = prev.filter((item) => item !== `Custom (${color})`);
      syncPaletteText(nextColors);
      return nextColors;
    });
  };

  const submitQuote = async (event) => {
    event.preventDefault();

    if (!user || user.role !== 'CLIENT') {
      toast.warning('Veuillez vous connecter avec un compte client pour envoyer une demande.');
      navigate('/connexion');
      return;
    }

    if (form.description.trim().length < 50) {
      toast.warning('La description doit contenir au moins 50 caracteres.');
      return;
    }

    try {
      setSubmitting(true);
      const data = new FormData();
      data.append('serviceId', serviceId);
      data.append('serviceType', service?.name || 'Service');
      data.append('description', form.description);
      data.append('paletteCouleur', form.paletteCouleur);
      data.append('paletteColors', JSON.stringify(selectedColors));
      data.append('inspiration', form.inspiration);
      data.append('inspirationLink', form.inspirationLink);
      data.append('contraintes', form.contraintes);
      data.append('budget', form.budget);
      data.append('deadline', form.deadline);
      files.forEach((item) => data.append('files', item));

      const response = await fetch(`${API_BASE_URL}/quote-requests`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: data
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || 'Erreur lors de la demande.');

      toast.success('Demande de devis envoyee avec succes.');
      navigate('/services');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-surface text-on-surface pt-32 px-8">Chargement...</div>;
  }

  if (!service) {
    return (
      <div className="min-h-screen bg-surface text-on-surface pt-32 px-8">
        <p>Service introuvable.</p>
        <Link to="/services" className="text-primary underline">Retour</Link>
      </div>
    );
  }

  return (
    <div className="bg-surface font-body text-on-surface min-h-screen">
      <style>{`
        .glass-header {
          background: rgba(250, 248, 255, 0.7);
          backdrop-filter: blur(24px);
        }
        .primary-gradient {
          background: linear-gradient(135deg, #00266f 0%, #1a3d8f 100%);
        }
      `}</style>

      <header className="fixed top-0 w-full z-50 glass-header shadow-sm flex justify-between items-center px-8 h-20 max-w-full mx-auto">
        <Link to="/" className="text-2xl font-bold tracking-tighter text-blue-900 font-headline">Ulysse Media</Link>
        <nav className="hidden md:flex items-center space-x-8 font-headline font-bold tracking-tight">
          <Link className="text-slate-600 hover:text-blue-900 transition-colors" to="/services">Portfolio</Link>
          <Link className="text-slate-600 hover:text-blue-900 transition-colors" to="/services">Services</Link>
          <Link className="text-slate-600 hover:text-blue-900 transition-colors" to="/services">Etudes de cas</Link>
          <Link className="text-slate-600 hover:text-blue-900 transition-colors" to="/profil">Espace client</Link>
        </nav>
        <div className="flex items-center space-x-4">
          <button type="button" className="hidden md:flex p-2 hover:bg-slate-100/50 rounded-lg transition-transform active:scale-90">
            <span className="material-symbols-outlined text-slate-600">notifications</span>
          </button>
          <Link to="/services" className="primary-gradient text-white px-6 py-2.5 rounded-xl font-headline font-bold transition-transform active:scale-95 shadow-lg">
            Demarrer un projet
          </Link>
        </div>
      </header>

      <main className="pt-32 pb-20 px-4 md:px-8 max-w-7xl mx-auto">
        <div className="mb-12 max-w-2xl">
          <h1 className="font-headline text-5xl font-extrabold tracking-tight text-primary mb-4">Demande de devis</h1>
          <p className="text-secondary text-lg leading-relaxed">Parlez-nous de votre vision pour <span className="font-bold text-primary">{service.name}</span>. Ce brief detaille aide notre equipe a etablir un devis juste et rapide.</p>
        </div>

        <form onSubmit={submitQuote}>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-3">
              <div className="sticky top-32 space-y-2 bg-surface-container-low p-4 rounded-xl">
                <div className="flex items-center space-x-3 p-3 bg-blue-100 text-blue-900 rounded-xl">
                  <span className="material-symbols-outlined">description</span>
                  <span className="font-headline font-semibold text-sm">Description</span>
                </div>
                <div className="flex items-center space-x-3 p-3 text-slate-500 hover:bg-slate-200 rounded-xl transition-all">
                  <span className="material-symbols-outlined">palette</span>
                  <span className="font-headline font-semibold text-sm">Esthetique</span>
                </div>
                <div className="flex items-center space-x-3 p-3 text-slate-500 hover:bg-slate-200 rounded-xl transition-all">
                  <span className="material-symbols-outlined">link</span>
                  <span className="font-headline font-semibold text-sm">Inspiration</span>
                </div>
                <div className="flex items-center space-x-3 p-3 text-slate-500 hover:bg-slate-200 rounded-xl transition-all">
                  <span className="material-symbols-outlined">upload_file</span>
                  <span className="font-headline font-semibold text-sm">Fichiers</span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-9 space-y-8">
              <section className="bg-surface-container-lowest p-8 md:p-12 rounded-xl shadow-sm">
                <div className="flex items-center space-x-4 mb-8">
                  <div className="w-10 h-10 rounded-full bg-primary-fixed flex items-center justify-center text-primary font-bold">1</div>
                  <h2 className="font-headline text-2xl font-bold">Coeur du projet</h2>
                </div>
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-on-surface-variant mb-2">Description detaillee</label>
                    <textarea
                      required
                      minLength={50}
                      className="w-full bg-surface-container-highest border-none rounded-xl p-4 focus:bg-surface-container-lowest transition-colors resize-none"
                      placeholder="Decrivez le perimetre du projet, les objectifs et les livrables attendus..."
                      rows={6}
                      value={form.description}
                      onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-on-surface-variant mb-2">Type de projet</label>
                      <input className="w-full bg-surface-container-highest border-none rounded-xl p-4" value={service.name} readOnly />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-on-surface-variant mb-2">Delai estime</label>
                      <input
                        className="w-full bg-surface-container-highest border-none rounded-xl p-4"
                        placeholder="Ex: 2-4 semaines"
                        value={form.deadline}
                        onChange={(e) => setForm((prev) => ({ ...prev, deadline: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
              </section>

              <section className="bg-surface-container-lowest p-8 md:p-12 rounded-xl shadow-sm">
                <div className="flex items-center space-x-4 mb-8">
                  <div className="w-10 h-10 rounded-full bg-primary-fixed flex items-center justify-center text-primary font-bold">2</div>
                  <h2 className="font-headline text-2xl font-bold">Identite visuelle</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                  <div>
                    <label className="block text-sm font-semibold text-on-surface-variant mb-4">Target Color Palette</label>
                    <div className="grid grid-cols-4 gap-3">
                      {PALETTES.map((palette) => (
                        <button
                          key={palette.value}
                          type="button"
                          onClick={() => toggleColor(palette.value)}
                          title={palette.label}
                          className={`h-12 w-full rounded-lg transition-all ${selectedColors.includes(palette.value) ? 'ring-2 ring-offset-2 ring-primary scale-[1.02]' : 'hover:ring-2 hover:ring-offset-2 hover:ring-slate-300'}`}
                          style={{ background: palette.color }}
                        />
                      ))}

                      {customColors.map((color) => (
                        <div key={color} className="relative group">
                          <button
                            type="button"
                            onClick={() => selectCustomColor(color)}
                            title={`Custom ${color}`}
                            className={`h-12 w-full rounded-lg transition-all ${selectedColors.includes(`Custom (${color})`) ? 'ring-2 ring-offset-2 ring-primary scale-[1.02]' : 'hover:ring-2 hover:ring-offset-2 hover:ring-slate-300'}`}
                            style={{ background: color }}
                          />
                          <button
                            type="button"
                            onClick={() => removeCustomColor(color)}
                            className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            x
                          </button>
                        </div>
                      ))}

                      <button
                        type="button"
                        onClick={() => setShowColorPicker((prev) => !prev)}
                        className="h-12 w-full rounded-lg border-2 border-dashed border-blue-300 bg-blue-50 text-blue-600 text-xl font-semibold hover:bg-blue-100 transition-colors"
                        title="Ajouter une couleur"
                      >
                        +
                      </button>
                    </div>

                    {showColorPicker && (
                      <div className="mt-4 bg-surface-container-high p-4 rounded-lg border border-outline-variant/20">
                        <div className="flex items-center gap-3">
                          <input
                            type="color"
                            value={tempColor}
                            onChange={(e) => setTempColor(e.target.value)}
                            className="w-12 h-12 rounded-lg cursor-pointer"
                          />
                          <input
                            type="text"
                            value={tempColor}
                            onChange={(e) => setTempColor(e.target.value)}
                            placeholder="#ffffff"
                            className="flex-1 bg-surface-container-highest border-none rounded-lg p-2 text-sm"
                          />
                          <button
                            type="button"
                            onClick={addCustomColor}
                            className="px-4 py-2 rounded-lg bg-primary text-white font-semibold"
                          >
                            Ajouter
                          </button>
                        </div>
                      </div>
                    )}

                    <p className="text-xs text-slate-500 mt-4">Selectionnez une ou plusieurs couleurs, puis ajoutez des precisions si besoin.</p>
                    <textarea
                      className="w-full mt-4 bg-surface-container-highest border-none rounded-xl p-4 focus:bg-surface-container-lowest transition-colors resize-none"
                      rows={3}
                      placeholder="Palette, ambiance, inspirations couleurs..."
                      value={form.paletteCouleur}
                      onChange={(e) => setForm((prev) => ({ ...prev, paletteCouleur: e.target.value }))}
                    />
                  </div>
                  <div className="bg-surface-container-low p-6 rounded-xl border border-outline-variant/10">
                    <label className="block text-sm font-semibold text-on-surface-variant mb-3">Budget cible</label>
                    <input
                      className="w-full bg-surface-container-highest border-none rounded-xl p-4"
                      placeholder="Ex: 1500 - 2500 EUR"
                      value={form.budget}
                      onChange={(e) => setForm((prev) => ({ ...prev, budget: e.target.value }))}
                    />
                    <p className="text-xs text-slate-500 mt-4">Donnez une fourchette budgetaire pour accelerer le cadrage.</p>
                  </div>
                </div>
              </section>

              <section className="bg-surface-container-lowest p-8 md:p-12 rounded-xl shadow-sm">
                <div className="flex items-center space-x-4 mb-8">
                  <div className="w-10 h-10 rounded-full bg-primary-fixed flex items-center justify-center text-primary font-bold">3</div>
                  <h2 className="font-headline text-2xl font-bold">Ressources & contraintes</h2>
                </div>
                <div className="space-y-8">
                  <div>
                    <label className="block text-sm font-semibold text-on-surface-variant mb-2">Lien d'inspiration</label>
                    <input
                      className="w-full bg-surface-container-highest border-none rounded-xl p-4"
                      placeholder="https://"
                      type="url"
                      value={form.inspirationLink}
                      onChange={(e) => setForm((prev) => ({ ...prev, inspirationLink: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-on-surface-variant mb-2">Inspirations et references</label>
                    <textarea
                      className="w-full bg-surface-container-highest border-none rounded-xl p-4 resize-none"
                      placeholder="Precisez vos inspirations, references visuelles ou concurrents..."
                      rows={3}
                      value={form.inspiration}
                      onChange={(e) => setForm((prev) => ({ ...prev, inspiration: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-on-surface-variant mb-2">Contraintes & fichiers</label>
                    <textarea
                      className="w-full bg-surface-container-highest border-none rounded-xl p-4 resize-none"
                      placeholder="Formats imposes, contraintes techniques, remarques importantes..."
                      rows={3}
                      value={form.contraintes}
                      onChange={(e) => setForm((prev) => ({ ...prev, contraintes: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-on-surface-variant mb-4">Fichiers facultatifs</label>
                    <label className="border-2 border-dashed border-outline-variant rounded-xl p-12 flex flex-col items-center justify-center text-center bg-surface-container-low/30 hover:bg-surface-container-low transition-colors cursor-pointer group">
                      <div className="w-16 h-16 rounded-full bg-primary-fixed flex items-center justify-center text-primary mb-4 group-hover:scale-110 transition-transform">
                        <span className="material-symbols-outlined text-3xl">cloud_upload</span>
                      </div>
                      <h3 className="font-headline font-bold text-primary">Deposez vos fichiers ici ou cliquez pour uploader</h3>
                      <p className="text-sm text-slate-500 mt-1">PDF, PNG, JPG, ZIP (plusieurs fichiers)</p>
                      <input type="file" multiple className="hidden" onChange={(e) => setFiles(Array.from(e.target.files || []))} />
                      {files.length > 0 && (
                        <div className="text-xs text-primary mt-3 space-y-1">
                          {files.map((item) => (
                            <p key={`${item.name}-${item.size}`}>{item.name}</p>
                          ))}
                        </div>
                      )}
                    </label>
                    {imagePreviewFiles.length > 0 && (
                      <div className="mt-4">
                        <p className="text-sm font-semibold text-on-surface-variant mb-3">Images de reference</p>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          {imagePreviewFiles.map((item, index) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => setActivePreviewIndex(index)}
                              className="rounded-xl overflow-hidden border border-outline-variant/20 bg-white text-left"
                            >
                              <img src={item.url} alt={item.label} className="w-full h-32 object-cover hover:scale-105 transition-transform" />
                              <p className="p-2 text-xs font-medium truncate">{item.label}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </section>

              <div className="flex flex-col md:flex-row justify-between items-center pt-8 gap-4">
                <Link to={`/services/${service.id}`} className="w-full md:w-auto px-8 py-4 text-slate-500 font-headline font-bold hover:text-primary transition-colors text-center">
                  Retour au service
                </Link>
                <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
                  <button type="button" className="w-full md:w-auto px-8 py-4 bg-surface-container-high text-primary rounded-xl font-headline font-bold hover:bg-surface-container-highest transition-all">
                    Verifier les details
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full md:w-auto px-12 py-4 primary-gradient text-white rounded-xl font-headline font-bold shadow-xl shadow-primary/20 transition-transform active:scale-95 disabled:opacity-70"
                  >
                    {submitting ? 'Envoi...' : 'Envoyer la demande'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </form>

        <div className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-surface-container-low p-8 rounded-xl">
            <span className="material-symbols-outlined text-primary mb-4 text-3xl">speed</span>
            <h3 className="font-headline font-bold text-xl mb-2">Reponse sous 24h</h3>
            <p className="text-secondary text-sm">Notre equipe etudie votre brief sous un jour ouvre pour un premier cadrage.</p>
          </div>
          <div className="bg-surface-container-low p-8 rounded-xl">
            <span className="material-symbols-outlined text-primary mb-4 text-3xl">security</span>
            <h3 className="font-headline font-bold text-xl mb-2">Confidentialite standard</h3>
            <p className="text-secondary text-sm">Tous les documents transmis sont traites avec un haut niveau de confidentialite.</p>
          </div>
          <div className="bg-surface-container-low p-8 rounded-xl">
            <span className="material-symbols-outlined text-primary mb-4 text-3xl">verified</span>
            <h3 className="font-headline font-bold text-xl mb-2">Cadrage expert</h3>
            <p className="text-secondary text-sm">Nous vous aidons a clarifier les besoins pour construire un devis plus pertinent.</p>
          </div>
        </div>
      </main>

      <footer className="w-full border-t border-slate-100 bg-white">
        <div className="flex flex-col md:flex-row justify-between items-center px-12 py-10 gap-6">
          <div className="flex flex-col items-center md:items-start gap-2">
            <div className="font-headline font-bold text-lg text-blue-900">Ulysse Media</div>
            <p className="font-body text-xs tracking-wide text-slate-500">© 2026 Ulysse Media. Concu pour l'excellence.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-8">
            <Link className="font-body text-xs tracking-wide text-slate-500 hover:text-blue-700 underline-offset-4 hover:underline transition-opacity opacity-80 hover:opacity-100" to="/">Politique de confidentialite</Link>
            <Link className="font-body text-xs tracking-wide text-slate-500 hover:text-blue-700 underline-offset-4 hover:underline transition-opacity opacity-80 hover:opacity-100" to="/">Conditions d'utilisation</Link>
            <Link className="font-body text-xs tracking-wide text-slate-500 hover:text-blue-700 underline-offset-4 hover:underline transition-opacity opacity-80 hover:opacity-100" to="/contact">Contact</Link>
            <Link className="font-body text-xs tracking-wide text-slate-500 hover:text-blue-700 underline-offset-4 hover:underline transition-opacity opacity-80 hover:opacity-100" to="/">Presse</Link>
          </div>
        </div>
      </footer>

      {activePreviewIndex !== null && (
        <ImageLightbox
          images={imagePreviewFiles}
          currentIndex={activePreviewIndex}
          onClose={() => setActivePreviewIndex(null)}
          onPrev={() => setActivePreviewIndex((prev) => (prev - 1 + imagePreviewFiles.length) % imagePreviewFiles.length)}
          onNext={() => setActivePreviewIndex((prev) => (prev + 1) % imagePreviewFiles.length)}
        />
      )}
    </div>
  );
}

export default QuoteRequestPage;
