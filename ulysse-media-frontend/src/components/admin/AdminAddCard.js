import { Link } from 'react-router-dom';

function AdminAddCard({ to, label }) {
  return (
    <Link
      to={to}
      className="w-full min-h-[340px] rounded-[30px] border-2 border-dashed border-blue-300 bg-blue-500/10 flex flex-col items-center justify-center gap-4 text-center transition hover:bg-blue-500/15 hover:border-blue-500"
    >
      <div className="w-14 h-14 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-lg">
        <span className="material-symbols-outlined text-[28px]">add</span>
      </div>
      <div>
        <p className="font-headline font-bold text-primary text-lg">Ajouter</p>
        <p className="text-sm text-on-surface-variant mt-1">{label}</p>
      </div>
    </Link>
  );
}

export default AdminAddCard;
