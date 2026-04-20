import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth-context';
import { useNotifications } from '../notification-context';

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'à l\'instant';
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  return `il y a ${Math.floor(diff / 86400)} j`;
}

function NotificationBell({ dark = false }) {
  const { token } = useAuth();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleNotificationClick = (notif) => {
    if (!notif.read) markRead(notif.id, token);
    setOpen(false);
    if (notif.link) navigate(notif.link);
  };

  const handleMarkAll = (e) => {
    e.stopPropagation();
    markAllRead(token);
  };

  const iconClass = dark
    ? 'p-2 text-on-surface-variant hover:bg-surface-container rounded-full transition-colors relative'
    : 'relative inline-flex items-center justify-center w-10 h-10 rounded-xl bg-surface-container-high text-primary';

  return (
    <div ref={ref} className="relative">
      <button type="button" className={iconClass} onClick={() => setOpen((v) => !v)}>
        <span className="material-symbols-outlined text-[20px]">notifications</span>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-white text-blue-600 text-[10px] font-bold flex items-center justify-center border-2 border-blue-500">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white border border-outline-variant/30 rounded-2xl shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/20">
            <p className="font-bold text-sm text-on-surface">Notifications</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAll}
                className="text-xs text-primary font-semibold hover:underline"
              >
                Tout marquer lu
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto divide-y divide-outline-variant/10">
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-on-surface-variant">Aucune notification</p>
            ) : (
              notifications.map((notif) => (
                <button
                  key={notif.id}
                  type="button"
                  onClick={() => handleNotificationClick(notif)}
                  className={`w-full text-left px-4 py-3 hover:bg-surface-container-low transition-colors space-y-0.5 ${notif.read ? '' : 'bg-blue-50/60'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm leading-snug ${notif.read ? 'text-on-surface-variant' : 'font-semibold text-on-surface'}`}>
                      {notif.title}
                    </p>
                    {!notif.read && <span className="mt-1.5 min-w-[8px] h-2 w-2 rounded-full bg-primary flex-shrink-0" />}
                  </div>
                  {notif.message && (
                    <p className="text-xs text-on-surface-variant line-clamp-2">{notif.message}</p>
                  )}
                  <p className="text-[10px] text-outline">{timeAgo(notif.createdAt)}</p>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
