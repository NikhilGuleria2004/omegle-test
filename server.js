const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname, 'public')));

const waitingUsers = [];
const activeSessions = new Map();

io.on('connection', (socket) => {
  console.log('A user connected');

  socket.on('join', (userId) => {
    if (!userId) {
      userId = uuidv4();
      socket.emit('userId', userId);
    }

    socket.userId = userId;

    if (activeSessions.has(userId)) {
      const partnerId = activeSessions.get(userId);
      const partnerSocket = findSocketByUserId(partnerId);
      if (partnerSocket) {
        socket.partner = partnerSocket;
        partnerSocket.partner = socket;
        socket.emit('chat start', { initiator: false, reconnected: true });
        partnerSocket.emit('partner reconnected');
      } else {
        activeSessions.delete(userId);
        handleNewUser(socket);
      }
    } else {
      handleNewUser(socket);
    }
  });

  socket.on('signal', (data) => {
    if (socket.partner) {
      socket.partner.emit('signal', data);
    }
  });

  socket.on('chat message', (msg) => {
    if (socket.partner) {
      socket.partner.emit('chat message', msg);
    }
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected');
    if (socket.partner) {
      socket.partner.emit('partner disconnected');
      socket.partner.partner = null;
    }
    const index = waitingUsers.indexOf(socket);
    if (index > -1) {
      waitingUsers.splice(index, 1);
    }
    // Don't remove from activeSessions to allow reconnection
  });
});

function handleNewUser(socket) {
  if (waitingUsers.length > 0) {
    const partner = waitingUsers.pop();
    socket.partner = partner;
    partner.partner = socket;
    activeSessions.set(socket.userId, partner.userId);
    activeSessions.set(partner.userId, socket.userId);
    socket.emit('chat start', { initiator: true });
    partner.emit('chat start', { initiator: false });
  } else {
    waitingUsers.push(socket);
    socket.emit('waiting');
  }
}

function findSocketByUserId(userId) {
  return Array.from(io.sockets.sockets.values()).find(socket => socket.userId === userId);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});