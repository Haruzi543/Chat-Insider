export interface User {
  id: string;
  nickname: string;
}

export interface Message {
  id: string;
  user: User;
  text: string;
  timestamp: string;
  type: 'user' | 'system' | 'game';
}

export type PlayerRole = 'Master' | 'Insider' | 'Common';

export interface Player extends User {
  role: PlayerRole | null;
}

export interface GameState {
  isActive: boolean;
  phase: 'setup' | 'questioning' | 'voting' | 'results';
  targetWord?: string;
  players?: Player[];
  timer?: number;
  votes?: Record<string, string>; // voterId -> votedForNickname
  results?: {
    insider: string;
    wasInsiderFound: boolean;
    wasWordGuessed: boolean;
  };
}

export interface RoomState {
  id: string;
  owner: User;
  users: User[];
  messages: Message[];
  gameState: GameState;
}
