import { Routes } from '@angular/router';
import { App } from './app'; // Your main app component
import { GameBoard } from './game-board/game-board'; // <-- Import your new component
import { GameLobby } from './game-lobby/game-lobby';
import { NightPhase } from './night-phase/night-phase';

export const routes: Routes = [
  // Route for the main application (e.g., your current game setup/join screen)
  { path: '', component: GameLobby }, // This might be your initial setup

  // NEW: Route for the GameLobbyComponent
  { path: 'board', component: GameBoard },

  {path: 'night-phase', component: NightPhase},

  // Optional: Wildcard route for 404 Not Found
  { path: '**', redirectTo: '' }
];