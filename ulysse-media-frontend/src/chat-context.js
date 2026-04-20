import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { authRequest } from './api';
import { socket } from './socket';

const ChatContext = createContext(null);

export function ChatProvider({ children }) {
  const [rooms, setRooms] = useState([]);
  const [activeQuoteId, setActiveQuoteId] = useState(null);
  const [messages, setMessages] = useState({}); // { quoteId: [...msgs] }
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  const loadRooms = useCallback((token) => {
    if (!token) return;
    authRequest('/chat/rooms', token)
      .then((res) => setRooms(res.rooms || []))
      .catch(() => {});
  }, []);

  const loadMessages = useCallback((quoteId, token) => {
    authRequest(`/chat/rooms/${quoteId}/messages`, token)
      .then((res) => {
        setMessages((prev) => ({ ...prev, [quoteId]: res.messages || [] }));
      })
      .catch(() => {});
  }, []);

  const sendMessage = useCallback(async (quoteId, message, token) => {
    const res = await authRequest(`/chat/rooms/${quoteId}/messages`, token, {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
    const sent = res?.message;
    if (sent) {
      setMessages((prev) => {
        const existing = prev[quoteId] || [];
        if (existing.some((m) => m.id === sent.id)) return prev;
        return { ...prev, [quoteId]: [...existing, sent] };
      });
    }
  }, []);

  const openRoom = useCallback((quoteId, token) => {
    setActiveQuoteId(quoteId);
    setOpen(true);
    loadMessages(quoteId, token);
  }, [loadMessages]);

  useEffect(() => {
    const onChatMessage = (msg) => {
      const quoteId = msg.channel?.replace('quote_', '');
      if (!quoteId) return;
      setMessages((prev) => {
        const existing = prev[quoteId] || [];
        // Avoid duplicates
        if (existing.some((m) => m.id === msg.id)) return prev;
        return { ...prev, [quoteId]: [...existing, msg] };
      });
      setUnread((n) => n + 1);
    };
    socket.on('chat_message', onChatMessage);
    return () => socket.off('chat_message', onChatMessage);
  }, []);

  const clearUnread = useCallback(() => setUnread(0), []);

  return (
    <ChatContext.Provider value={{ rooms, messages, activeQuoteId, open, unread, loadRooms, loadMessages, sendMessage, openRoom, setOpen, setActiveQuoteId, clearUnread }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  return useContext(ChatContext);
}
