import { useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';

Chart.register(...registerables, ChartDataLabels);

const monthlyBars = [40, 55, 48, 65, 78, 92, 60, 72, 66, 74, 81, 88];
const monthlyLabels = ['JAN', 'FÉV', 'MAR', 'AVR', 'MAI', 'JUN', 'JUL', 'AOÛ', 'SEP', 'OCT', 'NOV', 'DÉC'];

const kpis = [
  {
    title: 'Revenu',
    value: '124 592 €',
    delta: '+12,5% vs mois dernier',
    trend: 'up',
    icon: 'payments'
  },
  {
    title: 'Taux de conversion',
    value: '3,84%',
    delta: '+0,4% vs mois dernier',
    trend: 'up',
    icon: 'bolt'
  },
  {
    title: 'Nouveaux leads',
    value: '842',
    delta: '-2,1% vs mois dernier',
    trend: 'down',
    icon: 'person_add'
  },
  {
    title: 'Projets actifs',
    value: '47',
    delta: '+5 cette semaine',
    trend: 'up',
    icon: 'work'
  }
];

const requests = [
  {
    id: 'R-2026-104',
    client: 'Aether Media Group',
    service: 'Refonte identité visuelle',
    date: '10 avr 2026',
    budget: '12 000 €',
    status: 'En attente'
  },
  {
    id: 'R-2026-097',
    client: 'Vantage Logistics',
    service: 'Spot 3D motion',
    date: '08 avr 2026',
    budget: '45 500 €',
    status: 'Assignée'
  },
  {
    id: 'R-2026-093',
    client: 'Solaris Tech',
    service: 'Stratégie social media',
    date: '07 avr 2026',
    budget: '8 400 €',
    status: 'En revue'
  },
  {
    id: 'R-2026-088',
    client: 'Nexa Studio',
    service: 'Pack vidéo corporate',
    date: '05 avr 2026',
    budget: '21 300 €',
    status: 'Validée'
  }
];

const statusClass = {
  'En attente': 'bg-error-container text-on-error-container',
  Assignée: 'bg-primary-fixed text-on-primary-fixed-variant',
  'En revue': 'bg-tertiary-fixed-dim text-on-tertiary-fixed-variant',
  Validée: 'bg-secondary-fixed text-on-secondary-fixed-variant'
};

function AdminDashboardPage() {
  const revenueCanvasRef = useRef(null);
  const pipelineCanvasRef = useRef(null);
  const servicesCanvasRef = useRef(null);

  useEffect(() => {
    const revenueChart = new Chart(revenueCanvasRef.current, {
      type: 'bar',
      data: {
        labels: monthlyLabels,
        datasets: [
          {
            label: 'Revenu',
            data: monthlyBars,
            backgroundColor: monthlyBars.map((value) => (value >= 90 ? '#1a3d8f' : '#dbe1ff')),
            borderRadius: 10,
            borderSkipped: false,
            maxBarThickness: 24
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: true },
          datalabels: { display: false }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#747683', font: { size: 10, weight: '700' } } },
          y: { beginAtZero: true, max: 100, ticks: { display: false }, grid: { color: 'rgba(116,118,131,0.15)' } }
        }
      }
    });

    const pipelineChart = new Chart(pipelineCanvasRef.current, {
      type: 'line',
      data: {
        labels: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'],
        datasets: [
          {
            label: 'Entrées',
            data: [12, 16, 14, 20, 18, 24, 27, 29],
            borderColor: '#00266f',
            backgroundColor: 'rgba(0,38,111,0.08)',
            fill: true,
            tension: 0.35,
            pointRadius: 3,
            pointBackgroundColor: '#00266f'
          },
          {
            label: 'Conversions',
            data: [8, 9, 10, 12, 13, 15, 16, 19],
            borderColor: '#004768',
            backgroundColor: 'transparent',
            fill: false,
            tension: 0.35,
            pointRadius: 3,
            pointBackgroundColor: '#004768'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', align: 'end', labels: { boxWidth: 10, usePointStyle: true } },
          datalabels: { display: false }
        },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, ticks: { stepSize: 5 }, grid: { color: 'rgba(116,118,131,0.15)' } }
        }
      }
    });

    const servicesChart = new Chart(servicesCanvasRef.current, {
      type: 'doughnut',
      data: {
        labels: ['Branding', 'Vidéo / Motion', 'Social Media'],
        datasets: [
          {
            data: [44, 27, 29],
            backgroundColor: ['#00266f', '#004768', '#b4c5ff'],
            borderWidth: 0,
            cutout: '68%'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          datalabels: {
            color: '#ffffff',
            font: { weight: '700', size: 11 },
            formatter: (value) => `${value}%`
          }
        }
      }
    });

    return () => {
      revenueChart.destroy();
      pipelineChart.destroy();
      servicesChart.destroy();
    };
  }, []);

  return (
    <section className="space-y-8">
      <header >
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-primary tracking-tight">Dashboard Admin</h1>
            <p className="mt-2 text-on-surface-variant">Vue globale des performances, de la production et des demandes clients.</p>
          </div>
          <button type="button" className="inline-flex items-center gap-2 rounded-xl px-4 py-2 bg-primary text-white font-semibold text-sm">
            <span className="material-symbols-outlined text-[18px]">add</span>
            Nouveau service
          </button>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        {kpis.map((kpi) => (
          <article key={kpi.title} className="bg-white rounded-2xl border border-outline-variant/20 p-5">
            <div className="flex items-start justify-between">
              <p className="text-xs uppercase tracking-widest font-bold text-outline">{kpi.title}</p>
              <span className="material-symbols-outlined text-primary">{kpi.icon}</span>
            </div>
            <p className="mt-4 text-3xl font-extrabold text-on-surface tracking-tight">{kpi.value}</p>
            <p className={`mt-1 text-sm font-medium ${kpi.trend === 'up' ? 'text-green-700' : 'text-red-700'}`}>
              {kpi.delta}
            </p>
            <div className="mt-4 h-8 w-full flex items-end gap-1 opacity-70">
              {[4, 6, 5, 8, 7, 9].map((height, index) => (
                <div key={`${kpi.title}-${height}-${index}`} className="flex-1 bg-primary/25 rounded-t" style={{ height: `${height * 10}%` }} />
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <article className="xl:col-span-2 bg-white rounded-3xl border border-outline-variant/20 p-6 md:p-8">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl font-bold text-on-surface">Vélocité du revenu mensuel</h2>
              <p className="text-sm text-on-surface-variant">Performance glissante sur 12 mois</p>
            </div>
            <div className="text-xs font-semibold text-primary bg-primary-fixed px-3 py-1 rounded-full">12M</div>
          </div>
          <div className="h-64">
            <canvas ref={revenueCanvasRef} />
          </div>
        </article>

        <article className="bg-primary text-white rounded-3xl p-6 relative overflow-hidden">
          <div className="relative z-10">
            <p className="text-xs uppercase tracking-widest opacity-80">Spotlight</p>
            <h3 className="mt-2 text-xl font-bold">Campagne en vedette</h3>
            <p className="mt-1 text-sm opacity-90">Ulysse x Global Vision 2026</p>
          </div>
          <div className="relative z-10 mt-6 space-y-4">
            <div className="bg-white/10 border border-white/20 rounded-2xl p-4">
              <p className="text-xs uppercase tracking-widest opacity-80">Dernier rendu</p>
              <p className="mt-1 font-semibold">Cyber-Cityscape 4K</p>
            </div>
            <div className="bg-white rounded-xl px-4 py-3 text-primary font-semibold text-sm text-center">
              Gérer la médiathèque
            </div>
          </div>
          <div className="absolute -right-12 -top-12 w-44 h-44 bg-primary-container/50 rounded-full blur-3xl" />
          <div className="absolute -left-16 -bottom-16 w-44 h-44 bg-tertiary-container/50 rounded-full blur-3xl" />
        </article>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <article className="xl:col-span-2 bg-white rounded-3xl border border-outline-variant/20 p-6 md:p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-xl font-bold text-on-surface">Pipeline des demandes</h3>
              <p className="text-sm text-on-surface-variant">Entrées hebdomadaires et conversion</p>
            </div>
            <span className="text-xs font-semibold text-on-surface-variant">Semaine 15</span>
          </div>
          <div className="h-48 bg-surface-container-low rounded-2xl px-4 py-3">
            <canvas ref={pipelineCanvasRef} />
          </div>
        </article>

        <article className="bg-white rounded-3xl border border-outline-variant/20 p-6">
          <h3 className="text-xl font-bold text-on-surface">Répartition services</h3>
          <p className="text-sm text-on-surface-variant">Projets en cours par pôle</p>
          <div className="mt-6 flex items-center justify-center">
            <div className="w-44 h-44">
              <canvas ref={servicesCanvasRef} />
            </div>
          </div>
          <ul className="mt-6 space-y-2 text-sm">
            <li className="flex items-center justify-between"><span className="text-on-surface-variant">Branding</span><strong>44%</strong></li>
            <li className="flex items-center justify-between"><span className="text-on-surface-variant">Vidéo / Motion</span><strong>27%</strong></li>
            <li className="flex items-center justify-between"><span className="text-on-surface-variant">Social Media</span><strong>29%</strong></li>
          </ul>
        </article>
      </section>

      <section className="bg-white rounded-3xl border border-outline-variant/20 p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
          <div>
            <h3 className="text-xl font-bold text-on-surface">Demandes de projet récentes</h3>
            <p className="text-sm text-on-surface-variant">Requêtes entrantes depuis le portail client</p>
          </div>
          <button type="button" className="text-sm font-bold text-primary">Voir tout</button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-outline uppercase text-[11px] tracking-widest">
                <th className="pb-3">Réf</th>
                <th className="pb-3">Client</th>
                <th className="pb-3">Service</th>
                <th className="pb-3">Date</th>
                <th className="pb-3">Budget</th>
                <th className="pb-3">Statut</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id} className="border-t border-outline-variant/20">
                  <td className="py-4 font-semibold text-on-surface">{request.id}</td>
                  <td className="py-4">{request.client}</td>
                  <td className="py-4 text-on-surface-variant">{request.service}</td>
                  <td className="py-4 text-on-surface-variant">{request.date}</td>
                  <td className="py-4 font-semibold">{request.budget}</td>
                  <td className="py-4">
                    <span className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase ${statusClass[request.status]}`}>
                      {request.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

export default AdminDashboardPage;
