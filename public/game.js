var ROOM_STATE = {
    LOBBY: 0,
    START_DELAY: 1,
    PLAYING: 2,
    END_DELAY: 3
};


var socket = io();

var intro = document.getElementById("intro");
var playerNameBox = document.getElementById("name");
var game = document.getElementById("game");
var clock = document.getElementById("clockValue");
var messages = document.getElementById("messages");
var chatBox = document.getElementById("chatBox");
var canvas = document.getElementById("canvas");
var playerList = document.getElementById("playerList");

var mainTimer;
var room = {};
var graphics;

socket.on('playerJoin', playerJoin);
socket.on('playerLeave', playerLeave);
socket.on('playerReadyForStart', playerReadyForStart);
socket.on('roomJoin', roomJoin);
socket.on('startGame', startGame);
socket.on('initialCards', initialCards);
socket.on('changeTurn', changeTurn);
socket.on('dealCards', dealCards);
socket.on('placeCardRejected', placeCardRejected);
socket.on('placeCard', placeCard);
socket.on('endGame', endGame);

socket.on('playerLose', playerLose);
socket.on('playerWin', playerWin);
socket.on('playerDeath', playerDeath);

socket.on('chatMessage', chatMessage);

socket.on('disconnect', disconnect);

function playerJoin(players) {
    var i;
    for (i = 0; i < players.length; i++) {
        var player = players[i];
        room.playerInfo[player.id] = player;
        addPlayerToList(player);
        room.amountPlayers++;
        console.log(player.playerName + ' joined, ' + amountPlayers() + ' players.');
    }
}

function playerLeave(playerIds) {
    var i;
    for (i = 0; i < playerIds.length; i++) {
        var playerId = playerIds[i];
        var player = room.playerInfo[playerId];
        removePlayerFromList(player);
        delete room.playerInfo[playerId];
        room.amountPlayers--;
        console.log(player.playerName + ' left, ' + amountPlayers() + ' players.');
    }
}

function playerReadyForStart(playerId) {
    var player = room.playerInfo[playerId];
    if (player.listItem) {
        player.listItem.classList.add("ready");
    }
}

function roomJoin(roomData) {
    room = roomData;
    var mappedPlayerInfo = {};
    var i;
    for (i = 0; i < room.playerInfo.length; i++) {
        var player = room.playerInfo[i];
        mappedPlayerInfo[player.id] = player;

        addPlayerToList(player);
    }
    room.playerInfo = mappedPlayerInfo;
    room.playing = false;
    room.amountPlayers = amountPlayers();
    room.state = ROOM_STATE.LOBBY;

    startClock();

    location.hash = "#" + room.id;

    intro.style.display = "none";
    game.style.visibility = "visible";
}

function endGame(data) {
    resetRoom();
    resetGameGraphics();
    room.state = ROOM_STATE.END_DELAY;
    room.count = data.count;
}

function resetRoom() {
    room = {};
}

function roomLeave() {
    resetRoom();
    resetGameGraphics();
    clearChat();

    stopClock();

    intro.style.display = "block";
    game.style.visibility = "hidden";
}

function startGame(data) {
    var key;
    for (key in data) {
        room[key] = data[key];
    }
    room.amountPlayers = amountPlayers();
    room.state = ROOM_STATE.START_DELAY;

    reorderPlayersInList();

    buildGame();
    initializePiles();
}

function initialCards(cards) {
    room.cards = cards;
    initialCardSprites(cards);
}

function dealCards(cards) {
    dealCardSprites(cards);
}

function placeCardRejected(data) {
    var pile = room.playerInfo[data.pileOwnerId].pile;
    var pileLayer = pile[pile.size - 1];
    dealCards([data.card])
    removeCardSprite(pileLayer);
}

function placeCard(data) {
    console.log(data);
    var pileOwner = room.playerInfo[data.pileOwnerId];
    var pile = pileOwner.pile;
    if (pile.size >= room.pileSize) {
        return;
    }
    var pileLayer = pile[pile.size];
    createPileCard(data.card, pileLayer);
}


function playerDeath(playerId) {
    var player = room.playerInfo[playerId];
    player.listItem.classList.add("dead");

}

function playerLose(playerId) {
    var player = room.playerInfo[playerId];
    player.listItem.classList.add("loser");
    player.listItem.style = "";

}

function playerWin(playerId) {
    var player = room.playerInfo[playerId];
    player.listItem.classList.add("winner");
    player.listItem.style = "";
}

function drawCard() {
    if (!isTurnHolder()) {
        return;
    }
    socket.emit("drawCard");
}

function chatMessage(data) {
    if (!room) {
        return;
    }
    var playerName = room.playerInfo[data.sender].playerName;
    displayChatMessage(playerName + ": " + data.message);
}

function disconnect() {
    roomLeave();
}

function isTurnHolder() {
    if(!room.turnHolder) {
        return false;
    }
    return room.turnHolder.id === socket.id;
}


chatBox.addEventListener("keydown", function (event) {
    if (!room) {
        return;
    }
    if ((event.keyCode || event.which) == 13) {
        socket.emit("chatMessage", chatBox.value);
        chatBox.value = "";
    }
});

function amountPlayers() {
    var i = 0,
        playerId;
    for (playerId in room.playerInfo) {
        i++;
    }
    return i;
}

function requestRoom() {
    // TODO loading when requesting room

    var roomId = "";
    if (location.hash) {
        roomId = location.hash.substring(1);
    }
    socket.emit("requestRoom", {
        playerName: playerNameBox.value,
        roomId: roomId
    });
}

function requestPlaceCard(card, pileOwnerId) {
    if (!isTurnHolder()) {
        return;
    }
    socket.emit("placeCard", {
        card: card,
        pileOwnerId: pileOwnerId
    });
}

function displayChatMessage(message) {
    var entry = document.createElement('li');
    entry.appendChild(document.createTextNode(message));
    messages.append(entry);
}


function changeTurn(data) {
    if (room.turnHolder) {
        resetPlayerTurnHolderStatus(room.turnHolder);
    }
    room.turnHolder = room.playerInfo[data.turnHolderId];
    setPlayerAsTurnHolder(room.turnHolder);

    room.state = ROOM_STATE.PLAYING;
    room.count = data.count;
}

function setPlayerAsTurnHolder(player) {
    player.listItem.classList.add("turnHolder");
}

function resetPlayerTurnHolderStatus(player) {
    player.listItem.classList.remove("turnHolder");
}

function addPlayerToList(player) {
    var listItem = document.createElement('div');
    listItem.className = "player";
    listItem.id = "player:" + player.id;
    var playerIconDiv = document.createElement('div');
    playerIconDiv.className = "playerIcon";
    var playerNameDiv = document.createElement('div');
    playerNameDiv.className = "playerName";
    playerNameDiv.innerHTML = player.playerName;


    if (player.id === socket.id) {
        listItem.classList.add("me");
    }

    if (player.readyForStart) {
        listItem.classList.add("ready");
    }

    listItem.appendChild(playerIconDiv);
    listItem.appendChild(playerNameDiv);
    playerList.appendChild(listItem);

    player.listItem = listItem;
}

function removePlayerFromList(player) {
    if (!player.listItem) {
        return;
    }
    playerList.removeChild(player.listItem);
}

function reorderPlayersInList() {
    if (!room.playerOrder) {
        return;
    }
    var i;
    for (i = 0; i < room.playerOrder.length; i++) {
        var player = room.playerInfo[room.playerOrder[i]];
        if (!player.listItem) {
            return;
        }
        player.listItem.style.order = i;
    }
}


function startClock() {
    mainTimer = setTimeout(timer, 1000);
    if (room && room.count) {
        setClockValue(room.count);
    }
}

function stopClock() {
    setClockValue("");
}

function timer() {
    if (!room || room.count < 0) {
        return;
    }
    if ((room.state !== ROOM_STATE.LOBBY || room.amountPlayers >= room.minPlayers) && --room.count >= 0) {
        setClockValue(room.count);
    }
    setTimeout(timer, 1000);
}

function setClockValue(time) {
    clock.innerHTML = time;
}

window.onload = buildWindow;

const CARD_IMG_WIDTH = 221;
const CARD_IMG_HEIGHT = 300;
const BACK_CARD_ID = 54;
const DECK_X_OFFSET = 100;
const BASE_AND_DECK_Y = 75;
const PILES_BASE_Y = 200;
const PILES_PIVOT_Y = 180;
const PILE_CARD_DISTANCE = 48;
const PILE_CARD_SCALE = 0.92;
const MAX_ANGLE = 35;
const MAX_PLAYERS = 6;
const MIN_PLAYERS = 3;
const HAND_CARD_SCALE = 1.5;
const HAND_CARDS_X_DISTANCE = 95 * HAND_CARD_SCALE;
const HAND_CARDS_Y = 775;
const HAND_CARD_SNAP_DISTANCE_SQR = 50 * 50;
const CENTER_X = 400;

var cardSheet;

var deckSprite, baseCardSprite;
var handCardSprites;

function initializePiles() {
    var maxAngle = MAX_ANGLE * room.amountPlayers / MAX_PLAYERS;
    var startAngle = -maxAngle;
    var angleIncrement = (maxAngle * 2) / (room.amountPlayers - 1);
    if (room.amountPlayers === 1) {
        startAngle = 0;
        angleIncrement = 0;
    }

    var baseY = PILES_BASE_Y - PILES_PIVOT_Y;
    var baseX = CENTER_X;

    var playerId;
    var i;
    for (i = 0; i < room.playerOrder.length; i++) {
        var player = room.playerInfo[room.playerOrder[i]];
        var pile = [];
        pile.size = 0;
        pile.group = graphics.add.group();

        player.pile = pile;

        pile.angle = startAngle + angleIncrement * i;
        pile.angleRadians = Math.radians(pile.angle);
        var cos = Math.cos(pile.angleRadians);
        var sin = Math.sin(pile.angleRadians);

        var j;
        for (j = 0; j < room.pileSize; j++) {
            var hypotenuse = PILES_PIVOT_Y + j * PILE_CARD_DISTANCE;
            var x = baseX + hypotenuse * sin;
            var y = baseY + hypotenuse * cos;

            pile[j] = {
                x: x,
                y: y,
                pile: pile,
                owner: player.id
            };
        }
    }
}

//function buildPlayerList() {
//    var renderer = graphics.add.graphics(0, 0);
//    renderer.beginFill(0xE5E5E5);
//    renderer.drawRect(0, 0, 200, 800);
//    renderer.endFill();
//    var title = graphics.add.text(PLAYER_LIST_WIDTH / 2, TITLE_MARGIN_Y, "flappen");
//    title.anchor.set(0.5, 0.5);
//    title.fontSize = 40;
//    playerList = {
//        renderer: renderer,
//        title: title
//    };
//    var playerId, i = 0;
//    console.log(room.playerInfo);
//    for (playerId in room.playerInfo) {
//        createPlayerInList(room.playerInfo[playerId], i);
//        i++;
//    }
//}

function initialCardSprites(cards) {
    handCardSprites = [];
    dealCards(cards);
}

// leaving cards to null repositions the cards
function dealCardSprites(cards) {
    var cardsLength = cards ? cards.length : 0;
    var newAmountCards = handCardSprites.length + cardsLength;
    if (newAmountCards === 0) {
        return;
    }
    var width = (newAmountCards - 1) * HAND_CARDS_X_DISTANCE;
    var startX = CENTER_X - width / 2;
    var totalIndex = 0;
    var i;
    for (i = 0; i < handCardSprites.length; i++) {
        var sprite = handCardSprites[i];
        sprite.x = startX + HAND_CARDS_X_DISTANCE * totalIndex;
        sprite.y = HAND_CARDS_Y;
        totalIndex++;
    }
    for (i = 0; i < cardsLength; i++) {
        var card = cards[i];
        var sprite = createCardSprite(card, startX + HAND_CARDS_X_DISTANCE * totalIndex, HAND_CARDS_Y, HAND_CARD_SCALE);

        sprite.inputEnabled = true;
        sprite.events.onInputDown.add(startDragging, this);
        sprite.events.onInputUp.add(stopDragging, this);

        handCardSprites.push(sprite);
        totalIndex++;
    }
}

WebFontConfig = {

    //  'active' means all requested fonts have finished loading
    //  We set a 1 second delay before calling 'createText'.
    //  For some reason if we don't the browser cannot render the text the first time it's created.
    //    active: function() { graphics.time.events.add(Phaser.Timer.SECOND, buildPlayerList, this); },
    //    active: function () {
    //        buildPlayerList()
    //    },

    //  The Google Fonts we want to load (specify as many as you like in the array)
    google: {
        families: ['Oswald']
    }

};

function preload() {
    graphics.load.spritesheet('cards', '/img/cards.png', 221, 300, 56, 1, 2);
    graphics.load.script('webfont', '//ajax.googleapis.com/ajax/libs/webfont/1.4.7/webfont.js');
}

function buildGame() {
    buildDeck();
    buildBaseCard();
}

function buildDeck() {
    deckSprite = createCardSprite(BACK_CARD_ID, CENTER_X + DECK_X_OFFSET, BASE_AND_DECK_Y, 1);
    deckSprite.inputEnabled = true;
    deckSprite.events.onInputDown.add(drawCard);
}

function buildBaseCard() {
    baseCardSprite = createCardSprite(room.baseCard, CENTER_X, BASE_AND_DECK_Y, 1);
}

function buildWindow() {
    // TODO change spritesheet so render mode doesn't have to be CANVAS to work properly on all computers
    graphics = new Phaser.Game(canvas.clientWidth, canvas.clientHeight, Phaser.CANVAS, 'canvas', {
        preload: preload,
        create: create,
        update: update
        /*, render: render*/
    });
}

function create() {
    graphics.stage.backgroundColor = "#F2F2F2";
    graphics.scale.setShowAll();
    graphics.scale.scaleMode = Phaser.ScaleManager.SHOW_ALL;
    graphics.scale.setGameSize(800, 800);
}


function createCardSprite(card, x, y, scale, group) {
    var sprite = graphics.add.sprite(x, y, 'cards', card);
    if (group) {
        group.add(sprite);
    }
    sprite.anchor.set(0.5, 0.5);
    sprite.width = 88.4;
    sprite.height = 120;
    sprite.scale.setTo(scale ? spriteScale(scale) : spriteScale(1));
    return sprite;
}

function createPileCard(card, pileLayer) {
    var sprite = createCardSprite(card, pileLayer.x, pileLayer.y, PILE_CARD_SCALE, pileLayer.pile.group);
    pileLayer.card = card;
    pileLayer.sprite = sprite;

    positionAsPileCard(sprite, pileLayer);

    pileLayer.pile.group.add(sprite);
    pileLayer.pile.size++;

    return sprite;
}

function removeCardSprite(pileLayer) {
    pileLayer.pile.size--;
    if (pileLayer.sprite) {
        //        pileLayer.pile.group.remove(pileLayer.sprite);
        pileLayer.sprite.destroy();
    }
    delete pileLayer.card;
    delete pileLayer.sprite;
}

function positionAsPileCard(sprite, pileLayer) {
    sprite.x = pileLayer.x;
    sprite.y = pileLayer.y;
    sprite.anchor.set(0.5, 0);
    sprite.scale.setTo(spriteScale(PILE_CARD_SCALE));
    sprite.angle = -pileLayer.pile.angle;
}

function positionAsHandCard(sprite, x, y) {
    sprite.x = x;
    sprite.y = y;
    sprite.anchor.set(0.5, 0.5);
    sprite.scale.setTo(spriteScale(HAND_CARD_SCALE));
    sprite.angle = 0;
}

function removeHandCard(sprite) {
    handCardSprites.splice(handCardSprites.indexOf(sprite), 1);
    sprite.destroy();
}


function update() {
    if (graphics.drag) {
        snapDrag();
    }
}

function snapDrag() {
    var sprite = graphics.drag.sprite;
    sprite.x = graphics.drag.startPosition.x + graphics.drag.pointer.worldX - graphics.drag.pointerStartPosition.x;
    sprite.y = graphics.drag.startPosition.y + graphics.drag.pointer.worldY - graphics.drag.pointerStartPosition.y;
    if (graphics.drag.pileLayer && Math.distanceSqr(sprite.x, sprite.y, graphics.drag.pileLayer.x, graphics.drag.pileLayer.y) <= HAND_CARD_SNAP_DISTANCE_SQR) {
        return true;
    }

    if (graphics.drag.pileLayer) {
        removePileTopCard(graphics.drag.pileLayer);
        sprite.visible = true;
        delete graphics.drag.pileLayer;
    } else {
        var pileOwnerId;
        for (pileOwnerId in room.playerInfo) {
            var pile = room.playerInfo[pileOwnerId].pile;
            if (pile.size === room.pileSize) {
                continue;
            }
            var pileLayer = pile[pile.size];
            var parentCard = pile.size === 0 ? room.baseCard : pile[pile.size - 1].card;
            if (!cardsMatch(parentCard, sprite.frame)) {
                continue;
            }

            if (Math.distanceSqr(sprite.x, sprite.y, pileLayer.x, pileLayer.y) <= HAND_CARD_SNAP_DISTANCE_SQR) {
                createPileCard(sprite.frame, pileLayer);
                sprite.visible = false;
                graphics.drag.pileLayer = pileLayer;
                return true;
            }
        }
    }
    return false;
}

function startDragging(sprite, pointer) {
    graphics.world.bringToTop(sprite);
    graphics.drag = {
        sprite: sprite,
        pointer: pointer,
        startPosition: {
            x: sprite.x,
            y: sprite.y
        },
        pointerStartPosition: {
            x: pointer.worldX,
            y: pointer.worldY
        }
    };
}

function stopDragging(sprite, pointer) {
    if (!graphics.drag) {
        return;
    }
    if (graphics.drag.pileLayer) {
        requestPlaceCard(sprite.frame, graphics.drag.pileLayer.owner);
        removeHandCard(sprite);
        dealCardSprites();
    } else {
        positionAsHandCard(sprite, graphics.drag.startPosition.x, graphics.drag.startPosition.y);
    }
    delete graphics.drag;
}

function clearChat() {
    while (chatBox.firstChild) {
        chatBox.removeChild(chatBox.firstChild);
    }
}

function resetGameGraphics() {
    resetPlayerList();
    resetWorld();
}

function resetPlayerList() {
    while (playerList.firstChild) {
        playerList.removeChild(playerList.firstChild);
    }
}

function resetWorld() {
    graphics.world.removeAll();
}

function spriteScale(scale) {
    return scale * 0.4;
}

function cardsMatch(card1, card2) {
    if (card1 > 53 || card2 > 53) {
        return false;
    }
    var card1mod = card1 % 4;
    var card2mod = card2 % 4;
    // cards of the same symbol or same number or
    return card1mod === card2mod || Math.floor(card1 / 4) === Math.floor(card2 / 4) || card1 >= 52 || card2 >= 52;
};

Math.radians = function (degrees) {
    return degrees * Math.PI / 180;
};

Math.distanceSqr = function (x1, y1, x2, y2) {
    return Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2);
}
