
"use client";

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Gamepad2, Eye } from 'lucide-react';
import type { InsiderGameState, User, Player } from '../insider/types';

interface GamePanelProps {
  gameState: InsiderGameState;
  isOwner: boolean;
  users: User[];
  myId: string;
  myRole: Player['role'];
  onStartGame: (targetWord: string) => void;
  onSubmitVote: (voteForNickname: string) => void;
}

export default function GamePanel({ gameState, isOwner, users, myId, myRole, onStartGame, onSubmitVote }: GamePanelProps) {
  const [targetWord, setTargetWord] = useState('');
  const [gameTimer, setGameTimer] = useState(0);

  useEffect(() => {
    if (gameState.isActive && !gameState.paused && gameState.timer && gameState.timer > 0) {
      // Calculate remaining time considering pauses
      const startTime = Date.now();
      const initialRemainingTime = (gameState.timer * 1000) - (gameState.totalPausedTime || 0);

      const updateTimer = () => {
          const elapsed = Date.now() - startTime;
          const remaining = Math.max(0, initialRemainingTime - elapsed);
          setGameTimer(Math.ceil(remaining / 1000));
      };
      
      updateTimer();
      const interval = setInterval(updateTimer, 1000);
      return () => clearInterval(interval);
    } else if (gameState.paused && gameState.timer) {
       const remaining = (gameState.timer * 1000) - (gameState.totalPausedTime || 0);
       setGameTimer(Math.ceil(remaining/1000));
    }
  }, [gameState.isActive, gameState.timer, gameState.phase, gameState.paused, gameState.totalPausedTime]);

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
  };

  const handleStartGame = () => {
    onStartGame(targetWord);
  };
  
  const myVote = gameState.isActive && gameState.votes ? gameState.votes[myId] : undefined;
  
  return (
    <Card className="flex-grow flex flex-col">
      <CardHeader className="p-4">
        <CardTitle className="text-lg flex items-center gap-2"><Gamepad2 /> Insider Game</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-4 flex-grow flex flex-col">
        {!gameState.isActive ? (
          <>
            <p className="text-sm text-muted-foreground">The game has not started yet.</p>
            {isOwner && (
              <div className="space-y-2 mt-auto">
                <Input placeholder="Enter target word" value={targetWord} onChange={e => setTargetWord(e.target.value)} maxLength={50} />
                <Button onClick={handleStartGame} className="w-full" disabled={users.length < 4}>
                  Start Game
                </Button>
                {users.length < 4 && <p className="text-xs text-destructive text-center">Need at least 4 players to start.</p>}
              </div>
            )}
          </>
        ) : (
          <div className="space-y-3 text-center">
            <h3 className="font-semibold text-primary">{gameState.phase.charAt(0).toUpperCase() + gameState.phase.slice(1)} Phase</h3>

            {(myRole === 'Insider' || myRole === 'Master') && gameState.targetWord && (
              <div className="p-2 bg-accent/20 rounded-lg text-sm">
                <p className="flex items-center justify-center gap-2"><Eye className="w-4 h-4" /> The word is: <span className="font-bold">{gameState.targetWord}</span></p>
              </div>
            )}

            {(gameState.phase === 'questioning' || gameState.phase === 'voting') && gameState.timer !== undefined && (
              <div className="text-4xl font-bold font-mono">{formatTime(gameTimer)}</div>
            )}
            {gameState.phase === 'questioning' && <p className="text-xs text-muted-foreground">Ask 'Yes' or 'No' questions to find the word.</p>}
            
            {gameState.phase === 'voting' && !myVote && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Vote for the Insider.</p>
                <div className="grid grid-cols-2 gap-2">
                  {gameState.players?.filter(p => p.id !== myId).map(player => (
                    <Button key={player.id} variant="outline" size="sm" onClick={() => onSubmitVote(player.nickname)}>
                      {player.nickname}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {gameState.phase === 'voting' && myVote && <p className="text-sm text-green-500">You have voted. Waiting for others...</p>}
            
            {gameState.phase === 'results' && gameState.results && (
              <div className="p-3 bg-accent/20 rounded-lg">
                <p className="font-bold">{gameState.results.wasWordGuessed && !gameState.results.wasInsiderFound ? "Insider Wins!" : "Commons & Master Win!"}</p>
                <p className="text-sm">The Insider was: <span className="font-bold text-primary">{gameState.results.insider}</span></p>
                {!gameState.results.wasWordGuessed && <p className="text-sm">The word <span className="font-bold text-primary">"{gameState.targetWord}"</span> was not guessed.</p>}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
