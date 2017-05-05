function Room(roomId) {
    this.id = roomId;
    this.playing = false;
    this.count = GAME_COUNTDOWN;
    this.playerData = {};
    /*
    -> id (string)
    -> playerName (string)
    -> readyForStart (boolean)
    -> alive (boolean)
    -> cards
        --> (number)
    -> pile
        -->
            --> player (string)
            --> card (number)
    */
    this.playerOrder = [];
    // --> (playerId)
    this.turnIndex = 0;
    this.deck = randomDeck();
    this.deckIndex = 0;
    this.baseCard;
    this.turnIndex = -1;
    this.turnHolder;
    this.turnActions;
    this.amountPlayers;
    this.winners = [];
    this.losers = [];
}

Room.prototype.emit = function (event, data) {
    io.sockets.in(this.id).emit(event, data);
}

Room.prototype.sockets = function () {
    return io.sockets.in(this.id).clients;
};

Room.prototype.amountSockets = function () {
    var playerId, i = 0;
    for (playerId in this.sockets()) {
        i++;
    }
    return i;
};

Room.prototype.playingPlayers = function () {
    var playerId, players = [];
    for (playerId in this.playerData) {
        var player = this.playerData[playerId];
        if (this.isPlaying(player)) {
            players.push(player);
        }
    }
    return players;
}

// Public player data
Room.prototype.playerInfo = function (player) {
    if (player) {
        return {
            playerName: player.playerName,
            readyForStart: player.readyForStart
        }
    }
    var playerInfo = [];
    for (playerId in this.playerData) {
        playerInfo.push(this.playerInfo(this.playerData[playerId]));
    }
    return playerInfo;
};

Room.prototype.isJoinable = function () {
    return !isFull() && !rooms[roomId].playing;
};

Room.prototype.isFull = function () {
    return playersInRoom(roomId) >= MAX_PLAYERS;
};

Room.prototype.randomCard = function () {
    //    var card = deck[0];
    //    deck.splice(1);
    //    return card;
    var card = this.deck[this.deckIndex++];
    if (this.deckIndex >= this.deck.length) {
        shuffleArray(this.deck);
        this.deckIndex = 0;
    }
    return card;
};

//Room.prototypes.randomCards = function(amountCards) {
//    var cards = deck.slice(0, amountCards);
//    deck.splice(amountCards);
//    return cards;
//}

Room.prototype.dealCards = function (player, amountCards) {
    var socket = this.sockets()[player.id];
    var i, cards = [];
    for (i = 0; i < amountCards; i++) {
        var card = this.randomCard();
        cards[i] = card;
        this.playerData[socket.id].cards.push(card);
    }
    socket.emit("dealCards", cards);
    socket.broadcast.to(this.id).emit("cardsDealt", {
        playerId: socket.id,
        amountCards: amountCards
    });
};

Room.prototype.drawCard = function () {
    dealCards(this.turnHolder, 1);
}

Room.prototype.playerDeath = function (player) {
    player.alive = false;
    this.emit("playerDeath", player.id);
}

Room.prototype.playerWin = function (player) {
    this.winners.push(player.id);
    this.emit("playerWin", player.id);
}

Room.prototype.playerLose = function (player) {
    this.losers.push(player.id);
    this.emit("playerLose", plater.id);
}

Room.prototype.endGame = function () {
    resetRoom(this.id);
}

Room.prototype.rankList = function () {
    var rankList = [],
        playerId, i;
    for (playerId in winners) {
        rankList.push(playerId);
    }
    var playingPlayers = this.playingPlayers();
    // Reverse, as players that have a turn later in the game have a disadvantage, so should end up higher in the rank list
    for (i = playingPlayers.length - 1; i >= 0; i--) {
        rankList.push(playingPlayers[i]);
    }
    // Reverse; first loser is last
    for (i = losers.length - 1; i >= 0; i--) {
        rankList.push(losers[i]);
    }
    return rankList;

    // TODO scoring?
}

Room.prototype.endTurn = function () {
    if (this.turnIndex >= 0) {
        var amountCards = this.turnHolder.cards.length
        if (this.turnActions.length === 0) {
            if (!canDrawCard(this.turnHolder)) {
                this.playerDeath(this.turnHolder);
            } else if (amountCards >= START_CARDS_PER_PLAYER) {
                this.dealCards(this.turnHolder, 1);
            }
        }
        if (amountCards < START_CARDS_PER_PLAYER) {
            this.dealCards(this.turnHolder, START_CARDS_PER_PLAYER - amountCards)
        }
    }
    if (this.playingPlayers().length <= 1) {
        this.endGame();
        return;
    }
    this.nextTurn();
}

Room.prototype.nextTurn = function () {
    do {
        if (++this.turnIndex >= this.amountPlayers) {
            this.turnIndex = 0;
        }
        this.turnHolder = this.playerData[this.playerOrder[this.turnIndex]];
    } while (!this.isPlaying(this.turnHolder));

    this.turnActions = [];
    this.count = TURN_DURATION;

    if (!this.accelerateTurn()) {
        this.emit("changeTurn", this.turnHolder.id);
    }
}

Room.prototype.accelerateTurn = function () {
    if (!canPlaceCard(this.turnHolder)) {
        this.endTurn();
        return true;
    }
}

Room.prototype.placeCard = function(card, pileHolderId) {
    if (!this.turnHolder.cards.indexOf(card) === -1) {
        return;
    }
    var pile = this.playerData[pilePlayerId].pile;
    if (pile.length >= PILE_SIZE) {
        return;
    }
    var parentCard = (pile.length === 0) ? this.baseCard : pile[pile.length - 1].card;
    if (!cardsMatch(parentCard, card)) {
        return;
    }
    var turnAction = {
        player: this.turnHolder.id,
        card: card
    };
    pile.push(turnAction);
    this.turnActions = turnAction;
    this.emit("placeCard", {
        card: card,
        pileHolderId: pileHolderId
    });
    if (pile.length >= PILE_SIZE) {
        if (isCardBlack(card)) {
            playerLose(this.turnHolder);
        } else {
            playerWin(this.turnHolder);
        }
    }
    this.accelerateTurn();
}

Room.prototype.canPlaceCard = function(player) {
    var pileHolderId;
    for (pileHolderId in this.playerData) {
        var pile = this.playerData[pileHolder].pile;
        if (pile.length == 0) {
            continue;
        }
        var topCard = pile[pile.length - 1].card;
        var handCard;
        for (handCard in player.cards) {
            if (cardsMatch(topCard, handCard)) {
                return true;
            }
        }
    }
}

Room.prototype.canDrawCard = function(player) {
    return player.cards.length < MAX_CARDS_PER_PLAYER;
}


Room.prototype.startGame = function () {
    console.log("starting game in room " + this.id);

    if (this.playing) {
        console.log(this.id + " already playing");
        return;
    }
    this.playing = true;
    this.baseCard = this.randomCard();
    this.amountPlayers = this.amountSockets();

    var playerId;
    for (playerId in this.playerData) {
        this.playerOrder.push(playerId);
    }
    shuffleArray(this.playerOrder);

    this.emit('startGame', {
        playerOrder: this.playerOrder,
        baseCard: this.baseCard,
        cardsPerPlayer: START_CARDS_PER_PLAYER
    });

    var sockets = this.sockets();
    for (playerId in this.playerData) {
        var player = this.playerData[playerId];
        player.cards = [];
        var i;
        for (i = 0; i < START_CARDS_PER_PLAYER; i++) {
            player.cards[i] = this.randomCard();
        }
        player.pile = [];
        sockets[playerId].emit('initialCards', cards);
    }
};

Room.prototype.isTurnHolder = function (socket) {
    return socket.id === this.turnHolder.id;
}

Room.prototype.joinPlayer = function (socket, playerName) {
    var newPlayerData = {
        id: socket.id,
        playerName: playerName,
        readyForStart: false,
        alive: true,
    };
    this.playerData[socket.id] = newPlayerData;
    socket.join(this.id);
    socket.room = this;
    socket.emit("roomJoin", {
        id: this.id,
        count: this.count,
        playerInfo: this.playerInfo()
    });
    socket.broadcast.to(this.id).emit("playerJoin", [this.playerInfo(newPlayerData)]);
    console.log(socket.id + " joined room '" + this.id + "' as '" + playerName + "'");
};

Room.prototype.leavePlayer = function (socket) {
    if (!this.playing) {
        delete this.playerData[socket.id];
        this.emit("playerLeave", [socket.id]);
    } else {
        // TODO Leave when playing
        this.playerDeath(this.playerData[socket.id]);
    }
    socket.leave(this.id);
    delete socket.room;
};

Room.prototype.playerReadyForStart = function (socket) {
    var player = this.playerData[socket.id];
    if (player.readyForStart) {
        return;
    }
    player.readyForStart = true;
    var playerId;
    for (playerId in this.playerData) {
        if (!this.playerData[playerId]) {
            this.emit("playerReadyForStart", socket.id);
            return;
        }
    }
    this.startGame();
};

Room.prototype.isPlaying = function(player) {
    this.turnHolder.alive && this.winners.indexOf(this.turnHolder.id) === -1 && this.losers.indexOf(this.turnHolder.id) === -1
}

module.exports = Room;
