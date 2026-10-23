// Elegir supertécnica (⇄) y recarga por técnica; portería solo para porteros; progreso por rendimiento
const fs = require('fs'), vm = require('vm');
const S = require('path').join(__dirname,'..','src')+'/';
const store = {};
const ctx = { TX: (s, ...a) => a.length ? s.replace(/\{(\d+)\}/g, (m, i) => a[i]) : s, TXn: (n, a, b) => (n === 1 ? a : b).replace('{0}', n), console, Math, JSON, Object, Array, Set, Map, localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; }, removeItem: k => delete store[k] } };
ctx.GAME = JSON.parse(fs.readFileSync(require('path').join(__dirname,'..','juego','gamedata.json'), 'utf8'));
ctx.Sprites = { refOf: pd => ({ file: 'c00.png', row: 0 }) };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(S + 'logic.js', 'utf8') + '\n' + fs.readFileSync(S + 'run.js', 'utf8') + '\n' + fs.readFileSync(S + 'career.js', 'utf8') + '\nthis.Logic=Logic;this.rivalTeam=rivalTeam;this.Career=Career;this.PLAYER=PLAYER;this.TECH=TECH;Profile.load();', ctx);
const { Logic, rivalTeam, Career, PLAYER, TECH } = ctx;
const s = Logic.createMatch({ minutes: 3, difficulty: 'medio', golden: false, techMode: 'boton' }, { A: rivalTeam('Royal Academy', 1, 1), B: rivalTeam('Zeus', 1, 1) });
const me = s.players.find(p => p.team === 'A' && p.role === 'DEL');
const shots = Object.values(ctx.GAME.techniques).filter(t => t.type === 'tiro').slice(0, 2);
me.techs = shots.map(t => Object.assign({}, t, { cd: 10 })); me.cd = {};
Logic._t.take(s, me); s.controlledId = me.id; me.y = 6; me.x = 17;
console.log('elige al principio', Logic.contextTech(s, me).tech.name, '· opciones', Logic.techChoices(s, me));
const gkB = s.players.find(p => p.team === 'B' && p.role === 'POR');   // el portero, apartado (si no, se queda el balón al tocarte)
for (let i = 0; i < 400; i++) { if (s.ball.owner !== me) Logic._t.take(s, me); me.x = 17; me.y = 6; gkB.x = 3; gkB.y = 1; gkB.stun = 1; Logic.update(s, { move: { x: 0, y: 0 }, sprint: false, shootHeld: false, pressed: new Set(i === 399 ? ['techNext'] : []), dt: 1 / 60 }, 1 / 60); }
const picked = Logic.contextTech(s, me).tech; console.log('tras ⇄', picked.name, picked.id, me.techs.map(t => t.id + ':' + t.name).join(' | '), 'pick', JSON.stringify(me.techPick || null), 'fase', s.phase, s.kickoff ? 'kickoff' : '');
Logic._t.startTech(s, me, picked, 0);
const other = me.techs.find(t => t.id !== picked.id);
console.log('recarga usada', me.cd[picked.id], '· la otra', me.cd[other.id] || 0, '(debe ser 0)');
// portería
const c = Career.create(13, 'Prueba'); Career.autoLineup();
const roles = ctx.FORMATIONS ? null : null;
console.log('portero titular:', PLAYER(c.lineup[ctx.Career.data.lineup.findIndex((_, i) => vm.runInContext('FORMATIONS', ctx)[c.formation].roles[i] === 'POR')]).role);
// rendimiento
let up = 0, down = 0;
for (let w = 0; w < 9; w++) { const nm = Career.nextMatch(); if (!nm) { Career.advance(); continue; } const won = w % 2 === 0; const out = Career.finishMatch(won ? 3 : 0, won ? 0 : 3, null, 0, won ? [c.lineup[4], c.lineup[4]] : []); out.prog.forEach(x => x.d > 0 ? up++ : down++); Career.advance(); }
console.log('progreso en 9 jornadas: suben', up, '· bajan', down);
