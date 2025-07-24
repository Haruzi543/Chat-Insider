
export interface User {
  id: string;
  nickname: string;
}

export interface Message {
  id: string;
  user: User;
  text: string;
  timestamp: string;
  type: 'user' | 'system' | 'game' | 'answer';
  questionId?: string; // The ID of the message being answered
}

export type PlayerRole = 'Master' | 'Insider' | 'Common';

export interface Player extends User {
  role: PlayerRole | null;
}

export type InsiderGamePhase = 'setup' | 'questioning' | 'voting' | 'results' | 'paused';

export interface InsiderGameState {
  isActive: boolean;
  phase: InsiderGamePhase;
  targetWord?: string;
  players?: Player[];
  timer?: number;
  votes?: Record<string, string>; // voterId -> votedForNickname
  results?: {
    insider: string;
    wasInsiderFound: boolean;
    wasWordGuessed: boolean;
  };
  paused: boolean;
  pausedState: InsiderGamePhase | null;
  pauseStartTime: number;
  totalPausedTime: number;
}

export interface InsiderRoomState {
  id: string;
  owner: User;
  users: User[];
  messages: Message[];
  activeGame: 'insider';
  insiderGame: InsiderGameState;
  coupGame: any; // Placeholder
}
