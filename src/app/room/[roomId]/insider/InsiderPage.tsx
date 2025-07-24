
"use client";

import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { LogOut, Pause, Play } from 'lucide-react';
import type { Socket } from 'socket.io-client';

import type { InsiderRoomState } from './types';
import type { Player } from './types';
import UserListPanel from '../components/UserListPanel';
import GamePanel from '../components/GamePanel';
import ChatPanel from '../components/ChatPanel';
import MobileHeader from '../components/MobileHeader';

interface InsiderPageProps {
    socket: Socket;
    roomState: InsiderRoomState;
    isOwner: boolean;
    myRole: Player['role'] | null;
    roleInfo: { role: string; message: string } | null;
    setRoleInfo: (info: { role: string; message: string } | null) => void;
    onLeaveRoom: () => void;
    onSendMessage: (message: string) => void;
    onStartGame: (targetWord: string) => void;
    onSendAnswer: (questionId: string, answer: string) => void;
    onCorrectGuess: (messageId: string) => void;
    onIncorrectGuess: (messageId: string) => void;
    onSubmitVote: (voteForNickname: string) => void;
    onPause: () => void;
    onResume: () => void;
}

export default function InsiderPage({ 
    socket, roomState, isOwner, myRole, roleInfo, setRoleInfo, 
    onLeaveRoom, onSendMessage, onStartGame, onSendAnswer, onCorrectGuess, onIncorrectGuess, onSubmitVote,
    onPause, onResume
}: InsiderPageProps) {
    const { insiderGame } = roomState;
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
                <GamePanel
                    gameState={insiderGame}
                    isOwner={isOwner}
                    users={roomState.users}
                    myId={socket.id}
                    myRole={myRole}
                    onStartGame={onStartGame}
                    onSubmitVote={onSubmitVote}
                />
                 <div className="mt-auto flex flex-col gap-2">
                    {isOwner && insiderGame.isActive && (
                        <>
                            {insiderGame.paused ? (
                                <Button onClick={onResume} variant="outline"><Play className="mr-2" /> Resume Game</Button>
                            ) : (
                                <Button onClick={onPause} variant="outline"><Pause className="mr-2" /> Pause Game</Button>
                            )}
                        </>
                    )}
                    <Button onClick={onLeaveRoom} variant="outline">
                        <LogOut className="mr-2 h-4 w-4" /> Leave Room
                    </Button>
                </div>
            </aside>

            <main className="flex-1 flex flex-col h-screen max-h-screen overflow-hidden relative">
                <MobileHeader 
                    roomCode={roomState.id} 
                    onLeave={onLeaveRoom}
                    isOwner={isOwner}
                    isPaused={insiderGame.paused}
                    onPause={onPause}
                    onResume={onResume}
                />
                {insiderGame.paused && (
                     <div className="absolute inset-0 bg-black/70 z-20 flex flex-col items-center justify-center gap-4">
                        <Pause className="w-16 h-16 text-white"/>
                        <h2 className="text-3xl font-bold text-white">Game Paused</h2>
                        {isOwner && <Button onClick={onResume}><Play className="mr-2"/>Resume Game</Button>}
                    </div>
                )}
                <ChatPanel
                    messages={roomState.messages}
                    myId={socket.id}
                    myRole={myRole}
                    gameState={insiderGame}
                    onSendMessage={onSendMessage}
                    onSendAnswer={onSendAnswer}
                    onCorrectGuess={onCorrectGuess}
                    onIncorrectGuess={onIncorrectGuess}
                />
            </main>
        </div>
    );
}
