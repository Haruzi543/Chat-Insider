
"use client";

import { useEffect, useState, useMemo, Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

import type { RoomState as GenericRoomState } from './types';
import type { InsiderRoomState, Message as InsiderMessage, Player as InsiderPlayer } from './insider/types';
import type { CoupRoomState, CoupGameState } from './coup/types';

import UserListPanel from './components/UserListPanel';
import GameControlPanel from './components/GameControlPanel';
import InsiderPage from './insider/InsiderPage';
import CoupPage from './coup/CoupPage';
import ChatPanel from './components/ChatPanel';
import RoleDialog from './components/RoleDialog';
import { useSound } from '@/hooks/useSound';

function RoomPageContent() {
    const params = useParams();
    const router = useRouter();
    const { toast } = useToast();
    const roomCode = (params.roomId as string).toUpperCase();
    const { playMessage, playJoin, playLeave, playError, playSuccess } = useSound();

    const [socket, setSocket] = useState<Socket | null>(null);
    const [roomState, setRoomState] = useState<GenericRoomState | null>(null);
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
            newSocket.emit('join-room', { roomCode, nickname: storedNickname }, (response: any) => {
                if (response.error) {
                    playError();
                    toast({ title: 'Join Error', description: response.error, variant: 'destructive' });
                    router.push('/');
                } else {
                    setRoomState(response.roomState);
                    setIsLoading(false);
                    playJoin();
                }
            });
        });

        newSocket.on('room-state', (state: GenericRoomState) => {
            const sanitizedState = {
                ...state,
                coupGame: state.coupGame && typeof state.coupGame.getState === 'function' 
                    ? state.coupGame.getState() 
                    : state.coupGame,
            };
            setRoomState(sanitizedState);
        });
        
        newSocket.on('new-message', (newMessage: InsiderMessage) => {
            setRoomState(prev => {
                if (prev) {
                    const isNewUserMessage = newMessage.type === 'system' && newMessage.text.includes('has joined');
                    const isUserLeaveMessage = newMessage.type === 'system' && newMessage.text.includes('has left');
                    const isMyMessage = newMessage.user.id === newSocket.id;
                    
                    if (isNewUserMessage) playJoin();
                    else if (isUserLeaveMessage) playLeave();
                    else if (!isMyMessage) playMessage();
                }
                return prev ? { ...prev, messages: [...prev.messages, newMessage] } : null;
            });
        });
        
        // Insider specific listeners
        newSocket.on('private-role', (data: { role: string; message: string }) => {
            setRoleInfo(data);
            playSuccess();
        });
        
        // Generic listeners
        newSocket.on('error', (message: string) => {
            playError();
            toast({ title: 'Server Error', description: message, variant: 'destructive' });
        });
        newSocket.on('disconnect', () => {
            playError();
            toast({ title: 'Disconnected', description: 'You have been disconnected from the server.' });
            router.push('/');
        });

        return () => {
            newSocket.disconnect();
        };
    }, [roomCode, router, toast, playMessage, playJoin, playLeave, playError, playSuccess]);

    const handleLeaveRoom = () => {
        socket?.emit('leave-room');
        router.push('/');
    };

    const handleSendMessage = (message: string) => {
        if (socket && message.trim()) {
            socket.emit('send-message', { roomCode, message });
        }
    };

    const handleStartGame = (gameType: 'insider' | 'coup') => {
        if (socket) socket.emit('start-game', { roomCode, gameType });
    };

    const handleEndGame = () => {
        if (socket) socket.emit('end-game', { roomCode });
    };

    const handlePauseGame = () => {
        if (socket) socket.emit('pause-game', { roomCode });
    }

    const handleResumeGame = () => {
        if (socket) socket.emit('resume-game', { roomCode });
    }
    
    // ===== Insider Handlers =====
    const handleInsiderSendAnswer = (questionId: string, answer: string) => {
        if (socket) socket.emit('insider-send-answer', { roomCode, questionId, answer });
    };
    const handleInsiderCorrectGuess = (messageId: string) => {
        if (socket) {
            playSuccess();
            socket.emit('insider-correct-guess', { roomCode, messageId });
        }
    };
    const handleInsiderIncorrectGuess = (messageId: string) => {
        if (socket) {
            playError();
            socket.emit('insider-incorrect-guess', { roomCode, messageId });
        }
    };
    const handleInsiderStartGame = (targetWord: string) => { // This is for the game panel within Insider
        if (socket && targetWord.trim()) {
            playSuccess();
            socket.emit('insider-start-game-params', { roomCode, targetWord });
        } else {
            playError();
            toast({ title: "Game Error", description: "Please enter a target word.", variant: "destructive" });
        }
    };
    const handleInsiderSubmitVote = (voteForNickname: string) => {
        if (socket) {
            playMessage();
            socket.emit('insider-submit-vote', { roomCode, voteForNickname });
            toast({ title: "Vote Cast", description: `You voted for ${voteForNickname}.` });
        }
    };

    // ===== Coup Handlers =====
    const handleCoupAction = (action: string, targetId?: string, extra?: any) => {
        if(socket) socket.emit('coup-action', { roomCode, action, targetId, extra });
    };

    const myInsiderRole = useMemo(() => {
        if (!socket || !roomState || roomState.activeGame !== 'insider') return null;
        const insiderGameState = roomState.insiderGame;
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
    const coupGameState = roomState.coupGame;

    const renderGameContent = () => {
        switch (roomState.activeGame) {
            case 'insider':
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
                    onIncorrectGuess={handleInsiderIncorrectGuess}
                    onSubmitVote={handleInsiderSubmitVote}
                    onPause={handlePauseGame}
                    onResume={handleResumeGame}
                />;
            case 'coup':
                 return <CoupPage
                    socket={socket}
                    roomCode={roomCode}
                    roomState={{...roomState, coupGame: coupGameState}}
                    isOwner={isOwner}
                    onLeaveRoom={handleLeaveRoom}
                    onEndGame={handleEndGame}
                    onGameAction={handleCoupAction}
                    onPause={handlePauseGame}
                    onResume={handleResumeGame}
                />;
            default:
                // No game is active, show a lobby / chat view
                return (
                    <div className="flex h-screen bg-background text-foreground">
                        <aside className="hidden md:flex flex-col w-64 lg:w-80 border-r border-border p-4">
                            <UserListPanel
                                roomCode={roomState.id}
                                users={roomState.users}
                                ownerId={roomState.owner.id}
                                myId={socket.id}
                            />
                            <Separator className="my-4" />
                            {isOwner && (
                                <GameControlPanel
                                    onStartGame={handleStartGame}
                                    onEndGame={handleEndGame}
                                    activeGame={roomState.activeGame}
                                    users={roomState.users}
                                />
                            )}
                            <Button onClick={handleLeaveRoom} variant="outline" className="mt-auto">
                                <LogOut className="mr-2 h-4 w-4" /> Leave Room
                            </Button>
                        </aside>
                         <main className="flex-1 flex flex-col h-screen max-h-screen overflow-hidden">
                             <ChatPanel
                                messages={roomState.messages}
                                myId={socket.id}
                                onSendMessage={handleSendMessage}
                             />
                         </main>
                    </div>
                );
        }
    };
    
    return (
        <>
            <RoleDialog roleInfo={roleInfo} onOpenChange={() => setRoleInfo(null)} />
            {renderGameContent()}
        </>
    )
}

export default function RoomPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <RoomPageContent />
        </Suspense>
    );
}
