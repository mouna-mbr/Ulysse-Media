import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth-context';
import { authRequest } from '../api';
import { useToast } from '../toast-context';

function formatMailto(contact) {
  const subject = encodeURIComponent(`Re: ${contact.sujet}`);
  const body = encodeURIComponent(
    `Bonjour ${contact.nomComplet},\n\nMerci pour votre message.\n\n---\nVotre message:\n${contact.message}\n\nCordialement,\nUlysse Media`
  );
  return `mailto:${contact.email}?subject=${subject}&body=${body}`;
}

function AdminContactsPage() {
  const { token } = useAuth();
  const toast = useToast();

  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    authRequest('/contact', token)
      .then((res) => setContacts(res.contacts || []))
      .catch((error) => toast.error(error.message))
      .finally(() => setLoading(false));
  }, [token, toast]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return contacts;
    return contacts.filter((item) => (
      `${item.nomComplet} ${item.email} ${item.sujet} ${item.message}`.toLowerCase().includes(needle)
    ));
  }, [contacts, query]);

  return (
    <section className="space-y-6">
      <header className="bg-white border border-outline-variant/20 rounded-2xl p-6">
        <h1 className="text-3xl font-bold text-primary">Contacts</h1>
        <p className="mt-2 text-on-surface-variant">Messages envoyes depuis la page Contact du site.</p>
      </header>

      <section className="bg-white border border-outline-variant/20 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher par nom, email, sujet..."
            className="min-w-[260px] flex-1 rounded-xl bg-surface-container-highest border-none"
          />
          <p className="text-sm text-on-surface-variant">{filtered.length} message(s)</p>
        </div>

        {loading ? (
          <p className="text-sm text-on-surface-variant">Chargement...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-on-surface-variant">Aucun message.</p>
        ) : (
          <div className="space-y-3">
            {filtered.map((contact) => (
              <article key={contact.id} className="rounded-xl border border-outline-variant/20 p-4 bg-surface-container-lowest">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-sm font-semibold text-on-surface">{contact.nomComplet}</p>
                    <p className="text-xs text-on-surface-variant">{contact.email}</p>
                    <p className="mt-1 text-xs text-on-surface-variant">{new Date(contact.date).toLocaleString('fr-FR')}</p>
                  </div>
                  <a
                    href={formatMailto(contact)}
                    className="rounded-lg bg-primary text-white px-3 py-2 text-xs font-semibold hover:opacity-90"
                  >
                    Repondre
                  </a>
                </div>
                <p className="mt-3 text-sm font-semibold text-primary">{contact.sujet}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-on-surface">{contact.message}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

export default AdminContactsPage;
