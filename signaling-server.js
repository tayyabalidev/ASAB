const WebSocket = require('ws');

// Create WebSocket server
const wss = new WebSocket.Server({ port: 8080 });


// Store connected clients
const clients = new Map();

wss.on('connection', (ws) => {
  
  let clientId = null;
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'register':
          // Register client
          clientId = data.userID;
          clients.set(clientId, ws);
          
          // Send confirmation
          ws.send(JSON.stringify({
            type: 'registered',
            userID: clientId
          }));
          break;
          
        case 'call_invite':
          // Forward call invite to target user
          const targetWs = clients.get(data.toUserID);
          if (targetWs && targetWs.readyState === WebSocket.OPEN) {
            targetWs.send(JSON.stringify(data));
          } else {
            // Target user not online, send back error
            ws.send(JSON.stringify({
              type: 'call_error',
              error: 'User not online',
              toUserID: data.toUserID
            }));
          }
          break;
          
        case 'call_accept':
        case 'call_reject':
        case 'call_end':
        case 'ice_candidate':
        case 'offer':
        case 'answer':
          // Forward signaling messages
          const targetClient = clients.get(data.toUserID);
          if (targetClient && targetClient.readyState === WebSocket.OPEN) {
            targetClient.send(JSON.stringify(data));
          }
          break;
          
        default:
      }
    } catch (error) {
    }
  });
  
  ws.on('close', () => {
    if (clientId) {
      clients.delete(clientId);
    }
  });
  
  ws.on('error', (error) => {
  });
});

// Handle server shutdown
process.on('SIGINT', () => {
  wss.close(() => {
    process.exit(0);
  });
});
