"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
exports.__esModule = true;
exports.GameLobby = void 0;
var core_1 = require("@angular/core");
var forms_1 = require("@angular/forms");
var common_1 = require("@angular/common");
var uuid_1 = require("uuid"); // <-- ADD THIS IMPORT
var router_1 = require("@angular/router");
var GameLobby = /** @class */ (function () {
    function GameLobby(http, router, websocketService) {
        this.http = http;
        this.router = router;
        this.websocketService = websocketService;
        this.title = 'Blood on The Clocktower';
        this.backendMessage = '';
        this.roomInput = '';
        this.nameInput = '';
        this.messageInput = '';
        this.chatMessages = [];
        this.gameJoined = false;
        this.currentRoomId = '';
        this.gamePlayers = [];
        this.connectedPlayersCount = 0;
        this.gameState = {};
        this.playerId = '';
        this.seatId = '';
        this.subscriptions = [];
        this.backendApiUrl = '';
        this.socketIoUrl = '';
    }
    GameLobby.prototype.ngOnInit = function () {
        var _this = this;
        // Compute backend URLs dynamically so the app works when machine IP changes.
        // Optional dev override: set window.API_HOST = '192.168.0.59:5000' or full URL 'http://192.168.0.59:5000'
        var override = window.API_HOST;
        if (override) {
            // allow 'host:port' or full URL
            var full = override.includes('://') ? override.replace(/\/+$/, '') : window.location.protocol + "//" + override.replace(/\/+$/, '');
            this.socketIoUrl = full;
            this.backendApiUrl = full + "/api";
        }
        else {
            var protocol = window.location.protocol; // keep http or https
            var host = window.location.hostname;
            var port = 5000; // backend port
            var base = protocol + "//" + host + ":" + port;
            this.socketIoUrl = base;
            this.backendApiUrl = base + "/api";
        }
        console.log('Using backend API URL:', this.backendApiUrl, 'Socket URL:', this.socketIoUrl);
        var storedPlayerId = localStorage.getItem('playerId');
        if (storedPlayerId) {
            this.playerId = storedPlayerId;
            console.log('Loaded Player ID from local storage:', this.playerId);
        }
        this.websocketService.connect();
        // this.http.get<any>(`${this.backendApiUrl}/hello`).subscribe({
        //   next: (response) => {
        //     this.backendMessage = response.message;
        //   },
        //   error: (error) => {
        //     console.error('Error fetching from backend:', error);
        //     this.backendMessage = 'Failed to connect to backend.';
        //   }
        // });
        // this.socket = io(this.socketIoUrl);
        // this.socket.on('connect', () => {
        //   console.log('Connected to Socket.IO server:', this.socket?.id);
        //   if (this.playerId && this.currentRoomId && this.nameInput) {
        //     console.log('Attempting to rejoin game automatically...');
        //     this.socket?.emit('join_game', {
        //       room_id: this.currentRoomId,
        //       seat_number: this.seatId,
        //       player_name: this.nameInput,
        //       player_id: this.playerId
        //     });
        //   }
        // });
        // this.socket.on('disconnect', () => {
        //   console.log('Disconnected from Socket.IO server');
        // });
        // this.socket.on('player_id_assigned', (data: { player_id: string }) => {
        //   this.playerId = data.player_id;
        //   localStorage.setItem('playerId', this.playerId);
        //   console.log('New Player ID assigned and saved:', this.playerId);
        // });
        this.subscriptions.push(this.websocketService.playerIdAssigned$.subscribe(function (data) {
            _this.playerId = data.player_id;
            localStorage.setItem('playerId', _this.playerId);
            console.log('New Player ID assigned and saved:', _this.playerId);
        }));
        this.subscriptions.push(this.websocketService.playerJoined$.subscribe(function (data) {
            console.log('Player joined:', data);
            if (data.room_id === _this.currentRoomId) {
                _this.gamePlayers = data.current_players;
                _this.connectedPlayersCount = data.connected_players_count;
            }
        }));
        // this.socket.on('player_joined', (data: any) => {
        //   console.log('Player joined:', data);
        //   this.chatMessages.push(`${data.name} has joined the room ${data.room_id}`);
        //   if (data.room_id === this.currentRoomId) {
        //      this.gamePlayers = data.current_players;
        //      this.connectedPlayersCount = data.connected_players_count;
        //   }
        // });
        this.subscriptions.push(this.websocketService.playerLeft$.subscribe(function (data) {
            console.log('Player left:', data);
            _this.chatMessages.push(data.name + " has left room " + data.room_id);
            if (data.room_id === _this.currentRoomId) {
                _this.gamePlayers = data.current_players;
                _this.connectedPlayersCount = data.connected_players_count;
            }
        }));
        this.subscriptions.push(this.websocketService.currentGameState$.subscribe(function (data) {
            console.log('Received current game state:', data);
            _this.gameState = data.state;
            _this.gamePlayers = data.players;
            _this.connectedPlayersCount = data.state.players_count;
        }));
        this.subscriptions.push(this.websocketService.error$.subscribe(function (data) {
            console.error('Socket error:', data.message);
            _this.chatMessages.push("Error: " + data.message);
            alert("Error from server: " + data.message);
        }));
        this.subscriptions.push(this.websocketService.charactersAssigned$.subscribe(function (data) {
            console.log('Received Characters:', data);
            var keys = Object.keys(data.players);
            var gamePlayers = [];
            for (var i = 0; i < keys.length; i++) {
                var element = keys[i];
                gamePlayers.push(data.players[element]);
            }
            localStorage.setItem('gamePlayers', JSON.stringify(gamePlayers));
            _this.router.navigate(['/board'], {
                queryParams: { roomId: _this.currentRoomId }
            });
        }));
    };
    GameLobby.prototype.ngOnDestroy = function () {
        var _a;
        (_a = this.socket) === null || _a === void 0 ? void 0 : _a.disconnect();
    };
    GameLobby.prototype.createGame = function () {
        var _this = this;
        if (!this.nameInput) {
            alert('Please enter your name to create a game.');
            return;
        }
        // If no player ID exists, generate one
        if (!this.playerId) {
            this.playerId = localStorage.getItem('playerId') || uuid_1.v4(); // <-- CORRECTED LINE
            localStorage.setItem('playerId', this.playerId);
        }
        // use the computed backendApiUrl
        this.http.post(this.backendApiUrl + "/create_game", { playerName: this.nameInput }).subscribe({
            next: function (response) {
                console.log('Game created (HTTP):', response);
                _this.currentRoomId = response.room_id;
                if (response.player_id) { // Backend can optionally send player_id for creator
                    _this.playerId = response.player_id;
                    localStorage.setItem('playerId', _this.playerId);
                }
                _this.gameJoined = true;
                if (_this.websocketService) {
                    // If player is the Shaman and no seat specified, default to seat 1
                    if (!_this.seatId && _this.nameInput && _this.nameInput.trim().toLowerCase() === 'shaman') {
                        _this.seatId = '1';
                    }
                    _this.websocketService.emit('join_game', {
                        room_id: _this.currentRoomId,
                        seat_id: _this.seatId,
                        player_name: _this.nameInput,
                        player_id: _this.playerId
                    });
                }
            },
            error: function (error) {
                console.error('Error creating game:', error);
                _this.backendMessage = 'Failed to create game.';
                alert('Failed to create game. Check console for details.');
            }
        });
    };
    GameLobby.prototype.joinGame = function () {
        if (!this.nameInput || !this.roomInput) {
            alert('Please enter your name and the room ID to join.');
            return;
        }
        if (!this.websocketService) {
            alert('Socket connection not established. Please refresh or try again.');
            return;
        }
        // If no player ID exists, generate one
        if (!this.playerId) {
            this.playerId = localStorage.getItem('playerId') || uuid_1.v4(); // <-- CORRECTED LINE
            localStorage.setItem('playerId', this.playerId);
        }
        this.currentRoomId = this.roomInput;
        this.gameJoined = true;
        // If player is the Shaman and no seat specified, default to seat 1
        if (!this.seatId && this.nameInput && this.nameInput.trim().toLowerCase() === 'shaman') {
            this.seatId = '1';
        }
        this.websocketService.emit('join_game', {
            room_id: this.currentRoomId,
            seat_id: this.seatId,
            player_name: this.nameInput,
            player_id: this.playerId
        });
        console.log("Attempting to join game " + this.currentRoomId + " via WebSocket...");
    };
    GameLobby.prototype.handleStartGame = function () {
        console.log(this.websocketService, this.gameJoined, this.currentRoomId);
        if (this.websocketService && this.gameJoined && this.currentRoomId) {
            this.websocketService.emit('start_game', { room_id: this.currentRoomId });
            // this.router.navigate(['/board'], {
            //   queryParams: { roomId: this.currentRoomId, sort: 'name' }
            // });
        }
    };
    GameLobby = __decorate([
        core_1.Component({
            selector: 'game-lobby',
            templateUrl: './game-lobby.html',
            styleUrls: ['./game-lobby.scss'],
            standalone: true,
            imports: [
                forms_1.FormsModule,
                common_1.CommonModule,
                router_1.RouterModule
            ]
        })
    ], GameLobby);
    return GameLobby;
}());
exports.GameLobby = GameLobby;
