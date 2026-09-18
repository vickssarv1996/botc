"""
Simple Python simulator for multiple Socket.IO clients to exercise the backend.
Usage:
  python simulate_players.py [HOST] [ROOM] [COUNT]
Examples:
  python simulate_players.py http://192.168.0.59:5000 1234 5
  python simulate_players.py           # defaults to http://localhost:5000, room 1234, 3 bots

Requires: python-socketio (client)
  python -m pip install "python-socketio[client]"

Behavior:
- Each bot connects, emits 'join_game' with a generated player_id and name.
- Logs incoming events (player_joined, current_game_state, start_night_phase).
- On 'start_night_phase' the bot will wait 1-3s and emit 'night_phase_ready'.
- Runs until Ctrl+C, then disconnects bots.
"""

import sys
import time
import random
import uuid
import signal
from threading import Thread
from queue import Queue, Empty
from threading import Event

import socketio

HOST = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:5000'
ROOM = sys.argv[2] if len(sys.argv) > 2 else '1234'
COUNT = int(sys.argv[3]) if len(sys.argv) > 3 else 3

clients = []
stop_flag = False

# Global mapping of player_id -> name (kept up-to-date from current_game_state)
player_map = {}
# Last characters_assigned payload received from server (the "grim")
last_characters_assigned = None
# Queue of pending targeted responses (bot, data, Event)
pending_queue = Queue()


class BotClient:
    def __init__(self, index: int, host: str, room: str):
        self.index = index
        self.name = f"Bot-{index}"
        self.player_id = str(uuid.uuid4())
        self.host = host
        self.room = room
        self.sio = socketio.Client(logger=False, reconnection=True)

        @self.sio.event
        def connect():
            print(f"{self.name} connected -> {self.sio.sid}")
            # Register our own player_id -> name for easier lookup
            player_map[self.player_id] = self.name
            # Start seat numbering at 2 for simulated players
            self.sio.emit('join_game', {
                'room_id': self.room,
                'seat_id': self.index + 1,
                'player_name': self.name,
                'player_id': self.player_id
            })

        @self.sio.event
        def disconnect():
            print(f"{self.name} disconnected")

        @self.sio.on('player_joined')
        def on_player_joined(data):
            print(f"{self.name} received player_joined for room {data.get('room_id')}")

        @self.sio.on('current_game_state')
        def on_current_game_state(data):
            players = data.get('players')
            print(f"{self.name} current_game_state players={len(players) if players else 0}")
            # update global player map
            if isinstance(players, list):
                for p in players:
                    pid = p.get('player_id') or p.get('player_id')
                    name = p.get('name')
                    if pid and name:
                        player_map[pid] = name

        @self.sio.on('start_night_phase')
        def on_start_night_phase(data):
            # Print raw event for visibility with a clear separator
            print('\n' + '='*60, flush=True)
            print(f"{self.name} start_night_phase event received at {time.strftime('%H:%M:%S')}:", flush=True)
            print(data, flush=True)

            # If the payload is a dict, check whether this bot is the intended target
            target_pid = None
            if isinstance(data, dict):
                target_pid = data.get('player_id')

            # Resolve target name for better visibility (even if mapping isn't complete)
            target_name = None
            if target_pid:
                target_name = player_map.get(target_pid) or f"(unknown:{target_pid})"
                print(f"Intended target player_id={target_pid} name={target_name}", flush=True)

            # If this bot is the target, print the server-provided info clearly and respond
            if target_pid == self.player_id:
                info = data.get('info')
                # If poisoner, auto-select a victim (so server receives a choice)
                if info == 'poisoner':
                    players_dict = data.get('players') if isinstance(data.get('players'), dict) else {}
                    candidate_pids = [pid for pid in players_dict.keys() if pid != self.player_id]
                    chosen_victim = None
                    if candidate_pids:
                        chosen_victim = random.choice(candidate_pids)
                        # Record into payload for display
                        data['_sim_selected_target'] = chosen_victim
                        # Emit a dedicated event so server can be aware (server may ignore if not implemented)
                        try:
                            self.sio.emit('poisoner_choice', {'room_id': self.room, 'by': self.player_id, 'target_id': chosen_victim})
                            print(f"{self.name} auto-selected poison target: {player_map.get(chosen_victim, chosen_victim)}", flush=True)
                        except Exception:
                            pass

                print('-'*60, flush=True)
                print(f"{self.name} --> TARGETED ({info}) for player_id={target_pid} name={target_name}", flush=True)

                # If simulator selected a target earlier, show it
                if data.get('_sim_selected_target'):
                    sel = data.get('_sim_selected_target')
                    print(f"  selected_target: {sel} ({player_map.get(sel)})", flush=True)
                # Print common payload keys that the server may send (role, player1, player2, bluffs, evil_pairs, evil_neighbors)
                if 'role' in data:
                    print(f"  role: {data.get('role')}", flush=True)
                if 'player1' in data or 'player2' in data:
                    print(f"  players: {data.get('player1')} , {data.get('player2')}", flush=True)
                if 'bluffs' in data:
                    print(f"  bluffs: {data.get('bluffs')}", flush=True)
                if 'evil_pairs' in data:
                    print(f"  evil_pairs: {data.get('evil_pairs')}", flush=True)
                if 'evil_neighbors' in data:
                    print(f"  evil_neighbors: {data.get('evil_neighbors')}", flush=True)
                print('-'*60, flush=True)

                # Instead of auto-responding immediately, add to pending queue and wait for user approval
                ev = Event()
                pending_queue.put((self, data, ev))
                print(f"{self.name} queued for manual approval. Use the terminal to advance.", flush=True)
                ev.wait()  # blocked until main thread allows

                # After approval, emit night_phase_ready
                try:
                    # Ensure index is numeric; server may not include it in some role emits
                    idx = None
                    if isinstance(data, dict):
                        idx = data.get('index')
                    if idx is None:
                        idx = 0
                    self.sio.emit('night_phase_ready', {'room_id': self.room, 'index': idx})
                    print(f"{self.name} emitted night_phase_ready index={idx} (after manual approval)", flush=True)
                except Exception as e:
                    print(f"{self.name} failed to emit night_phase_ready: {e}", flush=True)
            else:
                # Not targeted to this bot; print a compact notice
                print(f"{self.name} not targeted (player_id={target_pid}), ignoring.", flush=True)
            print('='*60 + '\n', flush=True)

        @self.sio.on('player_id_assigned')
        def on_player_id_assigned(data):
            assigned = data.get('player_id') if isinstance(data, dict) else None
            if assigned:
                old = self.player_id
                self.player_id = assigned
                # update global mapping
                player_map[self.player_id] = self.name
                if old in player_map and old != self.player_id:
                    try:
                        del player_map[old]
                    except KeyError:
                        pass
                print(f"{self.name} received server-assigned player_id: {self.player_id}", flush=True)

        @self.sio.on('characters_assigned')
        def on_characters_assigned(data):
            # Record the latest characters_assigned (grim) so the main loop can print it after approvals
            nonlocal_ref = globals()
            try:
                # update global variable and player_map for easier name lookup
                players_payload = data.get('players') if isinstance(data, dict) else None
                if players_payload:
                    globals()['last_characters_assigned'] = players_payload
                    # also update player_map if payload is dict of player_id -> player
                    if isinstance(players_payload, dict):
                        for pid, pd in players_payload.items():
                            name = pd.get('name') if isinstance(pd, dict) else None
                            if name:
                                player_map[pid] = name
            except Exception:
                pass

    def connect(self):
        try:
            self.sio.connect(self.host, wait=True)
        except Exception as e:
            print(f"{self.name} connect error: {e}")

    def disconnect(self):
        try:
            self.sio.disconnect()
        except Exception:
            pass


def run_bots(host: str, room: str, count: int):
    global clients
    clients = [BotClient(i + 1, host, room) for i in range(count)]
    for c in clients:
        Thread(target=c.connect, daemon=True).start()
    print(f"Started {count} bot(s) connecting to {host} room={room}")


def stop_bots():
    for c in clients:
        c.disconnect()


def handle_sigint(signum, frame):
    global stop_flag
    stop_flag = True
    print("Stopping bots...")
    stop_bots()
    sys.exit(0)


if __name__ == '__main__':
    signal.signal(signal.SIGINT, handle_sigint)
    run_bots(HOST, ROOM, COUNT)
    try:
        # Main thread: process pending queue and prompt user to allow targeted bots to continue
        while True:
            try:
                bot, data, ev = pending_queue.get(timeout=0.5)
            except Empty:
                time.sleep(0.5)
                continue

            # Show a compact summary for the user
            target_pid = data.get('player_id') if isinstance(data, dict) else None
            info = data.get('info') if isinstance(data, dict) else None
            target_name = player_map.get(target_pid) if target_pid else None
            print('\n' + '-'*60)
            print(f"Pending approval -> {bot.name}: info='{info}' target={target_name if target_name else target_pid}")
            # Show selected target if simulator chose one
            if data.get('_sim_selected_target'):
                sel = data.get('_sim_selected_target')
                print(f"  selected_target: {sel} ({player_map.get(sel)})")
            print("Press ENTER to continue night phase for this bot. ('s' skip, 'q' quit)")

            try:
                choice = input('> ')
            except Exception:
                choice = ''

            if choice.strip().lower() == 'q':
                print('Quitting simulator...')
                stop_bots()
                sys.exit(0)
            # Approve by default for both empty input and 's'
            ev.set()
            # After approving, print the current 'grim' (characters assigned) if available
            print(f"Approved {bot.name}")
            grim = globals().get('last_characters_assigned')
            if grim:
                print('Grim (characters assigned):')
                try:
                    if isinstance(grim, dict):
                        for pid, pd in grim.items():
                            rname = pd.get('role_details', {}).get('name') if isinstance(pd, dict) and pd.get('role_details') else pd.get('role_details')
                            print(f"  {pd.get('name', pid)} ({pid}): {rname}")
                    else:
                        print(grim)
                except Exception:
                    print(grim)
            else:
                # Fallback: print known player map
                print('Grim not available yet; known players:')
                for pid, name in player_map.items():
                    print(f"  {name} ({pid})")
            print('-'*60)
    except KeyboardInterrupt:
        print('Interrupted, stopping bots...')
        stop_bots()
        sys.exit(0)

