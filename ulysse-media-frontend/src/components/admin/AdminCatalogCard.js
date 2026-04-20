function AdminCatalogCard({
  title,
  subtitle,
  description,
  image,
  accentLabel,
  onEdit,
  onDelete,
  onClick,
  children
}) {
  return (
    <article
      className="group w-full min-h-[340px] bg-white rounded-[30px] shadow-[15px_15px_30px_#d7dbe7,-15px_-15px_30px_#ffffff] transition duration-200 hover:shadow-[0px_10px_20px_rgba(0,0,0,0.1)] overflow-hidden"
      onClick={onClick}
    >
      <div className="relative h-[175px] rounded-t-[30px] overflow-hidden bg-gradient-to-br from-[#e66465] via-[#9ba8ff] to-[#6cc7ff] flex justify-end">
        {image ? (
          <img src={image} alt={title} className="absolute inset-0 w-full h-full object-cover" />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black/25 to-transparent" />
        <div className="relative z-10 flex gap-2 m-4">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onEdit();
            }}
            className="w-9 h-9 rounded-xl bg-white/95 flex items-center justify-center shadow-sm transition group-hover:scale-105"
          >
            <span className="material-symbols-outlined text-[18px] text-primary">edit</span>
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
            className="w-9 h-9 rounded-xl bg-white/95 flex items-center justify-center shadow-sm transition group-hover:scale-105"
          >
            <span className="material-symbols-outlined text-[18px] text-error">delete</span>
          </button>
        </div>
      </div>

      <div className="p-5 flex flex-col gap-3">
        <div>
          <p className="text-[15px] font-semibold text-black">{title}</p>
          <p className="text-[13px] text-[#999999] mt-1">{subtitle}</p>
        </div>
        <p className="text-xs text-on-surface-variant line-clamp-3 min-h-[48px]">{description}</p>
        <div className="mt-auto flex items-center justify-between gap-3">
          <div className="px-3 py-2 rounded-xl bg-[#e3fff9] text-[#6573d8] text-xs font-medium flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-[16px]">workspaces</span>
            <span className="truncate">{accentLabel}</span>
          </div>
          {children}
        </div>
      </div>
    </article>
  );
}

export default AdminCatalogCard;
