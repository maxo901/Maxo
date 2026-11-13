const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { SECRET } = require('./config');
const { q } = require('./db');
const { tokenOk } = require('./auth');

let io;
const online = new Map(); // userId -> Set(socketId)

// Users who switched "show my online status" off are never announced.
function visibleOnlineIds() {
  const ids = [...online.keys()];
  if (!ids.length) return [];
  return q(`SELECT id FROM users WHERE show_online = 1 AND id IN (${ids.map(() => '?').join(',')})`).all(...ids).map((r) => r.id);
}

function init(server) {
  io = new Server(server, { maxHttpBufferSize: 1e5 });

  io.use((socket, next) => {
    try {
      const payload = jwt.verify(socket.handshake.auth?.token || '', SECRET);
      const user = q('SELECT id, banned, pwd_at FROM users WHERE id = ?').get(payload.uid);
      if (!user || user.banned || !tokenOk(payload, user)) throw new Error('unauthorized');
      socket.userId = user.id;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const id = socket.userId;
    socket.join('u:' + id);

    let sockets = online.get(id);
    if (!sockets) online.set(id, (sockets = new Set()));
    sockets.add(socket.id);
    const me = q('SELECT show_online FROM users WHERE id = ?').get(id);
    if (sockets.size === 1 && me && me.show_online !== 0) io.emit('presence', { user_id: id, online: true });
    socket.emit('presence:init', { ids: visibleOnlineIds() });

    socket.on('typing', (data) => {
      const chatId = parseInt(data?.chat_id, 10);
      if (!chatId) return;
      const chat = q('SELECT id, type, user_a, user_b FROM chats WHERE id = ?').get(chatId);
      if (!chat) return;
      const payload = { chat_id: chatId, user_id: id };
      if (chat.type === 'group') {
        const members = q('SELECT user_id FROM chat_members WHERE chat_id = ?').all(chatId).map((r) => r.user_id);
        if (!members.includes(id)) return;
        members.filter((m) => m !== id).forEach((m) => io.to('u:' + m).emit('typing', payload));
      } else if (chat.user_a === id || chat.user_b === id) {
        const other = chat.user_a === id ? chat.user_b : chat.user_a;
        if (other !== id) io.to('u:' + other).emit('typing', payload);
      }
    });

    socket.on('disconnect', () => {
      const set = online.get(id);
      if (!set) return;
      set.delete(socket.id);
      if (set.size) return;
      online.delete(id);
      const now = Date.now();
      q('UPDATE users SET last_seen = ? WHERE id = ?').run(now, id);
      const u = q('SELECT show_online FROM users WHERE id = ?').get(id);
      if (u && u.show_online !== 0) io.emit('presence', { user_id: id, online: false, last_seen: now });
    });
  });
}

// Called after a user flips the "show online status" switch.
function refreshPresence(id) {
  if (!io) return;
  const u = q('SELECT show_online FROM users WHERE id = ?').get(id);
  if (!u) return;
  if (u.show_online === 0) io.emit('presence', { user_id: id, online: false, hidden: true });
  else if (online.has(id)) io.emit('presence', { user_id: id, online: true });
}

const emitAll = (event, data) => io && io.emit(event, data);
const emitToUsers = (ids, event, data) => io && [...new Set(ids)].forEach((id) => io.to('u:' + id).emit(event, data));
const disconnectUser = (id) => io && io.in('u:' + id).disconnectSockets(true);

module.exports = { init, emitAll, emitToUsers, disconnectUser, refreshPresence };
