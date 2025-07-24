
"use client";

import { useMemo } from 'react';
import type { Socket } from 'socket.io-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { User, Shield, Swords, DollarSign, Crown, Users, LogOut, VenetianMask } from 'lucide-react';
import type { RoomState } from '../types';
import type { Player } from './types';
import { ScrollArea } from '@/components/ui/scroll-area';

interface CoupPageProps {
  socket: Socket;
  roomCode: string;
  roomState: RoomState;
  isOwner: boolean;
  onLeaveRoom: () => void;
  onGameAction: (action: string, targetId?: string) => void;
}

const cardDetails = {
    'Duke': { description: 'Take 3 coins from Treasury. Block Foreign Aid.', color: 'bg-purple-600' },
    'Assassin': { description: 'Pay 3 coins to assassinate an opponent.', color: 'bg-gray-800' },
    'Contessa': { description: 'Block assassination attempt.', color: 'bg-red-600' },
    'Captain': { description: 'Steal 2 coins from an opponent. Block stealing.', color: 'bg-blue-600' },
    'Ambassador': { description: 'Exchange cards with deck. Block stealing.', color: 'bg-green-600' },
};

export default function CoupPage({ socket, roomCode, roomState, isOwner, onLeaveRoom, onGameAction }: CoupPageProps) {
    const gameState = roomState.coupGame;
    const { users } = roomState;
    const me = gameState.players.find(p => p.id === socket.id);
    const otherPlayers = gameState.players.filter(p => p.id !== socket.id);
    const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayerId);

    const isMyTurn = me?.id === gameState.currentPlayerId;

    const renderInfluence = (player: Player) => {
        return player.influence.map((influence, index) => (
            <Card 
                key={index} 
                className={`w-20 h-28 flex flex-col items-center justify-center text-white transition-all ${influence.isRevealed ? cardDetails[influence.card].color : 'bg-gray-500'} ${influence.isRevealed ? 'opacity-50' : ''}`}
            >
                {influence.isRevealed || player.id === me?.id ? (
                    <>
                        <VenetianMask className="w-8 h-8 mb-1" />
                        <span className="text-xs font-bold text-center">{influence.card}</span>
                    </>
                ) : (
                    <span className="text-lg font-bold">?</span>
                )}
            </Card>
        ));
    };

    const renderPlayer = (player: Player, isMe: boolean) => (
        <div key={player.id} className={`p-4 rounded-lg flex flex-col gap-2 relative ${isMyTurn && player.id === me?.id ? 'ring-2 ring-primary' : ''} ${player.isEliminated ? 'opacity-40' : ''}`}>
             {player.id === gameState.currentPlayerId && <Crown className="absolute top-2 right-2 w-5 h-5 text-amber-400" />}
            <div className="flex items-center gap-2">
                <User className="w-5 h-5" />
                <span className="font-bold">{player.nickname} {isMe ? '(You)' : ''}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
                <DollarSign className="w-4 h-4 text-yellow-500" />
                <span>{player.coins} Coins</span>
            </div>
            <div className="flex gap-2 mt-2">
                {renderInfluence(player)}
            </div>
             {player.isEliminated && <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><span className="text-white font-bold text-lg rotate-12">ELIMINATED</span></div>}
        </div>
    );

    const canTakeAction = isMyTurn && gameState.phase === 'turn';

    const getTargetablePlayers = () => {
        return gameState.players.filter(p => p.id !== socket.id && !p.isEliminated);
    };

    const handleActionWithTarget = (action: string) => {
        const targets = getTargetablePlayers();
        if (targets.length === 1) {
            onGameAction(action, targets[0].id);
        } else {
            // Here you would open a dialog to select a target.
            // For now, we can just alert or log.
            alert(`Please select a target for ${action}.`);
        }
    }

    return (
        <div className="flex flex-col h-screen bg-background text-foreground p-4 gap-4">
            <header className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <h1 className="text-2xl font-bold text-primary">Coup</h1>
                    <p className="text-sm text-muted-foreground">Room: <span className="font-mono">{roomCode}</span></p>
                </div>
                <Button onClick={onLeaveRoom} variant="outline" size="sm"><LogOut className="mr-2"/> Leave</Button>
            </header>
            
            <main className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1 overflow-hidden">
                {/* Players */}
                <div className="md:col-span-2 flex flex-col gap-4 overflow-y-auto">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><Users /> Opponents</CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                           {otherPlayers.map(p => renderPlayer(p, false))}
                        </CardContent>
                    </Card>

                    {/* My Hand */}
                    <div className="mt-auto">
                        <h3 className="font-bold text-lg mb-2">My Hand</h3>
                        {me && renderPlayer(me, true)}
                    </div>
                </div>

                {/* Game Info & Actions */}
                <div className="flex flex-col gap-4">
                   <Card>
                       <CardHeader><CardTitle>Game State</CardTitle></CardHeader>
                       <CardContent className="space-y-2">
                          <p>Turn: <span className="font-bold text-primary">{currentPlayer?.nickname ?? 'N/A'}</span></p>
                          <p>Phase: <span className="font-bold text-primary">{gameState.phase}</span></p>
                          <p>Treasury: <span className="font-bold text-yellow-400">{gameState.treasury} coins</span></p>
                          {gameState.winner && <p className="font-bold text-2xl text-green-500">{gameState.winner} wins!</p>}
                       </CardContent>
                   </Card>

                   <Card>
                       <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
                       <CardContent className="grid grid-cols-2 gap-2">
                           <Button onClick={() => onGameAction('income')} disabled={!canTakeAction}>Income (+1 coin)</Button>
                           <Button onClick={() => onGameAction('foreign_aid')} disabled={!canTakeAction}>Foreign Aid (+2 coins)</Button>
                           <Button onClick={() => onGameAction('tax')} disabled={!canTakeAction}>Tax (Duke, +3 coins)</Button>
                           <Button onClick={() => handleActionWithTarget('coup')} disabled={!canTakeAction || (me?.coins ?? 0) < 7}>Coup (Cost 7)</Button>
                           <Button onClick={() => handleActionWithTarget('steal')} disabled={!canTakeAction}>Steal (Captain)</Button>
                           <Button onClick={() => handleActionWithTarget('assassinate')} disabled={!canTakeAction || (me?.coins ?? 0) < 3}>Assassinate (Cost 3)</Button>
                           <Button onClick={() => onGameAction('exchange')} disabled={!canTakeAction}>Exchange (Ambassador)</Button>
                       </CardContent>
                   </Card>

                    <Card className="flex-1">
                        <CardHeader><CardTitle>Game Log</CardTitle></CardHeader>
                        <CardContent>
                            <ScrollArea className="h-48">
                                <ul className="space-y-2 text-sm">
                                    {gameState.log.map(entry => <li key={entry.id}>{entry.message}</li>)}
                                </ul>
                            </ScrollArea>
                        </CardContent>
                    </Card>
                </div>
            </main>
        </div>
    );
}
