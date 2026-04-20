import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authRequest, API_BASE_URL } from '../api';
import { useAuth } from '../auth-context';
import { useToast } from '../toast-context';

const roles = ['ADMIN', 'EMPLOYE', 'CLIENT'];
const employeeSpecialites = ['Videomaking', 'Design graphique', 'Social media', 'Montage', 'Motion design'];

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      const isEscapedQuote = inQuotes && line[index + 1] === '"';
      if (isEscapedQuote) {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function escapeCsvValue(value) {
  const text = value === null || value === undefined ? '' : String(value);
  if (text.includes('"')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  if (text.includes(',') || text.includes('\n')) {
    return `"${text}"`;
  }
  return text;
}

function AddUsersPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [mode, setMode] = useState('form'); // 'form' or 'csv'
  const [csvData, setCsvData] = useState([]);
  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    role: 'CLIENT',
    specialite: '',
    tauxHoraire: 0,
    disponibilite: true,
    niveau: 'STANDARD',
    tel: '',
    address: ''
  });

  // Parse CSV file
  const handleCsvFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target.result || '');
      const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      if (lines.length === 0) {
        setCsvData([]);
        toast.warning('Fichier CSV vide.');
        return;
      }

      const headers = parseCsvLine(lines[0]).map((header) => header.trim());
      const data = lines.slice(1).map((line) => {
        const values = parseCsvLine(line);
        const row = { id: Math.random() };
        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });
        return row;
      });

      setCsvData(data);
    };
    reader.readAsText(file);
  };

  // Update CSV row
  const updateCsvRow = (rowId, field, value) => {
    setCsvData((prev) =>
      prev.map((row) =>
        row.id === rowId ? { ...row, [field]: value } : row
      )
    );
  };

  // Delete CSV row
  const deleteCsvRow = (rowId) => {
    setCsvData((prev) => prev.filter((row) => row.id !== rowId));
  };

  // Submit CSV bulk import
  const submitCsvImport = async () => {
    if (csvData.length === 0) {
      toast.warning('Aucune donnée CSV à importer.');
      return;
    }

    try {
      // Convert CSV data to CSV string and upload
      const headers = Object.keys(csvData[0]).filter((k) => k !== 'id');
      const csvContent =
        headers.join(',') +
        '\n' +
        csvData
          .map((row) => headers.map((header) => escapeCsvValue(row[header])).join(','))
          .join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const formData = new FormData();
      formData.append('file', blob, 'import.csv');

      const response = await fetch(`${API_BASE_URL}/users/bulk-csv`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || 'Import CSV impossible.');
      }

      toast.success(`Import terminé : ${result.insertedCount} ajoutés, ${result.rejectedCount} rejetés.`);
      setCsvData([]);
      setTimeout(() => navigate('/backoffice/admin/utilisateurs'), 2000);
    } catch (importError) {
      toast.error(importError.message);
    }
  };

  // Submit single user form
  const submitUserForm = async (event) => {
    event.preventDefault();
    try {
      await authRequest('/users', token, {
        method: 'POST',
        body: JSON.stringify(form)
      });
      toast.success('Utilisateur créé avec succès.');
      setForm({
        username: '',
        email: '',
        password: '',
        role: 'CLIENT',
        specialite: '',
        tauxHoraire: 0,
        disponibilite: true,
        niveau: 'STANDARD',
        tel: '',
        address: ''
      });
      setTimeout(() => navigate('/backoffice/admin/utilisateurs'), 2000);
    } catch (submissionError) {
      toast.error(submissionError.message);
    }
  };

  return (
    <section className="space-y-6">
      <header>
        <button
          type="button"
          onClick={() => navigate('/backoffice/admin/utilisateurs')}
          className="mb-4 inline-flex items-center gap-2 text-primary font-semibold text-xs"
        >
          <span className="material-symbols-outlined">arrow_back</span>
          Retour à la liste
        </button>
        <h1 className="text-2xl font-bold text-primary tracking-tight">Ajouter des utilisateurs</h1>
        <p className="mt-2 text-on-surface-variant text-sm">Importez en masse via CSV ou créez un compte individuellement.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <article
          className={`p-6 rounded-2xl border-2 cursor-pointer transition-all ${
            mode === 'form'
              ? 'bg-primary-fixed border-primary text-on-primary-fixed'
              : 'bg-white border-outline-variant/20 text-on-surface'
          }`}
          onClick={() => setMode('form')}
        >
          <span className="material-symbols-outlined text-3xl">person_add</span>
          <h2 className=" text-lg font-bold">Formulaire</h2>
          <p className="text-sm mt-1">Créer un utilisateur à la fois.</p>
        </article>

        <article
          className={`p-6 rounded-2xl border-2 cursor-pointer transition-all ${
            mode === 'csv'
              ? 'bg-primary-fixed border-primary text-on-primary-fixed'
              : 'bg-white border-outline-variant/20 text-on-surface'
          }`}
          onClick={() => setMode('csv')}
        >
          <span className="material-symbols-outlined text-3xl">upload_file</span>
          <h2 className="text-lg font-bold">Importer CSV</h2>
          <p className="text-sm mt-1">Ajouter plusieurs utilisateurs à la fois.</p>
        </article>
      </div>

      {mode === 'form' && (
        <article className="bg-white border border-outline-variant/20 rounded-3xl p-6 md:p-8">
          <h2 className="text-xl font-bold text-on-surface mb-6">Créer un nouvel utilisateur</h2>
          <form className="space-y-5" onSubmit={submitUserForm}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-on-surface mb-1">Nom d'utilisateur</label>
                <input
                  className="w-full px-4 py-2 rounded-xl bg-surface-container-highest border-none focus:ring-2 focus:ring-primary"
                  placeholder="john_doe"
                  required
                  value={form.username}
                  onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-on-surface mb-1">Email</label>
                <input
                  className="w-full px-4 py-2 rounded-xl bg-surface-container-highest border-none focus:ring-2 focus:ring-primary"
                  placeholder="john@example.com"
                  required
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-on-surface mb-1">Mot de passe</label>
                <input
                  className="w-full px-4 py-2 rounded-xl bg-surface-container-highest border-none focus:ring-2 focus:ring-primary"
                  placeholder="••••••••"
                  required
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-on-surface mb-1">Rôle</label>
                <select
                  className="w-full px-4 py-2 rounded-xl bg-surface-container-highest border-none focus:ring-2 focus:ring-primary"
                  value={form.role}
                  onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))}
                >
                  {roles.map((r) => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-on-surface mb-1">Téléphone</label>
                <input
                  className="w-full px-4 py-2 rounded-xl bg-surface-container-highest border-none focus:ring-2 focus:ring-primary"
                  placeholder="+33 6 12 34 56 78"
                  value={form.tel}
                  onChange={(e) => setForm((prev) => ({ ...prev, tel: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-on-surface mb-1">Adresse</label>
                <input
                  className="w-full px-4 py-2 rounded-xl bg-surface-container-highest border-none focus:ring-2 focus:ring-primary"
                  placeholder="123 Rue de la SoA, Paris"
                  value={form.address}
                  onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
                />
              </div>

              {form.role === 'EMPLOYE' && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-on-surface mb-1">Spécialité</label>
                    <select
                      className="w-full px-4 py-2 rounded-xl bg-surface-container-highest border-none focus:ring-2 focus:ring-primary"
                      value={form.specialite}
                      onChange={(e) => setForm((prev) => ({ ...prev, specialite: e.target.value }))}
                    >
                      <option value="">Sélectionner une spécialité</option>
                      {employeeSpecialites.map((specialiteOption) => (
                        <option key={specialiteOption} value={specialiteOption}>
                          {specialiteOption}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-on-surface mb-1">Taux horaire</label>
                    <input
                      className="w-full px-4 py-2 rounded-xl bg-surface-container-highest border-none focus:ring-2 focus:ring-primary"
                      placeholder="45"
                      type="number"
                      value={form.tauxHoraire}
                      onChange={(e) => setForm((prev) => ({ ...prev, tauxHoraire: Number(e.target.value) }))}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-on-surface mb-1">Niveau</label>
                    <select
                      className="w-full px-4 py-2 rounded-xl bg-surface-container-highest border-none focus:ring-2 focus:ring-primary"
                      value={form.niveau}
                      onChange={(e) => setForm((prev) => ({ ...prev, niveau: e.target.value }))}
                    >
                      <option>JUNIOR</option>
                      <option>STANDARD</option>
                      <option>SENIOR</option>
                      <option>EXPERT</option>
                    </select>
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                className="flex-1 bg-primary text-white font-semibold py-3 rounded-xl hover:bg-primary-container transition-colors"
              >
                Créer l'utilisateur
              </button>
              <button
                type="button"
                onClick={() => navigate('/backoffice/admin/utilisateurs')}
                className="flex-1 bg-surface-container text-on-surface font-semibold py-3 rounded-xl hover:bg-surface-container-high transition-colors"
              >
                Annuler
              </button>
            </div>

          </form>
        </article>
      )}

      {mode === 'csv' && (
        <article className="bg-white border border-outline-variant/20 rounded-3xl p-6 md:p-8 space-y-6">
          <div>
            <label className="block text-sm font-semibold text-on-surface mb-3">Fichier CSV</label>
            <div className="border-2 border-dashed border-outline-variant/40 rounded-xl p-8 text-center">
              <span className="material-symbols-outlined text-4xl text-outline/50">cloud_upload</span>
              <input
                type="file"
                accept=".csv"
                onChange={handleCsvFile}
                className="hidden"
                id="csv-input"
              />
              <label htmlFor="csv-input" className="block mt-3 cursor-pointer">
                <p className="text-sm font-semibold text-primary">Cliquez pour sélectionner ou glissez-déposez</p>
                <p className="text-xs text-on-surface-variant">Colonnes attendues: username,email,password,role,specialite,tauxHoraire,disponibilite,niveau,tel,address</p>
              </label>
            </div>
          </div>

          {csvData.length > 0 && (
            <>
              <div>
                <h3 className="text-lg font-bold text-on-surface mb-3">Aperçu: {csvData.length} ligne{csvData.length > 1 ? 's' : ''}</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm mb-4 border-collapse">
                    <thead>
                      <tr className="bg-surface-container-highest">
                        {Object.keys(csvData[0])
                          .filter((k) => k !== 'id')
                          .map((key) => (
                            <th key={key} className="px-3 py-2 text-left font-semibold text-on-surface border border-outline-variant/20">
                              {key}
                            </th>
                          ))}
                        <th className="px-3 py-2 text-left font-semibold text-on-surface border border-outline-variant/20">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvData.map((row, index) => (
                        <tr key={row.id} className="border-b border-outline-variant/20">
                          {Object.keys(row)
                            .filter((k) => k !== 'id')
                            .map((key) => (
                              <td key={`${row.id}-${key}`} className="px-3 py-2 border border-outline-variant/20">
                                <input
                                  className="w-full px-2 py-1 rounded-lg bg-surface-container-highest border-none text-xs focus:ring-2 focus:ring-primary"
                                  value={row[key] || ''}
                                  onChange={(e) => updateCsvRow(row.id, key, e.target.value)}
                                />
                              </td>
                            ))}
                          <td className="px-3 py-2 border border-outline-variant/20">
                            <button
                              type="button"
                              onClick={() => deleteCsvRow(row.id)}
                              className="text-error hover:bg-error-container px-2 py-1 rounded-lg text-xs font-semibold"
                            >
                              Supprimer
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={submitCsvImport}
                  className="flex-1 bg-primary text-white font-semibold py-3 rounded-xl hover:bg-primary-container transition-colors"
                >
                  Importer {csvData.length} utilisateur{csvData.length > 1 ? 's' : ''}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCsvData([]);
                    document.getElementById('csv-input').value = '';
                  }}
                  className="flex-1 bg-surface-container text-on-surface font-semibold py-3 rounded-xl hover:bg-surface-container-high transition-colors"
                >
                  Annuler
                </button>
              </div>


            </>
          )}
        </article>
      )}
    </section>
  );
}

export default AddUsersPage;
