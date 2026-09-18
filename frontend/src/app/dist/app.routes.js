"use strict";
exports.__esModule = true;
exports.routes = void 0;
var game_board_1 = require("./game-board/game-board"); // <-- Import your new component
var game_lobby_1 = require("./game-lobby/game-lobby");
var night_phase_1 = require("./night-phase/night-phase");
exports.routes = [
    // Route for the main application (e.g., your current game setup/join screen)
    { path: '', component: game_lobby_1.GameLobby },
    // NEW: Route for the GameLobbyComponent
    { path: 'board', component: game_board_1.GameBoard },
    { path: 'night-phase', component: night_phase_1.NightPhase },
    // Optional: Wildcard route for 404 Not Found
    { path: '**', redirectTo: '' }
];
