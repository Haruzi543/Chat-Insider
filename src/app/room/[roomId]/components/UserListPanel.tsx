
"use client";

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Crown, Users, User as UserIcon, Share2 } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { Button } from '@/components/ui/button';

interface User {
  id: string;
  nickname: string;
}

interface UserListPanelProps {
  roomCode: string;
  users: User[];
  ownerId: string;
  myId: string;
}

export default function UserListPanel({ roomCode, users, ownerId, myId }: UserListPanelProps) {
  const { toast } = useToast();

  const handleShare = () => {
    // Construct a URL with a query parameter
    const url = `${window.location.origin}/?room=${roomCode}`;
    navigator.clipboard.writeText(url).then(() => {
      toast({
        title: "Link Copied!",
        description: "Room invitation link has been copied to your clipboard.",
      });
    }, (err) => {
      toast({
        title: "Error",
        description: "Could not copy link to clipboard.",
        variant: "destructive",
      });
      console.error('Could not copy text: ', err);
    });
  };

  return (
    <div>
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold mb-1">Chat & Games</h2>
          <p className="text-sm text-muted-foreground mb-4">Room Code: <span className="font-mono text-primary">{roomCode}</span></p>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={handleShare} className="shrink-0">
                <Share2 className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Share Room Link</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

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

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
