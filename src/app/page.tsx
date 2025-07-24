
"use client";

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from 'lucide-react';

function HomePageContent() {
  const [nickname, setNickname] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  useEffect(() => {
    const roomFromQuery = searchParams.get('room');
    if (roomFromQuery) {
      setRoomCode(roomFromQuery);
    }
  }, [searchParams]);

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim()) {
      toast({ title: "Error", description: "Please enter a nickname.", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    const newRoomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    sessionStorage.setItem('nickname', nickname);
    router.push(`/room/${newRoomCode}`);
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim() || !roomCode.trim()) {
      toast({ title: "Error", description: "Please enter both a nickname and a room code.", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    sessionStorage.setItem('nickname', nickname);
    router.push(`/room/${roomCode.toUpperCase()}`);
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-4 animate-fade-in">
      <div className="w-full max-w-md animate-slide-in-from-bottom-2">
        <h1 className="text-4xl font-bold text-center mb-2 text-primary">Chat & Games</h1>
        <p className="text-center text-muted-foreground mb-8">Create or join a room to play.</p>
        <Tabs defaultValue="join" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="join">Join Room</TabsTrigger>
            <TabsTrigger value="create">Create Room</TabsTrigger>
          </TabsList>
          <TabsContent value="join">
            <Card>
              <CardHeader>
                <CardTitle>Join an Existing Room</CardTitle>
                <CardDescription>Enter a room code and your nickname to join the fun.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleJoinRoom} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="join-nickname">Nickname</Label>
                    <Input id="join-nickname" placeholder="Your display name" value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={20} required autoFocus={!!roomCode} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="room-code">Room Code</Label>
                    <Input id="room-code" placeholder="e.g., ABC123" value={roomCode} onChange={(e) => setRoomCode(e.target.value)} maxLength={6} required />
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? <Loader2 className="animate-spin" /> : "Join Room"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="create">
            <Card>
              <CardHeader>
                <CardTitle>Create a New Room</CardTitle>
                <CardDescription>Start a new room and invite your friends.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreateRoom} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="create-nickname">Nickname</Label>
                    <Input id="create-nickname" placeholder="Your display name" value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={20} required autoFocus={!roomCode} />
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? <Loader2 className="animate-spin" /> : "Create Room"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><Loader2 className="h-12 w-12 animate-spin" /></div>}>
      <HomePageContent />
    </Suspense>
  )
}
