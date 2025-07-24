"use client";

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Crown, Users, User as UserIcon } from 'lucide-react';
import type { User } from '../types';

interface UserListPanelProps {
  roomCode: string;
  users: User[];
  ownerId: string;
  myId: string;
}

export default function UserListPanel({ roomCode, users, ownerId, myId }: UserListPanelProps) {
  return (
    <div>
      <h2 className="text-xl font-bold mb-1">Chat Insider</h2>
      <p className="text-sm text-muted-foreground mb-4">Room Code: <span className="font-mono text-primary">{roomCode}</span></p>

      <Card>
        <CardHeader className="p-4">
          <CardTitle className="text-lg flex items-center gap-2"><Users /> Participants ({users.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <ScrollArea className="h-40">
            <ul className="space-y-1">
              {users.map(user => (
                <li key={user.id} className="flex items-center gap-2 p-2 rounded-md hover:bg-accent/50">
                  <UserIcon className="w-4 h-4" />
                  <span className="font-medium truncate">{user.nickname}</span>
                  {user.id === ownerId && <Crown className="w-4 h-4 text-amber-500 shrink-0" />}
                  {user.id === myId && <span className="text-xs text-muted-foreground ml-auto shrink-0">(You)</span>}
                </li>
              ))}
            </ul>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
