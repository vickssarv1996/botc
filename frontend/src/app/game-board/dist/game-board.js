"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
exports.__esModule = true;
exports.GameBoard = void 0;
var core_1 = require("@angular/core");
var common_1 = require("@angular/common");
var GameBoard = /** @class */ (function () {
    function GameBoard(route, websocketService, router) {
        this.route = route;
        this.websocketService = websocketService;
        this.router = router;
        this.playerId = '';
        this.gamePlayers = [];
        this.currentRoomId = "";
        this.subscriptions = [];
        this.backendApiUrl = 'http://192.168.0.112:5000/api';
        this.socketIoUrl = 'http://192.168.0.112:5000';
    }
    GameBoard.prototype.ngOnInit = function () {
        var _this = this;
        this.route.queryParamMap.subscribe(function (params) {
            var _a;
            _this.currentRoomId = (_a = params.get('roomId')) !== null && _a !== void 0 ? _a : '';
            console.log(_this.currentRoomId);
        });
        var storedPlayerId = localStorage.getItem('playerId');
        if (storedPlayerId) {
            this.playerId = storedPlayerId;
            console.log('Loaded Player ID from local storage:', this.playerId);
        }
        console.log('inside game board', this.playerId);
        var gPlayer = localStorage.getItem('gamePlayers');
        this.gamePlayers = gPlayer ? JSON.parse(gPlayer) : [];
        console.log(this.gamePlayers);
        this.subscriptions.push(this.websocketService.navigateNight$.subscribe(function (data) {
            _this.router.navigate(['/night-phase'], {
                queryParams: { roomId: _this.currentRoomId }
            });
        }));
    };
    GameBoard.prototype.startNightPhase = function () {
        this.websocketService.emit('navigate_to_night', {
            room_id: this.currentRoomId
        });
    };
    GameBoard = __decorate([
        core_1.Component({
            selector: 'app-game-board',
            imports: [common_1.CommonModule],
            standalone: true,
            templateUrl: './game-board.html',
            styleUrl: './game-board.scss'
        })
    ], GameBoard);
    return GameBoard;
}());
exports.GameBoard = GameBoard;
