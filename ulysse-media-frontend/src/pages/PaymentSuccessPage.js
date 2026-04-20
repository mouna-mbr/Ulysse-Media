import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import MainNav from '../components/MainNav';
import { request } from '../api';

function PaymentSuccessPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = searchParams.get('session_id');
  const quoteId = searchParams.get('quoteId');
  const projectId = searchParams.get('projectId');

  const [status, setStatus] = useState('verifying'); // verifying | paid | error
  const [paidContext, setPaidContext] = useState({ quoteId: null, projectId: null, paymentType: null });

  useEffect(() => {
    let active = true;
    let timer = null;

    if (!sessionId && !quoteId && !projectId) {
      setStatus('error');
      return;
    }

    const verifyPayment = async (attempt = 0) => {
      try {
        const params = new URLSearchParams();
        if (sessionId) params.set('session_id', sessionId);
        if (quoteId) params.set('quoteId', quoteId);
        if (projectId) params.set('projectId', projectId);

        const res = await request(`/payments/verify?${params.toString()}`);
        if (!active) return;

        if (res.paid) {
          setStatus('paid');
          setPaidContext({
            quoteId: res.quoteId || quoteId || null,
            projectId: res.projectId || projectId || null,
            paymentType: String(res.paymentType || '').toUpperCase()
          });

          // Auto-redirect after 4s to the correct destination by payment type.
          timer = setTimeout(() => {
            const paymentType = String(res.paymentType || '').toUpperCase();
            const quoteTarget = res.quoteId || quoteId;
            const projectTarget = res.projectId || projectId;

            if (paymentType === 'DEPOSIT' && quoteTarget) {
              navigate(`/mes-devis/${quoteTarget}/chat`);
              return;
            }
            if (projectTarget) {
              navigate(`/mes-projets/${projectTarget}`);
              return;
            }
            if (quoteTarget) {
              navigate(`/mes-devis/${quoteTarget}`);
            }
          }, 4000);
          return;
        }

        if (attempt < 6) {
          timer = setTimeout(() => verifyPayment(attempt + 1), 1500);
          return;
        }

        setStatus('error');
      } catch (_) {
        if (!active) return;
        if (attempt < 6) {
          timer = setTimeout(() => verifyPayment(attempt + 1), 1500);
          return;
        }
        setStatus('error');
      }
    };

    verifyPayment();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [sessionId, quoteId, projectId, navigate]);

  return (
    <div className="min-h-screen bg-surface-container-lowest">
      <MainNav />
      <main className="flex items-center justify-center min-h-[80vh] px-4">
        <div className="bg-white rounded-3xl p-10 max-w-md w-full text-center space-y-6 shadow-xl border border-outline-variant/20">
          {status === 'verifying' && (
            <>
              <div className="w-20 h-20 rounded-full bg-blue-50 flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-4xl text-primary animate-spin">refresh</span>
              </div>
              <h1 className="text-2xl font-bold text-on-surface">Vérification du paiement…</h1>
              <p className="text-on-surface-variant text-sm">Veuillez patienter quelques secondes.</p>
            </>
          )}

          {status === 'paid' && (
            <>
              <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-4xl text-emerald-600">check_circle</span>
              </div>
              <h1 className="text-2xl font-bold text-on-surface">Paiement réussi !</h1>
              <p className="text-on-surface-variant text-sm">
                {paidContext.paymentType === 'DEPOSIT'
                  ? 'Votre acompte a ete encaisse avec succes. Votre projet demarre maintenant.'
                  : paidContext.paymentType === 'KICKOFF20'
                    ? 'Votre paiement kickoff 20% a ete confirme avec succes.'
                    : paidContext.paymentType === 'MILESTONE'
                      ? 'Votre paiement milestone a ete confirme avec succes.'
                      : 'Votre paiement a ete confirme avec succes.'}
              </p>
              <p className="text-xs text-outline">Redirection automatique dans 4 secondes...</p>
              {(paidContext.paymentType === 'DEPOSIT' && paidContext.quoteId) ? (
                <Link
                  to={`/mes-devis/${paidContext.quoteId}/chat`}
                  className="inline-flex items-center justify-center gap-2 w-full px-6 py-3 rounded-xl bg-primary text-white font-semibold hover:opacity-90 transition-colors"
                >
                  <span className="material-symbols-outlined text-base">chat</span>
                  Ouvrir le chat projet
                </Link>
              ) : (
                <Link
                  to={`/mes-projets/${paidContext.projectId || projectId || ''}`}
                  className="inline-flex items-center justify-center gap-2 w-full px-6 py-3 rounded-xl bg-primary text-white font-semibold hover:opacity-90 transition-colors"
                >
                  <span className="material-symbols-outlined text-base">folder</span>
                  Retour au projet
                </Link>
              )}
            </>
          )}

          {status === 'error' && (
            <>
              <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-4xl text-red-500">error</span>
              </div>
              <h1 className="text-2xl font-bold text-on-surface">Paiement échoué</h1>
              <p className="text-on-surface-variant text-sm">
                Nous n'avons pas pu confirmer votre paiement. Veuillez réessayer ou contacter le support.
              </p>
              <Link
                to="/mes-devis"
                className="inline-flex items-center justify-center gap-2 w-full px-6 py-3 rounded-xl border border-outline-variant/30 text-on-surface font-semibold hover:bg-surface-container transition-colors"
              >
                Retour à mes devis
              </Link>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default PaymentSuccessPage;
