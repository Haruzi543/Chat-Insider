
import type { User } from '../insider/types';

export type CardName = 'Duke' | 'Assassin' | 'Contessa' | 'Captain' | 'Ambassador';

export interface Player {
    id: string;
    nickname: string;
    coins: number;
    influence: { card: CardName, isRevealed: boolean }[];
    isEliminated: boolean;
}

export type GamePhase = 'waiting' | 'turn' | 'action-response' | 'block-response' | 'reveal' | 'exchange' | 'game-over';

export interface Action {
    type: string;
    playerId: string;
    targetId?: string;
    isChallengeable: boolean;
    isBlockable: boolean;
    claimedCard: CardName | null;
    blockClaimedCard: CardName | null;
    blockableBy: CardName[];
}

export interface CoupGameState {
    phase: GamePhase;
    players: Player[];
    deck: CardName[];
    treasury: number;
    currentPlayerId: string | null;
    action: Action | null;
    challengerId: string | null;
    blockerId: string | null;
    revealChoice: {
        playerId: string | null;
        reason: 'lost-challenge' | 'assassinated' | 'coup' | null;
    };
    exchangeInfo: {
        playerId: string;
        cards: CardName[];
    } | null;
    winner: string | null;
    log: { id: string, message: string }[];
}

export interface CoupRoomState {
  id: string;
  owner: User;
  users: User[];
  activeGame: 'coup';
  coupGame: CoupGameState;
  messages: any[]; // Assuming messages can be generic for now
  insiderGame: any; // Placeholder
}

    