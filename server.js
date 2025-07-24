
const { createServer } = require('http');
const { Server } = require('socket.io');
const next = require('next');
const CoupGame = require('./src/server/coup').CoupGame;

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const rooms = {};
const roomTimers = {}; // For Insider game

// --- Game Logic Helpers ---

const initialInsiderState = {
    isActive: false,
    phase: 'setup',
    targetWord: '',
    players: [],
    timer: 0,
    votes: {},
    results: null,
    paused: false,
    pausedState: null,
    pauseStartTime: 0,
    totalPausedTime: 0,
};

const getRoom = (roomCode) => {
    if (!rooms[roomCode]) {
        console.error(`Attempted to access non-existent room: ${roomCode}`);
    }
    return rooms[roomCode];
};

const getSanitizedRoom = (room) => {
    if (!room) return null;
    const sanitizedRoom = { ...room };
    if (sanitizedRoom.coupGame instanceof CoupGame) {
        sanitizedRoom.coupGame = sanitizedRoom.coupGame.getState();
    }
    return sanitizedRoom;
};


// --- Insider Game Logic ---

const advanceInsiderGameState = (io, roomCode) => {
    if (roomTimers[roomCode]) {
        clearTimeout(roomTimers[roomCode]);
        delete roomTimers[roomCode];
    }

    const room = getRoom(roomCode);
    if (!room || !room.insiderGame.isActive) return;

    const insider = room.insiderGame.players?.find((p) => p.role === 'Insider');
    let resultText = '';

    if (room.insiderGame.phase === 'questioning') {
        room.insiderGame.phase = 'results';
        room.insiderGame.results = {
            insider: insider?.nickname || 'Unknown',
            wasInsiderFound: false, 
            wasWordGuessed: false,
        };
        resultText = `Time's up! The word was not guessed. The Insider (${insider?.nickname}) wins! The word was "${room.insiderGame.targetWord}".`;
    
    } else if (room.insiderGame.phase === 'voting') {
        const voteCounts = {};
        if (room.insiderGame.votes) {
          Object.values(room.insiderGame.votes).forEach((votedNick) => {
              voteCounts[votedNick] = (voteCounts[votedNick] || 0) + 1;
          });
        }
        
        const mostVotedNickname = Object.keys(voteCounts).reduce((a, b) => voteCounts[a] > voteCounts[b] ? a : b, '');
        const wasInsiderFound = !!insider && insider.nickname === mostVotedNickname;

        room.insiderGame.phase = 'results';
        room.insiderGame.results = {
            insider: insider?.nickname || 'Unknown',
            wasInsiderFound,
            wasWordGuessed: true,
        };

        if (wasInsiderFound) {
            resultText = `The Insider was caught! It was ${insider?.nickname}. Commons and Master win!`;
        } else {
            resultText = `The Insider escaped! It was ${insider?.nickname}. The Insider wins! The word was "${room.insiderGame.targetWord}".`;
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
    
    io.to(roomCode).emit('room-state', getSanitizedRoom(room));
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
      socket.on('join-room', ({ roomCode, nickname }, callback) => {
        let room = rooms[roomCode];

        // Create room if it doesn't exist
        if (!room) {
            const owner = { id: socket.id, nickname };
            room = {
                id: roomCode,
                owner,
                users: [],
                messages: [],
                activeGame: 'none',
                insiderGame: { ...initialInsiderState },
                coupGame: new CoupGame(), // Instance of the class
            };
            rooms[roomCode] = room;
        }

        // Check if nickname is taken by another user
        const isNicknameTaken = room.users.some(u => u.nickname.toLowerCase() === nickname.toLowerCase() && u.id !== socket.id);
        if (isNicknameTaken) {
            return callback({ error: 'Nickname is already taken.' });
        }
        
        // Add user to the room
        const existingUser = room.users.find(u => u.id === socket.id);
        if (!existingUser) {
            room.users.push({ id: socket.id, nickname });
            const systemMessage = {
                id: Date.now().toString(),
                user: { id: 'system', nickname: 'System' },
                text: `${nickname} has joined the room.`,
                timestamp: new Date().toISOString(),
                type: 'system',
            };
            room.messages.push(systemMessage);
        }

        socket.join(roomCode);
        
        io.to(roomCode).emit('room-state', getSanitizedRoom(room));
        callback({ roomState: getSanitizedRoom(room) });
      });
      
      socket.on('send-message', ({ roomCode, message }) => {
          const room = getRoom(roomCode);
          if (!room) return;
  
          const user = room.users.find((u) => u.id === socket.id);
          if (!user) return;
  
          const newMessage = {
              id: Date.now().toString(),
              user,
              text: message.substring(0, 200),
              timestamp: new Date().toISOString(),
              type: room.insiderGame.isActive && room.insiderGame.phase === 'questioning' ? 'game' : 'user',
          };
          room.messages.push(newMessage);
          io.to(roomCode).emit('new-message', newMessage);
      });

      socket.on('start-game', ({ roomCode, gameType }) => {
        const room = getRoom(roomCode);
        if (!room || room.owner.id !== socket.id) return;

        if (room.activeGame !== 'none') {
            socket.emit('error', 'A game is already in progress. Please end it first.');
            return;
        }
        
        room.activeGame = gameType;

        if (gameType === 'insider') {
            room.insiderGame = { ...initialInsiderState };
            const systemMessage = { id: Date.now().toString(), user: { id: 'system', nickname: 'System' }, text: 'Insider game setup started. Owner needs to set the word and start.', timestamp: new Date().toISOString(), type: 'system' };
            room.messages.push(systemMessage);
        } else if (gameType === 'coup') {
            try {
                room.coupGame.reset();
                room.users.forEach(u => room.coupGame.addPlayer(u.id, u.nickname));
                room.coupGame.startGame();
                room.coupGame.addLog(`Coup game started by ${room.owner.nickname}`);
            } catch (error) {
                 socket.emit('error', error.message);
                 room.activeGame = 'none'; // Revert game start on error
            }
        }
        
        io.to(roomCode).emit('room-state', getSanitizedRoom(room));
      });

      socket.on('end-game', ({ roomCode }) => {
        const room = getRoom(roomCode);
        if (!room || room.owner.id !== socket.id) return;

        const endedGame = room.activeGame;
        room.activeGame = 'none';
        room.insiderGame = { ...initialInsiderState }; // Reset insider state
        room.coupGame = new CoupGame(); // Reset coup state

        const systemMessage = { id: Date.now().toString(), user: { id: 'system', nickname: 'System' }, text: `The ${endedGame} game has ended.`, timestamp: new Date().toISOString(), type: 'system' };
        room.messages.push(systemMessage);

        io.to(roomCode).emit('room-state', getSanitizedRoom(room));
      });

       socket.on('pause-game', ({ roomCode }) => {
            const room = getRoom(roomCode);
            if (!room || room.owner.id !== socket.id) return;

            if (room.activeGame === 'insider' && room.insiderGame.isActive && !room.insiderGame.paused) {
                if (roomTimers[roomCode]) clearTimeout(roomTimers[roomCode]);
                room.insiderGame.paused = true;
                room.insiderGame.pauseStartTime = Date.now();
                room.insiderGame.pausedState = room.insiderGame.phase;
                room.insiderGame.phase = 'paused';
                const systemMessage = { id: Date.now().toString(), user: { id: 'system', nickname: 'System' }, text: `The Insider game has been paused.`, timestamp: new Date().toISOString(), type: 'system' };
                room.messages.push(systemMessage);
                io.to(roomCode).emit('new-message', systemMessage);
            } else if (room.activeGame === 'coup') {
                room.coupGame.pause();
            }
            io.to(roomCode).emit('room-state', getSanitizedRoom(room));
        });

        socket.on('resume-game', ({ roomCode }) => {
            const room = getRoom(roomCode);
            if (!room || room.owner.id !== socket.id) return;
            
            if (room.activeGame === 'insider' && room.insiderGame.isActive && room.insiderGame.paused) {
                room.insiderGame.paused = false;
                room.insiderGame.totalPausedTime += Date.now() - room.insiderGame.pauseStartTime;
                room.insiderGame.phase = room.insiderGame.pausedState;
                room.insiderGame.pausedState = null;

                const remainingTime = (room.insiderGame.timer * 1000) - (room.insiderGame.pauseStartTime - room.insiderGame.totalPausedTime - (Date.now() - room.insiderGame.totalPausedTime));
                
                if (room.insiderGame.phase === 'questioning' || room.insiderGame.phase === 'voting') {
                     const resumeTime = room.insiderGame.timer - Math.floor(room.insiderGame.totalPausedTime / 1000);
                     const timeout = (room.insiderGame.timer * 1000) - (Date.now() - room.insiderGame.pauseStartTime) + room.insiderGame.totalPausedTime;
                     if(roomTimers[roomCode]) clearTimeout(roomTimers[roomCode]);
                     roomTimers[roomCode] = setTimeout(() => advanceInsiderGameState(io, roomCode), timeout > 0 ? timeout : 0);
                }

                const systemMessage = { id: Date.now().toString(), user: { id: 'system', nickname: 'System' }, text: `The Insider game has been resumed.`, timestamp: new Date().toISOString(), type: 'system' };
                room.messages.push(systemMessage);
                io.to(roomCode).emit('new-message', systemMessage);

            } else if (room.activeGame === 'coup') {
                room.coupGame.resume();
            }
            io.to(roomCode).emit('room-state', getSanitizedRoom(room));
        });
      
      // --- Insider Listeners ---
      socket.on('insider-send-answer', ({ roomCode, questionId, answer }) => {
        const room = getRoom(roomCode);
        if (!room || room.activeGame !== 'insider' || !room.insiderGame.isActive || room.insiderGame.phase !== 'questioning' || room.insiderGame.paused) return;

        const master = room.insiderGame.players?.find(p => p.role === 'Master');
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
        io.to(roomCode).emit('room-state', getSanitizedRoom(room)); // To update message list immediately
      });

      socket.on('insider-correct-guess', ({ roomCode, messageId }) => {
        const room = getRoom(roomCode);
        if (!room || room.activeGame !== 'insider' || !room.insiderGame.isActive || room.insiderGame.phase !== 'questioning' || room.insiderGame.paused) return;

        const master = room.insiderGame.players?.find(p => p.role === 'Master');
        if (!master || master.id !== socket.id) return;

        const guessMessage = room.messages.find(m => m.id === messageId);
        if (!guessMessage) return;

        const guess = guessMessage.text.substring(7).trim();

        if (guess.toLowerCase() === room.insiderGame.targetWord?.toLowerCase()) {
            if (roomTimers[roomCode]) {
                clearTimeout(roomTimers[roomCode]);
                delete roomTimers[roomCode];
            }
            room.insiderGame.phase = 'voting';
            room.insiderGame.timer = 60; // 1 minute for voting
            
            const systemMessageText = `The word was guessed correctly! It was "${room.insiderGame.targetWord}". Now, vote for the Insider!`;
            const systemMessage = { id: Date.now().toString(), user: { id: 'system', nickname: 'System' }, text: systemMessageText, timestamp: new Date().toISOString(), type: 'system' };
            room.messages.push(systemMessage);
            io.to(roomCode).emit('new-message', systemMessage);
            
            roomTimers[roomCode] = setTimeout(() => advanceInsiderGameState(io, roomCode), room.insiderGame.timer * 1000);
            io.to(roomCode).emit('room-state', getSanitizedRoom(room));
        } else {
            // This case should be handled by insider-incorrect-guess now
        }
      });
      
      socket.on('insider-incorrect-guess', ({ roomCode, messageId }) => {
        const room = getRoom(roomCode);
        if (!room || room.activeGame !== 'insider' || !room.insiderGame.isActive || room.insiderGame.phase !== 'questioning' || room.insiderGame.paused) return;

        const master = room.insiderGame.players?.find(p => p.role === 'Master');
        if (!master || master.id !== socket.id) return;

        const guessMessage = room.messages.find(m => m.id === messageId);
        if (!guessMessage) return;

        if (roomTimers[roomCode]) {
            clearTimeout(roomTimers[roomCode]);
            delete roomTimers[roomCode];
        }

        const insider = room.insiderGame.players?.find((p) => p.role === 'Insider');
        room.insiderGame.phase = 'results';
        room.insiderGame.results = {
            insider: insider?.nickname || 'Unknown',
            wasInsiderFound: false,
            wasWordGuessed: false,
        };
        const resultText = `The guess was incorrect! The Insider (${insider?.nickname}) wins! The word was "${room.insiderGame.targetWord}".`;

        const systemMessage = { 
            id: Date.now().toString(), 
            user: { id: 'system', nickname: 'System' }, 
            text: resultText, 
            timestamp: new Date().toISOString(), 
            type: 'system' 
        };
        room.messages.push(systemMessage);
        io.to(roomCode).emit('new-message', systemMessage);
        io.to(roomCode).emit('room-state', getSanitizedRoom(room));
      });
  
      socket.on('insider-start-game-params', ({ roomCode, targetWord }) => {
          const room = getRoom(roomCode);
          if (!room || room.owner.id !== socket.id || room.activeGame !== 'insider') return;
          if (room.users.length < 4) { 
              socket.emit('error', "You need at least 4 players to start Insider.");
              return;
          }
          if (room.insiderGame.isActive) {
              socket.emit('error', "An Insider game is already in progress.");
              return;
          }
  
          try {
              const assignedPlayers = assignInsiderRoles(room.users);
              
              room.insiderGame = {
                  ...room.insiderGame,
                  isActive: true,
                  phase: 'questioning',
                  targetWord,
                  players: assignedPlayers,
                  timer: 300,
                  votes: {},
                  totalPausedTime: 0,
              };
              
              const systemMessage = { id: Date.now().toString(), user: { id: 'system', nickname: 'System' }, text: `The Insider game has started! You have 5 minutes to find the word.`, timestamp: new Date().toISOString(), type: 'system' };
              room.messages.push(systemMessage);
              io.to(roomCode).emit('new-message', systemMessage);
  
              io.to(roomCode).emit('room-state', getSanitizedRoom(room));
              
              room.insiderGame.players?.forEach((player) => {
                  let message = `Your role is: ${player.role}. `;
                  if (player.role === 'Master' || player.role === 'Insider') {
                      message += `The word is: "${targetWord}"`;
                  } else { // Common
                      message += 'You do not know the word. Ask questions to find out!';
                  }
                  io.to(player.id).emit('private-role', { role: player.role, message });
              });
  
              if (roomTimers[roomCode]) clearTimeout(roomTimers[roomCode]);
              roomTimers[roomCode] = setTimeout(() => advanceInsiderGameState(io, roomCode), room.insiderGame.timer * 1000);
  
          } catch (error) {
              console.error('Error starting game:', error);
              socket.emit('error', error.message || 'Failed to start the game.');
          }
      });
  
      socket.on('insider-submit-vote', ({ roomCode, voteForNickname }) => {
          const room = getRoom(roomCode);
          if (!room?.insiderGame.isActive || room.insiderGame.phase !== 'voting' || room.activeGame !== 'insider' || room.insiderGame.paused) return;
          
          const voterId = socket.id;
          if(voterId && !room.insiderGame.votes?.[voterId]) {
              room.insiderGame.votes = { ...room.insiderGame.votes, [voterId]: voteForNickname };
  
              const allVoted = room.insiderGame.players && Object.keys(room.insiderGame.votes).length === room.insiderGame.players.length;
  
              if (allVoted) {
                  advanceInsiderGameState(io, roomCode);
              } else {
                io.to(roomCode).emit('room-state', getSanitizedRoom(room));
              }
          }
      });

      // --- Coup Listeners ---
      socket.on('coup-action', ({ roomCode, action, targetId, extra }) => {
          const room = getRoom(roomCode);
          if (!room || room.activeGame !== 'coup' || room.coupGame.getState().paused) return;

          try {
            const game = room.coupGame;
            switch(action) {
                case 'challenge': game.handleChallenge(socket.id); break;
                case 'pass': game.pass(socket.id); break;
                case 'block': game.handleBlock(socket.id, extra.card); break;
                case 'reveal': game.handleReveal(socket.id, extra.card); break;
                case 'exchange-response': game.handleExchangeResponse(socket.id, extra.cards); break;
                default: game.handleAction(socket.id, action, targetId);
            }
            io.to(roomCode).emit('room-state', getSanitizedRoom(room));
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
                  
                  const systemMessage = { id: Date.now().toString(), user: { id: 'system', nickname: 'System' }, text: `${user.nickname} has left the room.`, timestamp: new Date().toISOString(), type: 'system' };
                  room.messages.push(systemMessage);
                  
                  if (room.activeGame === 'coup') {
                      room.coupGame.removePlayer(user.id);
                  }

                  if (room.users.length === 0) {
                      if (room.activeGame === 'insider' && roomTimers[roomCode]) {
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
  
                      if (room.activeGame === 'insider' && room.insiderGame.isActive && (room.users.length < 4 || (room.insiderGame.players && !room.insiderGame.players.some(p => p.id === user.id)))) {
                           if (roomTimers[roomCode]) {
                              clearTimeout(roomTimers[roomCode]);
                              delete roomTimers[roomCode];
                          }
                          room.insiderGame = { ...initialInsiderState };
                          const resetMessage = { id: Date.now().toString(), user: { id: 'system', nickname: 'System' }, text: 'Insider game reset due to a player leaving or not enough players.', timestamp: new Date().toISOString(), type: 'system' };
                          room.messages.push(resetMessage);
                      }
                      
                      io.to(roomCode).emit('room-state', getSanitizedRoom(room));
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
