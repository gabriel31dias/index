const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, './client')));

// Rota principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, './client/index.html'));
});

// Conexão Socket.io
io.on('connection', (socket) => {
    console.log('Novo cliente conectado:', socket.id);
    
    // Receber stream do transmissor
    socket.on('screen-data', (data) => {
        // Transmitir para todos os clientes, exceto o remetente
        socket.broadcast.emit('screen-data', data);
    });
    
    socket.on('disconnect', () => {
        console.log('Cliente desconectado:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});