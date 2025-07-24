import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import type { NextApiRequest, NextApiResponse } from 'next';
import { assignInsiderRoles } from '@/ai/flows/assign-insider-roles';

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
  votes?: Record<string, string>;
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
      
      if (!room) {
        room = {
          id: roomCode,
          owner: { id: socket.id, nickname },
          users: [],
          messages: [],
          gameState: { isActive: false, phase: 'setup' },
        };
        rooms[roomCode] = room;
      }
      
      if (room.users.find((user) => user.nickname === nickname)) {
        return callback({ error: 'Nickname is already taken.' });
      }

      socket.join(roomCode);
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
            const guess = message.substring(7).trim().toLowerCase();
            if (guess === room.gameState.targetWord?.toLowerCase()) {
                room.gameState.phase = 'voting';
                room.gameState.timer = 60;
                io.to(roomCode).emit('game-update', room.gameState);
                
                const systemMessageText = `The word was guessed correctly! It was "${room.gameState.targetWord}". Now, vote for the Insider!`;
                const systemMessage: Message = { id: Date.now().toString(), user: { id: 'system', nickname: 'System' }, text: systemMessageText, timestamp: new Date().toISOString(), type: 'system' };
                room.messages.push(systemMessage);
                io.to(roomCode).emit('new-message', systemMessage);
            }
        }
    });

    socket.on('start-game', async ({ roomCode, targetWord }) => {
        const room = rooms[roomCode];
        if (!room || room.owner.id !== socket.id || room.users.length < 4) {
             socket.emit('error', "Can't start game. You must be the owner and have at least 4 players.");
            return;
        }

        const players = room.users.map((u) => u.nickname);
        const roomOwner = room.owner.nickname;

        try {
            const { roles } = await assignInsiderRoles({ players, roomOwner });
            room.gameState = {
                isActive: true,
                phase: 'questioning',
                targetWord,
                players: room.users.map((u) => ({ ...u, role: roles[u.nickname] as PlayerRole })),
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
        } catch (error) {
            console.error('Error assigning roles:', error);
            socket.emit('error', 'Failed to start the game. AI service might be down.');
        }
    });

    socket.on('submit-vote', ({ roomCode, voteForNickname }) => {
        const room = rooms[roomCode];
        if (!room?.gameState.isActive || room.gameState.phase !== 'voting') return;
        
        const voter = room.gameState.players?.find((p) => p.id === socket.id);
        if(voter && !room.gameState.votes?.[voter.id]) {
            room.gameState.votes = { ...room.gameState.votes, [voter.id]: voteForNickname };

            if (Object.keys(room.gameState.votes).length === room.gameState.players?.length) {
                const voteCounts: Record<string, number> = {};
                Object.values(room.gameState.votes).forEach((votedNick) => {
                    voteCounts[votedNick] = (voteCounts[votedNick] || 0) + 1;
                });
                
                const mostVotedNickname = Object.keys(voteCounts).reduce((a, b) => voteCounts[a] > voteCounts[b] ? a : b, '');
                const insider = room.gameState.players?.find((p) => p.role === 'Insider');
                
                room.gameState.phase = 'results';
                room.gameState.results = {
                    insider: insider?.nickname || 'Unknown',
                    wasInsiderFound: insider?.nickname === mostVotedNickname,
                    wasWordGuessed: true,
                };

                const resultText = room.gameState.results.wasInsiderFound ? `The Insider was ${insider?.nickname}! Commons and Master win!` : `The Insider escaped! It was ${insider?.nickname}. The Insider wins!`;
                const systemMessage: Message = { id: Date.now().toString(), user: { id: 'system', nickname: 'System' }, text: resultText, timestamp: new Date().toISOString(), type: 'system' };
                room.messages.push(systemMessage);
                io.to(roomCode).emit('new-message', systemMessage);
            }
            io.to(roomCode).emit('game-update', room.gameState);
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
                    delete rooms[roomCode];
                } else {
                     if (room.owner.id === user.id && room.users.length > 0) {
                        room.owner = room.users[0];
                     }
                    const systemMessage: Message = { id: Date.now().toString(), user: { id: 'system', nickname: 'System' }, text: `${user.nickname} has left the room.`, timestamp: new Date().toISOString(), type: 'system' };
                    room.messages.push(systemMessage);
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
