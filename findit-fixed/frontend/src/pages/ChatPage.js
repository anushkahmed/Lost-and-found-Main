import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { fileUrl } from '../config';

const T = {
  bg: '#0f1a0f',
  card: '#1a2e20',
  panel: '#14231a',
  border: 'rgba(74,124,111,0.22)',
  text: '#daeee6',
  muted: '#6b8f7a',
  accent: '#4a7c6f',
  accentSoft: 'rgba(74,124,111,0.18)',
  chipBg: 'rgba(74,124,111,0.15)',
  chipBorder: 'rgba(138,181,160,0.35)',
};

export default function ChatPage() {
  const { user } = useAuth();
  const { socket } = useSocket();

  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState('');
  const [messages, setMessages] = useState([]);
  const [loadingConvos, setLoadingConvos] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  const [input, setInput] = useState('');
  const [file, setFile] = useState(null);
  const [sending, setSending] = useState(false);
  const [typingMap, setTypingMap] = useState({}); // conversationId -> boolean

  const bottomRef = useRef(null);

  const activeConvo = useMemo(
    () => conversations.find(c => c._id === activeId) || null,
    [conversations, activeId]
  );

  const otherUser = useMemo(() => {
    if (!activeConvo) return null;
    const parts = activeConvo.participants || [];
    return parts.find(p => p?._id && p._id !== user?._id) || parts[0] || null;
  }, [activeConvo, user?._id]);

  const fetchConversations = async () => {
    setLoadingConvos(true);
    try {
      const { data } = await axios.get('/api/chat/conversations');
      setConversations(data);
      if (!activeId && data.length > 0) setActiveId(data[0]._id);
    } finally {
      setLoadingConvos(false);
    }
  };

  const fetchMessages = async (conversationId) => {
    if (!conversationId) return;
    setLoadingMsgs(true);
    try {
      const { data } = await axios.get(`/api/chat/conversations/${conversationId}/messages?page=1&limit=50`);
      setMessages(data.messages || []);
      await axios.put(`/api/chat/conversations/${conversationId}/read`);
      setConversations(prev => prev.map(c => c._id === conversationId ? { ...c, unreadForMe: 0 } : c));
    } finally {
      setLoadingMsgs(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  };

  useEffect(() => { fetchConversations().catch(() => {}); }, []);

  useEffect(() => { fetchMessages(activeId).catch(() => {}); }, [activeId]);

  // Real-time inbound messages
  useEffect(() => {
    if (!socket) return;
    const onMsg = (payload) => {
      const { conversationId, message } = payload || {};
      if (!conversationId || !message) return;

      setConversations(prev => {
        const idx = prev.findIndex(c => c._id === conversationId);
        if (idx === -1) return prev;
        const updated = [...prev];
        const c = { ...updated[idx] };
        c.lastMessage = message.body || (message.attachment?.type?.startsWith('image/') ? '📷 Photo' : '📎 Attachment');
        c.updatedAt = new Date().toISOString();
        c.unreadForMe = conversationId === activeId ? 0 : (Number(c.unreadForMe || 0) + 1);
        updated.splice(idx, 1);
        return [c, ...updated];
      });

      if (conversationId === activeId) {
        setMessages(prev => [...prev, message]);
        axios.put(`/api/chat/conversations/${conversationId}/read`).catch(() => {});
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      }
    };

    const onTyping = ({ conversationId, isTyping }) => {
      if (!conversationId) return;
      setTypingMap(prev => ({ ...prev, [conversationId]: Boolean(isTyping) }));
      if (isTyping) {
        setTimeout(() => setTypingMap(prev => ({ ...prev, [conversationId]: false })), 2500);
      }
    };

    socket.on('chat:message', onMsg);
    socket.on('chat:typing', onTyping);
    return () => {
      socket.off('chat:message', onMsg);
      socket.off('chat:typing', onTyping);
    };
  }, [socket, activeId]);

  const sendTyping = (isTyping) => {
    if (!socket || !activeConvo) return;
    const participants = activeConvo.participants || [];
    // best-effort: send to all others besides unknown self by using all participants
    participants.forEach(p => {
      if (!p?._id || p._id === user?._id) return;
      socket.emit('chat:typing', { toUserId: p._id, conversationId: activeConvo._id, isTyping });
    });
  };

  const send = async () => {
    if (!activeId) return;
    if (!input.trim() && !file) return;
    setSending(true);
    try {
      const fd = new FormData();
      fd.append('body', input.trim());
      if (file) fd.append('file', file);

      const { data } = await axios.post(`/api/chat/conversations/${activeId}/messages`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setMessages(prev => [...prev, data]);
      setInput('');
      setFile(null);
      setConversations(prev => prev.map(c => c._id === activeId ? { ...c, lastMessage: data.body || '📎 Attachment', unreadForMe: 0 } : c));
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    } finally {
      setSending(false);
      sendTyping(false);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', gap: 14, height: 'calc(100vh - 48px)' }}>
        {/* Left: conversation list */}
        <div style={{ width: 320, background: T.panel, border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: 14, borderBottom: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>💬 Chat</div>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>Messages are saved in MongoDB and delivered live.</div>
          </div>
          <div style={{ padding: 10, overflow: 'auto', flex: 1 }}>
            {loadingConvos ? (
              <div style={{ color: T.muted, padding: 10 }}>Loading conversations...</div>
            ) : conversations.length === 0 ? (
              <div style={{ color: T.muted, padding: 10 }}>No conversations yet.</div>
            ) : conversations.map(c => (
              <button
                key={c._id}
                onClick={() => setActiveId(c._id)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  border: `1px solid ${T.border}`,
                  background: c._id === activeId ? T.accentSoft : 'transparent',
                  color: T.text,
                  borderRadius: 12,
                  padding: 10,
                  cursor: 'pointer',
                  marginBottom: 8,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                  <div style={{ fontWeight: 800, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {(c.participants || []).find(p => p?._id && p._id !== user?._id)?.name || 'Conversation'}
                  </div>
                  {c.unreadForMe > 0 && (
                    <span style={{ background: '#3d6b55', color: '#b8d4c8', fontSize: 11, fontWeight: 800, padding: '1px 8px', borderRadius: 999 }}>
                      {c.unreadForMe}
                    </span>
                  )}
                </div>
                <div style={{ color: T.muted, fontSize: 12, marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.itemId?.name ? `Item: ${c.itemId.name} · ${c.lastMessage || '—'}` : (c.lastMessage || '—')}
                </div>
              </button>
            ))}
          </div>
          <div style={{ padding: 10, borderTop: `1px solid ${T.border}`, color: T.muted, fontSize: 11 }}>
            Tip: open an item and click “Message poster”.
          </div>
        </div>

        {/* Right: messages */}
        <div style={{ flex: 1, background: T.panel, border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: 14, borderBottom: `1px solid ${T.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ color: T.text, fontWeight: 900, fontSize: 13 }}>
                {activeConvo?.itemId?.name ? `Chat about "${activeConvo.itemId.name}"` : 'Select a conversation'}
              </div>
              {typingMap[activeId] && (
                <span style={{ fontSize: 11, color: T.muted, border: `1px solid ${T.chipBorder}`, background: T.chipBg, padding: '2px 8px', borderRadius: 999 }}>
                  typing…
                </span>
              )}
            </div>
          </div>

          <div style={{ padding: 14, overflow: 'auto', flex: 1 }}>
            {loadingMsgs ? (
              <div style={{ color: T.muted }}>Loading messages...</div>
            ) : messages.length === 0 ? (
              <div style={{ color: T.muted }}>No messages yet.</div>
            ) : messages.map(m => (
              <div key={m._id} style={{ marginBottom: 10 }}>
                <div style={{ color: T.muted, fontSize: 11, marginBottom: 4 }}>
                  {m.senderId?.name || 'User'} · {new Date(m.createdAt).toLocaleString()}
                </div>
                {m.body && (
                  <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 10, color: T.text, fontSize: 13, lineHeight: 1.5 }}>
                    {m.body}
                  </div>
                )}
                {m.attachment?.url && (
                  <div style={{ marginTop: 6 }}>
                    {m.attachment.type?.startsWith('image/')
                      ? <img alt="attachment" src={fileUrl(m.attachment.url)} style={{ maxWidth: 340, borderRadius: 12, border: `1px solid ${T.border}` }} />
                      : <a href={fileUrl(m.attachment.url)} style={{ color: '#8ab5a0' }} target="_blank" rel="noreferrer">📎 Download attachment</a>}
                  </div>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <div style={{ borderTop: `1px solid ${T.border}`, padding: 12, background: T.panel }}>
            {!activeId ? (
              <div style={{ textAlign: 'center', color: T.muted, fontSize: 13, padding: '8px 0' }}>
                To start a chat, open an item from <strong style={{ color: T.text }}>Search &amp; Filter</strong> and click <strong style={{ color: T.text }}>"Message poster"</strong>.
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={(e) => { sendTyping(true); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                    onBlur={() => sendTyping(false)}
                    placeholder="Type a message…"
                    style={{ flex: 1, background: '#0f1a0f', color: T.text, border: `1px solid ${T.border}`, borderRadius: 12, padding: '10px 12px', outline: 'none' }}
                  />
                  <label style={{ cursor: 'pointer', color: T.muted, fontSize: 12 }}>
                    <input type="file" style={{ display: 'none' }} onChange={e => setFile(e.target.files?.[0] || null)} />
                    📎
                  </label>
                  <button onClick={send} disabled={sending || (!input.trim() && !file)} style={{
                    background: T.accent, border: 'none', color: T.text, fontWeight: 900,
                    padding: '10px 14px', borderRadius: 12, cursor: 'pointer', opacity: sending ? 0.6 : 1
                  }}>
                    {sending ? 'Sending…' : 'Send'}
                  </button>
                </div>
                {file && (
                  <div style={{ marginTop: 8, fontSize: 12, color: T.muted }}>
                    Attached: <span style={{ color: T.text }}>{file.name}</span>
                    <button onClick={() => setFile(null)} style={{ marginLeft: 10, background: 'none', border: 'none', color: T.muted, cursor: 'pointer' }}>✕</button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

