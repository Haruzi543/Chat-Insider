
"use client";

import { useState, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send } from 'lucide-react';
import type { GameState, Message, Player } from '../types';

interface ChatPanelProps {
  messages: Message[];
  myId: string;
  myRole: Player['role'];
  gameState: GameState;
  onSendMessage: (message: string) => void;
  onSendAnswer: (questionId: string, answer: string) => void;
}

export default function ChatPanel({ messages, myId, myRole, gameState, onSendMessage, onSendAnswer }: ChatPanelProps) {
  const [message, setMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    onSendMessage(message);
    setMessage('');
  };

  const handleAnswer = (questionId: string, answer: string) => {
    onSendAnswer(questionId, answer);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const canBeAnswered = (msg: Message) => {
    const questioner = gameState.players?.find(p => p.id === msg.user.id);
    return gameState.isActive && 
           gameState.phase === 'questioning' &&
           (questioner?.role === 'Common' || questioner?.role === 'Insider') &&
           !messages.some(m => m.questionId === msg.id); // Check if already answered
  };
  
  return (
    <>
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.map(msg => (
            <div key={msg.id}>
              {msg.type === 'system' ? (
                <div className="text-center w-full my-2">
                  <p className="text-xs text-muted-foreground bg-accent/10 px-2 py-1 rounded-full inline-block">{msg.text}</p>
                </div>
              ) : (
                <div className={`flex flex-col gap-1 ${msg.user.id === myId ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-xs lg:max-w-md p-3 rounded-lg ${msg.user.id === myId ? 'bg-primary text-primary-foreground' : 'bg-card border'}`}>
                    <div className="flex items-center gap-2 text-xs mb-1 opacity-80">
                      <span>{msg.user.nickname}</span>
                      <span>{format(new Date(msg.timestamp), 'p')}</span>
                    </div>
                    <p className={`text-sm break-words ${msg.type === 'game' ? 'italic text-accent-foreground/90' : ''}`}>{msg.text}</p>
                    {myRole === 'Master' && canBeAnswered(msg) && (
                      <div className="flex gap-2 mt-2">
                        <Button size="sm" variant="outline" onClick={() => handleAnswer(msg.id, 'Yes')}>Yes</Button>
                        <Button size="sm" variant="outline" onClick={() => handleAnswer(msg.id, 'No')}>No</Button>
                        <Button size="sm" variant="outline" onClick={() => handleAnswer(msg.id, 'I don\'t know')}>DK</Button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>
      <div className="p-4 border-t border-border bg-background/80 backdrop-blur-sm">
        <form onSubmit={handleSendMessage} className="flex gap-2">
          <Input value={message} onChange={e => setMessage(e.target.value)} placeholder="Type a message or question..." maxLength={200} autoComplete="off" />
          <Button type="submit" size="icon" disabled={!message.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </>
  );
}
