
const { stat } = require("fs");

const ALL_CARDS = ['Duke', 'Assassin', 'Contessa', 'Captain', 'Ambassador'];
const DECK = ALL_CARDS.flatMap(card => Array(3).fill(card));

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

class CoupGame {
  constructor() {
    this.state = {
      phase: 'waiting', // waiting, turn, challenge, block, reveal, exchange, game-over
      players: [],
      deck: [],
      treasury: 50,
      currentPlayerId: null,
      action: null,
      challenge: null,
      block: null,
      winner: null,
      log: [],
    };
    this.nextLogId = 0;
  }

  addLog(message) {
      this.state.log.unshift({ id: this.nextLogId++, message });
      if (this.state.log.length > 50) {
          this.state.log.pop();
      }
  }

  getState() {
    return this.state;
  }

  getRoomState(room) {
      return {
          id: room.id,
          owner: room.owner,
          users: room.users,
          gameType: 'coup',
          gameState: this.getStateForPlayer() // Returns a generic state, not player specific
      }
  }

  getStateForPlayer(playerId) {
    // In a real game, you'd filter out hidden info for other players
    return this.state;
  }

  addPlayer(id, nickname) {
    if (this.state.phase !== 'waiting') return;
    if (this.state.players.find(p => p.id === id)) return;
    if (this.state.players.length >= 6) throw new Error("Room is full.");

    this.state.players.push({
      id,
      nickname,
      coins: 2,
      influence: [],
      isEliminated: false,
    });
    this.state.treasury -= 2;
    this.addLog(`${nickname} joined the game.`);
  }

  removePlayer(id) {
    const player = this.state.players.find(p => p.id === id);
    if (!player) return;

    player.isEliminated = true;
    this.addLog(`${player.nickname} was eliminated or left.`);
    
    // Return cards to deck
    player.influence.forEach(inf => {
        if (!inf.isRevealed) {
            this.state.deck.push(inf.card);
        }
    });
    shuffle(this.state.deck);
    
    // Check for winner
    this.checkForWinner();
  }


  startGame() {
    if (this.state.phase !== 'waiting') throw new Error("Game has already started.");
    if (this.state.players.length < 2) throw new Error("Need at least 2 players to start.");

    this.state.deck = shuffle([...DECK]);
    this.state.players.forEach(p => {
      p.influence = [
        { card: this.state.deck.pop(), isRevealed: false },
        { card: this.state.deck.pop(), isRevealed: false },
      ];
    });

    this.state.currentPlayerId = this.state.players[0].id;
    this.state.phase = 'turn';
    this.addLog("The game has started!");
    this.addLog(`It's ${this.state.players.find(p => p.id === this.state.currentPlayerId).nickname}'s turn.`);
  }
  
  handleAction(playerId, actionType, targetId) {
      if (this.state.phase === 'game-over') return;
      const player = this.state.players.find(p => p.id === playerId);
      if (!player) throw new Error("Player not found");
      
      this.addLog(`${player.nickname} attempts to use ${actionType}`);

      // For now, just process the action directly.
      // In a real implementation, you'd go into a 'challenge' or 'block' phase.
      switch(actionType) {
          case 'income':
              player.coins++;
              this.state.treasury--;
              this.addLog(`${player.nickname} takes Income, now has ${player.coins} coins.`);
              this.nextTurn();
              break;
          case 'foreign_aid':
              player.coins += 2;
              this.state.treasury -= 2;
              this.addLog(`${player.nickname} takes Foreign Aid, now has ${player.coins} coins.`);
              this.nextTurn();
              break;
          case 'tax': // Duke
              player.coins += 3;
              this.state.treasury -= 3;
              this.addLog(`${player.nickname} claims Duke and takes Tax, now has ${player.coins} coins.`);
              this.nextTurn();
              break;
          case 'coup':
              if (player.coins < 7) throw new Error("Not enough coins for a Coup.");
              player.coins -= 7;
              this.state.treasury += 7;
              // Simple coup logic: reveal first unrevealed card of target
              const targetPlayer = this.state.players.find(p => p.id === targetId);
              if (!targetPlayer) throw new Error("Target not found.");
              const influenceToReveal = targetPlayer.influence.find(i => !i.isRevealed);
              if (influenceToReveal) {
                  influenceToReveal.isRevealed = true;
                  this.addLog(`${player.nickname} performs a Coup on ${targetPlayer.nickname}, revealing a ${influenceToReveal.card}.`);
                  this.checkIfEliminated(targetPlayer);
              }
              this.nextTurn();
              break;
          // Add other actions like steal, assassinate, exchange later
          default:
              this.addLog(`Action ${actionType} is not fully implemented yet.`);
              this.nextTurn(); // Move turn for unimplemented actions
      }

      this.checkForWinner();
  }

  checkIfEliminated(player) {
      if (player.influence.every(i => i.isRevealed)) {
          player.isEliminated = true;
          this.addLog(`${player.nickname} has been eliminated from the game.`);
      }
  }

  checkForWinner() {
      const activePlayers = this.state.players.filter(p => !p.isEliminated);
      if (activePlayers.length === 1) {
          this.state.winner = activePlayers[0].nickname;
          this.state.phase = 'game-over';
          this.addLog(`${this.state.winner} is the winner!`);
      }
  }

  nextTurn() {
    if (this.state.phase === 'game-over') return;
    const currentIndex = this.state.players.findIndex(p => p.id === this.state.currentPlayerId);
    let nextIndex = (currentIndex + 1) % this.state.players.length;

    // Skip eliminated players
    while(this.state.players[nextIndex].isEliminated) {
        nextIndex = (nextIndex + 1) % this.state.players.length;
    }

    this.state.currentPlayerId = this.state.players[nextIndex].id;
    this.state.phase = 'turn';
    this.state.action = null;
    this.state.challenge = null;
    this.state.block = null;

    const nextPlayer = this.state.players.find(p => p.id === this.state.currentPlayerId);
    this.addLog(`It's now ${nextPlayer.nickname}'s turn.`);
  }
}

module.exports = { CoupGame };

