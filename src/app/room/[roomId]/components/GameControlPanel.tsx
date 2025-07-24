
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Gamepad, Play, StopCircle } from "lucide-react";
import type { GameType } from '../types';

interface GameControlPanelProps {
    activeGame: GameType;
    users: {id: string, nickname: string}[];
    onStartGame: (game: 'insider' | 'coup') => void;
    onEndGame: () => void;
}

export default function GameControlPanel({ activeGame, users, onStartGame, onEndGame }: GameControlPanelProps) {
    const insiderDisabled = users.length < 4;
    const coupDisabled = users.length < 2 || users.length > 6;

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><Gamepad /> Game Controls</CardTitle>
                <CardDescription>As the owner, you can start or stop games.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
                {activeGame === 'none' ? (
                    <>
                        <div>
                            <Button className="w-full justify-start" onClick={() => onStartGame('insider')} disabled={insiderDisabled}>
                                <Play className="mr-2" /> Start Insider
                            </Button>
                             {insiderDisabled && <p className="text-xs text-muted-foreground px-1 pt-1">Insider requires 4+ players.</p>}
                        </div>
                        <div>
                            <Button className="w-full justify-start" onClick={() => onStartGame('coup')} disabled={coupDisabled}>
                                <Play className="mr-2" /> Start Coup
                            </Button>
                            {coupDisabled && <p className="text-xs text-muted-foreground px-1 pt-1">Coup requires 2-6 players.</p>}
                        </div>
                    </>
                ) : (
                    <Button variant="destructive" className="w-full" onClick={onEndGame}>
                        <StopCircle className="mr-2" /> End {activeGame.charAt(0).toUpperCase() + activeGame.slice(1)} Game
                    </Button>
                )}
            </CardContent>
        </Card>
    );
}
