const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;

// Configuração do servidor
app.use(express.static(path.join(__dirname, 'public')));

// Rota do transmissor com parâmetro de sala opcional
app.get('/sender', (req, res) => {
  const roomName = req.query.room || 'default'; // Usando query parameter
  res.send(generateSenderHTML(roomName));
});

// Rota do transmissor com sala na URL (alternativa)
app.get('/sender/:room', (req, res) => {
  const roomName = req.params.room || 'default';
  res.send(generateSenderHTML(roomName));
});

// Rota do visualizador com parâmetro de sala opcional
app.get('/viewer', (req, res) => {
  const roomName = req.query.room || 'default'; // Usando query parameter
  res.send(generateViewerHTML(roomName));
});

// Rota do visualizador com sala na URL (alternativa)
app.get('/viewer/:room', (req, res) => {
  const roomName = req.params.room || 'default';
  res.send(generateViewerHTML(roomName));
});

// Função para gerar HTML do transmissor
function generateSenderHTML(roomName) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Transmissor - Sala ${roomName}</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        video { width: 100%; border: 2px solid #333; border-radius: 8px; margin-top: 10px; }
        #status { padding: 10px; margin: 10px 0; border-radius: 4px; }
        .ready { background-color: #d4edda; color: #155724; }
        .error { background-color: #f8d7da; color: #721c24; }
        #viewerCount { font-weight: bold; color: #007bff; }
        button { padding: 10px 15px; background-color: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; }
        button:hover { background-color: #0069d9; }
        #roomInfo { font-weight: bold; margin: 10px 0; padding: 8px; background-color: #f8f9fa; border-radius: 4px; }
      </style>
    </head>
    <body>
      <h1>Transmissor de Tela</h1>
      <div id="roomInfo">Sala: ${roomName}</div>
      <div id="status">Aguardando início... <span id="viewerCount">0 visualizadores</span></div>
      <div id="audioWarning" style="color: red; display: none;">
        ⚠️ Lembre-se de marcar "Compartilhar áudio" ao selecionar a aba/janela!
      </div>
      <video id="localVideo" autoplay muted></video>
      <button id="startBtn">Iniciar Transmissão</button>
      <button id="stopBtn" disabled>Parar Transmissão</button>

      <script src="/socket.io/socket.io.js"></script>
      <script>
        const socket = io();
        const statusEl = document.getElementById('status');
        const viewerCountEl = document.getElementById('viewerCount');
        const audioWarningEl = document.getElementById('audioWarning');
        const videoEl = document.getElementById('localVideo');
        const startBtn = document.getElementById('startBtn');
        const stopBtn = document.getElementById('stopBtn');
        const roomInfoEl = document.getElementById('roomInfo');
        
        let peerConnections = {};
        let stream;
        const currentRoom = '${roomName}';

        // Ao carregar a página, já define a sala
        socket.emit('set-room', currentRoom);
        roomInfoEl.textContent = "Sala: " + currentRoom;

        async function startCapture() {
          try {
            statusEl.textContent = "Solicitando permissões...";
            audioWarningEl.style.display = 'none';
            
            const constraints = {
              video: {
                displaySurface: 'browser',
                frameRate: 30
              },
              audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
                suppressLocalAudioPlayback: false,
                sampleRate: 48000,
                channelCount: 2
              },
              systemAudio: 'include',
              preferCurrentTab: true
            };

            stream = await navigator.mediaDevices.getDisplayMedia(constraints);
            
            const audioTracks = stream.getAudioTracks();
            if (audioTracks.length > 0) {
              statusEl.textContent = "Transmissão iniciada na sala: " + currentRoom + " ";
              console.log("Áudio capturado:", audioTracks[0].label);
            } else {
              statusEl.textContent = "Transmissão iniciada (sem áudio) na sala: " + currentRoom + " ";
              audioWarningEl.style.display = 'block';
              console.warn("Nenhuma track de áudio capturada");
            }
            
            videoEl.srcObject = stream;
            startBtn.disabled = true;
            stopBtn.disabled = false;
            
            stream.getTracks().forEach(track => {
              track.onended = () => {
                stopCapture();
                statusEl.textContent = "Compartilhamento encerrado ";
              };
            });

            socket.emit('broadcaster-ready', currentRoom);

          } catch (error) {
            console.error("Erro:", error);
            statusEl.textContent = "Erro: " + error.message;
          }
        }

        function stopCapture() {
          if (stream) {
            stream.getTracks().forEach(track => track.stop());
            videoEl.srcObject = null;
            stream = null;
          }
          
          Object.values(peerConnections).forEach(pc => pc.close());
          peerConnections = {};
          
          startBtn.disabled = false;
          stopBtn.disabled = true;
          socket.emit('broadcaster-disconnected', currentRoom);
        }

        socket.on('viewer-connected', (viewerId) => {
          console.log("Visualizador conectado: " + viewerId);
          viewerCountEl.textContent = Object.keys(peerConnections).length + " visualizadores";
          
          if (!stream) return;
          
          const peerConnection = new RTCPeerConnection({
         
            iceServers: [  
            
              { urls: "stun:stun.l.google.com:19302" },
  {
   urls: "turn:global.turn.tectonic.video:443?transport=tcp",
    username: "public",
    credential: "webrtc"
  },
  
            ]
          });


peerConnection.addTransceiver("video", {
    direction: "sendrecv",
    codecs: ["VP8", "H264"] // Prioriza codecs suportados no Android
  });

          peerConnections[viewerId] = peerConnection;

          stream.getTracks().forEach(track => {
            peerConnection.addTrack(track, stream);
          });

          peerConnection.onicecandidate = ({ candidate }) => {
            if (candidate) {
              socket.emit('candidate', { viewerId, candidate, room: currentRoom });
            }
          };

          peerConnection.createOffer()
            .then(offer => peerConnection.setLocalDescription(offer))
            .then(() => {
              socket.emit('offer', {
                viewerId,
                offer: peerConnection.localDescription,
                room: currentRoom
              });
            });
        });

        socket.on('answer', ({ viewerId, answer }) => {
          if (peerConnections[viewerId]) {
            peerConnections[viewerId].setRemoteDescription(answer);
          }
        });

        socket.on('candidate', ({ viewerId, candidate }) => {
          if (peerConnections[viewerId]) {
            peerConnections[viewerId].addIceCandidate(new RTCIceCandidate(candidate));
          }
        });

        socket.on('viewer-disconnected', (viewerId) => {
          if (peerConnections[viewerId]) {
            peerConnections[viewerId].close();
            delete peerConnections[viewerId];
            viewerCountEl.textContent = Object.keys(peerConnections).length + " visualizadores";
          }
        });

        startBtn.addEventListener('click', startCapture);
        stopBtn.addEventListener('click', stopCapture);
      </script>
    </body>
    </html>
  `;
}
function generateViewerHTML(roomName) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Visualizador - Sala ${roomName}</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
          video { width: 100%; border: 2px solid #333; border-radius: 8px; margin-top: 10px; }
          #status { padding: 10px; margin: 10px 0; border-radius: 4px; background-color: #f8f9fa; }
          .connected { background-color: #d4edda; color: #155724; }
          .disconnected { background-color: #f8d7da; color: #721c24; }
          #roomInfo { font-weight: bold; margin: 10px 0; padding: 8px; background-color: #f8f9fa; border-radius: 4px; }
          #logConsole {
            background: #000;
            color: #0f0;
            padding: 10px;
            margin-top: 20px;
            font-family: monospace;
            font-size: 12px;
            height: 150px;
            overflow: auto;
            white-space: pre-wrap;
            border-radius: 6px;
          }
        </style>
      </head>
      <body>
        <h1>Visualizador</h1>
        <div id="roomInfo">Conectando à sala: ${roomName}</div>
        <div id="status">Aguardando transmissão...</div>
        <video id="remoteVideo" autoplay playsinline muted></video>
        <div id="logConsole">[LOGS]</div>
  
        <script src="/socket.io/socket.io.js"></script>
        <script>
          const socket = io();
          const statusEl = document.getElementById('status');
          const videoEl = document.getElementById('remoteVideo');
          const roomInfoEl = document.getElementById('roomInfo');
          const logEl = document.getElementById('logConsole');
  
          let peerConnection;
          const currentRoom = '${roomName}';
  
          function logToScreen(msg) {
            const time = new Date().toLocaleTimeString();
            logEl.textContent += '\\n[' + time + '] ' + msg;
            logEl.scrollTop = logEl.scrollHeight;
          }
  
          // Conecta na sala ao iniciar
          socket.emit('viewer-ready', currentRoom);
          roomInfoEl.textContent = "Sala: " + currentRoom;
          logToScreen("🔌 Viewer conectado ao socket");
  
          socket.on('offer', async (data) => {
            if (data.room !== currentRoom) return;
            
            logToScreen("📡 Oferta recebida do transmissor");
  
            if (!peerConnection) {
              setupPeerConnection();
            }
  
            try {
              await peerConnection.setRemoteDescription(data.offer);
              const answer = await peerConnection.createAnswer();
              await peerConnection.setLocalDescription(answer);
              socket.emit('answer', {
                viewerId: socket.id,
                answer: peerConnection.localDescription,
                room: currentRoom
              });
              logToScreen("📤 Resposta enviada ao transmissor");
            } catch (error) {
              logToScreen("❌ Erro ao processar oferta: " + error);
            }
          });
  
          socket.on('candidate', async (data) => {
            if (data.room !== currentRoom) return;
            if (!peerConnection) return;
  
            try {
              await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
              logToScreen("🧊 Candidato ICE adicionado");
            } catch (error) {
              logToScreen("❌ Erro ao adicionar candidato ICE: " + error);
            }
          });
  
          socket.on('broadcaster-disconnected', (room) => {
            if (room !== currentRoom) return;
            logToScreen("⛔️ Transmissor desconectado");
            statusEl.textContent = "Transmissão encerrada na sala: " + room;
            statusEl.className = "disconnected";
            if (peerConnection) {
              peerConnection.close();
              peerConnection = null;
            }
          });
  
          socket.on('no-broadcaster', (room) => {
            if (room !== currentRoom) return;
            logToScreen("🚫 Nenhum transmissor ativo na sala");
            statusEl.textContent = "Nenhum transmissor ativo na sala: " + room;
            statusEl.className = "disconnected";
          });
  
          function setupPeerConnection() {
            peerConnection = new RTCPeerConnection({
             
              iceServers: [
        

        { urls: "stun:stun.l.google.com:19302" },
  {
     urls: "turn:global.turn.tectonic.video:443?transport=tcp",
    username: "public",
    credential: "webrtc"
  },
  
               
                 
              ],
               
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require"
            });

peerConnection.addTransceiver("video", {
  direction: "sendrecv",
  codecs: ["VP8", "H264"] // Prioriza codecs suportados no Android
});

  
            peerConnection.ontrack = (event) => {
              logToScreen("🎥 ontrack recebido");
              if (event.streams && event.streams[0]) {
              
                videoEl.srcObject = event.streams[0];
                videoEl.play().catch((err) => {
                  logToScreen("🔈 Erro no autoplay: " + err);
                  statusEl.innerHTML = 'Clique para iniciar o vídeo <button id="playBtn">Play</button>';
                  document.getElementById('playBtn').onclick = () => {
                    videoEl.play().catch(e => logToScreen("❌ Erro no play manual: " + e));
                  };
                });
                statusEl.textContent = "Conectado à sala: " + currentRoom;
                statusEl.className = "connected";
                logToScreen("✅ Stream atribuída ao vídeo");
              }
            };
  
            peerConnection.onicecandidate = ({ candidate }) => {
              if (candidate) {
                logToScreen("🧊 ICE candidate gerado");
                socket.emit('candidate', {
                  viewerId: socket.id,
                  candidate,
                  room: currentRoom
                });
              }

               if (candidate) {
      
    if (candidate.candidate.includes("relay")) {
    
      console.log("✅ Candidato relay (TURN) detectado");
    } else {
       
      console.warn("⚠️ Sem candidato relay, pode não funcionar no 4G");
    }
  }
            };
  
            peerConnection.onconnectionstatechange = () => {
              logToScreen("📶 Estado da conexão: " + peerConnection.connectionState);
            };
  
            logToScreen("🔧 PeerConnection configurado");
          }
  
          // Extra: clique em qualquer lugar para tentar forçar o play
          document.addEventListener('click', () => {
            if (videoEl.paused) {
              videoEl.play().then(() => {
                logToScreen("▶️ Play forçado por clique");
              }).catch(err => {
                logToScreen("❌ Play por clique falhou: " + err);
              });
            }
          }, { once: true });


          setInterval(() => {
             videoEl.muted = false; 
            if (videoEl.paused) {
              videoEl.play().then(() => {
                logToScreen("▶️ Play forçado por clique");
              }).catch(err => {
                logToScreen("❌ Play por clique falhou: " + err);
              });
            }
        
          }, 1000);
        </script>
      </body>
      </html>
    `;
  }
  

// Lógica do servidor Socket.io
io.on('connection', (socket) => {
  console.log("🟢 Novo cliente conectado: " + socket.id);

  socket.on('set-room', (roomName) => {
    console.log("🔵 Cliente definiu sala: " + roomName);
    socket.join(roomName);
  });

  socket.on('broadcaster-ready', (roomName) => {
    console.log("🎥 Transmissor pronto na sala: " + roomName);
    socket.to(roomName).emit('broadcaster-available');
  });

  socket.on('viewer-ready', (roomName) => {
    console.log("👁️ Visualizador tentando conectar à sala: " + roomName);
    socket.join(roomName);
    
    // Verifica se há um transmissor na sala
    const room = io.sockets.adapter.rooms.get(roomName);
    let broadcasterFound = false;
    
    if (room) {
      for (const clientId of room) {
        const clientSocket = io.sockets.sockets.get(clientId);
        if (clientSocket && clientSocket.rooms.has(roomName) && clientId !== socket.id) {
          broadcasterFound = true;
          io.to(clientId).emit('viewer-connected', socket.id);
          break;
        }
      }
    }
    
    if (!broadcasterFound) {
      socket.emit('no-broadcaster', roomName);
    }
  });

  socket.on('offer', (data) => {
    io.to(data.viewerId).emit('offer', data);
  });

  socket.on('answer', (data) => {
    io.to(data.room).emit('answer', data);
  });

  socket.on('candidate', (data) => {
    if (data.viewerId) {
      io.to(data.viewerId).emit('candidate', data);
    } else {
      io.to(data.room).emit('candidate', data);
    }
  });

  socket.on('broadcaster-disconnected', (roomName) => {
    console.log("🔴 Transmissor desconectado da sala: " + roomName);
    socket.to(roomName).emit('broadcaster-disconnected', roomName);
    socket.leave(roomName);
  });

  socket.on('disconnect', () => {
    console.log("🔴 Cliente desconectado: " + socket.id);
  });
});

server.listen(PORT, () => {
  console.log("🚀 Servidor rodando em http://localhost:" + PORT);
});
