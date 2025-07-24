
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
        phase: 'waiting', // waiting, turn, action-response, block-response, reveal, exchange, game-over, paused
        players: [],
        deck: [],
        treasury: 50,
        currentPlayerId: null,
        action: null, // { type, playerId, targetId, isChallengeable, isBlockable, claimedCard, blockClaimedCard, blockableBy[] }
        challengerId: null,
        blockerId: null,
        revealChoice: {
            playerId: null,
            reason: null, // 'lost-challenge', 'assassinated', 'coup'
        },
        exchangeInfo: null, // { playerId, cards }
        winner: null,
        log: [],
        paused: false,
        pausedState: null,
        respondedPlayerIds: [],
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
    const playerIndex = this.state.players.findIndex(p => p.id === id);
    if (playerIndex === -1) return;
    const player = this.state.players[playerIndex];
    
    // Prevent modifying eliminated player
    const wasAlreadyEliminated = player.isEliminated;
    player.isEliminated = true;

    if (!wasAlreadyEliminated) {
        this.addLog(`${player.nickname} was eliminated or left.`);
        player.influence.forEach(inf => {
            if (!inf.isRevealed) this.state.deck.push(inf.card);
        });
        this.state.deck = shuffle(this.state.deck);
    }
    
    // If the disconnected player was the one to act, advance turn
    if (this.state.currentPlayerId === id) {
        this.nextTurn();
    } else {
        // If they were supposed to respond, treat it as a pass
        this.pass(id);
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
    this.addLog(`It's ${this.getPlayer(this.state.currentPlayerId).nickname}'s turn.`);
  }

  pause() {
    if (this.state.phase !== 'game-over' && !this.state.paused) {
      this.state.pausedState = this.state.phase;
      this.state.phase = 'paused';
      this.state.paused = true;
      this.addLog('The game has been paused.');
    }
  }

  resume() {
    if (this.state.paused) {
      this.state.phase = this.state.pausedState;
      this.state.pausedState = null;
      this.state.paused = false;
      this.addLog('The game has been resumed.');
    }
  }

  getPlayer(id) {
      return this.state.players.find(p => p.id === id);
  }

  handleAction(playerId, actionType, targetId = null) {
      if (this.state.paused || this.state.phase === 'game-over' || this.state.phase !== 'turn' || playerId !== this.state.currentPlayerId) {
          throw new Error("Not your turn or action not allowed.");
      }
      const player = this.getPlayer(playerId);
      const target = targetId ? this.getPlayer(targetId) : null;
      if (player.isEliminated || (target && target.isEliminated)) {
          throw new Error("Player or target is eliminated.");
      }
      if (player.coins >= 10 && actionType !== 'coup') {
          throw new Error("You must launch a Coup with 10 or more coins.");
      }

      this.state.action = {
          type: actionType,
          playerId: playerId,
          targetId: targetId,
          isChallengeable: false,
          isBlockable: false,
          claimedCard: null,
          blockClaimedCard: null,
          blockableBy: [],
      };
      
      switch(actionType) {
          case 'income':
              this.addLog(`${player.nickname} takes Income.`);
              this.resolveIncome();
              break;
          case 'foreign_aid':
              this.state.action.isBlockable = true;
              this.state.action.blockableBy = ['Duke'];
              this.addLog(`${player.nickname} attempts Foreign Aid.`);
              this.state.phase = 'action-response';
              break;
          case 'coup':
              if (player.coins < 7) throw new Error("Not enough coins for a Coup.");
              if (!target) throw new Error("Coup requires a target.");
              if (target.isEliminated) throw new Error("Target is already eliminated.");
              this.addLog(`${player.nickname} launches a Coup against ${target.nickname}.`);
              this.resolveCoup(player, target);
              break;
          case 'tax':
              this.state.action.isChallengeable = true;
              this.state.action.claimedCard = 'Duke';
              this.addLog(`${player.nickname} claims Duke to take Tax.`);
              this.state.phase = 'action-response';
              break;
          case 'assassinate':
              if (player.coins < 3) throw new Error("Not enough coins to Assassinate.");
              if (!target) throw new Error("Assassination requires a target.");
              if (target.isEliminated) throw new Error("Target is already eliminated.");
              this.state.action.isChallengeable = true;
              this.state.action.claimedCard = 'Assassin';
              this.state.action.isBlockable = true;
              this.state.action.blockableBy = ['Contessa'];
              this.addLog(`${player.nickname} claims Assassin to assassinate ${target.nickname}.`);
              this.state.phase = 'action-response';
              break;
          case 'steal':
              if (!target) throw new Error("Steal requires a target.");
              if (target.isEliminated) throw new Error("Target is already eliminated.");
              this.state.action.isChallengeable = true;
              this.state.action.claimedCard = 'Captain';
              this.state.action.isBlockable = true;
              this.state.action.blockableBy = ['Captain', 'Ambassador'];
              this.addLog(`${player.nickname} claims Captain to steal from ${target.nickname}.`);
              this.state.phase = 'action-response';
              break;
          case 'exchange':
              this.state.action.isChallengeable = true;
              this.state.action.claimedCard = 'Ambassador';
              this.addLog(`${player.nickname} claims Ambassador to exchange cards.`);
              this.state.phase = 'action-response';
              break;
          default:
              throw new Error("Unknown action type.");
      }
  }

  handleChallenge(challengerId) {
      if (this.state.paused || (this.state.phase !== 'action-response' && this.state.phase !== 'block-response')) throw new Error("Not a valid time to challenge.");
      
      const { action } = this.state;
      const challenger = this.getPlayer(challengerId);
      this.state.challengerId = challengerId;
      
      if (this.state.phase === 'action-response') {
          // Challenging the initial action
          const challengedPlayer = this.getPlayer(action.playerId);
          if(challenger.id === challengedPlayer.id) throw new Error("You cannot challenge yourself.");

          this.addLog(`${challenger.nickname} challenges ${challengedPlayer.nickname}'s claim of ${action.claimedCard}.`);
          const hasCard = this.playerHasCard(challengedPlayer, action.claimedCard);

          if (hasCard) {
              this.addLog(`${challengedPlayer.nickname} reveals a ${action.claimedCard}! ${challenger.nickname} loses the challenge.`);
              this.returnCardToDeck(challengedPlayer, action.claimedCard);
              this.drawCard(challengedPlayer);
              this.state.revealChoice = { playerId: challenger.id, reason: 'lost-challenge' };
          } else {
              this.addLog(`${challengedPlayer.nickname} does not have a ${action.claimedCard}! The challenge is successful.`);
              const revealedInfluence = challengedPlayer.influence.find(inf => !inf.isRevealed);
              if(revealedInfluence) {
                revealedInfluence.isRevealed = true;
                this.addLog(`${challengedPlayer.nickname} loses an influence, revealing a ${revealedInfluence.card}.`);
                this.checkIfEliminated(challengedPlayer);
              }
              this.state.action = null; // action fails
              this.nextTurn();
              return;
          }
      } else { // 'block-response'
          // Challenging a block
          const challengedPlayer = this.getPlayer(this.state.blockerId);
          if (challenger.id !== action.playerId) throw new Error("Only the player being blocked can challenge the block.");

          this.addLog(`${challenger.nickname} challenges ${challengedPlayer.nickname}'s block claim of ${action.blockClaimedCard}.`);
          const hasCard = this.playerHasCard(challengedPlayer, action.blockClaimedCard);

          if (hasCard) {
              this.addLog(`${challengedPlayer.nickname} reveals a ${action.blockClaimedCard}! ${challenger.nickname} loses the challenge.`);
              this.returnCardToDeck(challengedPlayer, action.blockClaimedCard);
              this.drawCard(challengedPlayer);
              // The original action is successfully blocked
              this.state.action = null; 
              this.state.revealChoice = { playerId: challenger.id, reason: 'lost-challenge' };
          } else {
              this.addLog(`${challengedPlayer.nickname} does not have a ${action.blockClaimedCard}! The block fails.`);
              // The action will proceed after the reveal
              this.state.revealChoice = { playerId: challengedPlayer.id, reason: 'lost-challenge' };
          }
      }

      this.state.phase = 'reveal';
  }
  
  handleBlock(blockerId, card) {
      if (this.state.paused || this.state.phase !== 'action-response') throw new Error("Not a valid time to block.");
      const { action } = this.state;
      if (!action.isBlockable || !action.blockableBy.includes(card)) throw new Error("This action cannot be blocked with that card.");
      if (action.targetId !== blockerId) throw new Error("You are not the target of this action.");

      const blocker = this.getPlayer(blockerId);
      this.addLog(`${blocker.nickname} claims ${card} to block the action.`);
      this.state.blockerId = blockerId;
      this.state.respondedPlayerIds = [];
      this.state.action.blockClaimedCard = card;
      this.state.phase = 'block-response';
  }

  handleReveal(playerId, cardToReveal) {
      if (this.state.paused || this.state.phase !== 'reveal' || this.state.revealChoice.playerId !== playerId) throw new Error("It's not your turn to reveal a card.");

      const player = this.getPlayer(playerId);
      const influence = player.influence.find(inf => inf.card === cardToReveal && !inf.isRevealed);
      if (!influence) throw new Error("Invalid card to reveal.");

      influence.isRevealed = true;
      this.addLog(`${player.nickname} reveals a ${influence.card}.`);

      const wasEliminated = this.checkIfEliminated(player);
      this.state.revealChoice = { playerId: null, reason: null };
      
      if (wasEliminated) {
        if(this.checkForWinner()) return;
        // If the current player eliminated themselves, move to next turn
        if (player.id === this.state.currentPlayerId) {
            this.nextTurn();
            return;
        }
      }

      const wasActionChallenge = this.state.challengerId && !this.state.blockerId;
      const wasBlockChallenge = this.state.challengerId && this.state.blockerId;
      
      // Determine next step
      if (wasActionChallenge) {
          // If challenger lost, the original action proceeds
          if (player.id === this.state.challengerId) {
              this.resolveAction();
          } else { // If action claimant lost challenge (was bluffing), action is void, next turn
              this.nextTurn();
          }
      } else if (wasBlockChallenge) {
          const blocker = this.getPlayer(this.state.blockerId);
          // If blocker lost the challenge (was bluffing), the action proceeds
          if (blocker.id === playerId) {
              this.resolveAction();
          } else { // If challenger of block lost, action is blocked, next turn
              this.nextTurn();
          }
      } else { // No challenge, this reveal was from a Coup or Assassination
          this.nextTurn();
      }
  }

  handleExchangeResponse(playerId, cardsToKeep) {
    if (this.state.paused || this.state.phase !== 'exchange' || this.state.exchangeInfo.playerId !== playerId) throw new Error("Not your turn to exchange.");

    const { exchangeInfo } = this.state;
    const player = this.getPlayer(playerId);
    const influenceCount = player.influence.filter(i => !i.isRevealed).length;
    if (cardsToKeep.length !== influenceCount) throw new Error(`You must keep ${influenceCount} card(s).`);

    const tempDeck = [...exchangeInfo.cards];
    const newInfluence = [];
    
    cardsToKeep.forEach(card => {
        const index = tempDeck.indexOf(card);
        if (index > -1) {
            newInfluence.push({ card: tempDeck.splice(index, 1)[0], isRevealed: false });
        }
    });

    player.influence = [...player.influence.filter(i => i.isRevealed), ...newInfluence];
    this.state.deck.push(...tempDeck);
    this.state.deck = shuffle(this.state.deck);

    this.addLog(`${player.nickname} finishes exchanging cards.`);
    this.state.exchangeInfo = null;
    this.nextTurn();
  }


  pass(playerId) {
      if (this.state.paused || (this.state.phase !== 'action-response' && this.state.phase !== 'block-response')) return;

      const player = this.getPlayer(playerId);
      if (!player || player.isEliminated || this.state.respondedPlayerIds.includes(playerId)) {
          return; // Don't allow passing twice or if eliminated
      }

      this.state.respondedPlayerIds.push(playerId);
      this.addLog(`${player.nickname} passes.`);

      const activePlayers = this.state.players.filter(p => !p.isEliminated);
      let playersWhoNeedToRespond;

      if (this.state.phase === 'action-response') {
          // Everyone except the current player needs to respond
          playersWhoNeedToRespond = activePlayers.filter(p => p.id !== this.state.currentPlayerId);
      } else { // block-response
          // Only the current player needs to respond to the block
          playersWhoNeedToRespond = activePlayers.filter(p => p.id === this.state.currentPlayerId);
      }

      const allResponded = playersWhoNeedToRespond.every(p => this.state.respondedPlayerIds.includes(p.id));

      if (allResponded) {
          if (this.state.phase === 'action-response') {
              this.addLog("No challenges or blocks. The action proceeds.");
              this.resolveAction();
          } else if (this.state.phase === 'block-response') {
              this.addLog(`${this.getPlayer(this.state.action.playerId).nickname} does not challenge the block.`);
              this.state.action = null; // Action is blocked
              this.nextTurn();
          }
      }
  }

  resolveAction() {
      const { action } = this.state;
      if (!action) {
          this.nextTurn();
          return;
      };
      
      const player = this.getPlayer(action.playerId);
      const target = action.targetId ? this.getPlayer(action.targetId) : null;
      
      switch(action.type) {
          case 'foreign_aid':
              this.addLog(`${player.nickname} successfully takes Foreign Aid.`);
              this.resolveForeignAid(player);
              break;
          case 'tax':
              this.addLog(`${player.nickname}'s claim to Duke was successful.`);
              this.resolveTax(player);
              break;
          case 'assassinate':
              if (target.isEliminated) {
                this.addLog(`${target.nickname} was already eliminated. The assassination has no effect.`);
                this.nextTurn();
              } else {
                this.addLog(`${player.nickname}'s assassination is successful.`);
                this.resolveAssassinate(player, target);
              }
              break;
          case 'steal':
              this.addLog(`${player.nickname}'s steal is successful.`);
              this.resolveSteal(player, target);
              break;
          case 'exchange':
              this.addLog(`${player.nickname}'s exchange is successful.`);
              this.resolveExchange(player);
              break;
          default:
              this.nextTurn();
      }
  }

  playerHasCard(player, card) {
      return player.influence.some(inf => inf.card === card && !inf.isRevealed);
  }

  returnCardToDeck(player, card) {
      const influenceIndex = player.influence.findIndex(inf => inf.card === card && !inf.isRevealed);
      if(influenceIndex > -1) {
          const removedCard = player.influence.splice(influenceIndex, 1)[0];
          this.state.deck.push(removedCard.card);
          this.state.deck = shuffle(this.state.deck);
          this.addLog(`${player.nickname} shuffles a ${card} back into the deck.`);
      }
  }

  drawCard(player) {
      if(this.state.deck.length > 0) {
          const newCard = this.state.deck.pop();
          player.influence.push({ card: newCard, isRevealed: false });
          this.addLog(`${player.nickname} draws a new card.`);
      } else {
        this.addLog(`The deck is empty. ${player.nickname} cannot draw a new card.`)
      }
  }


  checkIfEliminated(player) {
      if (player.influence.every(i => i.isRevealed)) {
          if (!player.isEliminated) {
             player.isEliminated = true;
             this.addLog(`${player.nickname} has been eliminated from the game.`);
             // Return coins to treasury
             this.state.treasury += player.coins;
             player.coins = 0;
          }
          return true;
      }
      return false;
  }

  checkForWinner() {
      const activePlayers = this.state.players.filter(p => !p.isEliminated);
      if (activePlayers.length === 1 && this.state.players.length >= 2) {
          this.state.winner = activePlayers[0].nickname;
          this.state.phase = 'game-over';
          this.addLog(`${this.state.winner} is the winner!`);
          return true;
      }
      return false;
  }

  nextTurn() {
    if (this.checkForWinner()) return;

    const activePlayers = this.state.players.filter(p => !p.isEliminated);
    if(activePlayers.length === 0) {
        this.state.phase = 'game-over';
        this.addLog('Game over. No players left.');
        return;
    }

    const currentIndex = this.state.currentPlayerId ? activePlayers.findIndex(p => p.id === this.state.currentPlayerId) : -1;
    const nextPlayer = activePlayers[(currentIndex + 1) % activePlayers.length];

    this.state.currentPlayerId = nextPlayer.id;
    this.state.phase = 'turn';
    this.state.action = null;
    this.state.challengerId = null;
    this.state.blockerId = null;
    this.state.respondedPlayerIds = [];

    const nextPlayerObj = this.getPlayer(nextPlayer.id);
    this.addLog(`It's now ${nextPlayerObj.nickname}'s turn.`);
    if (nextPlayerObj.coins >= 10) {
        this.addLog(`${nextPlayerObj.nickname} has 10 or more coins and must Coup.`);
    }
  }

  // Action Resolution functions
  resolveIncome(player) {
      player = player || this.getPlayer(this.state.action.playerId);
      player.coins++;
      this.state.treasury--;
      this.addLog(`${player.nickname} gains 1 coin, now has ${player.coins}.`);
      this.nextTurn();
  }
  
  resolveCoup(player, target) {
      player.coins -= 7;
      this.state.treasury += 7;
      this.addLog(`${player.nickname} pays 7 coins for the Coup.`);
      this.state.phase = 'reveal';
      this.state.revealChoice = { playerId: target.id, reason: 'coup' };
  }

  resolveForeignAid(player) {
      player.coins += 2;
      this.state.treasury -= 2;
      this.addLog(`${player.nickname} gains 2 coins, now has ${player.coins}.`);
      this.nextTurn();
  }

  resolveTax(player) {
      player.coins += 3;
      this.state.treasury -= 3;
      this.addLog(`${player.nickname} gains 3 coins, now has ${player.coins}.`);
      this.nextTurn();
  }

  resolveAssassinate(player, target) {
      player.coins -= 3;
      this.state.treasury += 3;
      this.addLog(`${player.nickname} pays 3 coins to assassinate.`);
      this.state.phase = 'reveal';
      this.state.revealChoice = { playerId: target.id, reason: 'assassinated' };
  }

  resolveSteal(player, target) {
      const stolenAmount = Math.min(target.coins, 2);
      player.coins += stolenAmount;
      target.coins -= stolenAmount;
      this.addLog(`${player.nickname} steals ${stolenAmount} coins from ${target.nickname}.`);
      this.nextTurn();
  }

  resolveExchange(player) {
      const drawnCards = [this.state.deck.pop(), this.state.deck.pop()].filter(Boolean);
      if (this.state.deck.length < 2) {
          this.addLog('Not enough cards in deck to exchange.');
          this.nextTurn();
          return;
      }

      this.addLog(`${player.nickname} draws 2 cards from the deck.`);
      const currentInfluence = player.influence.filter(i => !i.isRevealed).map(i => i.card);
      
      this.state.phase = 'exchange';
      this.state.exchangeInfo = {
          playerId: player.id,
          cards: [...currentInfluence, ...drawnCards],
      };
  }
}

module.exports = { CoupGame };
