import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { io, Socket } from 'socket.io-client';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { v4 as uuidv4 } from 'uuid'; // <-- ADD THIS IMPORT
import { Router, RouterModule } from '@angular/router';
import { WebsocketService } from '../websocket'; // <-- Import your new service
import { Subscription } from 'rxjs';


@Component({
  selector: 'game-lobby',
  templateUrl: './game-lobby.html',
  styleUrls: ['./game-lobby.scss'],
  standalone: true,
  imports: [
    FormsModule,
    CommonModule,
    RouterModule
  ]
})
export class GameLobby implements OnInit, OnDestroy {
  title = 'Blood on The Clocktower';
  backendMessage: string = '';
  socket: Socket | undefined;
  roomInput: string = '';
  nameInput: string = '';
  messageInput: string = '';
  chatMessages: string[] = [];
  gameJoined: boolean = false;
  currentRoomId: string = '';
  gamePlayers: any[] = [];
  connectedPlayersCount: number = 0;
  gameState: any = {};
  playerId: string = '';
  seatId: string = '';
  private subscriptions: Subscription[] = [];

  private backendApiUrl: string = '';
  private socketIoUrl: string = '';

  constructor(private http: HttpClient, private router: Router, private websocketService: WebsocketService) { }

  ngOnInit(): void {
    // Compute backend URLs dynamically so the app works when machine IP changes.
    // Optional dev override: set window.API_HOST = '192.168.0.59:5000' or full URL 'http://192.168.0.59:5000'
    const override = (window as any).API_HOST as string | undefined;
    if (override) {
      // allow 'host:port' or full URL
      const full = override.includes('://') ? override.replace(/\/+$/,'') : `${window.location.protocol}//${override.replace(/\/+$/,'')}`;
      this.socketIoUrl = full;
      this.backendApiUrl = `${full}/api`;
    } else {
      const protocol = window.location.protocol; // keep http or https
      const host = window.location.hostname;
      const port = 5000; // backend port
      const base = `${protocol}//${host}:${port}`;
      this.socketIoUrl = base;
      this.backendApiUrl = `${base}/api`;
    }

    console.log('Using backend API URL:', this.backendApiUrl, 'Socket URL:', this.socketIoUrl);

    const storedPlayerId = localStorage.getItem('playerId');
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

    this.subscriptions.push(this.websocketService.playerIdAssigned$.subscribe(data => {
      this.playerId = data.player_id;
      localStorage.setItem('playerId', this.playerId);
      console.log('New Player ID assigned and saved:', this.playerId);
    }));

    this.subscriptions.push(this.websocketService.playerJoined$.subscribe(data => {
      console.log('Player joined:', data);
      if (data.room_id === this.currentRoomId) {
         this.gamePlayers = data.current_players;
         this.connectedPlayersCount = data.connected_players_count;
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

    this.subscriptions.push(this.websocketService.playerLeft$.subscribe(data => {
      console.log('Player left:', data);
      this.chatMessages.push(`${data.name} has left room ${data.room_id}`);
      if (data.room_id === this.currentRoomId) {
        this.gamePlayers = data.current_players;
        this.connectedPlayersCount = data.connected_players_count;
      }
    }));

    this.subscriptions.push(this.websocketService.currentGameState$.subscribe(data => {
      console.log('Received current game state:', data);
      this.gameState = data.state;
      this.gamePlayers = data.players;
      this.connectedPlayersCount = data.state.players_count;
    }));

    this.subscriptions.push(this.websocketService.error$.subscribe(data => {
      console.error('Socket error:', data.message);
      this.chatMessages.push(`Error: ${data.message}`);
      alert(`Error from server: ${data.message}`);
    }));

    this.subscriptions.push(this.websocketService.charactersAssigned$.subscribe(data => {
      console.log('Received Characters:', data);
      let keys= Object.keys(data.players)
      let gamePlayers = []
      for (let i = 0; i < keys.length; i++) {
        const element = keys[i];
        gamePlayers.push(data.players[element])
      }
      localStorage.setItem('gamePlayers', JSON.stringify(gamePlayers))
      this.router.navigate(['/board'], {
        queryParams: { roomId: this.currentRoomId }
      });
    }));
  }

  ngOnDestroy(): void {
    this.socket?.disconnect();
  }

  createGame(): void {
    if (!this.nameInput) {
      alert('Please enter your name to create a game.');
      return;
    }
    // If no player ID exists, generate one
    if (!this.playerId) {
        this.playerId = localStorage.getItem('playerId') || uuidv4(); // <-- CORRECTED LINE
        localStorage.setItem('playerId', this.playerId);
    }

    // use the computed backendApiUrl
    this.http.post<any>(`${this.backendApiUrl}/create_game`, { playerName: this.nameInput }).subscribe({
      next: (response) => {
        console.log('Game created (HTTP):', response);
        this.currentRoomId = response.room_id;
        if (response.player_id) { // Backend can optionally send player_id for creator
            this.playerId = response.player_id;
            localStorage.setItem('playerId', this.playerId);
        }
        this.gameJoined = true;
        if (this.websocketService) {
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
        }
      },
      error: (error) => {
        console.error('Error creating game:', error);
        this.backendMessage = 'Failed to create game.';
        alert('Failed to create game. Check console for details.');
      }
    });
  }

  joinGame(): void {
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
        this.playerId = localStorage.getItem('playerId') || uuidv4(); // <-- CORRECTED LINE
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
    
    console.log(`Attempting to join game ${this.currentRoomId} via WebSocket...`);
  }

  handleStartGame(): void {
    console.log(this.websocketService, this.gameJoined,  this.currentRoomId);
    if(this.websocketService && this.gameJoined && this.currentRoomId) {
      this.websocketService.emit('start_game',{room_id: this.currentRoomId})
      // this.router.navigate(['/board'], {
      //   queryParams: { roomId: this.currentRoomId, sort: 'name' }
      // });
    }
  }
}