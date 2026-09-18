"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
exports.__esModule = true;
exports.NightPhase = void 0;
var core_1 = require("@angular/core");
var router_1 = require("@angular/router");
var common_1 = require("@angular/common");
var NightPhase = /** @class */ (function () {
    function NightPhase(route, router, websocketService) {
        this.route = route;
        this.router = router;
        this.websocketService = websocketService;
        this.subscriptions = [];
        this.currentRoomId = "";
        this.playerId = "";
        this.nightOrderPlayerId = "";
        this.showFtCloseButton = false;
    }
    NightPhase.prototype.ngOnInit = function () {
        var _this = this;
        this.route.queryParamMap.subscribe(function (params) {
            var _a;
            _this.currentRoomId = (_a = params.get('roomId')) !== null && _a !== void 0 ? _a : '';
            console.log(_this.currentRoomId);
        });
        this.websocketService.connect();
        var player = localStorage.getItem('playerId');
        this.playerId = player ? player : "";
        this.subscriptions.push(this.websocketService.nightPhase$.subscribe(function (data) {
            _this.nightOrderPlayerId = data.player_id;
            _this.nightInfo = data;
            // Reset FT Close Eyes button whenever a new wake is received
            _this.showFtCloseButton = false;
            if (_this.playerId == _this.nightOrderPlayerId) {
                _this.vibratePhone();
            }
        }));
        this.websocketService.emit('night_phase', {
            room_id: this.currentRoomId
        });
    };
    NightPhase.prototype.closeEyes = function () {
        this.nightOrderPlayerId = "";
        this.websocketService.emit('night_phase_ready', {
            room_id: this.currentRoomId,
            index: this.nightInfo['index']
        });
    };
    NightPhase.prototype.vibratePhone = function (pattern) {
        if (pattern === void 0) { pattern = 500; }
        // Compute total duration (ms) from VibratePattern
        var duration = 500;
        if (typeof pattern === 'number') {
            duration = pattern;
        }
        else if (Array.isArray(pattern)) {
            duration = pattern.reduce(function (a, b) { return a + b; }, 0);
        }
        var AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
            try {
                var ctx_1 = new AudioContext();
                // Some browsers require resume() after user gesture; attempt resume silently
                if (ctx_1.state === 'suspended') {
                    ctx_1.resume()["catch"](function () { });
                }
                var osc = ctx_1.createOscillator();
                var gain = ctx_1.createGain();
                osc.type = 'sine';
                osc.frequency.value = 880; // frequency in Hz (adjust if desired)
                gain.gain.value = 0.12; // volume
                osc.connect(gain);
                gain.connect(ctx_1.destination);
                var now = ctx_1.currentTime;
                osc.start(now);
                osc.stop(now + duration / 1000);
                // Close audio context shortly after stop to free resources
                setTimeout(function () {
                    try {
                        ctx_1.close();
                    }
                    catch (e) { /* ignore */ }
                }, duration + 100);
                return;
            }
            catch (e) {
                console.warn('Audio beep failed, falling back to vibration.', e);
            }
        }
        // Fallback to vibration API if audio isn't available
        if ('vibrate' in navigator) {
            navigator.vibrate(pattern);
        }
        else {
            console.warn('Beep and Vibration APIs are not supported in this browser.');
        }
    };
    NightPhase.prototype.ftpick = function () {
        // Only act when the current wake is the fortune_teller and it's this player's turn
        if (this.nightInfo && this.nightInfo['info'] === 'fortune_teller' && this.nightOrderPlayerId === this.playerId) {
            try {
                var checkedEls = Array.from(document.querySelectorAll('input[name="fortune_teller_pick"]:checked'));
                // Require exactly two picks
                if (checkedEls.length !== 2) {
                    alert('Please select exactly 2 players.');
                    return; // do not advance night
                }
                var picks = checkedEls.map(function (e) { return e.value; });
                var redHerringRole = this.nightInfo['red_herring'];
                var recluseRegistering = !!this.nightInfo['recluse_registering_as_demon'];
                var demonFound = false;
                if (this.nightInfo['players']) {
                    for (var _i = 0, picks_1 = picks; _i < picks_1.length; _i++) {
                        var pid = picks_1[_i];
                        var p = this.nightInfo['players'][pid];
                        if (!p || !p['role_details'])
                            continue;
                        var name = p['role_details']['name'];
                        var type = p['role_details']['type'];
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
            }
            catch (e) {
                console.warn('Could not determine fortune teller picks', e);
                alert('Could not read your selections. Please try again.');
                return;
            }
        }
        // For fortune-teller we don't auto-advance here; closeEyes() will emit when pressed.
    };
    NightPhase = __decorate([
        core_1.Component({
            selector: 'app-night-phase',
            imports: [common_1.CommonModule,
                router_1.RouterModule],
            templateUrl: './night-phase.html',
            styleUrl: './night-phase.scss'
        })
    ], NightPhase);
    return NightPhase;
}());
exports.NightPhase = NightPhase;
