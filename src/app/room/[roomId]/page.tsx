
"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';
import { useToast } from "@/hooks/use-toast";
import { Loader2, LogOut } from 'lucide-react';

import type { RoomState, Message, GameState } from './types';
import UserListPanel from './components/UserListPanel';
import GamePanel from './components/GamePanel';
import ChatPanel from './components/ChatPanel';
import RoleDialog from './components/RoleDialog';
import MobileHeader from './components/MobileHeader';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

export default function RoomPage() {
    const params = useParams();
    const router = useRouter();
    const { toast } = useToast();
    const roomCode = (params.roomId as string).toUpperCase();

    const [socket, setSocket] = useState<Socket | null>(null);
    const [roomState, setRoomState] = useState<RoomState | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [roleInfo, setRoleInfo] = useState<{ role: string; message: string } | null>(null);

    useEffect(() => {
        const storedNickname = sessionStorage.getItem('nickname');
        if (!storedNickname) {
            router.push('/');
            return;
        }

        // The fetch call is a standard part of the useEffect cleanup to establish connection
        fetch('/api/socket').finally(() => {
            const newSocket = io();

            setSocket(newSocket);
    
            newSocket.on('connect', () => {
                console.log('Socket connected');
                newSocket.emit('join-room', { roomCode, nickname: storedNickname }, (response: any) => {
                    if (response.error) {
                        toast({ title: 'Join Error', description: response.error, variant: 'destructive' });
                        router.push('/');
                    } else {
                        setRoomState(response.roomState);
                        setIsLoading(false);
                    }
                });
            });
    
            newSocket.on('room-state', (state: RoomState) => setRoomState(state));
            newSocket.on('new-message', (newMessage: Message) => setRoomState(prev => prev ? { ...prev, messages: [...prev.messages, newMessage] } : null));
            newSocket.on('game-update', (gameState: GameState) => setRoomState(prev => prev ? { ...prev, gameState } : null));
            newSocket.on('private-role', (data: { role: string; message: string }) => setRoleInfo(data));
            newSocket.on('error', (message: string) => toast({ title: 'Server Error', description: message, variant: 'destructive' }));
            newSocket.on('disconnect', () => {
              toast({ title: 'Disconnected', description: 'You have been disconnected from the server.' });
              router.push('/');
            });
    
            return () => {
                newSocket.disconnect();
            };
        })
    }, [roomCode, router, toast]);

    const handleLeaveRoom = () => {
        socket?.emit('leave-room');
        socket?.disconnect();
        router.push('/');
    };

    const handleSendMessage = (message: string) => {
        if (socket && message.trim()) {
            socket.emit('send-message', { roomCode, message });
        }
    };

    const handleStartGame = (targetWord: string) => {
        if (socket && targetWord.trim()) {
            socket.emit('start-game', { roomCode, targetWord });
        } else {
            toast({ title: "Game Error", description: "Please enter a target word.", variant: "destructive" });
        }
    };
    
    const handleSubmitVote = (voteForNickname: string) => {
        if (socket) {
            socket.emit('submit-vote', { roomCode, voteForNickname });
            toast({ title: "Vote Cast", description: `You voted for ${voteForNickname}.` });
        }
    };

    if (isLoading || !roomState || !socket) {
        return (
            <div className="flex h-screen items-center justify-center bg-background">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="ml-4 text-lg">Joining room...</p>
            </div>
        );
    }

    const isOwner = socket.id === roomState.owner.id;

    return (
        <>
            <RoleDialog roleInfo={roleInfo} onOpenChange={() => setRoleInfo(null)} />
            
            <div className="flex h-screen bg-background text-foreground">
                <aside className="hidden md:flex flex-col w-64 lg:w-80 border-r border-border p-4">
                    <UserListPanel
                        roomCode={roomCode}
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
                        onStartGame={handleStartGame}
                        onSubmitVote={handleSubmitVote}
                    />
                    <Button onClick={handleLeaveRoom} variant="outline" className="mt-auto">
                        <LogOut className="mr-2 h-4 w-4" /> Leave Room
                    </Button>
                </aside>

                <main className="flex-1 flex flex-col h-screen max-h-screen overflow-hidden">
                    <MobileHeader roomCode={roomCode} onLeave={handleLeaveRoom} />
                    <ChatPanel
                        messages={roomState.messages}
                        myId={socket.id}
                        onSendMessage={handleSendMessage}
                    />
                </main>
            </div>
        </>
    );
}
