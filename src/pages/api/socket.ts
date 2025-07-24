import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import type { NextApiRequest, NextApiResponse } from 'next';

interface User {
  id: string;
  nickname: string;
}

interface Message {
  id: string;
  user: User;
  text: string;
  timestamp: string;
  type: 'user' | 'system' | 'game';
}

type PlayerRole = 'Master' | 'Insider' | 'Common';

interface Player extends User {
  role: PlayerRole | null;
}

interface GameState {
  isActive: boolean;
  phase: 'setup' | 'questioning' | 'voting' | 'results';
  targetWord?: string;
  players?: Player[];
  timer?: number;
  votes?: Record<string, string>; // voterId -> votedForNickname
  results?: {
    insider: string;
    wasInsiderFound: boolean;
    wasWordGuessed: boolean;
  };
}

interface RoomState {
    id: string;
    owner: User;
    users: User[];
    messages: Message[];
    gameState: GameState;
}

const rooms: Record<string, RoomState> = {};
const roomTimers: Record<string, NodeJS.Timeout> = {};

const advanceGameState = (roomCode: string, io: SocketIOServer) => {
    const room = rooms[roomCode];
    if (!room || !room.gameState.isActive) return;

    if (room.gameState.phase === 'questioning') {
        const insider = room.gameState.players?.find((p) => p.role === 'Insider');
        room.gameState.phase = 'results';
        room.gameState.results = {
            insider: insider?.nickname || 'Unknown',
            wasInsiderFound: false,
            wasWordGuessed: false,
        };
        const resultText = `Time's up! The word was not guessed. The Insider (${insider?.nickname}) wins! The word was "${room.gameState.targetWord}".`;
        const systemMessage: Message = { id: Date.now().toString(), user: { id: 'system', nickname: 'System' }, text: resultText, timestamp: new Date().toISOString(), type: 'system' };
        room.messages.push(systemMessage);
        io.to(roomCode).emit('new-message', systemMessage);
    } else if (room.gameState.phase === 'voting') {
        const insider = room.gameState.players?.find((p) => p.role === 'Insider');
        const voteCounts: Record<string, number> = {};
        if (room.gameState.votes) {
          Object.values(room.gameState.votes).forEach((votedNick) => {
              voteCounts[votedNick] = (voteCounts[votedNick] || 0) + 1;
          });
        }
        
        const mostVotedNickname = Object.keys(voteCounts).reduce((a, b) => voteCounts[a] > voteCounts[b] ? a : b, '');
        
        room.gameState.phase = 'results';
        const wasInsiderFound = !!insider && insider.nickname === mostVotedNickname;
        room.gameState.results = {
            insider: insider?.nickname || 'Unknown',
            wasInsiderFound,
            wasWordGuessed: true,
        };

        const resultText = wasInsiderFound ? `The Insider was caught! It was ${insider?.nickname}. Commons and Master win!` : `The Insider escaped! It was ${insider?.nickname}. The Insider wins! The word was "${room.gameState.targetWord}".`;
        const systemMessage: Message = { id: Date.now().toString(), user: { id: 'system', nickname: 'System' }, text: resultText, timestamp: new Date().toISOString(), type: 'system' };
        room.messages.push(systemMessage);
        io.to(roomCode).emit('new-message', systemMessage);
    }
    
    if (roomTimers[roomCode]) {
        clearInterval(roomTimers[roomCode]);
        delete roomTimers[roomCode];
    }
    
    io.to(roomCode).emit('game-update', room.gameState);
};

const assignRoles = (playersList: string[], roomOwnerNickname: string) => {
    if (playersList.length < 4) {
      throw new Error('The game requires at least 4 players.');
    }
    const roles: Record<string, PlayerRole> = {};
    const otherPlayers = playersList.filter(p => p !== roomOwnerNickname);
    const insiderIndex = Math.floor(Math.random() * otherPlayers.length);
    const insider = otherPlayers[insiderIndex];
    
    roles[roomOwnerNickname] = 'Master';
    roles[insider] = 'Insider';

    otherPlayers.forEach(player => {
      if (!roles[player]) {
        roles[player] = 'Common';
      }
    });

    return roles;
};

type NextApiResponseWithSocket = NextApiResponse & {
  socket: {
    server: HttpServer & {
      io?: SocketIOServer;
    };
  };
};

const socketHandler = (req: NextApiRequest, res: NextApiResponseWithSocket) => {
  if (res.socket.server.io) {
    res.end();
    return;
  }

  const io = new SocketIOServer(res.socket.server, {
    path: "/api/socket_io",
    addTrailingSlash: false,
  });
  res.socket.server.io = io;

  io.on('connection', (socket: Socket) => {
    socket.on('join-room', ({ roomCode, nickname }, callback) => {
        let room = rooms[roomCode];
        const lowerCaseNickname = nickname.toLowerCase();

        // SCENARIO 1: Room does not exist, so we create it.
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
        // SCENARIO 2: Room exists. Handle join or rejoin.
            const userInRoom = room.users.find(u => u.id === socket.id);
            const isNicknameTaken = room.users.some(u => u.id !== socket.id && u.nickname.toLowerCase() === lowerCaseNickname);

            if (isNicknameTaken) {
                return callback({ error: 'Nickname is already taken.' });
            }

            if (userInRoom) {
                // User is rejoining, potentially with a new nickname.
                if (userInRoom.nickname.toLowerCase() !== lowerCaseNickname) {
                    const oldNickname = userInRoom.nickname;
                    userInRoom.nickname = nickname;
                    if (room.owner.id === socket.id) {
                        room.owner.nickname = nickname;
                    }
                    const systemMessage: Message = {
                        id: Date.now().toString(),
                        user: { id: 'system', nickname: 'System' },
                        text: `${oldNickname} is now known as ${nickname}.`,
                        timestamp: new Date().toISOString(),
                        type: 'system',
                    };
                    room.messages.push(systemMessage);
                }
            } else {
                // New user is joining the room.
                const newUser = { id: socket.id, nickname };
                room.users.push(newUser);
                const systemMessage: Message = {
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

        const newMessage: Message = {
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
                    clearInterval(roomTimers[roomCode]);
                    delete roomTimers[roomCode];
                }
                room.gameState.phase = 'voting';
                room.gameState.timer = 60; // 1 minute for voting
                
                const systemMessageText = `The word was guessed correctly! It was "${room.gameState.targetWord}". Now, vote for the Insider!`;
                const systemMessage: Message = { id: Date.now().toString(), user: { id: 'system', nickname: 'System' }, text: systemMessageText, timestamp: new Date().toISOString(), type: 'system' };
                room.messages.push(systemMessage);
                io.to(roomCode).emit('new-message', systemMessage);
                io.to(roomCode).emit('game-update', room.gameState);

                roomTimers[roomCode] = setTimeout(() => advanceGameState(roomCode, io), room.gameState.timer! * 1000);
            }
        }
    });

    socket.on('start-game', async ({ roomCode, targetWord }) => {
        const room = rooms[roomCode];
        if (!room || room.owner.id !== socket.id || room.users.length < 4) {
             socket.emit('error', "Can't start game. You must be the owner and have at least 4 players.");
            return;
        }
        if (room.gameState.isActive) {
            socket.emit('error', "A game is already in progress.");
            return;
        }

        const players = room.users.map((u) => u.nickname);
        const roomOwner = room.owner.nickname;

        try {
            const roles = assignRoles(players, roomOwner);
            room.gameState = {
                isActive: true,
                phase: 'questioning',
                targetWord,
                players: room.users.map((u) => ({ ...u, role: roles[u.nickname] || null })),
                timer: 300,
                votes: {},
            };

            io.to(roomCode).emit('game-update', room.gameState);
            
            room.gameState.players?.forEach((player) => {
                const message = `Your role is: ${player.role}. ${player.role !== 'Common' ? `The word is: "${targetWord}"` : 'You do not know the word.'}`;
                io.to(player.id).emit('private-role', { role: player.role, message });
            });

            const systemMessage: Message = { id: Date.now().toString(), user: { id: 'system', nickname: 'System' }, text: `The Insider game has started! You have 5 minutes to find the word.`, timestamp: new Date().toISOString(), type: 'system' };
            room.messages.push(systemMessage);
            io.to(roomCode).emit('new-message', systemMessage);

            if (roomTimers[roomCode]) clearInterval(roomTimers[roomCode]);
            roomTimers[roomCode] = setTimeout(() => advanceGameState(roomCode, io), room.gameState.timer * 1000);

        } catch (error: any) {
            console.error('Error assigning roles:', error);
            socket.emit('error', error.message || 'Failed to start the game.');
        }
    });

    socket.on('submit-vote', ({ roomCode, voteForNickname }) => {
        const room = rooms[roomCode];
        if (!room?.gameState.isActive || room.gameState.phase !== 'voting') return;
        
        const voter = room.gameState.players?.find((p) => p.id === socket.id);
        if(voter && !room.gameState.votes?.[voter.id]) {
            room.gameState.votes = { ...room.gameState.votes, [voter.id]: voteForNickname };

            const allVoted = room.gameState.players && Object.keys(room.gameState.votes).length === room.gameState.players.length;

            if (allVoted) {
                 if (roomTimers[roomCode]) {
                    clearTimeout(roomTimers[roomCode]);
                    delete roomTimers[roomCode];
                }
                advanceGameState(roomCode, io);
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
                
                if (room.users.length === 0) {
                    if (roomTimers[roomCode]) {
                        clearInterval(roomTimers[roomCode]);
                        delete roomTimers[roomCode];
                    }
                    delete rooms[roomCode];
                } else {
                     if (room.owner.id === user.id) {
                        room.owner = room.users[0];
                        const ownerMessage: Message = { id: Date.now().toString(), user: { id: 'system', nickname: 'System' }, text: `${room.owner.nickname} is the new room owner.`, timestamp: new Date().toISOString(), type: 'system' };
                        room.messages.push(ownerMessage);
                     }
                    const systemMessage: Message = { id: Date.now().toString(), user: { id: 'system', nickname: 'System' }, text: `${user.nickname} has left the room.`, timestamp: new Date().toISOString(), type: 'system' };
                    room.messages.push(systemMessage);

                    if (room.gameState.isActive) {
                         const playerInGame = room.gameState.players?.find(p => p.id === user.id);
                         if (playerInGame || room.users.length < 4) {
                             if (roomTimers[roomCode]) {
                                clearTimeout(roomTimers[roomCode]);
                                delete roomTimers[roomCode];
                            }
                            room.gameState = { isActive: false, phase: 'setup' };
                            const resetMessage: Message = { id: Date.now().toString(), user: { id: 'system', nickname: 'System' }, text: 'Game reset due to a player leaving.', timestamp: new Date().toISOString(), type: 'system' };
                            room.messages.push(resetMessage);
                         }
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
  
  res.end();
};

export default socketHandler;
