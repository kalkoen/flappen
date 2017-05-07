const gameloop = require('node-gameloop');
const generateName = require('sillyname');
const shuffleArray = require("knuth-shuffle").knuthShuffle;

var express = require('express');
var app = express();
var http = require('http').Server(app);
var path = require('path');

global.io = require('socket.io')(http);

var Room = require('./room.js');

app.use(express.static(path.join(__dirname, 'public')));

var rooms = {};

global.MIN_PLAYERS = 3;
global.MAX_PLAYERS = 6;
global.GAME_COUNTDOWN = 30;
global.FIRST_TURN_COUNTDOWN = 5;
global.TURN_DURATION = 30;
global.ROOM_NAME_LENGTH = 5;
global.START_CARDS_PER_PLAYER = 3;
global.MAX_CARDS_PER_PLAYER = 4;
global.PILE_SIZE = 7;
global.MAX_ROOMS = 200;

io.on('connection', function (socket) {
    console.log('client with id ' + socket.id + ' connected from ' + socket.conn.remoteAddress);

    socket.on('requestRoom', function (data) {
        if(socket.room) {
            return;
        }
        console.log(socket.conn.remoteAddress + " requests room '" + data.roomId + "' and player name '" + data.playerName + "'");
        if (!data.playerName) {
            data.playerName = generateName().split(" ")[0];
        }
        var room = findPlayableRoom(data.roomId);
        room.joinPlayer(socket, data.playerName);
    });

    socket.on("drawCard", function() {
        if(socket.room && socket.room.isTurnHolder(socket)) {
            socket.room.drawCard();
        }
    });

    socket.on("placeCard", function(data) {
        if(socket.room && socket.room.isTurnHolder(socket) && data.card && data.pileOwnerId) {
            socket.room.placeCard(data.card, data.pileOwnerId);
        }
    });

    socket.on("endTurn", function() {
        if(socket.room && socket.room.isTurnHolder(socket)) {
            socket.room.endTurn();
        }
    });

    socket.on('readyForStart', function () {
        if (socket.room) {
            socket.room.playerReadyForStart(socket);
        }
    });

    socket.on('disconnect', function () {
        console.log("client with id " + socket.id + " disconnected");
        if (socket.room) {
            socket.room.leavePlayer(socket);
        }
    });
});

function resetRoom(roomId) {
    var room = rooms[roomId];
    var newRoom = new Room(roomId)
    rooms[roomId] = newRoom;

    if (room) {
        room.emit("endGame", room.rankList());
        var playerId;
        for(playerId in room.playerData) {
            var socket = io.sockets.sockets[playerId];
            newRoom.createPlayerData(socket, room.playerData[playerId].playerName);
            socket.room = newRoom;
        }
    }
    delete room;
}

function findPlayableRoom(roomId) {
    if (roomId) {
        roomId = roomId.substring(0, ROOM_NAME_LENGTH);
        var room = rooms[roomId];
        if (room) {
            if(room.isJoinable()) {
                return room;
            } else {
                return createNewRoom();
            }
        } else {
            return createNewRoom(roomId);
        }
    } else {
        var roomId, bestRoom;
        for (roomId in rooms) {
            var room = rooms[roomId];
            if(room.playing) {
                continue;
            }
            if (room.amountSockets().length == MAX_PLAYERS - 1) {
                return room;
            }
            if (!bestRoom || (room.amountPlayers().length > bestRoom.amountPlayers() && room.players().length < MAX_PLAYERS)) {
                bestRoom = room;
            }
        }
        return bestRoom || createNewRoom();
    }
}

function createNewRoom(roomId) {
    if(amountRooms() >= MAX_ROOMS) {
        return;
    }
    if (!roomId) {
        do {
            roomId = (Math.random().toString(36) + '00000000000000000').slice(2, ROOM_NAME_LENGTH + 2);
        } while (rooms[roomId]);
    }
    var room = new Room(roomId);
    rooms[roomId] = room;
    return room;
}

global.amountRooms = function() {
    var i = 0, roomId;
    for(roomId in rooms) {
        i++;
    }
    return i;
}

global.randomDeck = function() {
    var cards = [];
    var i;
    for (i = 0; i < 54; i++) {
        cards[i] = i;
    }
    shuffleArray(cards);
    return cards;
}

global.cardsMatch = function(card1, card2) {
    if (card1 > 53 || card2 > 53) {
        return false;
    }
    var card1mod = card1 % 4;
    var card2mod = card2 % 4;
    // cards of the same symbol or same number or
    return card1mod === card2mod || Math.floor(card1 / 4) === Math.floor(card2 / 4) || card1 >= 52 || card2 >= 52;
}

global.isCardBlack = function(card) {
    var type = card % 13;
    return type >= 2;
}

const loop = gameloop.setGameLoop(function (delta) {
    var roomId;
    for (roomId in rooms) {
        var room = rooms[roomId];
        if (!room.playing) {
            if (room.amountSockets() > MIN_PLAYERS && --room.count <= 0) {
                room.startGame();
            }
        } else if (--room.count <= 0) {
            room.nextTurn();
        }
    }
}, 1000);

http.listen(3000, function () {
    console.log("listening on *:3000");
});


/*
    Card order:
    clubs A
    diamonds A
    hearts A
    spades A
    clubs 2
    diamonds 2
    hearts 2
    spades 2
    clubs 3
    diamonds 3
    hearts 3
    spades 3
    ...
    clubs jack
    diamonds jack
    hearts jack
    spades jack
    ...
    black joker
    red joker
*/
