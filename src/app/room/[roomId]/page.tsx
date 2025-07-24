
"use client";

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from 'lucide-react';

import type { RoomState as InsiderRoomState, GameState as InsiderGameState, Message as InsiderMessage, Player as InsiderPlayer } from './insider/types';
import type { GameState as CoupGameState, Player as CoupPlayer } from './coup/types';

import InsiderPage from './insider/InsiderPage';
import CoupPage from './coup/CoupPage';

export interface SharedRoomState {
  id: string;
  owner: { id: string; nickname: string };
  users: { id: string; nickname: string }[];
  gameType: 'insider' | 'coup';
  messages: InsiderMessage[]; 
  gameState: InsiderGameState | CoupGameState;
}


export default function RoomPage() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const roomCode = (params.roomId as string).toUpperCase();
    const gameType = searchParams.get('game');

    const [socket, setSocket] = useState<Socket | null>(null);
    const [roomState, setRoomState] = useState<SharedRoomState | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    
    // Insider specific state
    const [roleInfo, setRoleInfo] = useState<{ role: string; message: string } | null>(null);

    useEffect(() => {
        const storedNickname = sessionStorage.getItem('nickname');
        if (!storedNickname) {
            router.push('/');
            return;
        }

        const newSocket = io();
        setSocket(newSocket);

        newSocket.on('connect', () => {
            console.log('Socket connected');
            newSocket.emit('join-room', { roomCode, nickname: storedNickname, gameType }, (response: any) => {
                if (response.error) {
                    toast({ title: 'Join Error', description: response.error, variant: 'destructive' });
                    router.push('/');
                } else {
                    setRoomState(response.roomState);
                    setIsLoading(false);
                }
            });
        });

        newSocket.on('room-state', (state: SharedRoomState) => setRoomState(state));
        newSocket.on('new-message', (newMessage: InsiderMessage) => {
             if (roomState?.gameType === 'insider') {
                setRoomState(prev => prev ? { ...prev, messages: [...prev.messages, newMessage] } : null)
             }
        });
        newSocket.on('game-update', (gameState: InsiderGameState | CoupGameState) => {
            setRoomState(prev => prev ? { ...prev, gameState } : null);
        });

        // Insider specific listeners
        newSocket.on('private-role', (data: { role: string; message: string }) => setRoleInfo(data));
        
        // Generic listeners
        newSocket.on('error', (message: string) => toast({ title: 'Server Error', description: message, variant: 'destructive' }));
        newSocket.on('disconnect', () => {
            toast({ title: 'Disconnected', description: 'You have been disconnected from the server.' });
            router.push('/');
        });

        return () => {
            newSocket.disconnect();
        };
    }, [roomCode, router, toast, gameType]);

    const handleLeaveRoom = () => {
        socket?.emit('leave-room');
        router.push('/');
    };

    const handleSendMessage = (message: string) => {
        if (socket && message.trim()) {
            socket.emit('send-message', { roomCode, message });
        }
    };
    
    // ===== Insider Handlers =====
    const handleInsiderSendAnswer = (questionId: string, answer: string) => {
        if (socket) socket.emit('insider-send-answer', { roomCode, questionId, answer });
    };
    const handleInsiderCorrectGuess = (messageId: string) => {
        if (socket) socket.emit('insider-correct-guess', { roomCode, messageId });
    };
    const handleInsiderStartGame = (targetWord: string) => {
        if (socket && targetWord.trim()) {
            socket.emit('insider-start-game', { roomCode, targetWord });
        } else {
            toast({ title: "Game Error", description: "Please enter a target word.", variant: "destructive" });
        }
    };
    const handleInsiderSubmitVote = (voteForNickname: string) => {
        if (socket) {
            socket.emit('insider-submit-vote', { roomCode, voteForNickname });
            toast({ title: "Vote Cast", description: `You voted for ${voteForNickname}.` });
        }
    };

    // ===== Coup Handlers =====
    const handleCoupAction = (action: string, targetId?: string) => {
        if(socket) socket.emit('coup-action', { roomCode, action, targetId });
    };

    const myInsiderRole = useMemo(() => {
        if (!socket || !roomState || roomState.gameType !== 'insider') return null;
        const insiderGameState = roomState.gameState as InsiderGameState;
        if (!insiderGameState.isActive) return null;
        return insiderGameState.players?.find(p => p.id === socket.id)?.role || null;
    }, [socket, roomState]);
    
    if (isLoading || !roomState || !socket) {
        return (
            <div className="flex h-screen items-center justify-center bg-background">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="ml-4 text-lg">Joining room...</p>
            </div>
        );
    }

    const isOwner = socket.id === roomState.owner.id;

    if (roomState.gameType === 'insider') {
        return <InsiderPage
            socket={socket}
            roomState={roomState as InsiderRoomState}
            isOwner={isOwner}
            myRole={myInsiderRole}
            roleInfo={roleInfo}
            setRoleInfo={setRoleInfo}
            onLeaveRoom={handleLeaveRoom}
            onSendMessage={handleSendMessage}
            onStartGame={handleInsiderStartGame}
            onSendAnswer={handleInsiderSendAnswer}
            onCorrectGuess={handleInsiderCorrectGuess}
            onSubmitVote={handleInsiderSubmitVote}
        />;
    }

    if (roomState.gameType === 'coup') {
         return <CoupPage
            socket={socket}
            roomCode={roomCode}
            roomState={roomState}
            isOwner={isOwner}
            onLeaveRoom={handleLeaveRoom}
            onGameAction={handleCoupAction}
        />;
    }

    return (
        <div className="flex h-screen items-center justify-center bg-background">
            <p className="text-lg text-destructive">Error: Invalid game type.</p>
        </div>
    );
}

