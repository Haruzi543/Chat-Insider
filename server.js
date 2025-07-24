
const { createServer } = require('http');
const { Server } = require('socket.io');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const rooms = {};
const roomTimers = {};

const advanceGameState = (io, roomCode) => {
    if (roomTimers[roomCode]) {
        clearTimeout(roomTimers[roomCode]);
        delete roomTimers[roomCode];
    }

    const room = rooms[roomCode];
    if (!room || !room.gameState.isActive) return;

    const insider = room.gameState.players?.find((p) => p.role === 'Insider');
    let resultText = '';

    if (room.gameState.phase === 'questioning') {
        room.gameState.phase = 'results';
        room.gameState.results = {
            insider: insider?.nickname || 'Unknown',
            wasInsiderFound: false, 
            wasWordGuessed: false,
        };
        resultText = `Time's up! The word was not guessed. The Insider (${insider?.nickname}) wins! The word was "${room.gameState.targetWord}".`;
    
    } else if (room.gameState.phase === 'voting') {
        const voteCounts = {};
        if (room.gameState.votes) {
          Object.values(room.gameState.votes).forEach((votedNick) => {
              voteCounts[votedNick] = (voteCounts[votedNick] || 0) + 1;
          });
        }
        
        const mostVotedNickname = Object.keys(voteCounts).reduce((a, b) => voteCounts[a] > voteCounts[b] ? a : b, '');
        const wasInsiderFound = !!insider && insider.nickname === mostVotedNickname;

        room.gameState.phase = 'results';
        room.gameState.results = {
            insider: insider?.nickname || 'Unknown',
            wasInsiderFound,
            wasWordGuessed: true,
        };

        if (wasInsiderFound) {
            resultText = `The Insider was caught! It was ${insider?.nickname}. Commons and Master win!`;
        } else {
            resultText = `The Insider escaped! It was ${insider?.nickname}. The Insider wins! The word was "${room.gameState.targetWord}".`;
        }
    }
    
    if (resultText) {
        const systemMessage = { 
            id: Date.now().toString(), 
            user: { id: 'system', nickname: 'System' }, 
            text: resultText, 
            timestamp: new Date().toISOString(), 
            type: 'system' 
        };
        room.messages.push(systemMessage);
        io.to(roomCode).emit('new-message', systemMessage);
    }
    
    io.to(roomCode).emit('game-update', room.gameState);
};

const assignRoles = (playersList) => {
    if (playersList.length < 4) {
      throw new Error('The game requires at least 4 players.');
    }
    const shuffledPlayers = [...playersList].sort(() => 0.5 - Math.random());
    const insider = shuffledPlayers.pop();
    const master = shuffledPlayers.pop();

    const assignedPlayers = playersList.map(user => {
        let role;
        if (user.id === insider.id) {
            role = 'Insider';
        } else if (user.id === master.id) {
            role = 'Master';
        } else {
            role = 'Common';
        }
        return { ...user, role };
    });
    
    return assignedPlayers;
};


app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    handle(req, res);
  });

  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  io.on('connection', (socket) => {
    socket.on('join-room', ({ roomCode, nickname }, callback) => {
        let room = rooms[roomCode];
        
        if (!room) {
          const owner = { id: socket.id, nickname };
          room = {
            id: roomCode,
            owner,
            users: [owner],
            messages: [{
              id: Date.now().toString(),
              user: { id: 'system', nickname: 'System' },
              text: `${nickname} created and joined the room.`,
              timestamp: new Date().toISOString(),
              type: 'system',
            }],
            gameState: { isActive: false, phase: 'setup' },
          };
          rooms[roomCode] = room;
        } else {
          const isNicknameTaken = room.users.some(u => u.nickname.toLowerCase() === nickname.toLowerCase() && u.id !== socket.id);
          if (isNicknameTaken) {
            return callback({ error: 'Nickname is already taken.' });
          }
          
          const existingUser = room.users.find(u => u.id === socket.id);
          if (existingUser) {
            if (existingUser.nickname !== nickname) {
              const oldNickname = existingUser.nickname;
              existingUser.nickname = nickname;
              if (room.owner.id === socket.id) {
                room.owner.nickname = nickname;
              }
              const systemMessage = {
                id: Date.now().toString(),
                user: { id: 'system', nickname: 'System' },
                text: `${oldNickname} is now known as ${nickname}.`,
                timestamp: new Date().toISOString(),
                type: 'system',
              };
              room.messages.push(systemMessage);
            }
          } else {
            const newUser = { id: socket.id, nickname };
            room.users.push(newUser);
            const systemMessage = {
              id: Date.now().toString(),
              user: { id: 'system', nickname: 'System' },
              text: `${nickname} has joined the room.`,
              timestamp: new Date().toISOString(),
              type: 'system',
            };
            room.messages.push(systemMessage);
          }
        }
  
        socket.join(roomCode);
        io.to(roomCode).emit('room-state', room);
        callback({ roomState: room });
      });
      
      socket.on('send-message', ({ roomCode, message }) => {
          const room = rooms[roomCode];
          if (!room) return;
  
          const user = room.users.find((u) => u.id === socket.id);
          if (!user) return;
  
          const newMessage = {
              id: Date.now().toString(),
              user,
              text: message.substring(0, 200),
              timestamp: new Date().toISOString(),
              type: message.startsWith('[Question]') || message.startsWith('[Guess]') || message.startsWith('[Answer]') ? 'game' : 'user',
          };
          room.messages.push(newMessage);
          io.to(roomCode).emit('new-message', newMessage);
  
          if (room.gameState.isActive && room.gameState.phase === 'questioning' && message.toLowerCase().startsWith('[guess]')) {
              const guess = message.substring(7).trim();
              if (guess.toLowerCase() === room.gameState.targetWord?.toLowerCase()) {
                  if (roomTimers[roomCode]) {
                      clearTimeout(roomTimers[roomCode]);
                      delete roomTimers[roomCode];
                  }
                  room.gameState.phase = 'voting';
                  room.gameState.timer = 60; // 1 minute for voting
                  
                  const systemMessageText = `The word was guessed correctly! It was "${room.gameState.targetWord}". Now, vote for the Insider!`;
                  const systemMessage = { id: Date.now().toString(), user: { id: 'system', nickname: 'System' }, text: systemMessageText, timestamp: new Date().toISOString(), type: 'system' };
                  room.messages.push(systemMessage);
                  io.to(roomCode).emit('new-message', systemMessage);
                  
                  roomTimers[roomCode] = setTimeout(() => advanceGameState(io, roomCode), room.gameState.timer * 1000);
                  io.to(roomCode).emit('game-update', room.gameState);
              }
          }
      });
  
      socket.on('start-game', ({ roomCode, targetWord }) => {
          const room = rooms[roomCode];
          if (!room || room.owner.id !== socket.id) {
               socket.emit('error', "Only the room owner can start the game.");
               return;
          }
          if (room.users.length < 4) {
              socket.emit('error', "You need at least 4 players to start the game.");
              return;
          }
          if (room.gameState.isActive) {
              socket.emit('error', "A game is already in progress.");
              return;
          }
  
          try {
              const assignedPlayers = assignRoles(room.users);
              
              room.gameState = {
                  isActive: true,
                  phase: 'questioning',
                  targetWord,
                  players: assignedPlayers,
                  timer: 300,
                  votes: {},
              };
              
              const systemMessage = { id: Date.now().toString(), user: { id: 'system', nickname: 'System' }, text: `The Insider game has started! You have 5 minutes to find the word.`, timestamp: new Date().toISOString(), type: 'system' };
              room.messages.push(systemMessage);
              io.to(roomCode).emit('new-message', systemMessage);
  
              io.to(roomCode).emit('game-update', room.gameState);
              
              room.gameState.players?.forEach((player) => {
                  let message = `Your role is: ${player.role}. `;
                  if (player.role === 'Master' || player.role === 'Insider') {
                      message += `The word is: "${targetWord}"`;
                  } else { // Common
                      message += 'You do not know the word. Ask questions to find out!';
                  }
                  io.to(player.id).emit('private-role', { role: player.role, message });
              });
  
  
              if (roomTimers[roomCode]) clearTimeout(roomTimers[roomCode]);
              roomTimers[roomCode] = setTimeout(() => advanceGameState(io, roomCode), room.gameState.timer * 1000);
  
          } catch (error) {
              console.error('Error starting game:', error);
              socket.emit('error', error.message || 'Failed to start the game.');
          }
      });
  
      socket.on('submit-vote', ({ roomCode, voteForNickname }) => {
          const room = rooms[roomCode];
          if (!room?.gameState.isActive || room.gameState.phase !== 'voting') return;
          
          const voterId = socket.id;
          if(voterId && !room.gameState.votes?.[voterId]) {
              room.gameState.votes = { ...room.gameState.votes, [voterId]: voteForNickname };
  
              const allVoted = room.gameState.players && Object.keys(room.gameState.votes).length === room.gameState.players.length;
  
              if (allVoted) {
                  advanceGameState(io, roomCode);
              } else {
                io.to(roomCode).emit('game-update', room.gameState);
              }
          }
      });
  
      const handleDisconnect = () => {
          for (const roomCode in rooms) {
              const room = rooms[roomCode];
              const userIndex = room.users.findIndex((u) => u.id === socket.id);
  
              if (userIndex !== -1) {
                  const user = room.users[userIndex];
                  room.users.splice(userIndex, 1);
                  
                  const systemMessage = { id: Date.now().toString(), user: { id: 'system', nickname: 'System' }, text: `${user.nickname} has left the room.`, timestamp: new Date().toISOString(), type: 'system' };
                  room.messages.push(systemMessage);
  
                  if (room.users.length === 0) {
                      if (roomTimers[roomCode]) {
                          clearTimeout(roomTimers[roomCode]);
                          delete roomTimers[roomCode];
                      }
                      delete rooms[roomCode];
                  } else {
                      if (room.owner.id === user.id) {
                          room.owner = room.users[0];
                          const ownerMessage = { id: Date.now().toString(), user: { id: 'system', nickname: 'System' }, text: `${room.owner.nickname} is the new room owner.`, timestamp: new Date().toISOString(), type: 'system' };
                          room.messages.push(ownerMessage);
                      }
  
                      if (room.gameState.isActive && (room.users.length < 4 || room.gameState.players?.some(p => p.id === user.id))) {
                           if (roomTimers[roomCode]) {
                              clearTimeout(roomTimers[roomCode]);
                              delete roomTimers[roomCode];
                          }
                          room.gameState = { isActive: false, phase: 'setup' };
                          const resetMessage = { id: Date.now().toString(), user: { id: 'system', nickname: 'System' }, text: 'Game reset due to a player leaving or not enough players.', timestamp: new Date().toISOString(), type: 'system' };
                          room.messages.push(resetMessage);
                      }
                      io.to(roomCode).emit('room-state', room);
                  }
                  break;
              }
          }
      };
      
      socket.on('leave-room', handleDisconnect);
      socket.on('disconnect', handleDisconnect);
  });

  const port = process.env.PORT || 3000;
  httpServer.listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${port}`);
  });
});
