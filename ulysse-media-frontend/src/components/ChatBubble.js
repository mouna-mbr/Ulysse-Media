import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth-context';
import { useChat } from '../chat-context';
import { useNavigate } from 'react-router-dom';

function timeStr(dateStr) {
  const d = new Date(dateStr);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function ChatModal({ onClose }) {
  const { token, user } = useAuth();
    const { rooms, messages, activeQuoteId, loadRooms, loadMessages, sendMessage, setActiveQuoteId, clearUnread } = useChat();
    const navigate = useNavigate();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    loadRooms(token);
  }, [loadRooms, token]);

  useEffect(() => {
    if (activeQuoteId) {
      loadMessages(activeQuoteId, token);
      clearUnread();
    }
  }, [activeQuoteId, loadMessages, token, clearUnread]);

  const currentMessages = (activeQuoteId ? messages[activeQuoteId] : null) || [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentMessages.length]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || !activeQuoteId) return;
    setSending(true);
    try {
      await sendMessage(activeQuoteId, trimmed, token);
      setText('');
    } catch (_) {}
    setSending(false);
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="fixed bottom-20 right-5 z-50 w-80 bg-white rounded-2xl shadow-2xl border border-outline-variant/30 flex flex-col overflow-hidden" style={{ height: 480 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-primary text-white">
        {activeQuoteId ? (
          <button type="button" onClick={() => setActiveQuoteId(null)} className="flex items-center gap-2 font-semibold text-sm">
            <span className="material-symbols-outlined text-base">arrow_back</span>
            Chat projet
          </button>
        ) : (
          <p className="font-bold text-sm">Mes discussions</p>
        )}
        <button type="button" onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
          <span className="material-symbols-outlined text-base">close</span>
        </button>
      </div>

      {/* Room list */}
      {!activeQuoteId && (
        <div className="flex-1 overflow-y-auto divide-y divide-outline-variant/15">
          {rooms.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6 py-8 gap-3">
              <span className="material-symbols-outlined text-4xl text-outline">chat_bubble</span>
              <p className="text-sm text-on-surface-variant">Aucune discussion ouverte pour le moment.</p>
              <p className="text-xs text-outline">Un chat s'ouvrira après avoir accepté un devis et payé l'acompte.</p>
            </div>
          ) : (
            rooms.map((room) => (
              <button
                key={room.quote_id}
                type="button"
                  onClick={() => {
                    onClose();
                    const isBackoffice = user?.role === 'ADMIN' || user?.role === 'EMPLOYE';
                    navigate(isBackoffice ? `/backoffice/devis/${room.quote_id}/chat` : `/mes-devis/${room.quote_id}/chat`);
                  }}
                className="w-full text-left px-4 py-3 hover:bg-surface-container-low transition-colors space-y-0.5"
              >
                <p className="font-semibold text-sm text-on-surface">{room.service_type || `Projet #${room.quote_id.slice(0, 6)}`}</p>
                <p className="text-xs text-on-surface-variant">{room.client_name || room.employee_name || 'Chat ouvert'}</p>
                <p className="text-xs text-outline">{room.message_count || 0} message(s)</p>
              </button>
            ))
          )}
        </div>
      )}

      {/* Messages view */}
      {activeQuoteId && (
        <>
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 bg-surface-container-lowest">
            {currentMessages.length === 0 && (
              <p className="text-center text-xs text-outline py-4">Début de la conversation</p>
            )}
            {currentMessages.map((msg) => {
              const isMe = msg.userId === user?.id;
              const isSystem = msg.userId === 'SYSTEM';
              if (isSystem) {
                return (
                  <div key={msg.id} className="flex justify-center">
                    <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs px-3 py-2 rounded-xl max-w-[90%] text-center">
                      {msg.message}
                    </div>
                  </div>
                );
              }
              return (
                <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] space-y-0.5 ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                    {!isMe && <p className="text-[10px] text-outline font-medium px-1">{msg.username}</p>}
                    <div className={`px-3 py-2 rounded-2xl text-sm ${isMe ? 'bg-primary text-white rounded-tr-sm' : 'bg-white border border-outline-variant/20 text-on-surface rounded-tl-sm'}`}>
                      {msg.message}
                    </div>
                    <p className="text-[10px] text-outline px-1">{timeStr(msg.createdAt)}</p>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
          {/* Input */}
          <div className="px-3 py-2 border-t border-outline-variant/20 flex gap-2 items-end bg-white">
            <textarea
              rows={1}
              className="flex-1 resize-none rounded-xl bg-surface-container-highest border-none text-sm px-3 py-2 max-h-24 focus:ring-1 focus:ring-primary"
              placeholder="Votre message..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKey}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || !text.trim()}
              className="p-2 rounded-xl bg-primary text-white disabled:opacity-40 hover:opacity-90 transition-colors flex-shrink-0"
            >
              <span className="material-symbols-outlined text-base">send</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ChatBubble() {
  const { token, user } = useAuth();
  const { open, unread, setOpen, loadRooms, clearUnread } = useChat();

  useEffect(() => {
    if (token) loadRooms(token);
  }, [token, loadRooms]);

  if (!user) return null;

  return (
    <>
      {open && <ChatModal onClose={() => setOpen(false)} />}
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); if (!open) clearUnread(); }}
        className="fixed bottom-5 right-5 z-50 w-14 h-14 rounded-full bg-primary text-white shadow-2xl flex items-center justify-center hover:opacity-90 transition-all"
        aria-label="Ouvrir le chat"
      >
        <span className="material-symbols-outlined text-2xl">{open ? 'close' : 'chat'}</span>
        {unread > 0 && !open && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-white text-blue-600 text-[11px] font-bold flex items-center justify-center border-2 border-blue-500">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
    </>
  );
}

export default ChatBubble;
