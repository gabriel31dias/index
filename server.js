const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.get('/', (req, res) => res.sendFile(__dirname + '/sender.html'));
app.get('/viewer', (req, res) => res.sendFile(__dirname + '/viewer.html'));

io.on('connection', (socket) => {
  socket.on('offer', (data) => io.to(data.viewerId).emit('offer', data));
  socket.on('answer', (data) => io.emit('answer', data));
  socket.on('candidate', (data) => io.to(data.viewerId).emit('candidate', data));
  socket.on('viewer-ready', () => io.emit('viewer-connected', socket.id));
});

server.listen(3000, () => console.log('Server running on http://localhost:3000'));