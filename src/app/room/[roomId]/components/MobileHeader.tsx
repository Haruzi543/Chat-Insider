"use client";

import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';

interface MobileHeaderProps {
  roomCode: string;
  onLeave: () => void;
}

export default function MobileHeader({ roomCode, onLeave }: MobileHeaderProps) {
  return (
    <header className="p-4 border-b border-border md:hidden flex justify-between items-center bg-background/80 backdrop-blur-sm sticky top-0 z-10">
      <h2 className="text-xl font-bold text-primary">{roomCode}</h2>
      <Button onClick={onLeave} variant="ghost" size="icon">
        <LogOut />
      </Button>
    </header>
  );
}
