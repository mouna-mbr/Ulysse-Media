import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authRequest } from '../api';
import { useAuth } from '../auth-context';
import { useToast } from '../toast-context';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';

pdfMake.vfs = pdfFonts.pdfMake ? pdfFonts.pdfMake.vfs : pdfFonts.vfs;

const roles = ['ADMIN', 'EMPLOYE', 'CLIENT'];
const SPECIALITES = ['Videomaking', 'Design graphique', 'Social media', 'Montage', 'Motion design'];
const NIVEAUX = ['JUNIOR', 'STANDARD', 'SENIOR', 'EXPERT'];

function EditModal({ user, onClose, onSave }) {
  const [form, setForm] = useState({
    username: user.username || '',
    email: user.email || '',
    niveau: user.niveau || 'STANDARD',
    specialite: user.specialite || '',
    tauxHoraire: user.tauxHoraire || 0,
  });

  const isEmploye = user.role === 'EMPLOYE';
  const isAdmin = user.role === 'ADMIN';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md mx-4 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-on-surface">Modifier l'utilisateur</h2>
            <p className="text-sm text-on-surface-variant mt-0.5">{user.username} — <span className="text-primary font-semibold">{user.role}</span></p>
          </div>
          <button type="button" onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-container transition-colors">
            <span className="material-symbols-outlined text-on-surface-variant">close</span>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1 uppercase tracking-wide">Nom d'utilisateur</label>
            <input
              className="w-full px-4 py-2.5 rounded-xl bg-surface-container-highest border-none focus:ring-2 focus:ring-primary text-sm"
              value={form.username}
              onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1 uppercase tracking-wide">Email</label>
            <input
              type="email"
              className="w-full px-4 py-2.5 rounded-xl bg-surface-container-highest border-none focus:ring-2 focus:ring-primary text-sm"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            />
          </div>

          {isAdmin && (
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1 uppercase tracking-wide">Niveau</label>
              <select
                className="w-full px-4 py-2.5 rounded-xl bg-surface-container-highest border-none focus:ring-2 focus:ring-primary text-sm"
                value={form.niveau}
                onChange={(e) => setForm((p) => ({ ...p, niveau: e.target.value }))}
              >
                {NIVEAUX.map((n) => <option key={n}>{n}</option>)}
              </select>
            </div>
          )}

          {isEmploye && (
            <>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1 uppercase tracking-wide">Spécialité</label>
                <select
                  className="w-full px-4 py-2.5 rounded-xl bg-surface-container-highest border-none focus:ring-2 focus:ring-primary text-sm"
                  value={form.specialite}
                  onChange={(e) => setForm((p) => ({ ...p, specialite: e.target.value }))}
                >
                  <option value="">Sélectionner</option>
                  {SPECIALITES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1 uppercase tracking-wide">Taux horaire (€)</label>
                <input
                  type="number"
                  className="w-full px-4 py-2.5 rounded-xl bg-surface-container-highest border-none focus:ring-2 focus:ring-primary text-sm"
                  value={form.tauxHoraire}
                  onChange={(e) => setForm((p) => ({ ...p, tauxHoraire: Number(e.target.value) }))}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1 uppercase tracking-wide">Niveau</label>
                <select
                  className="w-full px-4 py-2.5 rounded-xl bg-surface-container-highest border-none focus:ring-2 focus:ring-primary text-sm"
                  value={form.niveau}
                  onChange={(e) => setForm((p) => ({ ...p, niveau: e.target.value }))}
                >
                  {NIVEAUX.map((n) => <option key={n}>{n}</option>)}
                </select>
              </div>
            </>
          )}
        </div>

        <div className="flex gap-3 mt-8">
          <button
            type="button"
            onClick={() => onSave(user.id, form)}
            className="flex-1 bg-primary text-white font-semibold py-2.5 rounded-xl hover:opacity-90 transition-opacity text-sm"
          >
            Enregistrer
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-surface-container text-on-surface font-semibold py-2.5 rounded-xl hover:bg-surface-container-high transition-colors text-sm"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}

function AdminUsersPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [selectedRole, setSelectedRole] = useState('ADMIN');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  const fetchUsers = useCallback(
    async (role) => {
      setLoading(true);
      try {
        const result = await authRequest(`/users?role=${role}`, token);
        setUsers(result.users);
      } catch (fetchError) {
        toast.error(fetchError.message);
      } finally {
        setLoading(false);
      }
    },
    [token, toast]
  );

  useEffect(() => {
    if (token) fetchUsers(selectedRole);
  }, [token, selectedRole, fetchUsers]);

  const toggleSuspend = async (targetUser) => {
    try {
      await authRequest(`/users/${targetUser.id}/suspend`, token, {
        method: 'PATCH',
        body: JSON.stringify({ suspended: !targetUser.suspended })
      });
      fetchUsers(selectedRole);
      toast.success(targetUser.suspended ? 'Utilisateur réactivé.' : 'Utilisateur suspendu.');
    } catch (toggleError) {
      toast.error(toggleError.message);
    }
  };

  const saveEdit = async (userId, form) => {
    try {
      await authRequest(`/users/${userId}`, token, {
        method: 'PATCH',
        body: JSON.stringify(form)
      });
      setEditingUser(null);
      fetchUsers(selectedRole);
      toast.success('Utilisateur mis à jour.');
    } catch (updateError) {
      toast.error(updateError.message);
    }
  };

  const exportPdf = () => {
    if (users.length === 0) {
      toast.warning('Aucun utilisateur à exporter.');
      return;
    }

    const tableBody = [
      [
        { text: 'Nom', fontSize: 10, bold: true, color: '#00266f' },
        { text: 'Email', fontSize: 10, bold: true, color: '#00266f' },
        { text: 'Rôle', fontSize: 10, bold: true, color: '#00266f' },
        { text: 'Statut', fontSize: 10, bold: true, color: '#00266f' },
        ...(selectedRole === 'EMPLOYE'
          ? [
              { text: 'Spécialité', fontSize: 10, bold: true, color: '#00266f' },
              { text: 'Taux', fontSize: 10, bold: true, color: '#00266f' }
            ]
          : [])
      ]
    ];

    users.forEach((user) => {
      const row = [
        { text: user.username || '', fontSize: 9, color: '#131b2e' },
        { text: user.email || '', fontSize: 9, color: '#131b2e' },
        { text: user.role || '', fontSize: 9, color: '#131b2e' },
        { text: user.suspended ? 'Suspendu' : 'Actif', fontSize: 9, color: user.suspended ? '#ba1a1a' : '#1b7a4e' },
        ...(selectedRole === 'EMPLOYE'
          ? [
              { text: user.specialite || '-', fontSize: 9, color: '#131b2e' },
              { text: `${user.tauxHoraire || 0}€/h`, fontSize: 9, color: '#131b2e' }
            ]
          : [])
      ];
      tableBody.push(row);
    });

    const now = new Date();
    const isEmploye = selectedRole === 'EMPLOYE';
    const docDefinition = {
      pageOrientation: isEmploye ? 'landscape' : 'portrait',
      pageMargins: [40, 80, 40, 60],
      header: (currentPage) => ({
        margin: [40, 20, 40, 0],
        columns: [
          {
            text: 'Ulysse Media',
            fontSize: 24,
            bold: true,
            color: '#00266f'
          },
          {
            text: `Page ${currentPage}`,
            fontSize: 9,
            alignment: 'right',
            color: '#747683'
          }
        ]
      }),
      footer: (currentPage, pageCount) => ({
        margin: [40, 0, 40, 20],
        columns: [
          {
            text: `Généré le ${now.toLocaleDateString('fr-FR')} à ${now.toLocaleTimeString('fr-FR')}`,
            fontSize: 9,
            color: '#747683'
          },
          {
            text: `${currentPage}/${pageCount}`,
            fontSize: 9,
            alignment: 'right',
            color: '#747683'
          }
        ]
      }),
      content: [
        {
          text: `Liste des utilisateurs - ${selectedRole}`,
          fontSize: 13,
          bold: true,
          color: '#000000',
          alignment: 'center',
          marginBottom: 20
        },
        {
          table: {
            headerRows: 1,
            widths: isEmploye
              ? [90, '*', 55, 50, 80, 50]
              : [110, '*', 60, 60],
            body: tableBody
          },
          layout: {
            fillColor: (rowIndex) => (rowIndex === 0 ? '#dbe1ff' : null),
            hLineColor: () => '#b4c5ff',
            vLineColor: () => '#b4c5ff',
            hLineWidth: () => 1,
            vLineWidth: () => 1,
            paddingLeft: () => 8,
            paddingRight: () => 8,
            paddingTop: () => 6,
            paddingBottom: () => 6
          }
        }
      ]
    };

    pdfMake.createPdf(docDefinition).download(`utilisateurs_${selectedRole}_${now.getTime()}.pdf`);
    toast.success('PDF exporté avec succès.');
  };

  return (
    <section className="space-y-6">
      {editingUser && (
        <EditModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSave={saveEdit}
        />
      )}

      <header>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-primary tracking-tight">Gestion des utilisateurs</h1>
            <p className="mt-2 text-on-surface-variant">Administrez les comptes admin, employés et clients.</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/backoffice/admin/utilisateurs/ajouter')}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-3 bg-primary text-white font-semibold text-sm hover:opacity-90 transition-opacity"
          >
            <span className="material-symbols-outlined">add</span>
            Ajouter User
          </button>
        </div>
      </header>

      <section className="bg-white p-6 rounded-2xl border border-outline-variant/15">
        <div className="mb-6">
          <div className="flex gap-2 flex-wrap mb-5">
            {roles.map((role) => (
              <button
                key={role}
                onClick={() => setSelectedRole(role)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                  selectedRole === role ? 'bg-primary text-white' : 'bg-surface-container text-on-surface hover:bg-surface-container-high'
                }`}
                type="button"
              >
                {role}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-on-surface-variant">{users.length} utilisateur{users.length !== 1 ? 's' : ''}</p>
            <button
              type="button"
              onClick={exportPdf}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-container-high text-on-surface font-semibold text-sm hover:bg-outline-variant transition-colors"
            >
              <span className="material-symbols-outlined">download</span>
              Exporter PDF
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-center py-12 text-on-surface-variant">Chargement des utilisateurs...</p>
        ) : users.length === 0 ? (
          <div className="text-center py-12">
            <span className="material-symbols-outlined text-4xl text-outline/40 block mb-2">person_off</span>
            <p className="text-on-surface-variant">Aucun utilisateur trouvé pour ce rôle.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-outline-variant/30 bg-surface-container-low">
                  <th className="px-4 py-3 font-semibold text-on-surface">Nom</th>
                  <th className="px-4 py-3 font-semibold text-on-surface">Email</th>
                  <th className="px-4 py-3 font-semibold text-on-surface">Rôle</th>
                  <th className="px-4 py-3 font-semibold text-on-surface">Statut</th>
                  <th className="px-4 py-3 font-semibold text-on-surface text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((targetUser) => (
                  <tr key={targetUser.id} className="border-b border-outline-variant/20 hover:bg-surface-container-low transition-colors">
                    <td className="px-4 py-3 font-medium text-on-surface">{targetUser.username}</td>
                    <td className="px-4 py-3 text-on-surface-variant">{targetUser.email}</td>
                    <td className="px-4 py-3">
                      <span className="inline-block px-2 py-1 rounded-full text-xs font-semibold bg-primary-fixed text-on-primary-fixed-variant">
                        {targetUser.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${
                          targetUser.suspended ? 'bg-error-container text-on-error-container' : 'bg-secondary-fixed text-on-secondary-fixed-variant'
                        }`}
                      >
                        {targetUser.suspended ? 'Suspendu' : 'Actif'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => toggleSuspend(targetUser)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                            targetUser.suspended
                              ? 'bg-secondary-fixed text-on-secondary-fixed-variant border-secondary-fixed hover:opacity-80'
                              : 'bg-error-container text-on-error-container border-error-container hover:opacity-80'
                          }`}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                            {targetUser.suspended ? 'lock_open' : 'block'}
                          </span>
                          {targetUser.suspended ? 'Réactiver' : 'Suspendre'}
                        </button>
                        {(targetUser.role === 'EMPLOYE' || targetUser.role === 'ADMIN') && (
                          <button
                            type="button"
                            onClick={() => setEditingUser(targetUser)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border bg-primary-fixed text-on-primary-fixed-variant border-primary-fixed hover:opacity-80 transition-colors"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>edit</span>
                            Modifier
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}

export default AdminUsersPage;
