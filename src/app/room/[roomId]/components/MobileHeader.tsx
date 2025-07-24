
"use client";

import { Button } from '@/components/ui/button';
import { LogOut, Pause, Play } from 'lucide-react';

interface MobileHeaderProps {
  roomCode: string;
  isOwner: boolean;
  isPaused: boolean;
  onLeave: () => void;
  onPause: () => void;
  onResume: () => void;
}

export default function MobileHeader({ roomCode, isOwner, isPaused, onLeave, onPause, onResume }: MobileHeaderProps) {
  return (
    <header className="p-4 border-b border-border md:hidden flex justify-between items-center bg-background/80 backdrop-blur-sm sticky top-0 z-10">
      <h2 className="text-xl font-bold text-primary">{roomCode}</h2>
      <div className="flex items-center gap-2">
         {isOwner && (
            <>
            {isPaused ? (
                <Button onClick={onResume} variant="ghost" size="icon">
                    <Play />
                </Button>
            ) : (
                 <Button onClick={onPause} variant="ghost" size="icon">
                    <Pause />
                </Button>
            )}
            </>
         )}
        <Button onClick={onLeave} variant="ghost" size="icon">
          <LogOut />
        </Button>
      </div>
    </header>
  );
}
