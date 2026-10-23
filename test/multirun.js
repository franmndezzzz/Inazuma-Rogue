// Varias partidas en curso a la vez (una por modo) y conversión de la partida suelta de antes
const fs = require('fs'), vm = require('vm');
const S = require('path').join(__dirname,'..','src')+'/';
const store = {};
const ctx = { TX: (s, ...a) => a.length ? s.replace(/\{(\d+)\}/g, (m, i) => a[i]) : s, TXn: (n, a, b) => (n === 1 ? a : b).replace('{0}', n), console, Math, JSON, Object, Array, Set, Map, Date,
  localStorage: { getItem: k => k in store ? store[k] : null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } } };
ctx.GAME = JSON.parse(fs.readFileSync(require('path').join(__dirname,'..','juego','gamedata.json'), 'utf8'));
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(S + 'logic.js', 'utf8') + '\n' + fs.readFileSync(S + 'run.js', 'utf8') + '\nthis.Profile=Profile;this.Run=Run;', ctx);
const { Profile, Run, GAME } = ctx;
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails++; };
Profile.load(); Profile.data.firstDone = true;
const ids = GAME.players.filter(p => p.cs && p.gacha !== false).slice(0, 5).map(p => p.id); ids.forEach(id => { Profile.data.coll[id] = { stars: 1, up: {} }; });
// Partida suelta de la versión anterior
const old = Run.create('story', ids, { stage: 's1' }); store['inazuma-run3'] = JSON.stringify(old);
ok(Run.all().story && Run.all().story.kind === 'story', 'la partida guardada de antes sigue ahí (Historia)');
const inf = Run.create('infinite', ids); Run.save(inf);
ok(Run.all().story && Run.all().infinite, 'empezar el Infinito no borra la Historia: las dos a la vez');
const ch = Run.create('chain', ids, { chain: 'elemental' }); Run.save(ch);
ok(Object.keys(Run.all()).length === 3, 'tres partidas en curso a la vez (Historia, Infinito y cadena)');
inf.index = 3; Run.save(inf); ok(Run.load('infinite').index === 3 && Run.load('story').index === 0, 'cada una guarda su progreso por separado');
Run.clear('chain'); ok(!Run.all().chain && Run.all().story && Run.all().infinite, 'abandonar una no toca las demás');
const st = Run.load('story'); st.state = 'over'; Run.save(st); ok(!Run.all().story, 'una partida terminada ya no sale como «en curso»');
Run.clear(); ok(!('inazuma-run3' in store), 'borrar todo deja la clave vacía');
console.log(fails ? '\n✗ ' + fails + ' fallos' : '\n✓ Todo bien');
process.exit(fails ? 1 : 0);
