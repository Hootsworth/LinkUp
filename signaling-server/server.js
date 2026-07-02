const { WebSocketServer } = require('ws');

const wss = new WebSocketServer({ port: 8080 });
console.log('LinkUp Signaling Server running on port 8080');

// Map to store connected clients by their Device ID
const clients = new Map();

wss.on('connection', (ws) => {
  let clientId = null;

  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message);
      
      switch (msg.type) {
        case 'register':
          clientId = msg.id;
          clients.set(clientId, ws);
          console.log(`Registered device: ${clientId}`);
          ws.send(JSON.stringify({ type: 'registered', id: clientId }));
          break;

        case 'signal':
          const targetWs = clients.get(msg.target);
          if (targetWs && targetWs.readyState === 1) { // 1 = OPEN
            // Forward the SDP or ICE candidate to the target client
            targetWs.send(JSON.stringify({
              type: 'signal',
              sender: clientId,
              data: msg.data
            }));
          } else {
            ws.send(JSON.stringify({
              type: 'error',
              message: `Device ${msg.target} is offline or not found`
            }));
          }
          break;

        default:
          console.log('Unknown message type:', msg.type);
      }
    } catch (e) {
      console.error('Error handling message:', e);
    }
  });

  ws.on('close', () => {
    if (clientId) {
      clients.delete(clientId);
      console.log(`Disconnected device: ${clientId}`);
    }
  });
});
