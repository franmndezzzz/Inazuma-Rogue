// Infinito: al ganar a cada jefe (cada 5 oleadas) se elige 1 de 3 versiones (jugadores que no salen en el gacha), más raras cuanto más lejos
const fs = require('fs'), vm = require('vm');
const S = require('path').join(__dirname,'..','src')+'/';
const ctx = { TX: (s, ...a) => a.length ? s.replace(/\{(\d+)\}/g, (m, i) => a[i]) : s, TXn: (n, a, b) => (n === 1 ? a : b).replace('{0}', n), console, Math, JSON, Object, Array, Set, Map, Date, localStorage: { getItem: () => null, setItem: () => {} } };
ctx.GAME = JSON.parse(fs.readFileSync(require('path').join(__dirname,'..','juego','gamedata.json'), 'utf8'));
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(S + 'logic.js', 'utf8') + '\n' + fs.readFileSync(S + 'run.js', 'utf8') + '\nthis.Profile=Profile;this.Run=Run;this.versionPickOptions=versionPickOptions;', ctx);
const { Profile, Run, versionPickOptions, GAME } = ctx;
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails++; };
Profile.load(); Profile.data.firstDone = true;
const inf = GAME.players.filter(p => p.inf);
ok(inf.length > 150 && inf.every(p => p.gacha === false && p.cs && !p.halloween), inf.length + ' versiones marcadas (fuera del gacha, con muñeco, sin las de Halloween)');
ok(!GAME.players.find(p => p.id === 39001).inf, 'Karl Kappa (Papi Gavi) no entra: es del código');
const R = id => GAME.players.find(p => p.id === id).rarity;
let ok5 = true, ok20 = true, leg30 = false;
for (let i = 0; i < 200; i++) {
  const a = versionPickOptions(5), b = versionPickOptions(20), c = versionPickOptions(35);
  if (a.length !== 3 || a.some(id => !['comun', 'rara'].includes(R(id)))) ok5 = false;
  if (b.some(id => R(id) === 'legendaria')) ok20 = false;
  if (c.some(id => R(id) === 'legendaria')) leg30 = true;
}
ok(ok5, 'jefe de la oleada 5: 3 opciones, solo comunes y raras');
ok(ok20, 'jefe de la oleada 20: sin legendarias');
ok(leg30, 'jefe de la oleada 30 o más: ya pueden salir legendarias');
const ids = GAME.players.filter(p => p.cs && p.gacha !== false).slice(0, 5).map(p => p.id); ids.forEach(id => { Profile.data.coll[id] = { stars: 1, up: {} }; });
const run = Run.create('infinite', ids); while (run.schedule.length < 5) run.schedule.push(Run.infiniteTeam(run.schedule.length)); run.index = 4;
const out = Run.applyResult(run, 'win', 2);
const g = (Profile.data.giftPicks || []).find(x => x.uid === out.versionPick);
ok(g && g.opts.length === 3, 'ganar al jefe deja guardado un «elige 1 de 3»');
const i = Profile.data.giftPicks.indexOf(g), id = g.opts[0], r = Profile.takePick(i, id);
ok(r && Profile.data.coll[id] && !Profile.data.giftPicks.includes(g), 'elegir uno lo añade a tu colección');
const run2 = Run.create('infinite', ids); while (run2.schedule.length < 3) run2.schedule.push(Run.infiniteTeam(run2.schedule.length)); run2.index = 2; const n0 = (Profile.data.giftPicks || []).length;
Run.applyResult(run2, 'win', 1); ok((Profile.data.giftPicks || []).length === n0, 'una oleada normal no da versión');
console.log(fails ? '\n✗ ' + fails + ' fallos' : '\n✓ Todo bien');
process.exit(fails ? 1 : 0);
