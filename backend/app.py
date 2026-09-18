from flask import Flask, request, jsonify
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_cors import CORS
import uuid # Import uuid for generating unique IDs
import random
from constants import trouble_brewing_characters, composition, api_key, first_night_order, night_order
import time


app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='gevent') # or 'eventlet'

# --- Game State ---
# game_sessions: { 'room_id': { 'players': { 'player_id': {'name': 'PlayerName', 'sid': 'current_sid', 'status': 'connected'}, ... }, 'state': {...} } }
game_sessions = {}
# sid_to_room: { 'sid': 'room_id', ... } - To quickly find room on disconnect
sid_to_room = {}
# sid_to_player_id: { 'sid': 'player_id', ... } - To quickly find player on disconnect
sid_to_player_id = {}

players = {}
current_roles=[]
current_night = 0
is_drunk_in_play = False
woken_players = []

# Helper: return ordered player ids by seat_id when available, else fallback to insertion order
def get_ordered_pids(room_id):
    players = game_sessions[room_id]['players']
    # Build list of tuples (seat_sort_key, index, player_id) to preserve stable order
    ordered = []
    idx = 0
    for pid, pdata in players.items():
        seat = pdata.get('seat_id')
        # try to convert seat to int for correct numeric ordering
        try:
            seat_key = int(seat) if seat is not None else None
        except Exception:
            seat_key = None
        # None seats should sort after numeric seats; use tuple (has_no_seat, seat_key, idx)
        has_no_seat = 1 if seat_key is None else 0
        ordered.append((has_no_seat, seat_key if seat_key is not None else 0, idx, pid))
        idx += 1
    ordered.sort()
    return [t[3] for t in ordered]

# --- REST API Endpoints ---
@app.route('/api/hello', methods=['GET'])
def hello_world():
    return jsonify(message="Online"), 200

@app.route('/api/create_game', methods=['POST'])
def create_game():
    data = request.json
    player_name = data.get('playerName')
    if not player_name:
        return jsonify(error="Player name is required"), 400

    room_id = '1234' # Generate a unique, short ID for the room
    new_player_id = str(uuid.uuid4()) # Generate a unique, persistent ID for the creating player

    game_sessions[room_id] = {
        'players': {}, # Players will be added/updated via WebSocket 'join_game'
        'state': {'status': 'waiting', 'players_count': 0, 'messages': []}
    }
    print(f"Game '{room_id}' created (HTTP). Creator '{player_name}' has player_id: {new_player_id}")
    
    # Return the new player_id along with the room_id
    return jsonify(room_id=room_id, player_id=new_player_id, message="Game created successfully"), 201


# --- WebSocket Event Handlers ---
@socketio.on('connect')
def handle_connect():
    print('Client connected:', request.sid)
    # Client will send 'join_game' to identify themselves and their room/player_id

@socketio.on('disconnect')
def handle_disconnect():
    disconnected_sid = request.sid
    print('Client disconnected:', disconnected_sid)

    room_id = sid_to_room.pop(disconnected_sid, None) # Remove from sid_to_room
    player_id = sid_to_player_id.pop(disconnected_sid, None) # Remove from sid_to_player_id

    if room_id and room_id in game_sessions and player_id:
        if player_id in game_sessions[room_id]['players']:
            # Mark player as disconnected, but don't remove immediately
            game_sessions[room_id]['players'][player_id]['sid'] = None # Clear SID
            game_sessions[room_id]['players'][player_id]['status'] = 'disconnected'
            
            # Update players count (only counting connected ones)
            connected_players_count = sum(1 for p in game_sessions[room_id]['players'].values() if p['status'] == 'connected')
            game_sessions[room_id]['state']['players_count'] = connected_players_count

            player_name = game_sessions[room_id]['players'][player_id]['name']
            
            # Check if all players are disconnected in this room
            if connected_players_count == 0:
                del game_sessions[room_id] # Clean up empty rooms
                print(f"Room {room_id} is now empty and removed after {player_name} disconnected.")
            else:
                # Notify remaining players about the disconnect
                emit('player_left', {
                    'player_id': player_id,
                    'name': player_name,
                    'room_id': room_id,
                    'current_players': list(game_sessions[room_id]['players'].values()),
                    'connected_players_count': connected_players_count
                }, room=room_id)
                print(f"{player_name} ({disconnected_sid}) left room {room_id}. Connected players: {connected_players_count}")
        else:
            print(f"Disconnected SID {disconnected_sid} had player_id {player_id} but player not found in room {room_id}.")
    else:
        print(f"Disconnected SID {disconnected_sid} was not in a known room or had no player_id.")


@socketio.on('join_game')
def on_join(data):
    room_id = data.get('room_id')
    player_name = data.get('player_name')
    player_id = data.get('player_id') # Get the player_id from the client (can be None)
    seat_id = data.get('seat_id')
    
    if not room_id or not player_name or room_id not in game_sessions:
        emit('error', {'message': 'Invalid room ID or player name'}, room=request.sid)
        return

    

    # Check if this player_id already exists in the room
    is_rejoining = False
    if player_id in game_sessions[room_id]['players']:
        # Player is rejoining with an existing player_id
        is_rejoining = True
        game_sessions[room_id]['players'][player_id]['seat_id'] = seat_id
        current_player_info = game_sessions[room_id]['players'][player_id]
        current_player_info['sid'] = request.sid # Update SID
        current_player_info['status'] = 'connected'
        print(f"Player '{player_name}' (ID: {player_id}) rejoining room {room_id} with new SID: {request.sid}")
    else:
        # New player or player_id not provided/found, generate a new one
        player_id = str(uuid.uuid4())
        is_vip = False
        if not game_sessions[room_id]['players']:
            is_vip = True
        
        game_sessions[room_id]['players'][player_id] = {
            'name': player_name,
            'sid': request.sid,
            'status': 'connected',
            'player_id': player_id,
            'seat_id': seat_id,
            'is_vip': is_vip
        }
        print(f"New player '{player_name}' (ID: {player_id}) joining room {room_id} with SID: {request.sid}")

    # Update global SID maps
    sid_to_room[request.sid] = room_id
    sid_to_player_id[request.sid] = player_id

    join_room(room_id) # Flask-SocketIO function to add client to a room for broadcasting

    # Update connected players count
    connected_players_count = sum(1 for p in game_sessions[room_id]['players'].values() if p['status'] == 'connected')
    game_sessions[room_id]['state']['players_count'] = connected_players_count

    # Notify everyone in the room (including the joining/rejoining player)
    emit('player_joined', {
        'player_id': player_id, # Send the player_id back to confirm/store
        'name': player_name,
        'room_id': room_id,
        'current_players': list(game_sessions[room_id]['players'].values()), # Send all players (connected/disconnected)
        'connected_players_count': connected_players_count
    }, room=room_id)
    
    # Send current game state to ALL in the room (including the new joiner)
    emit('current_game_state', {
        'state': game_sessions[room_id]['state'],
        'players': list(game_sessions[room_id]['players'].values())
    }, room=room_id) # This now broadcasts to all in room

    # If it's a new player, send their new player_id back to them to store
    if not is_rejoining:
        emit('player_id_assigned', {'player_id': player_id}, room=request.sid)


@socketio.on('start_game')
def handle_game_action(data):
    room_id = data.get('room_id')

    if room_id not in game_sessions:
        emit('error', {'message': 'Room does not exist'}, room=request.sid)
        return
    
    # Validate player count before using composition mapping
    number_of_players = len(game_sessions[room_id]['players'])
    if number_of_players not in composition:
        supported = sorted(list(composition.keys()))
        msg = f'Unsupported player count: {number_of_players}. Supported counts: {supported}'
        print(msg)
        emit('error', {'message': msg}, room=request.sid)
        return
    
    current_composition = composition[number_of_players]
    # Notify clients only after validation succeeded
    emit('navigate_ready', {}, room=room_id)
    print('after emitting navigate ready')
    number_of_players = len(game_sessions[room_id]['players'])
    current_composition = composition[number_of_players]
    current_roles = ['imp']
    number_of_minions = current_composition['minion']
    number_of_outsiders = current_composition['outsider']
    number_of_townsfolk = current_composition['townsfolk']
    minions = [character['id'] for character in trouble_brewing_characters if character['role'] == 'minion']
    outsiders = [character['id'] for character in trouble_brewing_characters if character['role'] == 'outsider']
    townsfolk = [character['id'] for character in trouble_brewing_characters if character['role'] == 'townsfolk']
    current_minions = random.sample(minions, k=number_of_minions)
    is_drunk_in_play=False
    if 'baron' in current_minions:
        number_of_outsiders = number_of_outsiders + 2
        number_of_townsfolk = number_of_townsfolk - 2
    current_outsiders = random.sample(outsiders, k=number_of_outsiders)
    if 'drunk' in current_outsiders:
        is_drunk_in_play = True
        number_of_townsfolk = number_of_townsfolk + 1
        current_outsiders.remove('drunk')
    current_townsfolk = random.sample(townsfolk, k=number_of_townsfolk)
    current_roles = current_roles + current_minions + current_outsiders + current_townsfolk
    random.shuffle(current_roles)
    index = 0
    for player_id in game_sessions[room_id]['players']:
        game_sessions[room_id]['players'][player_id]['role_details'] = {
            'name': current_roles[index],
            'is_drunk': False,
            'is_poisoned': False,
            'is_alive': True,
            'is_ghost_vote_used': False,
            'type': [character['role'] for character in trouble_brewing_characters if character['id'] == current_roles[index]][0]
        }
        index = index + 1
    build_grim(is_drunk_in_play, current_townsfolk, room_id)
    emit('characters_assigned', {'players': game_sessions[room_id]['players']}, room=room_id)

@socketio.on('night_phase')
def handle_game_action(data):
    room_id = data.get('room_id')

    if room_id not in game_sessions:
        emit('error', {'message': 'Room does not exist'}, room=request.sid)
    
    if 'night' not in game_sessions[room_id]:
        current_night = 0
    else:
        current_night = game_sessions[room_id]['night'] + 1
    game_sessions[room_id]['night'] = current_night
    time.sleep(5)
    if current_night == 0:
        wakeup_character(first_night_order[0], room_id=room_id, index=0)
    else:
        wakeup_character(night_order[0], room_id=room_id, index=0)

@socketio.on('navigate_to_night')     
def handle_game_action(data):
       room_id = data.get('room_id')
       emit('navigate_to_night', {}, room=room_id)

@socketio.on('night_phase_ready')
def handle_game_action(data):
    room_id = data.get('room_id')
    # Ensure index is numeric when provided
    try:
        index = int(data.get('index')) if data.get('index') is not None else 0
    except Exception:
        index = 0

    # Validate room early
    if room_id not in game_sessions:
        emit('error', {'message': 'Room does not exist'}, room=request.sid)
        return

    # Derive the current night from the stored game state to avoid using an undefined variable
    current_night = game_sessions[room_id].get('night', 0)

    index = index + 1

    # Small delay to mimic pacing
    time.sleep(1)

    # Safely advance to the next wake if within order bounds
    order = first_night_order if current_night == 0 else night_order

    # Helper: check whether the role exists at all in the current game (presence)
    def _role_present(info):
        players = game_sessions[room_id]['players']
        if info == 'minion_info':
            return any(p.get('role_details', {}).get('type') == 'minion' for p in players.values())
        if info == 'demon_info':
            return any(p.get('role_details', {}).get('type') == 'demon' for p in players.values())
        return any(p.get('role_details', {}).get('name') == info for p in players.values())

    # Iterate through the night order from the computed index forward.
    # If the role is not present at all, skip to the next. Do not check whether
    # players of that role have already been woken; wake the role if it is present.
    while index < len(order):
        next_info = order[index]
        # If the role isn't present in this game, skip
        if not _role_present(next_info):
            index += 1
            continue

        # Wake the role (do not inspect woken_players)
        print(f"Advancing to index {index} info '{next_info}' in room {room_id} (woken check skipped)")
        wakeup_character(next_info, room_id=room_id, index=index)
        return

    # Reached end of order without finding any wakes -> night complete
    print(f"Night phase complete for room {room_id}")
    try:
        emit('night_phase_complete', {'room_id': room_id}, room=room_id)
        emit('navigate_to_day', {}, room=room_id)
    except Exception:
        pass
    return

def wakeup_character(info, room_id, index):
    if info == 'minion_info':
            for player_id in game_sessions[room_id]['players']:
                if game_sessions[room_id]['players'][player_id]['role_details']['type'] == 'minion' and player_id not in woken_players:
                    woken_players.append(player_id)
                    emit('start_night_phase', {
                        'player_id': player_id,
                        'index': index,
                        'info': 'minion_info',
                        'demon' : [game_sessions[room_id]['players'][player_id]['name'] for player_id in game_sessions[room_id]['players'] if game_sessions[room_id]['players'][player_id]['role_details']['type'] == 'demon'][0],
                        'minions': [game_sessions[room_id]['players'][player_id]['name'] for player_id in game_sessions[room_id]['players'] if game_sessions[room_id]['players'][player_id]['role_details']['type'] == 'minion']
                    }, room=room_id)
    elif info == 'demon_info':
        for player_id in game_sessions[room_id]['players']:
                if game_sessions[room_id]['players'][player_id]['role_details']['type'] == 'demon' and player_id not in woken_players:
                    woken_players.append(player_id)

                    # Prepare bluffs: pick up to 3 random townsfolk/outsider roles not currently in play,
                    # but ensure at least one townsfolk if available
                    all_pool = [c['id'] for c in trouble_brewing_characters if c['role'] in ('townsfolk', 'outsider')]
                    townsfolk_all = [c['id'] for c in trouble_brewing_characters if c['role'] == 'townsfolk']
                    # roles currently assigned to players
                    in_play_roles = [p['role_details']['name'] for p in game_sessions[room_id]['players'].values()]
                    # Prefer roles not in play
                    not_in_play = [r for r in all_pool if r not in in_play_roles]

                    # Determine the source pool (prefer not_in_play, else fallback to all_pool)
                    source_pool = not_in_play if not_in_play else all_pool
                    max_bluffs = min(3, len(source_pool))

                    bluffs = []
                    # Ensure at least one townsfolk in bluffs when possible (from not_in_play first)
                    townsfolk_not_in_play = [r for r in townsfolk_all if r not in in_play_roles]
                    if townsfolk_not_in_play:
                        bluffs.append(random.choice(townsfolk_not_in_play))

                    # Fill remaining slots from source_pool excluding already chosen
                    remaining_pool = [r for r in source_pool if r not in bluffs]
                    remaining_needed = max_bluffs - len(bluffs)
                    if remaining_needed > 0:
                        if len(remaining_pool) <= remaining_needed:
                            bluffs.extend(remaining_pool)
                        else:
                            bluffs.extend(random.sample(remaining_pool, remaining_needed))

                    # Shuffle bluffs to randomize order
                    random.shuffle(bluffs)

                    emit('start_night_phase', {
                        'player_id': player_id,
                        'index': index,
                        'info': 'demon_info',
                        'demon' : [game_sessions[room_id]['players'][player_id]['name'] for player_id in game_sessions[room_id]['players'] if game_sessions[room_id]['players'][player_id]['role_details']['type'] == 'demon'][0],
                        'minions': [game_sessions[room_id]['players'][player_id]['name'] for player_id in game_sessions[room_id]['players'] if game_sessions[room_id]['players'][player_id]['role_details']['type'] == 'minion'],
                        'bluffs': bluffs
                    }, room=room_id)
                    
    elif info == 'poisoner':
        for player_id in game_sessions[room_id]['players']:
                if game_sessions[room_id]['players'][player_id]['role_details']['name'] == 'poisoner':
                    woken_players.append(player_id)
                    emit('start_night_phase', {
                        'player_id': player_id,
                        'index': index,
                        'info': 'poisoner',
                        'players': game_sessions[room_id]['players']
                    }, room=room_id)
                    
    elif info == 'spy':
        for player_id in game_sessions[room_id]['players']:
                if game_sessions[room_id]['players'][player_id]['role_details']['name'] == 'spy':
                    woken_players.append(player_id)
                    emit('start_night_phase', {
                        'player_id': player_id,
                        'index': index,
                        'info': 'spy',
                        'players': game_sessions[room_id]['players']
                    }, room=room_id)
    
    elif info == 'washerwoman':
        for player_id in game_sessions[room_id]['players']:
                if game_sessions[room_id]['players'][player_id]['role_details']['name'] == 'washerwoman':
                    # Mark washerwoman as woken
                    woken_players.append(player_id)

                    # Find players who currently have a townsfolk role
                    townsfolk_pids = [pid for pid, p in game_sessions[room_id]['players'].items() if p['role_details']['type'] == 'townsfolk']

                    # Check for spy(s) in play who are not poisoned or drunk
                    spy_pids = [pid for pid, p in game_sessions[room_id]['players'].items() if p['role_details']['name'] == 'spy' and not p['role_details'].get('is_poisoned') and not p['role_details'].get('is_drunk')]
                    spy_registered_good = False
                    if spy_pids:
                        spy_registered_good = random.random() < 0.75
                        if spy_registered_good:
                            # add spy(s) to the townsfolk pool so they may be selected
                            for s in spy_pids:
                                if s not in townsfolk_pids:
                                    townsfolk_pids.append(s)

                    # Remove the washerwoman themself from the candidate pool
                    townsfolk_pids = [pid for pid in townsfolk_pids if pid != player_id]

                    chosen_role = None
                    player1_name = None
                    player2_name = None

                    if townsfolk_pids:
                        # pick a random townsfolk player (may be a spy if spy_registered_good)
                        chosen_pid = random.choice(townsfolk_pids)

                        # If chosen player is a spy who registered as good, pick a random townsfolk role *not in play* to present
                        if game_sessions[room_id]['players'][chosen_pid]['role_details']['name'] == 'spy' and spy_registered_good:
                            all_townsfolk_roles = [c['id'] for c in trouble_brewing_characters if c['role'] == 'townsfolk']
                            # roles currently assigned to players
                            in_play_roles = [p['role_details']['name'] for p in game_sessions[room_id]['players'].values()]
                            # townsfolk roles not currently in play
                            townsfolk_not_in_play = [r for r in all_townsfolk_roles if r not in in_play_roles]
                            if townsfolk_not_in_play:
                                chosen_role = random.choice(townsfolk_not_in_play)
                            elif all_townsfolk_roles:
                                # fallback to any townsfolk role if all are already in play
                                chosen_role = random.choice(all_townsfolk_roles)
                            else:
                                chosen_role = None
                        else:
                            chosen_role = game_sessions[room_id]['players'][chosen_pid]['role_details']['name']

                        # pick another random player different from chosen_pid
                        other_candidates = [pid for pid in game_sessions[room_id]['players'] if pid != chosen_pid and pid != player_id]
                        if other_candidates:
                            other_pid = random.choice(other_candidates)
                        else:
                            other_pid = None

                        # prepare the two player names and randomize their order
                        names = [game_sessions[room_id]['players'][chosen_pid]['name']]
                        if other_pid:
                            names.append(game_sessions[room_id]['players'][other_pid]['name'])
                        else:
                            names.append('')
                        random.shuffle(names)
                        player1_name, player2_name = names[0], names[1]
                    else:
                        # no townsfolk found (edge case) - pick any two distinct players
                        pids = list(game_sessions[room_id]['players'].keys())
                        if len(pids) >= 2:
                            a, b = random.sample(pids, 2)
                            player1_name = game_sessions[room_id]['players'][a]['name']
                            player2_name = game_sessions[room_id]['players'][b]['name']
                            chosen_role = None
                        elif len(pids) == 1:
                            player1_name = game_sessions[room_id]['players'][pids[0]]['name']
                            player2_name = ''
                            chosen_role = None
                        else:
                            player1_name = ''
                            player2_name = ''
                            chosen_role = None

                    emit('start_night_phase', {
                        'player_id': player_id,
                        'index': index,
                        'info': 'washerwoman',
                        'role': chosen_role,
                        'player1': player1_name,
                        'player2': player2_name,
                        'spy_registered_good': spy_registered_good if spy_pids else 0
                    }, room=room_id)
    elif info == 'librarian':
        for player_id in game_sessions[room_id]['players']:
                if game_sessions[room_id]['players'][player_id]['role_details']['name'] == 'librarian':
                    woken_players.append(player_id)

                    # Find players who currently have an outsider role
                    outsider_pids = [pid for pid, p in game_sessions[room_id]['players'].items() if p['role_details']['type'] == 'outsider']

                    # Check for spy(s) in play who are not poisoned or drunk and may register as outsider
                    spy_pids = [pid for pid, p in game_sessions[room_id]['players'].items() if p['role_details']['name'] == 'spy' and not p['role_details'].get('is_poisoned') and not p['role_details'].get('is_drunk')]
                    spy_registered_outsider = False
                    if spy_pids:
                        spy_registered_outsider = random.random() < 0.75
                        if spy_registered_outsider:
                            for s in spy_pids:
                                if s not in outsider_pids:
                                    outsider_pids.append(s)

                    chosen_role = 0  # default to 0 if no outsiders
                    player1_name = None
                    player2_name = None

                    if outsider_pids:
                        # pick a random outsider player (may be a spy if spy_registered_outsider)
                        chosen_pid = random.choice(outsider_pids)

                        # If chosen player is a spy who registered as outsider, pick a random outsider role not in play to present
                        if game_sessions[room_id]['players'][chosen_pid]['role_details']['name'] == 'spy' and spy_registered_outsider:
                            all_outsider_roles = [c['id'] for c in trouble_brewing_characters if c['role'] == 'outsider']
                            in_play_roles = [p['role_details']['name'] for p in game_sessions[room_id]['players'].values()]
                            outsider_not_in_play = [r for r in all_outsider_roles if r not in in_play_roles]
                            if outsider_not_in_play:
                                chosen_role = random.choice(outsider_not_in_play)
                            elif all_outsider_roles:
                                chosen_role = random.choice(all_outsider_roles)
                            else:
                                chosen_role = 0
                        else:
                            chosen_role = game_sessions[room_id]['players'][chosen_pid]['role_details']['name']

                        # pick another random player different from chosen_pid
                        other_candidates = [pid for pid in game_sessions[room_id]['players'] if pid != chosen_pid and pid != player_id]
                        if other_candidates:
                            other_pid = random.choice(other_candidates)
                        else:
                            other_pid = None

                        # prepare the two player names and randomize their order
                        names = [game_sessions[room_id]['players'][chosen_pid]['name']]
                        if other_pid:
                            names.append(game_sessions[room_id]['players'][other_pid]['name'])
                        else:
                            names.append('')
                        random.shuffle(names)
                        player1_name, player2_name = names[0], names[1]
                    else:
                        # no outsiders found - chosen_role stays 0, don't show any player names
                        player1_name = ''
                        player2_name = ''
                        # Ensure chosen_role remains 0 when no outsiders
                        chosen_role = 0

                    emit('start_night_phase', {
                        'player_id': player_id,
                        'index': index,
                        'info': 'librarian',
                        'role': chosen_role,
                        'player1': player1_name,
                        'player2': player2_name,
                        'spy_registered_outsider': spy_registered_outsider if spy_pids else 0
                    }, room=room_id)
    elif info == 'investigator':
        for player_id in game_sessions[room_id]['players']:
                if game_sessions[room_id]['players'][player_id]['role_details']['name'] == 'investigator':
                    woken_players.append(player_id)

                    # Find players who currently have a minion role
                    minion_pids = [pid for pid, p in game_sessions[room_id]['players'].items() if p['role_details']['type'] == 'minion']

                    # Check for recluse(s) in play who are not poisoned or drunk and may register as minion
                    recluse_pids = [pid for pid, p in game_sessions[room_id]['players'].items() if p['role_details']['name'] == 'recluse' and not p['role_details'].get('is_poisoned') and not p['role_details'].get('is_drunk')]
                    recluse_registered_minion = False
                    if recluse_pids:
                        recluse_registered_minion = random.random() < 0.75
                        if recluse_registered_minion:
                            for s in recluse_pids:
                                if s not in minion_pids:
                                    minion_pids.append(s)

                    chosen_role = 0  # default to 0 if no minions
                    player1_name = None
                    player2_name = None

                    if minion_pids:
                        # pick a random minion player (may be a recluse if recluse_registered_minion)
                        chosen_pid = random.choice(minion_pids)

                        # If chosen player is a recluse who registered as minion, pick a random minion role from ALL minion roles to present
                        if game_sessions[room_id]['players'][chosen_pid]['role_details']['name'] == 'recluse' and recluse_registered_minion:
                            all_minion_roles = [c['id'] for c in trouble_brewing_characters if c['role'] == 'minion']
                            if all_minion_roles:
                                chosen_role = random.choice(all_minion_roles)
                            else:
                                chosen_role = 0
                        else:
                            chosen_role = game_sessions[room_id]['players'][chosen_pid]['role_details']['name']

                        # pick another random player different from chosen_pid
                        other_candidates = [pid for pid in game_sessions[room_id]['players'] if pid != chosen_pid and pid != player_id]
                        if other_candidates:
                            other_pid = random.choice(other_candidates)
                        else:
                            other_pid = None

                        # prepare the two player names and randomize their order
                        names = [game_sessions[room_id]['players'][chosen_pid]['name']]
                        if other_pid:
                            names.append(game_sessions[room_id]['players'][other_pid]['name'])
                        else:
                            names.append('')
                        random.shuffle(names)
                        player1_name, player2_name = names[0], names[1]
                    else:
                        # no minions found - chosen_role stays 0, don't show any player names
                        player1_name = ''
                        player2_name = ''
                        chosen_role = 0

                    emit('start_night_phase', {
                        'player_id': player_id,
                        'index': index,
                        'info': 'investigator',
                        'role': chosen_role,
                        'player1': player1_name,
                        'player2': player2_name,
                        'recluse_registered_minion': recluse_registered_minion if recluse_pids else 0
                    }, room=room_id)
    elif info == 'chef':
        for player_id in game_sessions[room_id]['players']:
                if game_sessions[room_id]['players'][player_id]['role_details']['name'] == 'chef':
                    woken_players.append(player_id)

                    # Find recluse and spy players (by role name)
                    recluse_pids = [pid for pid, p in game_sessions[room_id]['players'].items() if p['role_details']['name'] == 'recluse']
                    spy_pids = [pid for pid, p in game_sessions[room_id]['players'].items() if p['role_details']['name'] == 'spy']

                    # Randomly decide registrations if present (75% true, 25% false)
                    # Only if recluse/spy are not poisoned or drunk
                    recluse_registered_evil = False
                    spy_registered_good = False
                    for pid in recluse_pids:
                        if not game_sessions[room_id]['players'][pid]['role_details']['is_poisoned'] and not game_sessions[room_id]['players'][pid]['role_details']['is_drunk']:
                            recluse_registered_evil = random.random() < 0.75
                            break
                    for pid in spy_pids:
                        if not game_sessions[room_id]['players'][pid]['role_details']['is_poisoned'] and not game_sessions[room_id]['players'][pid]['role_details']['is_drunk']:
                            spy_registered_good = random.random() < 0.75
                            break

                    # Build ordered list of players and determine effective 'evil' status
                    ordered_pids = get_ordered_pids(room_id)
                    evil_flags = []
                    for pid in ordered_pids:
                        p = game_sessions[room_id]['players'][pid]
                        role_type = p['role_details'].get('type')
                        is_evil = True if role_type in ('minion', 'demon') else False
                        # Apply recluse/spy overrides
                        if pid in recluse_pids and recluse_registered_evil:
                            is_evil = True
                        if pid in spy_pids and spy_registered_good:
                            is_evil = False
                        evil_flags.append(is_evil)

                    # Count circular adjacent evil pairs (wrap around)
                    evil_pairs = 0
                    if len(evil_flags) >= 2:
                        for i in range(len(evil_flags)):
                            j = (i + 1) % len(evil_flags)
                            if evil_flags[i] and evil_flags[j]:
                                evil_pairs += 1
                    else:
                        evil_pairs = 0

                    emit('start_night_phase', {
                        'player_id': player_id,
                        'index': index,
                        'info': 'chef',
                        'evil_pairs': evil_pairs,
                        'recluse_registered_evil': recluse_registered_evil if recluse_pids else 0,
                        'spy_registered_good': spy_registered_good if spy_pids else 0,
                    }, room=room_id)
    elif info == 'empath':
        for player_id in game_sessions[room_id]['players']:
                if game_sessions[room_id]['players'][player_id]['role_details']['name'] == 'empath':
                    woken_players.append(player_id)

                    # Build ordered list of players to determine seating adjacency (circular)
                    ordered_pids = get_ordered_pids(room_id)
                    evil_neighbors = 0
                    if len(ordered_pids) >= 2:
                        idx = ordered_pids.index(player_id)
                        left_pid = ordered_pids[(idx - 1) % len(ordered_pids)]
                        right_pid = ordered_pids[(idx + 1) % len(ordered_pids)]

                        def _is_evil_pid(pid):
                            p = game_sessions[room_id]['players'][pid]
                            # Base evil by role type
                            base_evil = True if p['role_details'].get('type') in ('minion', 'demon') else False
                            name = p['role_details'].get('name')
                            is_poisoned = p['role_details'].get('is_poisoned')
                            is_drunk = p['role_details'].get('is_drunk')

                            # Recluse may register as evil 75% (only if not poisoned/drunk)
                            if name == 'recluse' and not is_poisoned and not is_drunk:
                                if random.random() < 0.75:
                                    return True
                                else:
                                    return base_evil

                            # Spy may register as good (not evil) 75% (only if not poisoned/drunk)
                            if name == 'spy' and not is_poisoned and not is_drunk:
                                if random.random() < 0.75:
                                    return False
                                else:
                                    return base_evil

                            return base_evil

                        left_evil = _is_evil_pid(left_pid)
                        right_evil = _is_evil_pid(right_pid)

                        evil_neighbors = int(left_evil) + int(right_evil)

                    emit('start_night_phase', {
                        'player_id': player_id,
                        'index': index,
                        'info': 'empath',
                        'evil_neighbors': evil_neighbors
                    }, room=room_id)
    elif info == 'fortune_teller':
        for player_id in game_sessions[room_id]['players']:
                if game_sessions[room_id]['players'][player_id]['role_details']['name'] == 'fortune_teller':
                    woken_players.append(player_id)

                    # Roles pool: townsfolk + outsiders that are currently in play
                    all_pool = [c['id'] for c in trouble_brewing_characters if c['role'] in ('townsfolk', 'outsider')]
                    in_play_roles = [p['role_details']['name'] for p in game_sessions[room_id]['players'].values() if p.get('role_details')]
                    # Only consider roles that are both in the defined pool and currently assigned to players
                    in_play_pool = [r for r in in_play_roles if r in all_pool]

                    # Choose a red herring from roles currently in play (if any)
                    red_herring = random.choice(in_play_pool) if in_play_pool else None

                    # Build what the fortune teller would see for each player (appears as demon or not)
                    appears_demon = False
                    for pid, pdata in game_sessions[room_id]['players'].items():
                        rd = pdata.get('role_details', {})
                        name = rd.get('name')
                        is_poisoned = rd.get('is_poisoned')
                        is_drunk = rd.get('is_drunk')

                        # Recluse may register as demon 75% of the time (only if not poisoned/drunk)
                        if name == 'recluse' and not is_poisoned and not is_drunk:
                            appears_demon = True if random.random() < 0.75 else False

                    emit('start_night_phase', {
                        'player_id': player_id,
                        'index': index,
                        'info': 'fortune_teller',
                        'players': game_sessions[room_id]['players'],
                        'recluse_registering_as_demon': appears_demon,
                        'red_herring': red_herring
                    }, room=room_id)
    elif info == 'butler':
        for player_id in game_sessions[room_id]['players']:
            if game_sessions[room_id]['players'][player_id]['role_details']['name'] == 'butler':
                woken_players.append(player_id)
                emit('start_night_phase', {
                    'player_id': player_id,
                    'index': index,
                    'info': 'butler',
                    'players': game_sessions[room_id]['players']
                }, room=room_id)
    elif info == 'monk':
        for player_id in game_sessions[room_id]['players']:
            if game_sessions[room_id]['players'][player_id]['role_details']['name'] == 'monk':
                woken_players.append(player_id)
                emit('start_night_phase', {
                    'player_id': player_id,
                    'index': index,
                    'info': 'monk',
                    'players': game_sessions[room_id]['players']
                }, room=room_id)
def build_grim(is_drunk_in_play, current_townsfolk, room_id):
    if is_drunk_in_play:
        drunk_player=random.choice(current_townsfolk)
        for player_id in game_sessions[room_id]['players']:
            if game_sessions[room_id]['players'][player_id]['role_details']['name']==drunk_player:
                game_sessions[room_id]['players'][player_id]['role_details']['is_drunk']=True
                game_sessions[room_id]['players'][player_id]['role_details']['type']="outsider"

@socketio.on('poisoner_choice')
def handle_poisoner_choice(data):
    """Handle a poisoner selecting a target during their wake. This allows automated simulators
    to inform the server of the selected victim before (or when) the poisoner signals ready.
    """
    room_id = data.get('room_id')
    by = data.get('by')
    target_id = data.get('target_id')

    if not room_id or room_id not in game_sessions:
        emit('error', {'message': 'Room does not exist for poisoner_choice'}, room=request.sid)
        return
    if not target_id or target_id not in game_sessions[room_id]['players']:
        emit('error', {'message': 'Invalid target_id for poisoner_choice'}, room=request.sid)
        return

    # Mark the chosen target as poisoned so subsequent role logic can read it
    try:
        game_sessions[room_id]['players'][target_id]['role_details']['is_poisoned'] = True
        print(f"Poisoner choice recorded in room {room_id}: by={by} target={target_id}")
        # Notify room (or UI) that the poison choice was recorded (optional)
        emit('poisoner_choice_recorded', {'by': by, 'target_id': target_id, 'room_id': room_id}, room=room_id)
    except Exception as e:
        print(f"Error recording poisoner_choice: {e}")
        emit('error', {'message': 'Failed to record poisoner choice'}, room=request.sid)

if __name__ == '__main__':
    print("Starting Flask-SocketIO server on http://0.0.0.0:5000")
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)