import { Component } from '@angular/core';
import { WebsocketService } from '../websocket';
import { ActivatedRoute, ParamMap, Router, RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-night-phase',
  imports: [ CommonModule,
    RouterModule],
  templateUrl: './night-phase.html',
  styleUrl: './night-phase.scss'
})
export class NightPhase {
  private subscriptions: Subscription[] = [];
  currentRoomId: string = "";
  playerId: string = "";
  nightOrderPlayerId: string = "";
  nightInfo: any;
  showFtCloseButton: boolean = false;

  constructor(private route: ActivatedRoute, private router: Router, private websocketService: WebsocketService) { }

  ngOnInit() {
    this.route.queryParamMap.subscribe((params: ParamMap) => {
      this.currentRoomId = params.get('roomId') ?? '';
      console.log(this.currentRoomId);
    })
    this.websocketService.connect();
    let player = localStorage.getItem('playerId')
    this.playerId = player ? player : "";
    this.subscriptions.push(this.websocketService.nightPhase$.subscribe(data => {
      this.nightOrderPlayerId = data.player_id;
      this.nightInfo = data;
      // Reset FT Close Eyes button whenever a new wake is received
      this.showFtCloseButton = false;
      if(this.playerId == this.nightOrderPlayerId){
        this.vibratePhone();
      }
    }));
    this.websocketService.emit('night_phase', {
      room_id: this.currentRoomId,
    });
  }

  closeEyes(){
    this.nightOrderPlayerId=""
    this.websocketService.emit('night_phase_ready', {
      room_id: this.currentRoomId,
      index: this.nightInfo['index']
    });
  }

  vibratePhone(pattern: VibratePattern = 500): void {
    // Compute total duration (ms) from VibratePattern
    let duration = 500;
    if (typeof pattern === 'number') {
      duration = pattern;
    } else if (Array.isArray(pattern)) {
      duration = pattern.reduce((a, b) => a + b, 0);
    }

    const AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (AudioContext) {
      try {
        const ctx = new AudioContext();
        // Some browsers require resume() after user gesture; attempt resume silently
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.value = 880; // frequency in Hz (adjust if desired)
        gain.gain.value = 0.12; // volume

        osc.connect(gain);
        gain.connect(ctx.destination);

        const now = ctx.currentTime;
        osc.start(now);
        osc.stop(now + duration / 1000);

        // Close audio context shortly after stop to free resources
        setTimeout(() => {
          try { ctx.close(); } catch (e) { /* ignore */ }
        }, duration + 100);

        return;
      } catch (e) {
        console.warn('Audio beep failed, falling back to vibration.', e);
      }
    }

    // Fallback to vibration API if audio isn't available
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern);
    } else {
      console.warn('Beep and Vibration APIs are not supported in this browser.');
    }
  }

  ftpick() {
    // Only act when the current wake is the fortune_teller and it's this player's turn
    if (this.nightInfo && this.nightInfo['info'] === 'fortune_teller' && this.nightOrderPlayerId === this.playerId) {
      try {
        const checkedEls = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="fortune_teller_pick"]:checked'));

        // Require exactly two picks
        if (checkedEls.length !== 2) {
          alert('Please select exactly 2 players.');
          return; // do not advance night
        }

        const picks = checkedEls.map(e => e.value);
        const redHerringRole = this.nightInfo['red_herring'];
        const recluseRegistering = !!this.nightInfo['recluse_registering_as_demon'];

        let demonFound = false;
        if (this.nightInfo['players']) {
          for (const pid of picks) {
            const p = this.nightInfo['players'][pid];
            if (!p || !p['role_details']) continue;
            const name = p['role_details']['name'];
            const type = p['role_details']['type'];

            // Perceived demon if actual demon, or matches red herring, or recluse registers as demon
            if (type === 'demon' || name === redHerringRole || (recluseRegistering && name === 'recluse')) {
              demonFound = true;
              break;
            }
          }
        }

        alert(demonFound ? 'Demon found among picks.' : 'No Demon among your picks.');
        // Show Close Eyes button for the fortune teller so they can proceed when ready
        this.showFtCloseButton = true;
        return; // do not auto-advance; wait for user to press Close Eyes

      } catch (e) {
        console.warn('Could not determine fortune teller picks', e);
        alert('Could not read your selections. Please try again.');
        return;
      }
    }

    // For fortune-teller we don't auto-advance here; closeEyes() will emit when pressed.
  }

}
