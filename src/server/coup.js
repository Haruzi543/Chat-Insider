
const ALL_CARDS = ['Duke', 'Assassin', 'Contessa', 'Captain', 'Ambassador'];
const DECK = ALL_CARDS.flatMap(card => Array(3).fill(card));

function shuffle(array) {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

class CoupGame {
  constructor() {
    this.state = this.getInitialState();
    this.nextLogId = 0;
  }

  getInitialState() {
      return {
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
      }
  }

  reset() {
      this.state = this.getInitialState();
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

  addPlayer(id, nickname) {
    if (this.state.phase !== 'waiting') return;
    if (this.state.players.find(p => p.id === id)) return;
    if (this.state.players.length >= 6) return;

    this.state.players.push({
      id,
      nickname,
      coins: 2,
      influence: [],
      isEliminated: false,
    });
    this.state.treasury -= 2;
    this.addLog(`${nickname} is ready to play Coup.`);
  }

  removePlayer(id) {
    const player = this.state.players.find(p => p.id === id);
    if (!player || player.isEliminated) return;

    player.isEliminated = true;
    this.addLog(`${player.nickname} was eliminated or left.`);
    
    // Return cards to deck
    player.influence.forEach(inf => {
        if (!inf.isRevealed) {
            this.state.deck.push(inf.card);
        }
    });
    this.state.deck = shuffle(this.state.deck);
    
    if (this.state.currentPlayerId === id) {
        this.nextTurn();
    }
    
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
    this.addLog("The Coup game has started!");
    this.addLog(`It's ${this.state.players.find(p => p.id === this.state.currentPlayerId).nickname}'s turn.`);
  }
  
  handleAction(playerId, actionType, targetId) {
      if (this.state.phase === 'game-over') return;
      const player = this.state.players.find(p => p.id === playerId);
      if (!player || player.isEliminated) throw new Error("Player not found or is eliminated");
      
      // For now, only allow actions on your turn.
      if (this.state.phase !== 'turn' || this.state.currentPlayerId !== playerId) {
          throw new Error("It's not your turn to perform an action.");
      }

      this.addLog(`${player.nickname} attempts to use ${actionType}${targetId ? ` on ${this.state.players.find(p=>p.id === targetId)?.nickname}` : ''}.`);

      // This is a simplified direct-to-resolution flow. 
      // A full implementation would set the action and enter a 'challenge/block' phase.
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
              const targetPlayerCoup = this.state.players.find(p => p.id === targetId);
              if (!targetPlayerCoup || targetPlayerCoup.isEliminated) throw new Error("Invalid target for Coup.");
              player.coins -= 7;
              
              const influenceToRevealCoup = targetPlayerCoup.influence.find(i => !i.isRevealed);
              if (influenceToRevealCoup) {
                  influenceToRevealCoup.isRevealed = true;
                  this.addLog(`${player.nickname} performs a Coup on ${targetPlayerCoup.nickname}, revealing a ${influenceToRevealCoup.card}.`);
                  this.checkIfEliminated(targetPlayerCoup);
              }
              this.nextTurn();
              break;
        case 'steal': // Captain
              const targetPlayerSteal = this.state.players.find(p => p.id === targetId);
              if (!targetPlayerSteal || targetPlayerSteal.isEliminated) throw new Error("Invalid target for Steal.");
              const stolenAmount = Math.min(targetPlayerSteal.coins, 2);
              player.coins += stolenAmount;
              targetPlayerSteal.coins -= stolenAmount;
              this.addLog(`${player.nickname} claims Captain and steals ${stolenAmount} coins from ${targetPlayerSteal.nickname}.`);
              this.nextTurn();
              break;
        case 'assassinate': // Assassin
              if (player.coins < 3) throw new Error("Not enough coins to Assassinate.");
              const targetPlayerAssassinate = this.state.players.find(p => p.id === targetId);
              if (!targetPlayerAssassinate || targetPlayerAssassinate.isEliminated) throw new Error("Invalid target for Assassination.");
              player.coins -= 3;

              const influenceToRevealAssassinate = targetPlayerAssassinate.influence.find(i => !i.isRevealed);
               if (influenceToRevealAssassinate) {
                  influenceToRevealAssassinate.isRevealed = true;
                  this.addLog(`${player.nickname} claims Assassin and assassinates ${targetPlayerAssassinate.nickname}, revealing a ${influenceToRevealAssassinate.card}.`);
                  this.checkIfEliminated(targetPlayerAssassinate);
              }
              this.nextTurn();
              break;
          default:
              this.addLog(`Action ${actionType} is not fully implemented yet.`);
              this.nextTurn();
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
      if (activePlayers.length === 1 && this.state.players.length >= 2) {
          this.state.winner = activePlayers[0].nickname;
          this.state.phase = 'game-over';
          this.addLog(`${this.state.winner} is the winner!`);
      }
  }

  nextTurn() {
    if (this.state.phase === 'game-over') return;
    const activePlayers = this.state.players.filter(p => !p.isEliminated);
    if (activePlayers.length < 2) {
        this.checkForWinner();
        return;
    }

    const currentIndex = activePlayers.findIndex(p => p.id === this.state.currentPlayerId);
    const nextPlayer = activePlayers[(currentIndex + 1) % activePlayers.length];

    this.state.currentPlayerId = nextPlayer.id;
    this.state.phase = 'turn';
    this.state.action = null;
    this.state.challenge = null;
    this.state.block = null;

    this.addLog(`It's now ${nextPlayer.nickname}'s turn.`);
  }
}

module.exports = { CoupGame };
