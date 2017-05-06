var socket = io();

var login = document.getElementById("login");
var playerNameBox = document.getElementById("name");
var container = document.getElementById("container");
//var graphics = document.getElementById("graphics");
var chat = document.getElementById("chat");
var canvas = document.getElementById("canvas");

var room = {};

var graphics;

socket.on('playerJoin', function (players) {
    var playerId;
    for (playerId in players) {
        var player = players[playerId];
        room.playerInfo[playerId] = player;
        console.log(player.playerName + ' joined, ' + amountPlayers() + ' players.');
        createPlayerInList(player, amountPlayers()-1);
    }
});

socket.on('playerLeave', function (players) {
    var playerId;
    for (playerId in players) {
        var player = room.playerInfo[playerId];
        removePlayerInList(player);
        delete room.playerInfo[playerId];
        reorderPlayersInList();
        console.log(player.playerName + ' left, ' + amountPlayers() + ' players.');
    }
});

socket.on('roomJoin', function (roomData) {
    room = roomData;
    room.playing = false;

    location.hash = "#" + room.id;

    buildLobby();
});


socket.on('startGame', function (data) {
    room.playerOrder = data.playerOrder;
    room.baseCard = data.baseCard;
    room.cardsPerPlayer = data.cardsPerPlayer;
    room.pileSize = data.pileSize;

    room.amountPlayers = amountPlayers();

    buildGame();
    initializePiles();
});

socket.on('initialCards', function (cards) {
    room.cards = cards;
    initialCards(cards);
});

socket.on("placeCardRejected", function (data) {
    removePileTopCard(playerInfo[data.pileOwnerId]);
});

socket.on("placeCard", function (data) {
    var pileOwner = this.playerInfo[data.pileOwnerId];
    var pile = pileOwner.pile;
    if (pile.size >= room.pileSize) {
        return;
    }
    var pileLayer = pile[pile.size - 1];
    if (pileLayer.card === data.card && pileLayer.sprite) {
        if (pileLayer.sprite === graphics.unverifiedPileCard) {
            delete graphics.unverifiedPileCard;
        }
        return;
    }
    createPileCard(data.card, pileLayer);
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

function placeCard(card, pileOwnerId) {
    socket.emit("placeCard", {
        card: card,
        pileOwnerId: pileOwnerId
    });
}

window.onload = buildWindow;
window.onresize = function () {};

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

const PLAYER_LIST_WIDTH = 200;

//const PLAYER_LIST_MARGIN_X = 10;
const TITLE_MARGIN_Y = 50;
const PLAYER_LIST_MARGIN_Y = 120;
const PLAYER_LIST_SPACING = 50;

const CENTER_X = 600;

var cardSheet;

var deckSprite, baseCardSprite;
var handCardSprites;

var playerList;

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
        // TODO CHANGE
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

            if (j < 5 && i < 3) {
                createPileCard(2, pile[j]);
            }
        }
    }
}

function buildGame() {
    CENTER_X = 600;
    buildDeck();
    buildBaseCard();
}

function buildDeck() {
    deckSprite = createCardSprite(BACK_CARD_ID, CENTER_X + DECK_X_OFFSET, BASE_AND_DECK_Y, 1);
}

function buildBaseCard() {
    baseCardSprite = createCardSprite(room.baseCard, CENTER_X, BASE_AND_DECK_Y, 1);
}

function buildLobby() {
    login.style.visibility = "hidden";
    container.style.visibility = "visible";
    buildPlayerList();
}

function buildWindow() {
    graphics = new Phaser.Game(PLAYER_LIST_WIDTH + 800, 800, Phaser.AUTO, 'canvas', {
        preload: preload,
        create: create,
        update: update
        /*, render: render*/
    });
}

function buildPlayerList() {
    var renderer = graphics.add.graphics(0, 0);
    renderer.beginFill(0xE5E5E5);
    renderer.drawRect(0, 0, 200, 800);
    renderer.endFill();
    var title = graphics.add.text(PLAYER_LIST_WIDTH / 2, TITLE_MARGIN_Y, "flappen");
    title.anchor.set(0.5, 0.5);
    title.fontSize = 40;
    playerList = {
        renderer: renderer,
        title: title
    };
    var playerId, i = 0;
    console.log(room.playerInfo);
    for (playerId in room.playerInfo) {
        createPlayerInList(room.playerInfo[playerId], i);
        i++;
    }
}

function createPlayerInList(player, index) {
    player.title = graphics.add.text(PLAYER_LIST_WIDTH / 2, PLAYER_LIST_MARGIN_Y + PLAYER_LIST_SPACING * index, player.playerName);
    player.title.anchor.set(0.5, 0.5);
    player.title.fontWeight = player.id === socket.id ? 'bold' : 'normal';
    player.index = index;
}

function positionPlayerInList(player, index) {
    player.title.x = PLAYER_LIST_WIDTH / 2;
    player.title.y = PLAYER_LIST_MARGIN_Y + PLAYER_LIST_SPACING * index;
    player.index = index;
}

function removePlayerInList(player, index) {
    player.title.destroy();
}

function reorderPlayersInList() {
    if (room.playerOrder) {
        var i;
        for (i = 0; i < room.playerOrder.length; i++) {
            var player = room.playerInfo[room.playerOrder[i]];
            positionPlayerInList(player, i);
        }
    } else {
        var playerId, i = 0;
        for (playerId in room.playerInfo) {
            var player = room.playerInfo[playerId];
            positionPlayerInList(player, i);
            i++;
        }
    }
}

function initialCards(cards) {
    handCardSprites = [];
    cardsDealt(cards);
}

// leaving cards to null repositions the cards
function cardsDealt(cards) {
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

function create() {
    graphics.stage.backgroundColor = "#F2F2F2";
    graphics.scale.setShowAll();
    graphics.scale.scaleMode = Phaser.ScaleManager.SHOW_ALL;
    graphics.scale.scaleMode = Phaser.ScaleManager.SHOW_ALL;
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

function removePileTopCard(pileLayer) {
    pileLayer.pile.size--;
    if (pileLayer.sprite) {
        pileLayer.pile.group.remove(pileLayer.sprite);
    }
    delete pileLayer.sprite;
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
        placeCard(sprite.frame, graphics.drag.pileLayer.owner);
        removeHandCard(sprite);
        cardsDealt();
    } else {
        positionAsHandCard(sprite, graphics.drag.startPosition.x, graphics.drag.startPosition.y);
    }
    delete graphics.drag;
}

function spriteScale(scale) {
    return scale * 0.4;
}

Math.radians = function (degrees) {
    return degrees * Math.PI / 180;
};

Math.distanceSqr = function (x1, y1, x2, y2) {
    return Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2);
}

function cardsMatch(card1, card2) {
    if (card1 > 53 || card2 > 53) {
        return false;
    }
    var card1mod = card1 % 4;
    var card2mod = card2 % 4;
    // cards of the same symbol or same number or one is joker
    return card1mod === card2mod || Math.floor(card1 / 4) === Math.floor(card2 / 4) || card1 >= 52 || card2 >= 52;
}
