
"use client";

import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';
import type { Socket } from 'socket.io-client';

import type { RoomState, Message, GameState, Player } from './types';
import UserListPanel from '../components/UserListPanel';
import GamePanel from '../components/GamePanel';
import ChatPanel from '../components/ChatPanel';
import RoleDialog from '../components/RoleDialog';
import MobileHeader from '../components/MobileHeader';

interface InsiderPageProps {
    socket: Socket;
    roomState: RoomState;
    isOwner: boolean;
    myRole: Player['role'] | null;
    roleInfo: { role: string; message: string } | null;
    setRoleInfo: (info: { role: string; message: string } | null) => void;
    onLeaveRoom: () => void;
    onSendMessage: (message: string) => void;
    onStartGame: (targetWord: string) => void;
    onSendAnswer: (questionId: string, answer: string) => void;
    onCorrectGuess: (messageId: string) => void;
    onSubmitVote: (voteForNickname: string) => void;
}

export default function InsiderPage({ 
    socket, roomState, isOwner, myRole, roleInfo, setRoleInfo, 
    onLeaveRoom, onSendMessage, onStartGame, onSendAnswer, onCorrectGuess, onSubmitVote 
}: InsiderPageProps) {
    return (
        <>
            <RoleDialog roleInfo={roleInfo} onOpenChange={() => setRoleInfo(null)} />
            
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
                        gameState={roomState.gameState}
                        isOwner={isOwner}
                        users={roomState.users}
                        myId={socket.id}
                        myRole={myRole}
                        onStartGame={onStartGame}
                        onSubmitVote={onSubmitVote}
                    />
                    <Button onClick={onLeaveRoom} variant="outline" className="mt-auto">
                        <LogOut className="mr-2 h-4 w-4" /> Leave Room
                    </Button>
                </aside>

                <main className="flex-1 flex flex-col h-screen max-h-screen overflow-hidden">
                    <MobileHeader roomCode={roomState.id} onLeave={onLeaveRoom} />
                    <ChatPanel
                        messages={roomState.messages}
                        myId={socket.id}
                        myRole={myRole}
                        gameState={roomState.gameState}
                        onSendMessage={onSendMessage}
                        onSendAnswer={onSendAnswer}
                        onCorrectGuess={onCorrectGuess}
                    />
                </main>
            </div>
        </>
    );
}

