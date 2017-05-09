global.ROOM_STATE = {
    LOBBY: 0,
    START_DELAY: 1,
    PLAYING: 2,
    END_DELAY: 3
};

function Room(roomId) {
    this.id = roomId;
    this.state = ROOM_STATE.LOBBY;
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
        //--> owner (string)
        -->
            --> player (string)
            --> card (number)
    */
    this.playerOrder = [];
    // --> (playerId)
    this.turnIndex = -1;
    this.deck = randomDeck();
    this.deckIndex = 0;
    this.baseCard;
    this.turnHolder;
    this.turnActions;
    this.amountPlayers = 0;
    this.winners = [];
    this.losers = [];
}

Room.prototype.emit = function (event, data) {
    io.sockets.in(this.id).emit(event, data);
}

Room.prototype.sockets = function () {
    return io.sockets.in(this.id).sockets;
};

Room.prototype.amountSockets = function () {
    var sockets = this.sockets(),
        i = 0,
        socketId;
    for (socketId in sockets) {
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
            id: player.id,
            playerName: player.playerName,
            readyForStart: player.readyForStart
        };
    }
    var playerInfo = [];
    var playerId;
    for (playerId in this.playerData) {
        playerInfo.push(this.playerInfo(this.playerData[playerId]));
    }
    return playerInfo;
};

Room.prototype.isJoinable = function () {
    return !this.isFull() && this.state === ROOM_STATE.LOBBY;
};

Room.prototype.isFull = function () {
    return this.amountPlayers >= MAX_PLAYERS;
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
    var socket = io.sockets.sockets[player.id];
    var i, cards = [];
    for (i = 0; i < amountCards; i++) {
        var card = this.randomCard();
        cards[i] = card;
        this.playerData[player.id].cards.push(card);
    }
    socket.emit("dealCards", cards);
    socket.broadcast.to(this.id).emit("cardsDealt", {
        playerId: socket.id,
        amountCards: amountCards
    });
};

Room.prototype.drawCard = function () {
    if (this.turnActions.length !== 0) {
        return;
    }
    dealCards(this.turnHolder, 1);
    this.nextTurn();
}

Room.prototype.playerDeath = function (player) {
    player.alive = false;
    if(this.isTurnHolder(player)) {
        this.nextTurn();
    }
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
    this.state = ROOM_STATE.END_DELAY;
    this.count = END_GAME_COUNTDOWN;
    this.emit("endGame", {
        rankList: this.rankList(),
        count: this.count
    });
}

Room.prototype.endRoom = function () {

    resetRoom(this.id);
}

Room.prototype.rankList = function () {
    var rankList = [],
        playerId, i;
    for (i = 0; i < this.winners.length; i++) {
        rankList.push(this.winners[i]);
    }
    var playingPlayers = this.playingPlayers();
    // Reverse, as players that have a turn later in the game have a disadvantage, so should end up higher in the rank list
    for (i = playingPlayers.length - 1; i >= 0; i--) {
        rankList.push(this.playingPlayers[i]);
    }
    // Reverse; first loser is last
    for (i = this.losers.length - 1; i >= 0; i--) {
        rankList.push(this.losers[i]);
    }
    return rankList;

    // TODO scoring?
}

Room.prototype.endTurn = function () {
    var amountCards = this.turnHolder.cards.length
    if (this.turnActions.length === 0) {
        if (!this.canDrawCard(this.turnHolder)) {
            this.playerDeath(this.turnHolder);
        } else if (amountCards >= START_CARDS_PER_PLAYER) {
            this.dealCards(this.turnHolder, 1);
        }
    }
    if (amountCards < START_CARDS_PER_PLAYER) {
        this.dealCards(this.turnHolder, START_CARDS_PER_PLAYER - amountCards)
    }
    this.nextTurn();
}

Room.prototype.nextTurn = function () {
    if (this.playingPlayers().length <= 1) {
        this.endGame();
        return;
    }
    do {
        console.log("amount Players " + this.amountPlayers);
        if (++this.turnIndex >= this.amountPlayers) {
            this.turnIndex = 0;
        }
        console.log("turnIndex " + this.turnIndex);
        this.turnHolder = this.playerData[this.playerOrder[this.turnIndex]];
    } while (!this.isPlaying(this.turnHolder));

    this.turnActions = [];
    this.count = TURN_DURATION;

    if (!this.accelerateTurn()) {
        this.emit("changeTurn", {
            turnHolderId: this.turnHolder.id,
            count: this.count
        });
    }
}

Room.prototype.accelerateTurn = function () {
    if (!this.canPlaceCard(this.turnHolder)) {
        this.endTurn();
        return true;
    }
    return false;
}

Room.prototype.placeCardRejected = function (socket, card, pileOwnerId) {
    socket.emit("placeCardRejected", {
        card: card,
        pileOwnerId: pileOwnerId
    });
}

Room.prototype.placeCard = function (card, pileOwnerId) {
    if (!this.turnHolder.cards.indexOf(card) === -1) {
        return;
    }
    var pile = this.playerData[pileOwnerId].pile;
    var parentCard = (pile.length === 0) ? this.baseCard : pile[pile.length - 1].card;
    if (pile.length >= PILE_SIZE || !cardsMatch(parentCard, card)) {
        var socket = io.sockets.sockets[this.turnHolder.id];
        var socket = io.sockets.sockets[this.turnHolder.id];
        placeCardRejected(socket, card, pileOwnerId);
        return;
    }

    var turnAction = {
        player: this.turnHolder.id,
        card: card
    };
    pile.push(turnAction);
    this.turnHolder.cards.splice(this.turnHolder.cards.indexOf(card), 1);
    this.turnActions = turnAction;
    var socket = io.sockets.sockets[this.turnHolder.id];
    socket.broadcast.to(this.id).emit("placeCard", {
        card: card,
        pileOwnerId: pileOwnerId
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

Room.prototype.canPlaceCard = function (player) {
    var checkedBaseCard = false;
    var pileOwnerId;
    for (pileOwnerId in this.playerData) {
        var pile = this.playerData[pileOwnerId].pile;
        if (checkedBaseCard && pile.length == 0) {
            continue;
        }
        var topCard = pile.length === 0 ? this.baseCard : pile[pile.length - 1].card;
        console.log("topCard " + topCard);
        if (pile.length === 0) {
            checkedBaseCard = true;
        }
        var i;
        for (i = 0; i < player.cards.length; i++) {
            var handCard = player.cards[i];
            if (cardsMatch(topCard, handCard)) {
                console.log("cards " + topCard + " and " + handCard + " match");
                return true;
            }
        }
    }
    return false;
}

Room.prototype.canCardBePlaced = function (card, parentCard, pileIndex) {
    return cardsMatch(parentCard, card) && !(pileIndex == PILE_SIZE - 1 && card >= 52);
}

Room.prototype.canDrawCard = function (player) {
    return player.cards.length < MAX_CARDS_PER_PLAYER;
}

Room.prototype.startGame = function () {
    console.log("starting game in room " + this.id);

    if (this.state !== ROOM_STATE.LOBBY) {
        console.log(this.id + " already playing");
        return;
    }
    this.state = ROOM_STATE.START_DELAY;
    this.count = FIRST_TURN_COUNTDOWN;
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
        cardsPerPlayer: START_CARDS_PER_PLAYER,
        maxCardsPerPlayer: MAX_CARDS_PER_PLAYER,
        pileSize: PILE_SIZE,
        count: this.count
    });

    for (playerId in this.playerData) {
        var player = this.playerData[playerId];
        player.cards = [];
        var i;
        for (i = 0; i < START_CARDS_PER_PLAYER; i++) {
            player.cards[i] = this.randomCard();
        }
        player.pile = [];
        //        player.pile.owner = player.id;
        io.sockets.sockets[playerId].emit('initialCards', player.cards);
    }
};

Room.prototype.isTurnHolder = function (socket) {
    if (!this.turnHolder) {
        return false;
    }
    return socket.id === this.turnHolder.id;
}

Room.prototype.joinPlayer = function (socket, playerName) {
    var newPlayerData = this.updatePlayerInformation(socket, playerName);
    socket.broadcast.to(this.id).emit("playerJoin", [this.playerInfo(newPlayerData)]);
    console.log(socket.id + " joined room '" + this.id + "' as '" + playerName + "', " + this.amountPlayers + " players.");
};

Room.prototype.updatePlayerInformation = function (socket, playerName) {
    var newPlayerData = this.createPlayerData(socket, playerName);
    socket.join(this.id);
    socket.room = this;
    socket.emit("roomJoin", {
        id: this.id,
        count: this.count,
        minPlayers: MIN_PLAYERS,
        maxPlayers: MAX_PLAYERS,
        playerInfo: this.playerInfo()
    });
    this.amountPlayers++;
    return newPlayerData;
}

Room.prototype.createPlayerData = function (socket, playerName) {
    var newPlayerData = {
        id: socket.id,
        playerName: playerName,
        readyForStart: false,
        alive: true,
    };
    this.playerData[socket.id] = newPlayerData;
    return newPlayerData;
}

Room.prototype.leavePlayer = function (socket) {
    if (this.state === ROOM_STATE.LOBBY) {
        delete this.playerData[socket.id];
        this.emit("playerLeave", [socket.id]);
    } else {
        this.playerDeath(this.playerData[socket.id]);
    }
    socket.leave(this.id);
    this.amountPlayers--;

    if (this.amountPlayers <= 0) {
        removeRoom(this.id);
    }

    delete socket.room;
};

Room.prototype.playerReadyForStart = function (socket) {
    var player = this.playerData[socket.id];
    if (player.readyForStart) {
        return;
    }
    player.readyForStart = true;
    var playerId;
    console.log(this.amountPlayers);
    for (playerId in this.playerData) {
        if (this.amountPlayers < MIN_PLAYERS || !this.playerData[playerId].readyForStart) {
            this.emit("playerReadyForStart", socket.id);
            return;
        }
    }
    this.startGame();
};

Room.prototype.sendChatMessage = function (socket, dirtyMessage) {
    var message = sanitizeHtml(dirtyMessage, {
        allowedTags: ['b', 'i', 'em', 'strong']
    });
    if (message.toLowerCase().valueOf() === "ready") {
        this.playerReadyForStart(socket);
        return;
    }
    this.emit("chatMessage", {
        sender: socket.id,
        message: message
    });
}

Room.prototype.isPlaying = function (player) {
    return player.alive && this.winners.indexOf(player.id) === -1 && this.losers.indexOf(player.id) === -1;
}

module.exports = Room;
