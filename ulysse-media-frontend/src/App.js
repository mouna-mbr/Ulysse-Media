import { Navigate, Route, Routes } from 'react-router-dom';
import { useEffect } from 'react';
import { ToastProvider } from './toast-context';
import { useAuth } from './auth-context';
import { useNotifications } from './notification-context';
import ChatBubble from './components/ChatBubble';
import ChatPage from './pages/ChatPage';
import PaymentSuccessPage from './pages/PaymentSuccessPage';
import HomePage from './pages/HomePage';
import ContactPage from './pages/ContactPage';
import SignInPage from './pages/SignInPage';
import RegisterPage from './pages/RegisterPage';
import AdminUsersPage from './pages/AdminUsersPage';
import AddUsersPage from './pages/AddUsersPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import EmployeeDashboardPage from './pages/EmployeeDashboardPage';
import ProfilePage from './pages/ProfilePage';
import SettingsPage from './pages/SettingsPage';
import ServicesPage from './pages/ServicesPage';
import ServiceDetailPage from './pages/ServiceDetailPage';
import QuoteRequestPage from './pages/QuoteRequestPage';
import ClientQuoteRequestsPage from './pages/ClientQuoteRequestsPage';
import ClientQuoteRequestDetailPage from './pages/ClientQuoteRequestDetailPage';
import AdminServicesPage from './pages/AdminServicesPage';
import AdminServiceFormPage from './pages/AdminServiceFormPage';
import AdminServiceDetailPage from './pages/AdminServiceDetailPage';
import AdminPortfoliosPage from './pages/AdminPortfoliosPage';
import AdminPortfolioFormPage from './pages/AdminPortfolioFormPage';
import AdminPortfolioDetailPage from './pages/AdminPortfolioDetailPage';
import BackOfficeQuoteRequestsPage from './pages/BackOfficeQuoteRequestsPage';
import BackOfficeQuoteRequestDetailPage from './pages/BackOfficeQuoteRequestDetailPage';
import MeetingCalendarPage from './pages/MeetingCalendarPage';
import ProjectsPage from './pages/ProjectsPage';
import ProjectBoardPage from './pages/ProjectBoardPage';
import BackOfficeLayout from './components/BackOfficeLayout';
import ProjectMilestonesPage from './pages/ProjectMilestonesPage';
import ProjectMeetingsPage from './pages/ProjectMeetingsPage';

function AuthSocketBridge() {
  const { user, token } = useAuth();
  const { connect, disconnect } = useNotifications();

  useEffect(() => {
    if (user && token) {
      connect(token);
    } else {
      disconnect();
    }
  }, [user, token, connect, disconnect]);

  return null;
}

function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-on-surface-variant">
        Verification de la session...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/connexion" replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function App() {
  return (
    <ToastProvider>
      <AuthSocketBridge />
      <ChatBubble />
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/services" element={<ServicesPage />} />
      <Route path="/services/:id" element={<ServiceDetailPage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/connexion" element={<SignInPage />} />
      <Route path="/inscription" element={<RegisterPage />} />
      <Route
        path="/client/devis/:serviceId"
        element={(
          <ProtectedRoute roles={['CLIENT']}>
            <QuoteRequestPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/mes-devis"
        element={(
          <ProtectedRoute roles={['CLIENT']}>
            <ClientQuoteRequestsPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/mes-devis/:quoteId"
        element={(
          <ProtectedRoute roles={['CLIENT']}>
            <ClientQuoteRequestDetailPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/mes-devis/:quoteId/chat"
        element={(
          <ProtectedRoute roles={['CLIENT']}>
            <ChatPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/mes-reunions"
        element={(
          <ProtectedRoute roles={['CLIENT']}>
            <MeetingCalendarPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/mes-projets"
        element={(
          <ProtectedRoute roles={['CLIENT']}>
            <ProjectsPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/mes-projets/:projectId"
        element={(
          <ProtectedRoute roles={['CLIENT']}>
            <ProjectBoardPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/mes-projets/:projectId/milestones"
        element={(
          <ProtectedRoute roles={['CLIENT']}>
            <ProjectMilestonesPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/mes-projets/:projectId/meetings"
        element={(
          <ProtectedRoute roles={['CLIENT']}>
            <ProjectMeetingsPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/paiement/succes"
        element={(
          <ProtectedRoute roles={['CLIENT']}>
            <PaymentSuccessPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/profil"
        element={(
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/parametres"
        element={(
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/backoffice"
        element={(
          <ProtectedRoute roles={['ADMIN', 'EMPLOYE']}>
            <BackOfficeLayout />
          </ProtectedRoute>
        )}
      >
        <Route
          path="admin"
          element={(
            <ProtectedRoute roles={['ADMIN']}>
              <AdminDashboardPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="admin/utilisateurs"
          element={(
            <ProtectedRoute roles={['ADMIN']}>
              <AdminUsersPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="admin/utilisateurs/ajouter"
          element={(
            <ProtectedRoute roles={['ADMIN']}>
              <AddUsersPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="admin/services"
          element={(
            <ProtectedRoute roles={['ADMIN']}>
              <AdminServicesPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="admin/services/nouveau"
          element={(
            <ProtectedRoute roles={['ADMIN']}>
              <AdminServiceFormPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="admin/services/:serviceId"
          element={(
            <ProtectedRoute roles={['ADMIN']}>
              <AdminServiceDetailPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="admin/services/:serviceId/modifier"
          element={(
            <ProtectedRoute roles={['ADMIN']}>
              <AdminServiceFormPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="admin/portfolios"
          element={(
            <ProtectedRoute roles={['ADMIN']}>
              <AdminPortfoliosPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="admin/portfolios/nouveau"
          element={(
            <ProtectedRoute roles={['ADMIN']}>
              <AdminPortfolioFormPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="admin/portfolios/:portfolioId"
          element={(
            <ProtectedRoute roles={['ADMIN']}>
              <AdminPortfolioDetailPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="admin/portfolios/:portfolioId/modifier"
          element={(
            <ProtectedRoute roles={['ADMIN']}>
              <AdminPortfolioFormPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="devis"
          element={(
            <ProtectedRoute roles={['ADMIN', 'EMPLOYE']}>
              <BackOfficeQuoteRequestsPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="devis/:quoteId"
          element={(
            <ProtectedRoute roles={['ADMIN', 'EMPLOYE']}>
              <BackOfficeQuoteRequestDetailPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="devis/:quoteId/chat"
          element={(
            <ProtectedRoute roles={['ADMIN', 'EMPLOYE']}>
              <ChatPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="reunions"
          element={(
            <ProtectedRoute roles={['ADMIN', 'EMPLOYE']}>
              <MeetingCalendarPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="projects"
          element={(
            <ProtectedRoute roles={['ADMIN', 'EMPLOYE']}>
              <ProjectsPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="projects/:projectId"
          element={(
            <ProtectedRoute roles={['ADMIN', 'EMPLOYE']}>
              <ProjectBoardPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="projects/:projectId/milestones"
          element={(
            <ProtectedRoute roles={['ADMIN', 'EMPLOYE']}>
              <ProjectMilestonesPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="projects/:projectId/meetings"
          element={(
            <ProtectedRoute roles={['ADMIN', 'EMPLOYE']}>
              <ProjectMeetingsPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="employe"
          element={(
            <ProtectedRoute roles={['EMPLOYE']}>
              <EmployeeDashboardPage />
            </ProtectedRoute>
          )}
        />
      </Route>
      <Route path="/admin/utilisateurs" element={<Navigate to="/backoffice/admin/utilisateurs" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </ToastProvider>
  );
}

export default App;
