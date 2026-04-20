import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import MainNav from '../components/MainNav';
import { authRequest } from '../api';
import { useAuth } from '../auth-context';
import { useToast } from '../toast-context';
import { useChat } from '../chat-context';

function formatTime(dateStr) {
  const date = new Date(dateStr);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatListDate(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay ? formatTime(dateStr) : date.toLocaleDateString('fr-FR');
}

function getRoomLabel(room, role) {
  if (role === 'CLIENT') return room.employee_name || 'Chargé de projet';
  if (role === 'EMPLOYE') return room.client_name || 'Client';
  return room.client_name || room.employee_name || 'Conversation';
}

function ChatPage() {
  const { quoteId } = useParams();
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const toast = useToast();
  const {
    rooms,
    messages: chatMessages,
    loadRooms,
    loadMessages,
    sendMessage,
    clearUnread,
  } = useChat();

  const [selectedQuoteId, setSelectedQuoteId] = useState(quoteId || null);
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [loadingQuote, setLoadingQuote] = useState(true);
  const [search, setSearch] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  const isClient = user?.role === 'CLIENT';
  const isBackoffice = user?.role === 'ADMIN' || user?.role === 'EMPLOYE';

  useEffect(() => {
    if (token) loadRooms(token);
    clearUnread();
  }, [token, loadRooms, clearUnread]);

  useEffect(() => {
    setSelectedQuoteId(quoteId || null);
  }, [quoteId]);

  const filteredRooms = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rooms;
    return rooms.filter((room) => {
      const partner = getRoomLabel(room, user?.role).toLowerCase();
      const service = String(room.service_type || '').toLowerCase();
      const reference = String(room.quote_id || '').toLowerCase();
      return partner.includes(needle) || service.includes(needle) || reference.includes(needle);
    });
  }, [rooms, search, user?.role]);

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.quote_id === selectedQuoteId) || null,
    [rooms, selectedQuoteId]
  );

  const messages = chatMessages[selectedQuoteId] || [];

  const loadQuote = useCallback((targetQuoteId) => {
    if (!targetQuoteId || !token) return;
    setLoadingQuote(true);
    authRequest(`/quote-requests/${targetQuoteId}`, token)
      .then((res) => setSelectedQuote(res.quoteRequest || null))
      .catch((err) => toast.error(err.message))
      .finally(() => setLoadingQuote(false));
  }, [token, toast]);

  useEffect(() => {
    if (!selectedQuoteId || !token) return;
    loadQuote(selectedQuoteId);
    loadMessages(selectedQuoteId, token);
  }, [selectedQuoteId, token, loadQuote, loadMessages]);

  useEffect(() => {
    if (!selectedQuoteId || !token) return;
    const intervalId = setInterval(() => {
      loadMessages(selectedQuoteId, token);
    }, 3000);
    return () => clearInterval(intervalId);
  }, [selectedQuoteId, token, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, selectedQuoteId]);

  useEffect(() => {
    if (!selectedQuoteId && rooms.length > 0) {
      const firstRoomId = rooms[0].quote_id;
      setSelectedQuoteId(firstRoomId);
      const target = isBackoffice ? `/backoffice/devis/${firstRoomId}/chat` : `/mes-devis/${firstRoomId}/chat`;
      navigate(target, { replace: true });
    }
  }, [selectedQuoteId, rooms, isBackoffice, navigate]);

  const handleSelectRoom = (nextQuoteId) => {
    setSelectedQuoteId(nextQuoteId);
    const target = isBackoffice ? `/backoffice/devis/${nextQuoteId}/chat` : `/mes-devis/${nextQuoteId}/chat`;
    navigate(target);
  };

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || !selectedQuoteId) return;
    setSending(true);
    try {
      await sendMessage(selectedQuoteId, trimmed, token);
      setText('');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const pageBackLink = isClient
    ? '/mes-devis'
    : '/backoffice/devis';

  const partnerName = selectedRoom ? getRoomLabel(selectedRoom, user?.role) : 'Conversation';

  const content = (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Messagerie projet</h1>
          <p className="text-sm text-on-surface-variant">Échangez avec {isClient ? 'votre chargé de projet' : 'votre client'} en temps réel.</p>
        </div>
        <Link
          to={pageBackLink}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-outline-variant/30 bg-white text-sm font-semibold text-on-surface hover:bg-surface-container-low transition-colors"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
          Retour
        </Link>
      </div>

      <div className="grid min-h-[calc(100vh-180px)] overflow-hidden rounded-[28px] border border-outline-variant/20 bg-white shadow-sm lg:grid-cols-[340px_1fr]">
        <aside className="border-b border-outline-variant/20 bg-surface-container-lowest lg:border-b-0 lg:border-r">
          <div className="border-b border-outline-variant/20 p-4 space-y-3">
            <div>
              <p className="text-lg font-bold text-on-surface">Discussions</p>
              <p className="text-xs text-on-surface-variant">{rooms.length} conversation(s) active(s)</p>
            </div>
            <label className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 border border-outline-variant/20">
              <span className="material-symbols-outlined text-outline text-[20px]">search</span>
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Rechercher un client, un projet..."
                className="w-full bg-transparent border-none p-0 text-sm text-on-surface placeholder:text-outline focus:ring-0"
              />
            </label>
          </div>

          <div className="chat-scrollbar-blue max-h-[calc(100vh-310px)] overflow-y-auto lg:max-h-[calc(100vh-280px)]">
            {filteredRooms.length === 0 ? (
              <div className="px-6 py-10 text-center space-y-2">
                <span className="material-symbols-outlined text-4xl text-outline">forum</span>
                <p className="text-sm font-semibold text-on-surface">Aucune discussion trouvée</p>
                <p className="text-xs text-on-surface-variant">Essayez une autre recherche ou ouvrez un projet payé.</p>
              </div>
            ) : (
              filteredRooms.map((room) => {
                const roomMessages = chatMessages[room.quote_id] || [];
                const lastMessage = roomMessages[roomMessages.length - 1];
                const active = room.quote_id === selectedQuoteId;
                return (
                  <button
                    key={room.quote_id}
                    type="button"
                    onClick={() => handleSelectRoom(room.quote_id)}
                    className={`w-full border-b border-outline-variant/10 px-4 py-4 text-left transition-colors ${active ? 'bg-slate-300' : 'bg-slate-100 hover:bg-slate-200'}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-11 w-11 items-center justify-center rounded-full bg-blue-900 text-sm font-bold text-white">
                        {getRoomLabel(room, user?.role).slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-on-surface">{getRoomLabel(room, user?.role)}</p>
                          <span className="text-[11px] text-outline">{lastMessage ? formatListDate(lastMessage.createdAt) : ''}</span>
                        </div>
                        <p className="truncate text-xs font-medium text-primary">{room.service_type || `Projet #${room.quote_id.slice(0, 6)}`}</p>
                        <p className="truncate text-xs text-on-surface-variant">
                          {lastMessage ? lastMessage.message : 'Discussion prête à démarrer'}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <div className="flex min-h-[65vh] flex-col bg-surface-container-lowest">
          {selectedRoom ? (
            <>
              <header className="border-b border-outline-variant/20 bg-white px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
                    {partnerName.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold text-on-surface">{partnerName}</p>
                    <p className="truncate text-xs text-on-surface-variant">
                      {loadingQuote ? 'Chargement du projet...' : (selectedQuote?.serviceName || selectedQuote?.serviceType || `Projet #${selectedRoom.quote_id.slice(0, 6)}`)}
                    </p>
                  </div>
                </div>
              </header>

              <div className="chat-scrollbar-blue max-h-[calc(100vh-340px)] flex-1 space-y-3 overflow-y-auto px-4 py-5 md:px-6">
                {messages.length === 0 && (
                  <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                    <span className="material-symbols-outlined text-5xl text-outline">chat_bubble_outline</span>
                    <p className="text-sm font-semibold text-on-surface">Aucun message pour le moment</p>
                    <p className="max-w-sm text-sm text-on-surface-variant">La conversation commencera ici. Vous pouvez envoyer votre premier message en bas.</p>
                  </div>
                )}

                {messages.map((message) => {
                  const isMe = message.userId === user?.id;
                  const isSystem = message.userId === 'SYSTEM';

                  if (isSystem) {
                    return (
                      <div key={message.id} className="flex justify-center">
                        <div className="max-w-xl rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-xs text-emerald-800">
                          {message.message}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={message.id} className={`flex items-end gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                      {!isMe && (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-xs font-bold text-primary shadow-sm">
                          {message.username?.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div className={`flex max-w-[78%] flex-col gap-1 ${isMe ? 'items-end' : 'items-start'}`}>
                        {!isMe && <p className="px-1 text-[11px] font-semibold text-on-surface-variant">{message.username}</p>}
                        <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${isMe ? 'rounded-br-sm bg-primary text-white' : 'rounded-bl-sm border border-outline-variant/15 bg-white text-on-surface'}`}>
                          {message.message}
                        </div>
                        <p className="px-1 text-[10px] text-outline">{formatTime(message.createdAt)}</p>
                      </div>
                      {isMe && (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-white shadow-sm">
                          {user?.username?.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              <footer className="border-t border-outline-variant/20 bg-white p-4">
                <div className="flex items-end gap-3">
                  <textarea
                    rows={1}
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={`Écrire à ${partnerName}...`}
                    className="max-h-32 min-h-[52px] flex-1 resize-none rounded-2xl border-none bg-surface-container-highest px-4 py-3 text-sm text-on-surface placeholder:text-outline focus:ring-2 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={sending || !text.trim()}
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white transition-all hover:opacity-90 disabled:opacity-40"
                  >
                    <span className="material-symbols-outlined text-[20px]">send</span>
                  </button>
                </div>
              </footer>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <span className="material-symbols-outlined text-5xl text-outline">forum</span>
              <p className="text-base font-bold text-on-surface">Sélectionnez une discussion</p>
              <p className="max-w-sm text-sm text-on-surface-variant">Choisissez une conversation dans la colonne de gauche pour afficher les messages.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );

  if (isClient) {
    return (
      <div className="min-h-screen bg-surface-container-lowest">
        <MainNav />
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {content}
        </main>
      </div>
    );
  }

  return content;
}

export default ChatPage;
