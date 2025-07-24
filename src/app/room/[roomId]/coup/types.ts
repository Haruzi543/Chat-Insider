
export type CardName = 'Duke' | 'Assassin' | 'Contessa' | 'Captain' | 'Ambassador';

export interface Player {
    id: string;
    nickname: string;
    coins: number;
    influence: { card: CardName, isRevealed: boolean }[];
    isEliminated: boolean;
}

export type GamePhase = 'waiting' | 'turn' | 'challenge' | 'block' | 'reveal' | 'exchange' | 'game-over';

export interface Action {
    type: string;
    playerId: string;
    targetId?: string;
}

export interface GameState {
    phase: GamePhase;
    players: Player[];
    deck: CardName[];
    treasury: number;
    currentPlayerId: string | null;
    action: Action | null;
    challenge?: {
        challengerId: string;
        isSuccessful: boolean | null;
    };
    block?: {
        blockerId: string;
        blockedWith: CardName;
    };
    winner: string | null;
    log: { id: string, message: string }[];
}

export interface RoomState {
  id: string;
  owner: { id: string; nickname: string };
  users: { id: string; nickname: string }[];
  gameType: 'coup';
  gameState: GameState;
}
