
"use client";

import { useState, useMemo } from 'react';
import type { Socket } from 'socket.io-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { User, Shield, Swords, DollarSign, Crown, Users, LogOut, VenetianMask, HelpCircle, Pause, Play, Gamepad2, Info } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"


import type { CoupRoomState, CoupGameState, Player } from './types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useSound } from '@/hooks/useSound';

interface CoupPageProps {
  socket: Socket;
  roomCode: string;
  roomState: { coupGame: CoupGameState } & Omit<CoupRoomState, 'coupGame'>;
  isOwner: boolean;
  onLeaveRoom: () => void;
  onEndGame: () => void;
  onGameAction: (action: string, targetId?: string, extra?: any) => void;
  onPause: () => void;
  onResume: () => void;
}

const cardDetails = {
    'Duke': { description: 'Take 3 coins (Tax). Block Foreign Aid.', color: 'bg-purple-600' },
    'Assassin': { description: 'Pay 3 coins to assassinate an opponent.', color: 'bg-gray-800' },
    'Contessa': { description: 'Block assassination attempt.', color: 'bg-red-600' },
    'Captain': { description: 'Steal 2 coins. Block stealing.', color: 'bg-blue-600' },
    'Ambassador': { description: 'Exchange cards with deck. Block stealing.', color: 'bg-green-600' },
};

export default function CoupPage({ socket, roomState, isOwner, onLeaveRoom, onEndGame, onGameAction, onPause, onResume }: CoupPageProps) {
    const gameState = roomState.coupGame;
    const me = gameState.players.find(p => p.id === socket.id);
    const otherPlayers = gameState.players.filter(p => p.id !== socket.id);
    const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayerId);
    
    const [targetSelection, setTargetSelection] = useState<{action: string, required: number} | null>(null);
    const [revealSelection, setRevealSelection] = useState<string | null>(null);
    const [exchangeSelection, setExchangeSelection] = useState<string[]>([]);
    const { playClick, playCardFlip } = useSound();

    const isMyTurn = me?.id === gameState.currentPlayerId;
    const mustCoup = (me?.coins ?? 0) >= 10;
    
    const targetablePlayers = useMemo(() => {
        return gameState.players.filter(p => p.id !== socket.id && !p.isEliminated);
    }, [gameState.players, socket.id]);

    const renderInfluence = (player: Player) => {
        return player.influence.map((influence, index) => (
            <div key={index} className="[perspective:1000px]">
                <Card 
                    onClick={() => {if(influence.isRevealed) playCardFlip()}}
                    className={cn(
                        "w-20 h-28 flex flex-col items-center justify-center text-white transition-transform duration-700 [transform-style:preserve-3d]",
                        influence.isRevealed ? '[transform:rotateY(180deg)]' : '',
                    )}
                >
                    <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center bg-zinc-600 [backface-visibility:hidden]">
                         <span className="text-lg font-bold text-zinc-300">?</span>
                    </div>
                    <div className={cn(
                        "absolute inset-0 w-full h-full flex flex-col items-center justify-center text-white [transform:rotateY(180deg)] [backface-visibility:hidden]",
                        cardDetails[influence.card]?.color || 'bg-gray-500'
                    )}>
                        {player.id === me?.id || influence.isRevealed ? (
                             <>
                                <VenetianMask className="w-8 h-8 mb-1" />
                                <span className="text-xs font-bold text-center">{influence.card}</span>
                            </>
                        ) : null}
                    </div>
                </Card>
            </div>
        ));
    };

    const renderPlayer = (player: Player, isMe: boolean) => (
        <div key={player.id} className={`p-3 rounded-lg flex flex-col gap-2 relative border bg-card animate-fade-in ${isMyTurn && player.id === me?.id ? 'border-primary shadow-lg' : 'border-border'} ${player.isEliminated ? 'opacity-40' : ''}`}>
             {player.id === gameState.currentPlayerId && <Crown className="absolute top-2 right-2 w-5 h-5 text-amber-400" />}
            <div className="flex items-center gap-2">
                <User className="w-5 h-5" />
                <span className="font-bold">{player.nickname} {isMe ? '(You)' : ''}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
                <DollarSign className="w-4 h-4 text-yellow-500" />
                <span>{player.coins} Coins</span>
            </div>
            <div className="flex gap-2 mt-1">
                {renderInfluence(player)}
            </div>
             {player.isEliminated && <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg"><span className="text-white font-bold text-lg rotate-12">ELIMINATED</span></div>}
        </div>
    );
    
    const handleActionWithTarget = (action: string, required: number) => {
        playClick();
        const targets = targetablePlayers;
        if (targets.length < required) {
            return;
        }
        if (targets.length === 1 && required === 1) {
            onGameAction(action, targets[0].id);
        } else {
            setTargetSelection({ action, required });
        }
    };
    
    const handleGenericAction = (action: string) => {
        playClick();
        onGameAction(action);
    };

    const renderActionResponseDialog = () => {
        if (!gameState.action || gameState.phase !== 'action-response' || !me) return null;

        const { action } = gameState;
        const actor = gameState.players.find(p => p.id === action.playerId);
        const target = action.targetId ? gameState.players.find(p => p.id === action.targetId) : null;
        if (!actor) return null;

        const isMyAction = actor.id === me.id;
        const amITarget = target?.id === me.id;
        const haveIResponded = gameState.respondedPlayerIds?.includes(me.id);
        
        let description = `${actor.nickname} is attempting to use ${action.type}`;
        if (action.claimedCard) description += ` (claiming ${action.claimedCard})`;
        if (target) description += ` on ${target.nickname}`;
        description += ".";

        const canChallenge = !isMyAction && action.isChallengeable;
        const canBlock = amITarget && action.isBlockable;
        const blockCards = action.isBlockable ? action.blockableBy : [];
        
        const myTurnToRespond = !isMyAction && !haveIResponded;

        return (
            <AlertDialog open={true}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Action In Progress</AlertDialogTitle>
                        <AlertDialogDescription>{description}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="flex-row sm:flex-row justify-end gap-2">
                        {isMyAction && <p className="text-sm text-muted-foreground">Waiting for other players to respond...</p>}
                        {myTurnToRespond ? (
                             <>
                                {canChallenge && <Button variant="outline" onClick={() => handleGenericAction('challenge')}>Challenge</Button>}
                                {canBlock && blockCards?.map(card => <Button key={card} variant="secondary" onClick={() => {playClick(); onGameAction('block', undefined, { card })}}>Block with {card}</Button>)}
                                <Button onClick={() => handleGenericAction('pass')}>Pass</Button>
                            </>
                        ) : (!isMyAction && haveIResponded) ? (
                            <p className="text-sm text-muted-foreground">You have passed. Waiting for others...</p>
                        ) : null}
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        );
    };

    const renderBlockResponseDialog = () => {
        if (!gameState.action || gameState.phase !== 'block-response' || !me) return null;
        
        const blocker = gameState.players.find(p => p.id === gameState.blockerId);
        const actor = gameState.players.find(p => p.id === gameState.action.playerId);
        if (!blocker || !actor) return null;

        const amIActor = actor.id === me.id;
        const haveIResponded = gameState.respondedPlayerIds?.includes(me.id);
        
        return (
            <AlertDialog open={true}>
                 <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Action Blocked!</AlertDialogTitle>
                        <AlertDialogDescription>{blocker.nickname} is claiming {gameState.action.blockClaimedCard} to block the action.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="flex-row sm:flex-row justify-end gap-2">
                         {amIActor && !haveIResponded ? (
                            <>
                                <Button variant="destructive" onClick={() => handleGenericAction('challenge')}>Challenge Block</Button>
                                <Button onClick={() => handleGenericAction('pass')}>Accept Block</Button>
                            </>
                         ) : (
                            <p className="text-sm text-muted-foreground">Waiting for {actor.nickname} to respond...</p>
                         )}
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        )
    };
    
    const renderRevealDialog = () => {
        if (!gameState.revealChoice.playerId || gameState.phase !== 'reveal') return null;
        const amIRevealing = gameState.revealChoice.playerId === me?.id;
        if (!amIRevealing || !me) return null;

        const availableInfluence = me.influence.filter(inf => !inf.isRevealed);

        return (
            <AlertDialog open={true}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>You Must Lose an Influence!</AlertDialogTitle>
                        <AlertDialogDescription>Reason: {gameState.revealChoice.reason}. Choose one card to reveal.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="flex justify-center gap-4 my-4">
                        {availableInfluence.map(inf => (
                             <Button key={inf.card} variant={revealSelection === inf.card ? 'default' : 'outline'} onClick={() => {playClick(); setRevealSelection(inf.card)}}>Reveal {inf.card}</Button>
                        ))}
                    </div>
                    <AlertDialogFooter>
                         <Button disabled={!revealSelection} onClick={() => {playCardFlip(); onGameAction('reveal', undefined, { card: revealSelection }); setRevealSelection(null);}}>Confirm Reveal</Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        )
    };
    
    const renderExchangeDialog = () => {
        if (!gameState.exchangeInfo || gameState.phase !== 'exchange') return null;
        const amIExchanging = gameState.exchangeInfo.playerId === me?.id;
        if (!amIExchanging) return null;

        const myInfluenceCount = me?.influence.filter(i => !i.isRevealed).length ?? 0;
        const cards = gameState.exchangeInfo.cards;

        return (
            <AlertDialog open={true}>
                <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>Exchange Influence</AlertDialogTitle></AlertDialogHeader>
                    <AlertDialogDescription>Choose {myInfluenceCount} card(s) to keep.</AlertDialogDescription>
                    <div className="space-y-2">
                        {cards.map((card, idx) => (
                             <div key={idx} className="flex items-center space-x-2">
                                <Checkbox 
                                    id={`card-${idx}`}
                                    checked={exchangeSelection.includes(card)}
                                    onCheckedChange={(checked) => {
                                        playClick();
                                        setExchangeSelection(prev => {
                                          if (checked) {
                                            if (prev.length < myInfluenceCount) {
                                                return [...prev, card];
                                            }
                                            return prev;
                                          } else {
                                            return prev.filter(c => c !== card);
                                          }
                                        });
                                    }}
                                />
                                <Label htmlFor={`card-${idx}`}>{card}</Label>
                            </div>
                        ))}
                    </div>
                    <AlertDialogFooter>
                        <Button
                            disabled={exchangeSelection.length !== myInfluenceCount}
                            onClick={() => { playClick(); onGameAction('exchange-response', undefined, { cards: exchangeSelection }); setExchangeSelection([]) }}
                        >Confirm Exchange</Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        );
    };

    const GameActionsPanel = () => (
        <>
            <Card>
                <CardHeader className="p-4">
                    <CardTitle className="text-lg">Game State</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 p-4 pt-0">
                    <p>Turn: <span className="font-bold text-primary">{currentPlayer?.nickname ?? 'N/A'}</span></p>
                    <p>Phase: <span className="font-bold capitalize">{gameState.phase.replace('-', ' ')}</span></p>
                    <p>Treasury: <span className="font-bold text-yellow-400">{gameState.treasury} coins</span></p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="p-4">
                    <CardTitle className="text-lg">Actions</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-2 p-4 pt-0">
                    <Button onClick={() => handleGenericAction('income')} disabled={!isMyTurn || gameState.phase !== 'turn' || mustCoup}>Income (+1)</Button>
                    <Button onClick={() => handleGenericAction('foreign_aid')} disabled={!isMyTurn || gameState.phase !== 'turn' || mustCoup}>Foreign Aid (+2)</Button>
                    <Button onClick={() => handleActionWithTarget('coup', 1)} disabled={!isMyTurn || gameState.phase !== 'turn' || (me?.coins ?? 0) < 7}>Coup (Cost 7)</Button>
                    <Button onClick={() => handleGenericAction('tax')} disabled={!isMyTurn || gameState.phase !== 'turn' || mustCoup}>Tax (Duke)</Button>
                    <Button onClick={() => handleActionWithTarget('assassinate', 1)} disabled={!isMyTurn || gameState.phase !== 'turn' || mustCoup || (me?.coins ?? 0) < 3}>Assassinate (Cost 3)</Button>
                    <Button onClick={() => handleActionWithTarget('steal', 1)} disabled={!isMyTurn || gameState.phase !== 'turn' || mustCoup}>Steal (Captain)</Button>
                    <Button onClick={() => handleGenericAction('exchange')} disabled={!isMyTurn || gameState.phase !== 'turn' || mustCoup}>Exchange (Amb.)</Button>
                    {mustCoup && <p className="col-span-2 text-center text-destructive text-sm">You must Coup (10+ coins)</p>}
                </CardContent>
            </Card>

            <Card className="flex-1">
                <CardHeader className="p-4">
                    <CardTitle className="text-lg">Game Log</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                    <ScrollArea className="h-48 md:h-64">
                        <ul className="space-y-2 text-sm pr-2">
                            {gameState.log.map(entry => <li key={entry.id}>{entry.message}</li>)}
                        </ul>
                    </ScrollArea>
                </CardContent>
            </Card>
        </>
    );

    return (
        <div className="flex flex-col h-screen bg-zinc-900 text-foreground">
            <header className="flex justify-between items-center p-4 border-b border-border">
                <div className="flex items-center gap-4">
                    <h1 className="text-2xl font-bold text-primary">Coup</h1>
                </div>
                 <div className="flex items-center gap-2">
                    {isOwner && (
                        <>
                        {gameState.paused ? (
                            <Button onClick={() => {playClick(); onResume()}} variant="outline" size="sm"><Play className="mr-2"/> Resume</Button>
                        ) : (
                            <Button onClick={() => {playClick(); onPause()}} variant="outline" size="sm" disabled={gameState.phase === 'game-over'}><Pause className="mr-2"/> Pause</Button>
                        )}
                        </>
                    )}
                    <Button onClick={() => {playClick(); onLeaveRoom()}} variant="outline" size="sm"><LogOut className="mr-2"/> Leave</Button>
                </div>
            </header>
            
            <main className="flex-1 overflow-hidden">
                {gameState.paused && (
                    <div className="absolute inset-0 bg-black/70 z-20 flex flex-col items-center justify-center gap-4">
                        <Pause className="w-16 h-16 text-white"/>
                        <h2 className="text-3xl font-bold text-white">Game Paused</h2>
                        {isOwner && <Button onClick={() => {playClick(); onResume()}}><Play className="mr-2"/>Resume Game</Button>}
                    </div>
                )}
                 {gameState.phase === 'game-over' && gameState.winner && (
                    <div className="absolute inset-0 bg-black/80 z-20 flex flex-col items-center justify-center gap-4 rounded-lg">
                        <Crown className="w-24 h-24 text-amber-400 animate-bounce"/>
                        <h2 className="text-4xl font-bold text-white">Game Over!</h2>
                        <p className="text-2xl text-white">{gameState.winner} is the winner!</p>
                        {isOwner && <Button onClick={() => {playClick(); onEndGame()}} className="mt-4">Play Again</Button>}
                    </div>
                )}

                <Tabs defaultValue="board" className="w-full h-full flex flex-col md:hidden">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="board">Board</TabsTrigger>
                        <TabsTrigger value="actions">Log & Actions</TabsTrigger>
                    </TabsList>
                    <TabsContent value="board" className="flex-1 overflow-y-auto p-4 space-y-4">
                        <Card>
                            <CardHeader className="p-4">
                                <CardTitle className="flex items-center gap-2"><Users /> Opponents</CardTitle>
                            </CardHeader>
                            <CardContent className="grid grid-cols-1 gap-4 p-4 pt-0">
                               {otherPlayers.map(p => renderPlayer(p, false))}
                            </CardContent>
                        </Card>
                        {me && renderPlayer(me, true)}
                    </TabsContent>
                    <TabsContent value="actions" className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
                       <GameActionsPanel/>
                    </TabsContent>
                </Tabs>
                
                <div className="hidden md:grid md:grid-cols-3 gap-4 h-full p-4">
                    <div className="md:col-span-2 flex flex-col gap-4 overflow-y-auto pr-2">
                        <Card>
                            <CardHeader className="p-4">
                                <CardTitle className="flex items-center gap-2"><Users /> Opponents</CardTitle>
                            </CardHeader>
                            <CardContent className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 pt-0">
                               {otherPlayers.map(p => renderPlayer(p, false))}
                            </CardContent>
                        </Card>
                        {me && <div className="mt-auto sticky bottom-0 bg-zinc-900 py-2">{renderPlayer(me, true)}</div>}
                    </div>

                    <div className="flex flex-col gap-4 overflow-y-auto">
                        <GameActionsPanel/>
                    </div>
                </div>
            </main>

            {renderActionResponseDialog()}
            {renderBlockResponseDialog()}
            {renderRevealDialog()}
            {renderExchangeDialog()}

            <AlertDialog open={!!targetSelection} onOpenChange={() => setTargetSelection(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Select a Target for {targetSelection?.action.replace('_', ' ')}</AlertDialogTitle>
                    </AlertDialogHeader>
                    <div className="flex flex-col gap-2">
                        {targetablePlayers.map(p => (
                             <Button key={p.id} variant="outline" onClick={() => {playClick(); onGameAction(targetSelection!.action, p.id); setTargetSelection(null);}}>{p.nickname}</Button>
                        ))}
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={playClick}>Cancel</AlertDialogCancel>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
