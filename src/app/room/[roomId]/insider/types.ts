

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

export interface InsiderGameState {
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

export interface InsiderRoomState {
  id: string;
  owner: User;
  users: User[];
  messages: Message[];
  activeGame: 'insider';
  insiderGame: InsiderGameState;
  coupGame: any; // Placeholder
}

    