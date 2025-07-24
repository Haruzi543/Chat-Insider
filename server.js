

const { createServer } = require('http');
const { Server } = require('socket.io');
const next = require('next');
const CoupGame = require('./src/server/coup');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const rooms = {};
const roomTimers = {}; // For Insider game

// --- Insider Game Logic ---

const advanceInsiderGameState = (io, roomCode) => {
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

const assignInsiderRoles = (playersList) => {
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


// --- Main Server Logic ---

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
      socket.on('join-room', ({ roomCode, nickname, gameType }, callback) => {
        let room = rooms[roomCode];

        if (!room) {
            // Create room
            if (!gameType) {
                return callback({ error: 'A game type must be specified to create a room.' });
            }
            const owner = { id: socket.id, nickname };
            room = {
                id: roomCode,
                owner,
                users: [owner],
                gameType,
                messages: [],
            };
            
            if (gameType === 'insider') {
                room.messages.push({
                    id: Date.now().toString(),
                    user: { id: 'system', nickname: 'System' },
                    text: `${nickname} created and joined the room for Insider.`,
                    timestamp: new Date().toISOString(),
                    type: 'system',
                });
                room.gameState = { isActive: false, phase: 'setup' };
            } else if (gameType === 'coup') {
                room.coupGame = new CoupGame.CoupGame();
                room.gameState = room.coupGame.getStateForPlayer();
                 room.coupGame.addLog(`${nickname} created and joined the room for Coup.`);
            }

            rooms[roomCode] = room;
        } else {
            // Join existing room
            const isNicknameTaken = room.users.some(u => u.nickname.toLowerCase() === nickname.toLowerCase());
            if (isNicknameTaken) {
                return callback({ error: 'Nickname is already taken.' });
            }

            const newUser = { id: socket.id, nickname };
            room.users.push(newUser);
            
            if (room.gameType === 'insider') {
                const systemMessage = {
                    id: Date.now().toString(),
                    user: { id: 'system', nickname: 'System' },
                    text: `${nickname} has joined the room.`,
                    timestamp: new Date().toISOString(),
                    type: 'system',
                };
                room.messages.push(systemMessage);
            } else if (room.gameType === 'coup') {
                 room.coupGame.addLog(`${nickname} has joined the room.`);
            }
        }
  
        socket.join(roomCode);
        
        // Add player to Coup game if it's in waiting phase
        if (room.gameType === 'coup' && room.coupGame.getState().phase === 'waiting') {
            room.coupGame.addPlayer(socket.id, nickname);
        }

        io.to(roomCode).emit('room-state', room.gameType === 'coup' ? room.coupGame.getRoomState(room) : room);
        callback({ roomState: room.gameType === 'coup' ? room.coupGame.getRoomState(room) : room });
      });
      
      socket.on('send-message', ({ roomCode, message }) => {
          const room = rooms[roomCode];
          if (!room || room.gameType !== 'insider') return;
  
          const user = room.users.find((u) => u.id === socket.id);
          if (!user) return;
  
          const newMessage = {
              id: Date.now().toString(),
              user,
              text: message.substring(0, 200),
              timestamp: new Date().toISOString(),
              type: room.gameState.isActive && room.gameState.phase === 'questioning' ? 'game' : 'user',
          };
          room.messages.push(newMessage);
          io.to(roomCode).emit('new-message', newMessage);
      });
      
      // --- Insider Listeners ---
      socket.on('insider-send-answer', ({ roomCode, questionId, answer }) => {
        const room = rooms[roomCode];
        if (!room || room.gameType !== 'insider' || !room.gameState.isActive || room.gameState.phase !== 'questioning') return;

        const master = room.gameState.players?.find(p => p.role === 'Master');
        if (!master || master.id !== socket.id) return;
        
        if (room.messages.some(m => m.questionId === questionId)) return;

        const answerMessage = {
            id: Date.now().toString(),
            user: master,
            text: answer,
            timestamp: new Date().toISOString(),
            type: 'answer',
            questionId: questionId,
        };
        room.messages.push(answerMessage);
        io.to(roomCode).emit('new-message', answerMessage);
      });

      socket.on('insider-correct-guess', ({ roomCode, messageId }) => {
        const room = rooms[roomCode];
        if (!room || room.gameType !== 'insider' || !room.gameState.isActive || room.gameState.phase !== 'questioning') return;

        const master = room.gameState.players?.find(p => p.role === 'Master');
        if (!master || master.id !== socket.id) return;

        const guessMessage = room.messages.find(m => m.id === messageId);
        if (!guessMessage) return;

        const guess = guessMessage.text.substring(7).trim();

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
            
            roomTimers[roomCode] = setTimeout(() => advanceInsiderGameState(io, roomCode), room.gameState.timer * 1000);
            io.to(roomCode).emit('game-update', room.gameState);
        } else {
            const wrongGuessMessage = { id: Date.now().toString(), user: { id: 'system', nickname: 'System' }, text: `The guess "${guess}" was incorrect.`, timestamp: new Date().toISOString(), type: 'system' };
            io.to(master.id).emit('new-message', wrongGuessMessage);
        }
      });
  
      socket.on('insider-start-game', ({ roomCode, targetWord }) => {
          const room = rooms[roomCode];
          if (!room || room.owner.id !== socket.id || room.gameType !== 'insider') return;
          if (room.users.length < 2) { // Min players for Insider
              socket.emit('error', "You need at least 4 players to start Insider.");
              return;
          }
          if (room.gameState.isActive) {
              socket.emit('error', "A game is already in progress.");
              return;
          }
  
          try {
              const assignedPlayers = assignInsiderRoles(room.users);
              
              room.gameState = {
                  ...room.gameState,
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
              roomTimers[roomCode] = setTimeout(() => advanceInsiderGameState(io, roomCode), room.gameState.timer * 1000);
  
          } catch (error) {
              console.error('Error starting game:', error);
              socket.emit('error', error.message || 'Failed to start the game.');
          }
      });
  
      socket.on('insider-submit-vote', ({ roomCode, voteForNickname }) => {
          const room = rooms[roomCode];
          if (!room?.gameState.isActive || room.gameState.phase !== 'voting' || room.gameType !== 'insider') return;
          
          const voterId = socket.id;
          if(voterId && !room.gameState.votes?.[voterId]) {
              room.gameState.votes = { ...room.gameState.votes, [voterId]: voteForNickname };
  
              const allVoted = room.gameState.players && Object.keys(room.gameState.votes).length === room.gameState.players.length;
  
              if (allVoted) {
                  advanceInsiderGameState(io, roomCode);
              } else {
                io.to(roomCode).emit('game-update', room.gameState);
              }
          }
      });

      // --- Coup Listeners ---
      socket.on('coup-action', ({ roomCode, action, targetId }) => {
          const room = rooms[roomCode];
          if (!room || room.gameType !== 'coup') return;

          try {
            if (action === 'start_game') {
                if (socket.id === room.owner.id) {
                    room.coupGame.startGame();
                }
            } else {
                room.coupGame.handleAction(socket.id, action, targetId);
            }
            io.to(roomCode).emit('room-state', room.coupGame.getRoomState(room));
          } catch (error) {
              console.error(`Coup Error in room ${roomCode}:`, error);
              socket.emit('error', error.message);
          }
      });
  
      // --- Generic Listeners ---
      const handleDisconnect = () => {
          for (const roomCode in rooms) {
              const room = rooms[roomCode];
              const userIndex = room.users.findIndex((u) => u.id === socket.id);
  
              if (userIndex !== -1) {
                  const user = room.users[userIndex];
                  room.users.splice(userIndex, 1);
                  
                  if (room.gameType === 'insider') {
                    const systemMessage = { id: Date.now().toString(), user: { id: 'system', nickname: 'System' }, text: `${user.nickname} has left the room.`, timestamp: new Date().toISOString(), type: 'system' };
                    room.messages.push(systemMessage);
                  } else if (room.gameType === 'coup') {
                      room.coupGame.removePlayer(user.id);
                      room.coupGame.addLog(`${user.nickname} has left the room.`);
                  }

                  if (room.users.length === 0) {
                      if (room.gameType === 'insider' && roomTimers[roomCode]) {
                          clearTimeout(roomTimers[roomCode]);
                          delete roomTimers[roomCode];
                      }
                      delete rooms[roomCode];
                  } else {
                      if (room.owner.id === user.id) {
                          room.owner = room.users[0];
                          if (room.gameType === 'insider') {
                            const ownerMessage = { id: Date.now().toString(), user: { id: 'system', nickname: 'System' }, text: `${room.owner.nickname} is the new room owner.`, timestamp: new Date().toISOString(), type: 'system' };
                            room.messages.push(ownerMessage);
                          } else if (room.gameType === 'coup') {
                            room.coupGame.addLog(`${room.owner.nickname} is the new room owner.`);
                          }
                      }
  
                      if (room.gameType === 'insider' && room.gameState.isActive && (room.users.length < 4 || (room.gameState.players && !room.gameState.players.some(p => p.id === user.id)))) {
                           if (roomTimers[roomCode]) {
                              clearTimeout(roomTimers[roomCode]);
                              delete roomTimers[roomCode];
                          }
                          room.gameState = { isActive: false, phase: 'setup' };
                          const resetMessage = { id: Date.now().toString(), user: { id: 'system', nickname: 'System' }, text: 'Game reset due to a player leaving or not enough players.', timestamp: new Date().toISOString(), type: 'system' };
                          room.messages.push(resetMessage);
                      }
                      
                      io.to(roomCode).emit('room-state', room.gameType === 'coup' ? room.coupGame.getRoomState(room) : room);
                  }
                  break;
              }
          }
      };
      
      socket.on('leave-room', () => {
        handleDisconnect();
        socket.disconnect(true);
      });
      socket.on('disconnect', handleDisconnect);
  });

  const port = process.env.PORT || 3000;
  httpServer.listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${port}`);
  });
});
