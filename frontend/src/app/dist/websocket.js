"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
exports.__esModule = true;
exports.WebsocketService = void 0;
var core_1 = require("@angular/core");
var socket_io_client_1 = require("socket.io-client");
var rxjs_1 = require("rxjs"); // For reactive event handling
var WebsocketService = /** @class */ (function () {
    function WebsocketService() {
        // Compute socket URL at runtime so it follows the current host/IP or an optional override
        this.socketIoUrl = '';
        this.reconnectAttempts = 5;
        // Subjects to broadcast events to components
        this.playerJoinedSubject = new rxjs_1.Subject();
        this.playerLeftSubject = new rxjs_1.Subject();
        this.receiveMessageSubject = new rxjs_1.Subject();
        this.gameStateUpdateSubject = new rxjs_1.Subject();
        this.currentGameStateSubject = new rxjs_1.Subject();
        this.playerIdAssignedSubject = new rxjs_1.Subject();
        this.errorSubject = new rxjs_1.Subject();
        this.charactersAssignedSubject = new rxjs_1.Subject();
        this.navigateReadySubject = new rxjs_1.Subject();
        this.nightPhaseSubject = new rxjs_1.Subject();
        this.navigateNightSubject = new rxjs_1.Subject();
        // Observables for components to subscribe to
        this.playerJoined$ = this.playerJoinedSubject.asObservable();
        this.playerLeft$ = this.playerLeftSubject.asObservable();
        this.receiveMessage$ = this.receiveMessageSubject.asObservable();
        this.gameStateUpdate$ = this.gameStateUpdateSubject.asObservable();
        this.currentGameState$ = this.currentGameStateSubject.asObservable();
        this.playerIdAssigned$ = this.playerIdAssignedSubject.asObservable();
        this.error$ = this.errorSubject.asObservable();
        this.charactersAssigned$ = this.charactersAssignedSubject.asObservable();
        this.navigateReady$ = this.navigateReadySubject.asObservable();
        this.nightPhase$ = this.nightPhaseSubject.asObservable();
        this.navigateNight$ = this.navigateNightSubject.asObservable();
        // Optional dev override: set window.API_HOST = '192.168.0.59:5000' or full URL 'http://192.168.0.59:5000'
        var override = window.API_HOST;
        if (override) {
            this.socketIoUrl = override.includes('://') ? override.replace(/\/+$/, '') : window.location.protocol + "//" + override.replace(/\/+$/, '');
        }
        else {
            var protocol = window.location.protocol;
            var host = window.location.hostname;
            var port = 5000;
            this.socketIoUrl = protocol + "//" + host + ":" + port;
        }
        console.log('WebsocketService socket URL:', this.socketIoUrl);
    }
    /**
     * Establishes the WebSocket connection if not already connected.
     * Sets up common event listeners.
     */
    WebsocketService.prototype.connect = function () {
        var _this = this;
        if (!this.socket || !this.socket.connected) {
            console.log('Attempting to connect to Socket.IO server at', this.socketIoUrl);
            this.socket = socket_io_client_1.io(this.socketIoUrl, { reconnectionAttempts: this.reconnectAttempts, reconnectionDelay: 1000 });
            // Common event listeners
            this.socket.on('connect', function () {
                var _a;
                console.log('Connected to Socket.IO server:', (_a = _this.socket) === null || _a === void 0 ? void 0 : _a.id);
            });
            this.socket.on('disconnect', function () {
                console.log('Disconnected from Socket.IO server');
            });
            this.socket.on('connect_error', function (err) {
                console.error('Socket connect_error:', err);
            });
            // Route all incoming events to their respective Subjects
            this.socket.on('player_id_assigned', function (data) { return _this.playerIdAssignedSubject.next(data); });
            this.socket.on('player_joined', function (data) { return _this.playerJoinedSubject.next(data); });
            this.socket.on('player_left', function (data) { return _this.playerLeftSubject.next(data); });
            this.socket.on('receive_message', function (data) { return _this.receiveMessageSubject.next(data); });
            this.socket.on('game_state_update', function (data) { return _this.gameStateUpdateSubject.next(data); });
            this.socket.on('current_game_state', function (data) { return _this.currentGameStateSubject.next(data); });
            this.socket.on('error', function (data) { return _this.errorSubject.next(data); });
            this.socket.on('characters_assigned', function (data) { return _this.charactersAssignedSubject.next(data); });
            this.socket.on('navigate_ready', function (data) { return _this.navigateReadySubject.next(data); });
            this.socket.on('start_night_phase', function (data) { return _this.nightPhaseSubject.next(data); });
            this.socket.on('navigate_to_night', function (data) { return _this.navigateNightSubject.next(data); });
        }
        else {
            console.log('Socket already connected:', this.socket.id);
        }
    };
    /**
     * Disconnects the WebSocket connection.
     */
    WebsocketService.prototype.disconnect = function () {
        if (this.socket && this.socket.connected) {
            this.socket.disconnect();
        }
    };
    /**
     * Emits a WebSocket event to the server.
     * @param eventName The name of the event.
     * @param data The data to send with the event.
     */
    WebsocketService.prototype.emit = function (eventName, data) {
        var _this = this;
        if (this.socket && this.socket.connected) {
            this.socket.emit(eventName, data);
        }
        else {
            console.warn("Attempted to emit '" + eventName + "' but socket is not connected. Trying to connect and will emit on connect.");
            // Try to connect and emit once connected
            this.connect();
            // If socket becomes available, emit once on first connect
            var tryEmit = function () {
                if (_this.socket) {
                    _this.socket.once('connect', function () {
                        try {
                            _this.socket.emit(eventName, data);
                        }
                        catch (e) {
                            console.error('Emit after connect failed', e);
                        }
                    });
                }
            };
            // Small delay to allow connect() to set this.socket
            setTimeout(tryEmit, 50);
        }
    };
    /**
     * Get the current socket ID.
     */
    WebsocketService.prototype.getSocketId = function () {
        var _a;
        return (_a = this.socket) === null || _a === void 0 ? void 0 : _a.id;
    };
    /**
     * Check if the socket is currently connected.
     */
    WebsocketService.prototype.isConnected = function () {
        var _a;
        return ((_a = this.socket) === null || _a === void 0 ? void 0 : _a.connected) || false;
    };
    WebsocketService = __decorate([
        core_1.Injectable({
            providedIn: 'root' // Makes this service a singleton available throughout the app
        })
    ], WebsocketService);
    return WebsocketService;
}());
exports.WebsocketService = WebsocketService;
