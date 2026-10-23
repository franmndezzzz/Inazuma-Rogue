// Las versiones del Infinito no desaparecen al recargar (fallo del 23 oct: el cambio de ids viejo las convertía en el jugador base)
const fs = require('fs'), vm = require('vm'), path = require('path');
const S = path.join(__dirname, '..', 'src') + '/', store = {};
const mk = () => { const ctx = { TX: (s, ...a) => a.length ? s.replace(/\{(\d+)\}/g, (m, i) => a[i]) : s, TXn: (n, a, b) => (n === 1 ? a : b).replace('{0}', n), console, Math, JSON, Object, Array, Set, Map, Date,
  localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => delete store[k] } };
  ctx.GAME = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'juego', 'gamedata.json'), 'utf8'));
  vm.createContext(ctx); vm.runInContext(fs.readFileSync(S + 'logic.js', 'utf8') + '\n' + fs.readFileSync(S + 'run.js', 'utf8') + '\nthis.Profile=Profile;this.PLAYER=PLAYER;', ctx); return ctx; };
let fails = 0; const ok = (c, t) => { console.log((c ? '  ✓ ' : '  ✗ ') + t); if (!c) fails++; };
let A = mk(); A.Profile.load();
const infs = A.GAME.players.filter(p => p.inf).slice(0, 5).map(p => p.id);
infs.forEach(id => A.Profile.data.coll[id] = { stars: 2, up: {} }); A.Profile.save();
let B = mk(); B.Profile.load();
ok(infs.every(id => B.Profile.data.coll[id] && B.Profile.data.coll[id].stars === 2), 'tras recargar siguen las 5 versiones del Infinito');
console.log(fails ? fails + ' FALLOS' : 'Todo bien'); process.exit(fails ? 1 : 0);
