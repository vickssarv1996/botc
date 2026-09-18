import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable, Subject } from 'rxjs'; // For reactive event handling

@Injectable({
  providedIn: 'root' // Makes this service a singleton available throughout the app
})
export class WebsocketService {
  private socket: Socket | undefined;
  // Compute socket URL at runtime so it follows the current host/IP or an optional override
  private socketIoUrl: string = '';
  private reconnectAttempts = 5;

  // Subjects to broadcast events to components
  private playerJoinedSubject = new Subject<any>();
  private playerLeftSubject = new Subject<any>();
  private receiveMessageSubject = new Subject<any>();
  private gameStateUpdateSubject = new Subject<any>();
  private currentGameStateSubject = new Subject<any>();
  private playerIdAssignedSubject = new Subject<any>();
  private errorSubject = new Subject<any>();
  private charactersAssignedSubject = new Subject<any>();
  private navigateReadySubject = new Subject<any>();
  private nightPhaseSubject = new Subject<any>();
  private navigateNightSubject = new Subject<any>();

  // Observables for components to subscribe to
  playerJoined$ = this.playerJoinedSubject.asObservable();
  playerLeft$ = this.playerLeftSubject.asObservable();
  receiveMessage$ = this.receiveMessageSubject.asObservable();
  gameStateUpdate$ = this.gameStateUpdateSubject.asObservable();
  currentGameState$ = this.currentGameStateSubject.asObservable();
  playerIdAssigned$ = this.playerIdAssignedSubject.asObservable();
  error$ = this.errorSubject.asObservable();
  charactersAssigned$ = this.charactersAssignedSubject.asObservable();
  navigateReady$ = this.navigateReadySubject.asObservable();
  nightPhase$ = this.nightPhaseSubject.asObservable();
  navigateNight$ = this.navigateNightSubject.asObservable();

  constructor() {
    // Optional dev override: set window.API_HOST = '192.168.0.59:5000' or full URL 'http://192.168.0.59:5000'
    const override = (window as any).API_HOST as string | undefined;
    if (override) {
      this.socketIoUrl = override.includes('://') ? override.replace(/\/+$/, '') : `${window.location.protocol}//${override.replace(/\/+$/,'')}`;
    } else {
      const protocol = window.location.protocol;
      const host = window.location.hostname;
      const port = 5000;
      this.socketIoUrl = `${protocol}//${host}:${port}`;
    }
    console.log('WebsocketService socket URL:', this.socketIoUrl);
  }

  /**
   * Establishes the WebSocket connection if not already connected.
   * Sets up common event listeners.
   */
  public connect(): void {
    if (!this.socket || !this.socket.connected) {
      console.log('Attempting to connect to Socket.IO server at', this.socketIoUrl);
      this.socket = io(this.socketIoUrl, { reconnectionAttempts: this.reconnectAttempts, reconnectionDelay: 1000 });

      // Common event listeners
      this.socket.on('connect', () => {
        console.log('Connected to Socket.IO server:', this.socket?.id);
      });

      this.socket.on('disconnect', () => {
        console.log('Disconnected from Socket.IO server');
      });

      this.socket.on('connect_error', (err: any) => {
        console.error('Socket connect_error:', err);
      });


      // Route all incoming events to their respective Subjects
      this.socket.on('player_id_assigned', (data: any) => this.playerIdAssignedSubject.next(data));
      this.socket.on('player_joined', (data: any) => this.playerJoinedSubject.next(data));
      this.socket.on('player_left', (data: any) => this.playerLeftSubject.next(data));
      this.socket.on('receive_message', (data: any) => this.receiveMessageSubject.next(data));
      this.socket.on('game_state_update', (data: any) => this.gameStateUpdateSubject.next(data));
      this.socket.on('current_game_state', (data: any) => this.currentGameStateSubject.next(data));
      this.socket.on('error', (data: any) => this.errorSubject.next(data));
      this.socket.on('characters_assigned', (data: any) => this.charactersAssignedSubject.next(data));
      this.socket.on('navigate_ready',(data:any) => this.navigateReadySubject.next(data));
      this.socket.on('start_night_phase',(data:any) => this.nightPhaseSubject.next(data));
      this.socket.on('navigate_to_night',(data:any) => this.navigateNightSubject.next(data));
    } else {
        console.log('Socket already connected:', this.socket.id);
    }
  }

  /**
   * Disconnects the WebSocket connection.
   */
  public disconnect(): void {
    if (this.socket && this.socket.connected) {
      this.socket.disconnect();
    }
  }

  /**
   * Emits a WebSocket event to the server.
   * @param eventName The name of the event.
   * @param data The data to send with the event.
   */
  public emit(eventName: string, data: any): void {
    if (this.socket && this.socket.connected) {
      this.socket.emit(eventName, data);
    } else {
      console.warn(`Attempted to emit '${eventName}' but socket is not connected. Trying to connect and will emit on connect.`);
      // Try to connect and emit once connected
      this.connect();
      // If socket becomes available, emit once on first connect
      const tryEmit = () => {
        if (this.socket) {
          this.socket.once('connect', () => {
            try { this.socket!.emit(eventName, data); } catch (e) { console.error('Emit after connect failed', e); }
          });
        }
      };
      // Small delay to allow connect() to set this.socket
      setTimeout(tryEmit, 50);
    }
  }

  /**
   * Get the current socket ID.
   */
  public getSocketId(): string | undefined {
    return this.socket?.id;
  }

  /**
   * Check if the socket is currently connected.
   */
  public isConnected(): boolean {
    return this.socket?.connected || false;
  }
}