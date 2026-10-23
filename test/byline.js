// Llevar el balón más allá de una línea: fuera (puerta, córner o banda); solo es gol si entras por la boca de la portería
const fs = require('fs'), vm = require('vm');
const S = require('path').join(__dirname,'..','src')+'/';
const ctx = { TX: (s, ...a) => a.length ? s.replace(/\{(\d+)\}/g, (m, i) => a[i]) : s, TXn: (n, a, b) => (n === 1 ? a : b).replace('{0}', n), console, Math, JSON, Object, Array, Set, Map, localStorage: { getItem: () => null, setItem: () => {} } };
ctx.GAME = JSON.parse(fs.readFileSync(require('path').join(__dirname,'..','juego','gamedata.json'), 'utf8'));
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(S + 'logic.js', 'utf8') + '\n' + fs.readFileSync(S + 'run.js', 'utf8') + '\nthis.Logic=Logic;this.rivalTeam=rivalTeam;', ctx);
const { Logic, rivalTeam } = ctx, F = Logic.FIELD, cx = F.w / 2;
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails++; };
// A ataca hacia y = 0. El jugador de A lleva el balón desde (x, y) en la dirección (mx, my) durante un rato
function run(x, y, mx, my, defenders) {
  const s = Logic.createMatch({ minutes: 3, difficulty: 'facil', golden: false, techMode: 'boton' }, { A: rivalTeam('Royal Academy', 1, 1), B: rivalTeam('Zeus', 1, 1) });
  s.pause = null;
  const A = s.players.filter(p => p.team === 'A'), B = s.players.filter(p => p.team === 'B');
  B.forEach(p => { if (p.role === 'POR') { p.x = defenders ? cx : 2; p.y = defenders ? 1 : 50; } else { p.x = 2; p.y = 45; } });
  const me = A.find(p => p.role === 'DEL'); me.x = x; me.y = y;
  A.filter(p => p !== me).forEach(p => { p.x = 30; p.y = 48; });
  Logic._t.take(s, me); s.controlledId = me.id; me.aim = Math.atan2(my, mx);
  const ev = []; let maxBehind = 0;
  for (let i = 0; i < 240 && !ev.length && !(s.ball.owner && s.ball.owner.role === 'POR'); i++) {
    Logic.update(s, { move: { x: mx, y: my }, sprint: true, shootHeld: false, pressed: new Set() }, 1 / 60);
    if (s.ball.owner === me) maxBehind = Math.min(maxBehind, s.ball.y);
    for (const e of s.events) if (e.type === 'goal' || e.type === 'setpiece') ev.push(e.type + (e.kind ? ':' + e.kind : '') + '@' + e.team);
    s.events.length = 0;
  }
  return { ev: ev[0] || 'nada', score: s.score, maxBehind, owner: s.ball.owner && s.ball.owner.role };
}
const side = cx + F.goalW / 2 + 3;
let r = run(side, 3, 0, -1);
ok(r.ev === 'setpiece:puerta@B', 'cruzar la línea de fondo al lado de la portería = saque de puerta del rival (' + r.ev + ')');
ok(r.maxBehind >= -0.01, 'el balón nunca llega a estar detrás de la línea con dueño (' + r.maxBehind.toFixed(2) + ')');
r = run(side, 3, -0.6, -1, true);
ok(r.ev !== 'goal@A' && r.score.A === 0, 'ya no se puede rodear al portero por detrás para marcar (' + r.ev + ')');
r = run(cx, 4, 0, -1);
ok(r.ev !== 'goal@A' && r.score.A === 0 && r.owner === 'POR', 'entrar andando con el balón en la portería no vale: el portero se lo quita (' + r.ev + ', ' + r.owner + ')');
r = run(cx + 4, 6, -0.5, -1, true);
ok(r.ev !== 'goal@A' && r.score.A === 0, 'regatear hasta el portero: se lo quita (' + r.ev + ')');
r = run(1, 30, -1, 0);
ok(r.ev === 'setpiece:banda@B', 'salir por la banda con el balón = saque de banda del rival (' + r.ev + ')');
r = run(17, 30, 0, -1);
ok(r.ev === 'nada' || /goal|puerta|corner/.test(r.ev), 'conducir por el campo no da falsos fueras (' + r.ev + ')');
r = run(cx, 8, 0, -1, true);
ok(r.ev !== 'goal@A' && r.score.A === 0, 'correr con el balón contra el portero: te la quita y no hay gol (' + r.ev + ')');
console.log(fails ? '\n✗ ' + fails + ' fallos' : '\n✓ Todo bien');
process.exit(fails ? 1 : 0);
