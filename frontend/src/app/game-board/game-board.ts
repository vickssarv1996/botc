import { Component } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { WebsocketService } from '../websocket'; // <-- Import your new service
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-game-board',
  imports: [CommonModule],
  standalone: true,
  templateUrl: './game-board.html',
  styleUrl: './game-board.scss'
})
export class GameBoard {
  playerId: string = '';
  socket: Socket | undefined;
  gamePlayers: any = [];
  currentRoomId: string = "";
  private subscriptions: Subscription[] = [];
  private backendApiUrl = 'http://192.168.0.112:5000/api';
  private socketIoUrl = 'http://192.168.0.112:5000';
  constructor(private route: ActivatedRoute, private websocketService: WebsocketService, private router: Router) { }


  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params: ParamMap) => {
      this.currentRoomId = params.get('roomId') ?? '';
      console.log(this.currentRoomId);
    })
    const storedPlayerId = localStorage.getItem('playerId');
    if (storedPlayerId) {
      this.playerId = storedPlayerId;
      console.log('Loaded Player ID from local storage:', this.playerId);
    }
    console.log('inside game board', this.playerId);
    let gPlayer = localStorage.getItem('gamePlayers')
    this.gamePlayers = gPlayer ? JSON.parse(gPlayer) : []
    console.log(this.gamePlayers);
    this.subscriptions.push(this.websocketService.navigateNight$.subscribe(data => {
      this.router.navigate(['/night-phase'], {
        queryParams: { roomId: this.currentRoomId }
      })      
    }));
  }

  startNightPhase() {
    this.websocketService.emit('navigate_to_night', {
      room_id: this.currentRoomId
    });
  }
}
