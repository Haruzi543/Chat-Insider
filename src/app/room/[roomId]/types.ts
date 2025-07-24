
import type { GameState as InsiderGameState, Message as InsiderMessage, User } from './insider/types';
import type { GameState as CoupGameState } from './coup/types';

export type GameType = 'insider' | 'coup' | 'none';

export interface RoomState {
  id: string;
  owner: User;
  users: User[];
  messages: InsiderMessage[];
  activeGame: GameType;
  insiderGame: InsiderGameState;
  coupGame: CoupGameState;
}
