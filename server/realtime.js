const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { SECRET } = require('./config');
const { q } = require('./db');

let io;
const online = new Map(); // userId -> Set(socketId)

const visible = (id) => {
  const u = q('SELECT show_online FROM users WHERE id = ?').get(id);
  return !!u && u.show_online !== 0;
};

function init(server) {
  io = new Server(server, { maxHttpBufferSize: 1e5 });

  io.use((socket, next) => {
    try {
      const { uid } = jwt.verify(socket.handshake.auth?.token || '', SECRET);
      const user = q('SELECT id, banned FROM users WHERE id = ?').get(uid);
      if (!user || user.banned) throw new Error('unauthorized');
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
    if (sockets.size === 1 && visible(id)) io.emit('presence', { user_id: id, online: true });
    socket.emit('presence:init', { ids: [...online.keys()].filter((x) => x === id || visible(x)) });

    socket.on('typing', (data) => {
      const chatId = parseInt(data?.chat_id, 10);
      if (!chatId) return;
      const chat = q('SELECT id, type, user_a, user_b FROM chats WHERE id = ?').get(chatId);
      if (!chat) return;
      const payload = { chat_id: chatId, user_id: id };
      if (chat.type === 'dm') {
        if (chat.user_a === id || chat.user_b === id) io.to('u:' + (chat.user_a === id ? chat.user_b : chat.user_a)).emit('typing', payload);
      } else if (chat.type !== 'saved' && q('SELECT 1 FROM members WHERE chat_id = ? AND user_id = ?').get(chatId, id)) {
        for (const r of q('SELECT user_id FROM members WHERE chat_id = ? AND user_id <> ?').all(chatId, id)) io.to('u:' + r.user_id).emit('typing', payload);
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
      if (visible(id)) io.emit('presence', { user_id: id, online: false, last_seen: now });
    });
  });
}

// user toggled "show my online status"
function setVisibility(id) {
  if (!io || !online.has(id)) return;
  io.emit('presence', visible(id) ? { user_id: id, online: true } : { user_id: id, online: false, last_seen: null });
}

const emitAll = (event, data) => io && io.emit(event, data);
const emitToUsers = (ids, event, data) => io && ids.forEach((id) => io.to('u:' + id).emit(event, data));
const disconnectUser = (id) => io && io.in('u:' + id).disconnectSockets(true);

module.exports = { init, emitAll, emitToUsers, disconnectUser, setVisibility };
