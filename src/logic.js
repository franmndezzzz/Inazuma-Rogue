/* =====================================================================
   LÓGICA DEL PARTIDO (no usa Phaser). Metros y segundos.
   El equipo A (tú) ataca hacia arriba (y = 0); el B, hacia abajo.
   ===================================================================== */
// Fácil = el antiguo Difícil; Medio y Difícil suben desde ahí
const DIFF = {
  facil:   { aiSpeed: 1.03, steal: 1.1,  shootRange: 15, think: 0.26, tackle: 0.85, react: 0.04, techUse: 0.9, smart: 0.6 },
  medio:   { aiSpeed: 1.07, steal: 1.35, shootRange: 16, think: 0.2,  tackle: 0.95, react: 0.03, techUse: 1,   smart: 0.85 },
  dificil: { aiSpeed: 1.12, steal: 1.6,  shootRange: 17, think: 0.15, tackle: 1.05, react: 0.02, techUse: 1,   smart: 1 },
};
let GAME_SPEED = 0.75;   // todo el juego un 25 % más pausado (el reloj del partido no cambia)

const Logic = (() => {
  // Campo para 5 contra 5 (provisional)
  const F = { w: 34, l: 52, margin: 4, goalW: 5.5, goalDepth: 1.5, barZ: 2.0,
              boxW: 18, boxD: 7.5, smallW: 9, smallD: 2.5, spot: 6.5, circleR: 5.5 };
  const cx = F.w / 2;
  const rnd = Math.random;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const snap8 = a => Math.round(a / (Math.PI / 4)) * (Math.PI / 4);
  const angDiff = (a, b) => { let d = Math.abs(a - b) % (2 * Math.PI); return d > Math.PI ? 2 * Math.PI - d : d; };
  const turnTo = (a, b, max) => { let d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI; return a + clamp(d, -max, max); };
  const attackDir = t => t === 'A' ? -1 : 1;
  const ownGoalY = t => t === 'A' ? F.l : 0;
  const oppGoalY = t => t === 'A' ? 0 : F.l;
  const depthOf = (t, y) => t === 'A' ? F.l - y : y;
  const toAbs = (t, ox, depth) => t === 'A' ? { x: cx + ox, y: F.l - depth } : { x: cx - ox, y: depth };
  const possession = s => s.ball.owner ? s.ball.owner.team : s.ball.lastTeam;
  const controlled = s => s.players.find(p => p.id === s.controlledId);
  const inOwnBox = (t, pt) => Math.abs(pt.x - cx) < F.boxW / 2 && depthOf(t, pt.y) < F.boxD && depthOf(t, pt.y) > -1;
  const goalDist = p => Math.hypot(cx - p.x, oppGoalY(p.team) - p.y);
  // Fuera de juego: línea del penúltimo rival (contando al portero), nunca antes de medio campo ni por detrás del balón
  function offLine(s, team) {
    const opp = s.players.filter(o => o.team !== team).map(o => depthOf(team, o.y)).sort((a, b) => b - a);
    return Math.max(opp[1] ?? F.l, depthOf(team, s.ball.y), F.l / 2);
  }
  const isOffside = (s, m) => depthOf(m.team, m.y) > offLine(s, m.team) + 0.4;
  const onside = (s, p, y) => { const lim = offLine(s, p.team) - 0.6; return depthOf(p.team, y) > lim ? toAbs(p.team, 0, lim).y : y; };

  const BASE = { POR: [0, 1.2], DEF: [-4, 11], MED: [6, 19], DEL: [-2, 27] };
  const KO = { POR: [0, 1.2], DEF: [-5, 9], MED: [6, 15] };

  /* ---------- Creación ---------- */
  function createMatch(settings, teams) {
    const diff = DIFF[settings.difficulty] || DIFF.medio;
    const s = { field: F, settings, diff, teams, players: [], score: { A: 0, B: 0 }, time: settings.minutes * 60, t: 0,
      pause: null, hitstop: 0, over: false, result: null, golden: false, controlledId: null, events: [], slow: 0, tech: null, effects: [],
      shoot: { charging: false, charge: 0, aimX: 0 },
      ball: { x: cx, y: F.l / 2, z: 0, vx: 0, vy: 0, vz: 0, owner: null, lastTeam: 'A', intended: null, shot: null, fire: null, ang: 0, phase: 0 } };
    for (const team of ['A', 'B']) {
      teams[team].players.forEach((d, i) => {
        const ai = team === 'B';
        const home = d.home || BASE[d.role], ko = d.ko || [home[0], Math.min(home[1], 22)];
        s.players.push(Object.assign({}, d, { id: team + i, team, num: i + 1, home, ko,
          speed: d.speed * (ai ? diff.aiSpeed : 1),
          cd: {}, x: 0, y: 0, z: 0, vx: 0, vy: 0, dvx: 0, dvy: 0, facing: 0, aim: 0, moving: false,
          stamina: 1, tired: false, sprint: false, stun: 0, kickLock: 0, kickT: 0, tackle: null, tackleCd: 0, windup: null, tkWind: 0,
          dash: null, think: 0, holdT: 0, react: 0, diving: false, gkTech: null, invuln: 0 }));
      });
    }
    // Recarga: unas 3 veces por partido; las técnicas fuertes tardan más
    const span = settings.minutes * 60 * GAME_SPEED / 3;
    for (const p of s.players) {
      p.techs = p.techs.map(t => Object.assign({}, t, { cd: +(span * (0.75 + t.power / 240) * (p.bonus.cdMul || 1)).toFixed(1) }));
      for (const t of p.techs) p.cd[t.id] = t.cd * 0.5;   // al empezar, a mitad de recarga
    }
    kickoff(s, 'A');
    return s;
  }

  // Delantero que saca de centro (o el jugador más adelantado)
  function striker(s, team) {
    const order = { DEL: 0, MED: 1, DEF: 2, POR: 3 };
    return s.players.filter(p => p.team === team).sort((a, b) => order[a.role] - order[b.role] || b.ko[1] - a.ko[1])[0];
  }
  function kickoff(s, team) {
    const tk = striker(s, team);
    for (const p of s.players) {
      const o = p === tk ? [0, F.l / 2 - 0.6] : [p.ko[0], Math.min(p.ko[1], F.l / 2 - (p.team === team ? 1.5 : 6))];
      const a = toAbs(p.team, o[0], o[1]);
      Object.assign(p, { x: a.x, y: a.y, z: 0, vx: 0, vy: 0, dvx: 0, dvy: 0, stun: 0, tackle: null, dash: null, windup: null, tkWind: 0,
        kickLock: 0, moving: false, diving: false, gkTech: null, invuln: 0 });
      p.facing = p.aim = attackDir(p.team) < 0 ? -Math.PI / 2 : Math.PI / 2;
    }
    s.tech = null; s.slow = 0; s.shoot.charging = false; s.shoot.charge = 0;
    take(s, tk);
    s.controlledId = striker(s, 'A').id;
    s.pause = { t: 0.9 };
    s.events.push({ type: 'kickoff' });
  }

  function take(s, p) {
    const b = s.ball;
    Object.assign(b, { owner: p, intended: null, shot: null, fire: null, offside: null, setPiece: null, lastTeam: p.team, vx: 0, vy: 0, vz: 0, z: 0 });
    b.ang = p.aim;
    p.holdT = 0; p.think = 0.2 + rnd() * 0.25;
    if (p.team === 'A') s.controlledId = p.id;   // también el portero, mientras tenga el balón
    if (p.role === 'POR' && p.team === 'A') { s.gkHold = 0; if (!s.gkHint) { s.gkHint = true; s.events.push({ type: 'msg', text: TX('Tu portero tiene el balón: pasa (J) o despeja (L)') }); } }
    syncBall(s, 1);
  }

  // El balón va pegado al pie, gira con suavidad y "rebota" un poco al correr (toques)
  function syncBall(s, dt) {
    const b = s.ball, p = b.owner;
    if (!p) return;
    b.ang = turnTo(b.ang, p.aim, 14 * dt);
    const sp = Math.hypot(p.vx, p.vy);
    b.phase += dt * sp * 1.6;
    const r = 0.45 + (sp > 1 ? 0.18 * (0.5 + 0.5 * Math.sin(b.phase)) : 0);
    b.x = p.x + Math.cos(b.ang) * r; b.y = p.y + Math.sin(b.ang) * r; b.z = 0;
  }

  function kick(s, p, vx, vy, vz) {
    Object.assign(s.ball, { owner: null, vx, vy, vz, lastTeam: p.team, intended: null, shot: null, fire: null, offside: null });
    p.kickLock = 0.3; p.kickT = 0.28;
  }

  function speedOf(s, p, sprint) {
    let v = p.speed; const own = s.ball.owner;
    if (own === p) v *= 0.92;
    // con el balón se esprinta algo menos (antes los tuyos se escapaban corriendo de todo el equipo rival)
    if (sprint && !p.tired && p.stamina > 0.02) { v *= own === p ? 1.3 : 1.38; p.sprint = true; }
    if (p.team === 'B' && own && own.team === 'A') v *= 1.05;   // la IA rival corre un poco más cuando defiende
    if (p.id === s.controlledId && s.shoot.charging) v *= 0.45;
    return v;
  }

  function moveTo(s, p, tx, ty, sprint) {
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
    if (d < 0.35) { p.dvx = p.dvy = 0; return; }
    const sp = speedOf(s, p, sprint && d > 3) * Math.min(1, d / 1.2);
    p.dvx = dx / d * sp; p.dvy = dy / d * sp;
  }

  /* ---------- Acciones con balón ---------- */
  function pass(s, p, kind, dir, power = 0) {
    const mates = s.players.filter(m => m.team === p.team && m !== p && m.role !== 'POR');
    const aim = dir && Math.hypot(dir.x, dir.y) > 0.3 ? Math.atan2(dir.y, dir.x) : p.aim;
    let best = null, bestScore = Infinity;
    for (const m of mates) {
      const d = dist(m, p); if (d < 2) continue;
      const score = angDiff(aim, Math.atan2(m.y - p.y, m.x - p.x)) * 3 + d * 0.035;
      if (score < bestScore) { bestScore = score; best = m; }
    }
    if (!best) return false;
    const off = s.ball.setPiece !== p.id && isOffside(s, best);
    let tx, ty, speed, vz;
    if (kind === 'through') {
      tx = clamp(best.x + best.vx * 0.6 + (cx - best.x) * 0.15, 1, F.w - 1);
      ty = clamp(best.y + best.vy * 0.6 + attackDir(p.team) * 5, 1.5, F.l - 1.5);
      speed = clamp(Math.hypot(tx - p.x, ty - p.y) * 0.85 + 6, 8, 15); vz = 3;
    } else {
      tx = best.x + best.vx * 0.35; ty = best.y + best.vy * 0.35;
      // Pase raso: más fuerte que antes y, si se carga, un pase tenso y rápido
      speed = clamp(Math.hypot(tx - p.x, ty - p.y) * 1.15 + 8.5, 10.5, 19) * (1 + 0.45 * power) * (0.92 + p.kick / 900); vz = 0;
    }
    const d = Math.hypot(tx - p.x, ty - p.y) || 1;
    p.aim = Math.atan2(ty - p.y, tx - p.x); p.facing = snap8(p.aim);
    s.ball.ang = p.aim; syncBall(s, 1);
    kick(s, p, (tx - p.x) / d * speed, (ty - p.y) / d * speed, vz);
    s.ball.intended = best.id;
    s.ball.passPower = power;
    if (off) s.ball.offside = best.id;
    if (p.team === 'A') s.controlledId = best.id;
    s.events.push({ type: 'pass', power });
    return true;
  }

  // Lo que aporta una técnica: crece con su potencia, pero sin aplastar a las estadísticas
  const techEff = (t, bonus) => 2 + t.power * 0.25 + (bonus || 0) * 0.4;
  // Un tiro bien cargado (85 % o más) pega más fuerte y el portero ya no tiene tanta ventaja
  function shotStrength(p, charge, tech) { return p.kick * (0.6 + 0.4 * charge) + (tech ? techEff(tech, p.bonus.tiro) : charge >= 0.85 ? 6 : 0); }

  function shoot(s, p, charge, aimX, tech) {
    const goalY = oppGoalY(p.team), half = F.goalW / 2 - 0.35;
    let tx = cx + clamp(aimX, -1, 1) * half;
    const scatter = (1 - p.kick / 110) * 2.2 * (0.6 + charge * 0.6) * (tech ? 0.3 : 1);
    tx += (rnd() - 0.5) * scatter * 2;
    const speed = (15 + charge * 13) * (0.8 + p.kick / 250) * (tech ? 1.2 + tech.power / 250 : 1);
    const dx = tx - p.x, dy = goalY - p.y, d = Math.hypot(dx, dy) || 1;
    p.aim = Math.atan2(dy, dx); p.facing = snap8(p.aim);
    s.ball.ang = p.aim; syncBall(s, 1);
    kick(s, p, dx / d * speed, dy / d * speed, tech ? -1 : 1 + charge * 2.6 + rnd() * 0.6);
    s.ball.shot = { team: p.team, by: p.id, power: shotStrength(p, charge, tech), tech: tech || null, charged: !tech && charge >= 0.85, resolved: false, dist: d };
    s.events.push({ type: 'shot', team: p.team });
  }

  /* ---------- Supertécnicas ---------- */
  const ready = (p, t) => (p.cd[t.id] || 0) <= 0;
  function bestTech(p, type) {
    let best = null;
    for (const t of p.techs) if (t.type === type && ready(p, t) && (!best || t.power > best.power)) best = t;
    return best;
  }
  function anyTech(p, type) { return p.techs.some(t => t.type === type); }
  // Elegir qué supertécnica usar cuando tienes varias del mismo tipo (botón ⇄ / tecla U)
  function cycleTech(s, p) {
    const c = contextTech(s, p); if (!c) return;
    const list = p.techs.filter(t => t.type === c.tech.type); if (list.length < 2) return;
    const i = list.findIndex(t => t.id === c.tech.id), n = list[(i + 1) % list.length];
    p.techPick = p.techPick || {}; p.techPick[c.tech.type] = n.id;
    s.events.push({ type: 'msg', text: TX('Técnica: ') + n.name });
  }
  const techChoices = (s, p) => { const c = p && contextTech(s, p); return c ? p.techs.filter(t => t.type === c.tech.type).length : 0; };

  // Qué técnica usaría ahora el jugador al pulsar el botón (según la situación)
  function contextTech(s, p) {
    const b = s.ball;
    if (b.owner === p) {
      if (anyTech(p, 'tiro') && goalDist(p) < 22) return pickReady(p, 'tiro');
      if (anyTech(p, 'regate')) return pickReady(p, 'regate');
      if (anyTech(p, 'tiro')) return pickReady(p, 'tiro');
      return null;
    }
    if (anyTech(p, 'bloqueo')) return pickReady(p, 'bloqueo');
    return null;
  }
  function pickReady(p, type) {
    const pick = p.techPick && p.techPick[type] != null && p.techs.find(t => t.id === p.techPick[type] && t.type === type);
    if (pick) return { tech: pick, ready: ready(p, pick), frac: ready(p, pick) ? 0 : p.cd[pick.id] / pick.cd };
    const r = bestTech(p, type);
    if (r) return { tech: r, ready: true, frac: 0 };
    let soon = null;
    for (const t of p.techs) if (t.type === type && (!soon || p.cd[t.id] < p.cd[soon.id])) soon = t;
    return soon ? { tech: soon, ready: false, frac: p.cd[soon.id] / soon.cd } : null;
  }

  // Cada técnica tiene su propia recarga: usar una no bloquea las demás
  const spend = (p, tech) => { p.cd[tech.id] = tech.cd; };
  function startTech(s, p, tech, aimX) {
    spend(p, tech);
    s.shoot.charging = false; s.shoot.charge = 0;
    const holder = s.ball.owner;
    const dur = tech.type === 'tiro' ? 0.55 : tech.type === 'regate' ? 0.3 : 0.25;
    s.tech = { p, tech, t: 0, dur, aimX, target: tech.type === 'bloqueo' ? holder : null };
    p.invuln = dur + 0.4;
    s.events.push({ type: 'techStart', name: tech.name, elem: tech.elem, kind: tech.type, team: p.team, id: p.id });
    return true;
  }

  function tryTech(s, p, aimX, quiet) {
    if (s.tech) return false;
    const c = contextTech(s, p);
    const say = text => { if (!quiet) s.events.push({ type: 'msg', text }); return false; };
    if (!c) return say(s.ball.owner === p ? p.name + TX(' no tiene técnica de tiro ni de regate') : p.name + TX(' no tiene técnica de bloqueo'));
    if (!c.ready) return say(c.tech.name + ' recargando');
    const t = c.tech;
    if (t.type === 'tiro' && goalDist(p) > 24) return say(TX('Acércate más a la portería'));
    if (t.type === 'bloqueo') {
      const h = s.ball.owner;
      if (!h || h.team === p.team || dist(h, p) > 4.5) return say(TX('Acércate al rival que lleva el balón'));
    }
    return startTech(s, p, t, aimX);
  }

  function updateTech(s, dt) {
    const T = s.tech; if (!T) return;
    const p = T.p, b = s.ball, k = Math.min(1, (T.t += dt) / T.dur);
    p.dvx = p.dvy = 0; p.vx *= 0.5; p.vy *= 0.5;
    if (T.tech.type === 'tiro') {
      if (b.owner !== p) { s.tech = null; return; }
      p.z = Math.sin(k * Math.PI / 2) * 1.6;
      const a = T.t * 16;
      b.x = p.x + Math.cos(a) * 0.7; b.y = p.y + Math.sin(a) * 0.42; b.z = p.z + 0.8 + k * 0.8;
      if (k >= 1) {
        s.tech = null;
        b.x = p.x; b.y = p.y + attackDir(p.team) * 0.4;
        shoot(s, p, 1, T.aimX, T.tech);
        b.z = 1.6; b.vz = -1; b.fire = T.tech.elem;
        s.events.push({ type: 'techKick', x: b.x, y: b.y, elem: T.tech.elem, name: T.tech.name, team: p.team });
        s.hitstop = 0.08;
      }
    } else if (k >= 1) {
      s.tech = null;
      if (T.tech.type === 'regate') {
        if (b.owner !== p) return;
        p.dash = { t: 0.35, dir: p.aim, speed: 15, tech: T.tech };
        p.invuln = 0.6;
        s.events.push({ type: 'techBurst', x: p.x, y: p.y, elem: T.tech.elem });
      } else if (T.tech.type === 'bloqueo') {
        const h = b.owner;
        if (!h || h.team === p.team) return;
        p.dash = { t: 0.25, dir: Math.atan2(h.y - p.y, h.x - p.x), speed: 13, tech: T.tech, target: h };
      }
    }
  }

  function updateDash(s, p, dt) {
    const D = p.dash;
    p.dvx = Math.cos(D.dir) * D.speed; p.dvy = Math.sin(D.dir) * D.speed;
    p.vx = p.dvx; p.vy = p.dvy;
    D.t -= dt;
    if (D.tech.type === 'regate') {
      D.met = D.met || new Set();
      for (const o of s.players) {
        if (o.team === p.team || (o.role === 'POR' && !D.tech.plain) || o.stun > 0 || D.met.has(o) || dist(o, p) > (o.role === 'POR' ? 1.8 : 2.4)) continue;
        if (o.dash && o.dash.tech.type === 'bloqueo') continue;
        D.met.add(o);
        const chance = D.tech.plain && o.role === 'POR' ? 0.1                                    // regate normal al portero: solo 1 de cada 10
          : D.tech.plain ? clamp(0.58 + (p.control - o.defense) / 55, 0.3, 0.85)   // regate normal: más arriesgado
          : clamp(0.72 + (p.control + techEff(D.tech, p.bonus.regate) * 1.2 - o.defense) / 50, 0.4, 0.95);
        if (rnd() < chance || s.ball.owner !== p) {
          o.stun = D.tech.plain ? 0.55 : 0.9; o.tackle = null;
          if (D.tech.plain) { p.invuln = 0.45; if (p.team === 'A') s.events.push({ type: 'msg', text: TX('¡Regate!') }); }
          else s.events.push({ type: 'knock', x: o.x, y: o.y, elem: D.tech.elem });
        } else {   // el defensa lee el regate y se queda el balón
          take(s, o); p.stun = D.tech.plain ? 0.45 : 0.6; p.kickLock = 0.5; p.dash = null;
          s.events.push({ type: 'dodgeFail', x: o.x, y: o.y, elem: D.tech.elem, team: o.team, name: o.name });
          return;
        }
      }
    } else if (D.tech.type === 'bloqueo' && D.target) {
      const h = D.target;
      if (s.ball.owner === h && dist(h, p) < 1.3) {
        const hp = h.control * 0.6 + h.body * 0.4 + (h.dash ? techEff(h.dash.tech) * 1.2 : 0);
        const chance = clamp(0.5 + (p.defense + techEff(D.tech, p.bonus.bloqueo) * 1.2 - hp) / 60, 0.2, 0.93);
        if (rnd() < chance) {
          h.stun = 0.9; h.kickLock = 0.5; h.dash = null;
          take(s, p);
          s.events.push({ type: 'blockOk', x: p.x, y: p.y, elem: D.tech.elem, team: p.team, name: D.tech.name });
        } else s.events.push({ type: 'msg', text: TX('¡') + h.name + TX(' resiste el bloqueo!') });
        D.t = 0;
      }
    }
    if (D.t <= 0) { p.dash = null; if (D.tech.type === 'bloqueo' && s.ball.owner !== p) p.stun = Math.max(p.stun, 0.35); }
  }

  /* ---------- Regate normal (sin técnica) ----------
     Un recorte rápido con el balón: si hay un rival delante, intenta superarlo
     (control contra defensa); si sale bien, el rival pierde el equilibrio. */
  const DRIBBLE = { name: TX('Regate'), type: 'regate', power: 0, elem: 'neutro', plain: true };
  const DRIBBLE_CD = 2.6;   // segundos entre regates normales
  function dribble(s, p, dir) {
    if (s.ball.owner !== p || (p.dribbleCd || 0) > 0 || p.stun > 0 || p.dash) return false;
    const a = dir && Math.hypot(dir.x, dir.y) > 0.3 ? Math.atan2(dir.y, dir.x) : p.aim;
    p.aim = a; p.facing = snap8(a); s.ball.ang = a;
    p.dash = { t: 0.28, dir: a, speed: Math.max(11, p.speed * 1.55), tech: DRIBBLE };
    p.invuln = 0.3; p.dribbleCd = DRIBBLE_CD;
    s.events.push({ type: 'dribble', id: p.id, x: p.x, y: p.y, team: p.team });
    return true;
  }

  /* ---------- Entradas ---------- */
  function startTackle(s, p) {
    if (p.tackleCd > 0 || p.stun > 0 || p.tackle || p.dash) return;
    const h = s.ball.owner, b = s.ball;
    let dir = p.aim;
    if (h && h.team !== p.team && dist(h, p) < 4.5) dir = Math.atan2(h.y + h.vy * 0.15 - p.y, h.x + h.vx * 0.15 - p.x);
    else if (!h && dist(b, p) < 4.5) dir = Math.atan2(b.y - p.y, b.x - p.x);
    p.aim = dir; p.facing = snap8(dir);
    p.tackle = { t: 0.26, dir, hit: false, ok: false, target: h && h.team !== p.team ? h : null };
    p.tackleCd = 0.9;
  }

  function updateTackle(s, p, dt) {
    const T = p.tackle;
    if (T.target && s.ball.owner === T.target) {   // la carga se corrige un poco hacia el rival
      T.dir = turnTo(T.dir, Math.atan2(T.target.y - p.y, T.target.x - p.x), 7 * dt);
      p.aim = T.dir; p.facing = snap8(T.dir);
    }
    p.dvx = Math.cos(T.dir) * 10.5; p.dvy = Math.sin(T.dir) * 10.5;
    T.t -= dt;
    const h = s.ball.owner;
    if (!T.hit && h && h.team !== p.team && h.role !== 'POR' && h.invuln <= 0 && dist(h, p) < 1.15) {
      T.hit = true;
      const front = Math.cos(angDiff(Math.atan2(p.y - h.y, p.x - h.x), h.aim)) > 0 ? 0.1 : -0.12;
      const chance = clamp(0.55 + (p.defense - (h.control * 0.6 + h.body * 0.4)) / 70 + front, 0.2, 0.92);
      if (rnd() < chance) {
        T.ok = true;
        h.stun = 0.8; h.kickLock = 0.5;
        h.vx = Math.cos(T.dir) * 4; h.vy = Math.sin(T.dir) * 4;   // empujón
        if (rnd() < 0.7) take(s, p);
        else Object.assign(s.ball, { owner: null, vx: Math.cos(T.dir) * 6, vy: Math.sin(T.dir) * 6, vz: 1, lastTeam: p.team, intended: null });
        s.events.push({ type: 'tackle', ok: true, team: p.team, x: h.x, y: h.y });
        T.t = Math.min(T.t, 0.06);
      } else s.events.push({ type: 'tackle', ok: false, team: p.team, x: h.x, y: h.y });
    }
    if (T.t <= 0) {
      p.tackle = null; p.recover = T.ok ? 0.1 : 0.4;
      if (!T.ok && p.team === 'A' && p.id === s.controlledId) s.events.push({ type: 'msg', text: TX('Entrada fallida') });
    }
  }

  // Cambia al compañero que está hacia donde apunta el joystick; sin dirección, al más cercano al balón
  // Cambiar de jugador: al compañero que antes llega al balón (antes, con el joystick movido, elegía «hacia donde apuntabas»
  // y en el móvil casi siempre lo estás moviendo, así que cambiaba a quien no querías). Si pulsas otra vez enseguida, al siguiente.
  function switchPlayer(s, dir) {
    const cur = controlled(s), b = s.ball, tgt = b.owner || b;
    const mates = s.players.filter(p => p.team === 'A' && p.role !== 'POR' && p !== cur);
    const eta = p => (b.owner ? dist(p, tgt) : dist(p, interceptPoint(s, p))) / Math.max(4, p.speed);
    const order = mates.sort((m, q) => eta(m) - eta(q));
    s.swHist = (s.swHist || []).filter(h => s.t - h.t < 1.2);
    const c = order.find(m => !s.swHist.some(h => h.id === m.id)) || order[0];
    if (c) {
      s.swHist.push({ id: cur ? cur.id : null, t: s.t });
      s.controlledId = c.id; s.swT = 1.2;   // el cambio automático no te lo deshace enseguida
      s.events.push({ type: 'switch', id: c.id });
    }
  }

  // Cambio automático: si el balón está suelto o lo tiene el rival y otro compañero llega mucho antes, pasas a él
  function autoSwitch(s, dt) {
    if (s.settings.autoSwitch === 0) return;
    const me = controlled(s), b = s.ball;
    s.swT = Math.max(0, (s.swT || 0) - dt);
    const lost = s.lastOwnerTeam === 'A' && b.owner && b.owner.team === 'B';
    s.lastOwnerTeam = b.owner ? b.owner.team : s.lastOwnerTeam;
    if (!me || (b.owner && b.owner.team === 'A') || me.tackle || me.dash || (s.tech && s.tech.p === me)) return;
    if (!b.owner && b.intended && b.intended.startsWith('A')) return;   // un pase tuyo en el aire: ya va a tu jugador
    if (s.swT > 0 && !lost) return;
    const tgt = b.owner || b;
    const eta = p => (b.owner ? dist(p, tgt) : dist(p, interceptPoint(s, p))) / Math.max(4, p.speed);
    let best = me, be = eta(me);
    for (const p of s.players) {
      if (p.team !== 'A' || p.role === 'POR' || p === me || p.stun > 0) continue;
      const e = eta(p); if (e < be) { be = e; best = p; }
    }
    if (best !== me && be < eta(me) * (lost ? 0.85 : 0.6) - 0.1) {
      s.controlledId = best.id; s.swT = 0.9;
      s.events.push({ type: 'switch', id: best.id, auto: true });
    }
  }

  // Despeje del portero: balón largo y alto hacia donde apuntas (o hacia arriba)
  function clearance(s, p, dir) {
    const a = dir && Math.hypot(dir.x, dir.y) > 0.3 ? Math.atan2(dir.y, dir.x) : Math.atan2(attackDir(p.team), 0);
    const fwd = Math.sin(a) * attackDir(p.team) > 0 ? a : Math.atan2(attackDir(p.team), Math.cos(a) * 0.6);   // nunca hacia tu portería
    p.aim = fwd; p.facing = snap8(fwd); s.ball.ang = fwd; syncBall(s, 1);
    const sp = 19 + p.kick / 25;
    kick(s, p, Math.cos(fwd) * sp, Math.sin(fwd) * sp, 7.5);
    s.events.push({ type: 'shot' });
    // pasas a controlar al compañero que mejor llega a la caída del balón
    const land = { x: p.x + Math.cos(fwd) * 16, y: p.y + Math.sin(fwd) * 16 };
    const mate = s.players.filter(m => m.team === p.team && m.role !== 'POR').sort((m, q) => dist(m, land) - dist(q, land))[0];
    if (p.team === 'A' && mate) s.controlledId = mate.id;
  }
  // El portero con balón no sale de su área
  function keepInBox(p) {
    const half = F.boxW / 2 - 0.4, d = depthOf(p.team, p.y);
    p.x = clamp(p.x, cx - half, cx + half);
    if (d > F.boxD - 0.4) p.y = toAbs(p.team, 0, F.boxD - 0.4).y;
    if (d < 0.3) p.y = toAbs(p.team, 0, 0.3).y;
  }

  /* ---------- Control del jugador ---------- */
  function handleUser(s, input) {
    const me = controlled(s), b = s.ball;
    me.tkWind = 0; me.windup = null;   // al pasar a controlarlo, se olvida lo que estaba preparando su IA
    let { x, y } = input.move;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    const pr = input.pressed;
    if (pr.has('techNext')) cycleTech(s, me);   // ⇄: cambiar de supertécnica en cualquier momento
    if (s.tech && s.tech.p === me) return;
    if (me.stun > 0 || me.recover > 0 || me.tackle || me.dash) { s.shoot.charging = false; s.pass = null; return; }

    const sprint = input.sprint || len > 0.95;
    if (len > 0.15) {
      const sp = speedOf(s, me, sprint);
      me.dvx = x * sp; me.dvy = y * sp;
      me.aim = Math.atan2(y, x); me.facing = snap8(me.aim);
    } else if ((b.intended === me.id || dist(me, b) < 7) && !b.owner) {
      const ip = interceptPoint(s, me); moveTo(s, me, ip.x, ip.y, b.intended !== me.id);   // recepción asistida / va solo a por el balón suelto
    } else { me.dvx = me.dvy = 0; }

    const auto = s.settings.techMode === 'auto';
    if (b.owner === me && me.role === 'POR') {
      // Portero con balón: pasa (toque o fuerte), saca en largo (K) o despeja (L). Si tardas mucho, despeja solo
      s.gkHold = (s.gkHold || 0) + input.dt;
      if (pr.has('A')) { if (input.passHeld) s.pass = { charge: 0, dir: { x, y } }; else { pass(s, me, 'strong', { x, y }); return; } }
      if (s.pass) {
        if (input.passHeld) { s.pass.charge = Math.min(1, s.pass.charge + input.dt / 0.7); if (len > 0.15) s.pass.dir = { x, y }; }
        else { const c = s.pass.charge, d = s.pass.dir; s.pass = null; pass(s, me, 'strong', d, c > 0.18 ? c : 0); return; }
      }
      if (pr.has('B')) { pass(s, me, 'through', { x, y }); return; }
      const gkTap = pr.has('shoot');   // un toque rápido en Despeje también vale
      if (input.shootHeld) s.shoot.charging = true;
      else if (s.shoot.charging || gkTap) { s.shoot.charging = false; s.shoot.charge = 0; clearance(s, me, { x, y }); return; }
      if (s.gkHold > 7) { clearance(s, me, null); return; }
      return;
    }
    if (me.role === 'POR') {   // sin balón vuelves a un jugador de campo
      const m = s.players.filter(q => q.team === 'A' && q.role !== 'POR').sort((q, r) => dist(q, b) - dist(r, b))[0];
      if (m) s.controlledId = m.id;
      return;
    }
    if (b.owner === me) {
      // Pase: toque = pase normal; mantener = se carga la fuerza y sale al soltar
      if (pr.has('A')) { if (input.passHeld) s.pass = { charge: 0, dir: { x, y } }; else { pass(s, me, 'strong', { x, y }); return; } }
      if (s.pass) {
        if (input.passHeld) { s.pass.charge = Math.min(1, s.pass.charge + input.dt / 0.7); if (len > 0.15) s.pass.dir = { x, y }; }
        else { const c = s.pass.charge, d = s.pass.dir; s.pass = null; pass(s, me, 'strong', d, c > 0.18 ? c : 0); return; }
      }
      if (pr.has('dribble')) { dribble(s, me, { x, y }); return; }
      pr.has('B');   // el pase al hueco se quitó del juego (22 oct, Fran): la tecla/botón ya no hace nada con balón (el portero sí saca en largo)
      if (pr.has('tech')) { tryTech(s, me, x); return; }
      if (auto && !s.shoot.charging) {
        const t = bestTech(me, 'regate');
        if (t && s.players.some(o => o.team !== me.team && o.role !== 'POR' && o.stun <= 0 && dist(o, me) < 1.8 &&
            angDiff(Math.atan2(o.y - me.y, o.x - me.x), me.aim) < 1)) { startTech(s, me, t, x); return; }
      }
      const tap = pr.has('shoot');   // toque rápido de Tiro: aunque suelte antes del siguiente fotograma, chuta
      if (tap || input.shootHeld) pr.has('switch');   // K/X con balón es tiro: que no quede pendiente «cambiar jugador»
      if (input.shootHeld) {
        s.shoot.charging = true;
        s.shoot.charge = Math.min(1, s.shoot.charge + input.dt / 0.9);
        s.shoot.aimX = x;
      } else if (s.shoot.charging || tap) {
        const ch = s.shoot.charge;
        s.shoot.charging = false; s.shoot.charge = 0;
        const t = bestTech(me, 'tiro');
        if (auto && t && goalDist(me) < 24) startTech(s, me, t, x);
        else shoot(s, me, ch, x);
      }
    } else {
      // Balón que viene hacia ti (un pase tuyo o suelto de tu equipo cerca): Pase/Tiro esperan a que lo recibas
      // (antes, pulsar Pase un instante antes de recibir hacía una entrada y no pasaba)
      const toMe = !b.owner && (b.intended === me.id || (b.lastTeam === me.team && dist(me, b) < 4));
      if (!(toMe && input.shootHeld)) { s.shoot.charging = false; s.shoot.charge = 0; }
      s.pass = null;
      if (toMe) { pr.keep('A'); pr.keep('shoot'); }
      else if (b.owner && b.owner.team === me.team) pr.has('A');   // un compañero lleva el balón: no hay entrada que hacer
      else if (pr.has('A')) startTackle(s, me);
      if (pr.has('switch')) switchPlayer(s, { x, y });
      if (pr.has('tech')) tryTech(s, me, x);
      else if (auto) {
        const h = b.owner, t = bestTech(me, 'bloqueo');
        if (t && h && h.team !== me.team && h.role !== 'POR' && dist(h, me) < 2.5) startTech(s, me, t, 0);
      }
    }
  }

  /* ---------- IA ---------- */
  function homeTarget(s, p) {
    const [ox, oy] = p.home || BASE[p.role], b = s.ball;
    const att = possession(s) === p.team;
    let depth = oy + (depthOf(p.team, b.y) - F.l / 2) * 0.45 + (att ? (p.role === 'DEF' ? 2 : 6) : -2);
    depth = clamp(depth, p.role === 'DEF' ? 5 : 8, F.l - 3);
    const bRel = (b.x - cx) * (p.team === 'A' ? 1 : -1);
    const a = toAbs(p.team, ox + bRel * 0.35, depth);
    a.x = clamp(a.x, 1.5, F.w - 1.5);
    if (att) a.y = onside(s, p, a.y);   // los atacantes no se quedan en fuera de juego
    return a;
  }

  function chaserFor(s, team) {
    let best = null, bd = Infinity;
    for (const p of s.players) {
      if (p.team !== team || p.role === 'POR' || p.stun > 0) continue;
      const d = dist(p, s.ball); if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  function interceptPoint(s, p) {
    const b = s.ball, k = b.z > 0.05 ? 0.12 : 0.85;
    let t = dist(p, b) / Math.max(4, p.speed * 1.3), x = b.x, y = b.y;
    for (let i = 0; i < 3; i++) {
      const f = (1 - Math.exp(-k * t)) / k;
      x = b.x + b.vx * f; y = b.y + b.vy * f;
      t = Math.hypot(x - p.x, y - p.y) / Math.max(4, p.speed * 1.3);
    }
    return { x: clamp(x, -1, F.w + 1), y: clamp(y, -1, F.l + 1) };
  }

  function openMate(s, p) {
    let best = null, bs = -Infinity;
    for (const m of s.players) {
      if (m.team !== p.team || m === p || m.role === 'POR' || dist(m, p) < 3) continue;
      let open = 99;
      for (const o of s.players) if (o.team !== p.team) open = Math.min(open, dist(o, m));
      const sc = Math.min(open, 8) + (depthOf(p.team, m.y) - depthOf(p.team, p.y)) * 0.25;
      if (sc > bs) { bs = sc; best = m; best.open = open; }
    }
    return best;
  }

  function ai(s, p, dt) {
    const b = s.ball;
    if (p.stun > 0 || p.recover > 0 || p.tackle || p.dash || (s.tech && s.tech.p === p)) { if (!p.tackle && !p.dash) p.dvx = p.dvy = 0; return; }
    if (b.owner === p) p.tkWind = 0;   // si se queda el balón, ya no hay entrada que hacer
    else if (p.tkWind > 0) {          // preparando la entrada (aviso «!»)
      p.tkWind -= dt; p.dvx = p.dvy = 0;
      if (p.tkWind <= 0) { p.tkWind = 0; if (b.owner && b.owner.team !== p.team) startTackle(s, p); }
      return;
    }
    if (p.role === 'POR') return gkAI(s, p, dt);
    if (b.owner === p) return holderAI(s, p, dt);
    p.windup = null;
    if (!b.owner) {
      const rec = b.intended ? s.players.find(q => q.id === b.intended) : null;
      const chase = rec && rec.team === p.team ? rec === p : chaserFor(s, p.team) === p;
      if (chase) { const ip = interceptPoint(s, p); moveTo(s, p, ip.x, ip.y, true); return; }
      const h = homeTarget(s, p); moveTo(s, p, h.x, h.y, false); return;
    }
    if (b.owner.team === p.team) {
      const h = homeTarget(s, p);
      let tx = h.x + Math.sin(s.t * 0.7 + p.num) * 2, ty = h.y;
      const hd = dist(p, b.owner);
      if (hd < 5) { tx += (p.x - b.owner.x) / (hd || 1) * 3; ty += (p.y - b.owner.y) / (hd || 1) * 3; }
      ty = onside(s, p, ty);
      moveTo(s, p, tx, ty, dist(p, { x: tx, y: ty }) > 7);
      return;
    }
    defendAI(s, p, dt);
  }

  function defendAI(s, p, dt) {
    const h = s.ball.owner, gy = ownGoalY(p.team);
    const pressers = s.players.filter(q => q.team === p.team && q.role !== 'POR' && q.stun <= 0 && q.id !== s.controlledId)
      .sort((a, q) => dist(a, h) - dist(q, h));
    if (h.role === 'POR') {   // portero con el balón: no se le puede robar, así que se cubren los pases
      const o = (s.marks && s.marks[p.id]) || null;
      if (o && o !== h) { const gx = cx - o.x, gl = Math.hypot(gx, h.y - o.y) || 1; moveTo(s, p, o.x + gx / gl * 1.2, o.y + (h.y - o.y) / gl * 1.2, false); }
      else { const t = toAbs(h.team, 0, F.boxD + 3); moveTo(s, p, t.x + (p.x - cx) * 0.6, t.y, false); }
      return;
    }
    if (pressers[0] === p) {
      // Presión: va a donde estará el rival (no a donde está), siempre por el lado de su portería
      const fx = h.x + h.vx * 0.35, fy = h.y + h.vy * 0.35;
      const gx = cx - fx, gyy = gy - fy, gl = Math.hypot(gx, gyy) || 1;
      moveTo(s, p, fx + gx / gl * 0.6, fy + gyy / gl * 0.6, true);
      if (h.role !== 'POR' && h.invuln <= 0) {
        const d = dist(p, h), use = p.team === 'B' ? s.diff.techUse : 0.6;
        const t = bestTech(p, 'bloqueo');
        if (t && !s.tech && d < 3 && rnd() < use * dt * 1.5) { startTech(s, p, t, 0); return; }
        const tk = p.team === 'B' ? s.diff.tackle : 0.6;
        if (d < 2.2 && p.tackleCd <= 0 && rnd() < tk * dt * 2.5) { p.tkWind = p.team === 'B' ? 0.18 : 0.22; }
      }
      return;
    }
    const o = (s.marks && s.marks[p.id]) || null;   // rival asignado a este defensor
    if (!o || o === h) {
      const gx = cx - h.x, gyy = gy - h.y, gl = Math.hypot(gx, gyy) || 1;
      moveTo(s, p, h.x + gx / gl * 4, h.y + gyy / gl * 4, true); return;
    }
    const gx = cx - o.x, gyy = gy - o.y, gl = Math.hypot(gx, gyy) || 1;
    const hm = homeTarget(s, p), sm = p.team === 'B' ? s.diff.smart : 0.8;
    const sideX = o.x + gx / gl * 1.8, sideY = o.y + gyy / gl * 1.8;                 // entre su marca y la portería
    const laneX = o.x + (h.x - o.x) * 0.3, laneY = o.y + (h.y - o.y) * 0.3;          // tapando la línea de pase
    const mx = sideX * (1 - sm * 0.45) + laneX * sm * 0.45, my = sideY * (1 - sm * 0.45) + laneY * sm * 0.45;
    const tx = mx * 0.8 + hm.x * 0.2, ty = my * 0.8 + hm.y * 0.2;
    moveTo(s, p, tx, ty, dist(p, { x: tx, y: ty }) > 5);
  }

  function assignMarks(s) {
    const h = s.ball.owner; s.marks = {};
    if (!h) return;
    const def = h.team === 'A' ? 'B' : 'A';
    const ds = s.players.filter(p => p.team === def && p.role !== 'POR' && p.id !== s.controlledId);
    const os = s.players.filter(q => q.team === h.team && q.role !== 'POR' && q !== h);
    const used = new Set();
    for (const d of ds.sort((a, b) => depthOf(def, a.y) - depthOf(def, b.y))) {
      let best = null, bd = Infinity;
      for (const o of os) { if (used.has(o)) continue; const dd = dist(d, o); if (dd < bd) { bd = dd; best = o; } }
      if (best) { used.add(best); s.marks[d.id] = best; }
    }
  }

  // Cuántos rivales tapan la línea entre p y un punto (para pases y tiros)
  function laneBlock(s, p, tx, ty, margin, skipGK) {
    let n = 0; const dx = tx - p.x, dy = ty - p.y, L2 = dx * dx + dy * dy || 1;
    for (const o of s.players) {
      if (o.team === p.team || o.stun > 0 || (skipGK && o.role === 'POR')) continue;
      const t = ((o.x - p.x) * dx + (o.y - p.y) * dy) / L2; if (t < 0.05 || t > 1) continue;
      if (Math.hypot(p.x + dx * t - o.x, p.y + dy * t - o.y) < margin) n++;
    }
    return n;
  }
  // Mejor compañero para pasar: libre, con la línea limpia y, si puede ser, más adelantado
  function bestPassTarget(s, p) {
    let best = null;
    for (const m of s.players) {
      if (m.team !== p.team || m === p || m.role === 'POR' || m.stun > 0) continue;
      const d = dist(m, p); if (d < 3) continue;
      let open = 9; for (const o of s.players) if (o.team !== p.team) open = Math.min(open, dist(o, m));
      const prog = depthOf(p.team, m.y) - depthOf(p.team, p.y);
      const sc = Math.min(open, 7) + prog * 0.3 - laneBlock(s, p, m.x, m.y, 1.1, false) * 5 - (d > 18 ? 2 : 0) - (isOffside(s, m) ? 20 : 0);
      if (!best || sc > best.score) best = { p: m, score: sc, open };
    }
    return best;
  }

  function holderAI(s, p, dt) {
    const goalY = oppGoalY(p.team), g = { x: cx, y: goalY }, d = dist(p, g);
    if (p.windup) {      // cargando el tiro
      const w = p.windup; w.t -= dt; w.c = Math.min(1, w.c + dt / 0.42);
      p.dvx = p.dvy = 0; p.aim = Math.atan2(goalY - p.y, cx - p.x); p.facing = snap8(p.aim);
      if (w.t <= 0 || p.stun > 0) { p.windup = null; if (p.stun <= 0) shoot(s, p, w.c, w.aimX); }
      return;
    }
    let near = null, nd = Infinity;
    const opp = s.players.filter(q => q.team !== p.team && q.role !== 'POR' && q.stun <= 0);
    for (const q of opp) { const e = dist(q, p); if (e < nd) { nd = e; near = q; } }
    const rival = p.team === 'B', smart = rival ? s.diff.smart : 0.8;
    p.think -= dt;
    if (p.think <= 0) {
      p.think = (rival ? s.diff.think : 0.3) * (0.6 + rnd() * 0.8);
      const gk = s.players.find(q => q.team !== p.team && q.role === 'POR');
      const side = gk && Math.abs(gk.x - cx) > 0.3 ? (gk.x > cx ? -1 : 1) : (rnd() < 0.5 ? -1 : 1);   // al palo contrario al portero
      const aimX = side * (0.55 + rnd() * 0.4);
      const lateral = Math.abs(p.x - cx), ahead = Math.abs(goalY - p.y);
      const goodAngle = lateral < ahead * 0.9 + 2.5;
      const clear = laneBlock(s, p, cx + aimX * (F.goalW / 2 - 0.35), goalY, 1.0, true) === 0;
      const shotT = bestTech(p, 'tiro'), dribT = bestTech(p, 'regate');
      const aimGoal = () => { p.aim = Math.atan2(goalY - p.y, cx - p.x); p.facing = snap8(p.aim); };
      // Supertécnica de tiro: cerca y con buen ángulo
      if (!s.tech && shotT && d < 16 && goodAngle && (clear || d < 10) && rnd() < s.diff.techUse * (rival ? 1 : 0.8)) { aimGoal(); startTech(s, p, shotT, aimX); return; }
      // Tiro normal: solo con una buena ocasión (o si está encima de la portería)
      // La IA también carga el tiro: se para un momento (se ve la barra) y chuta con fuerza
      if ((d < (rival ? s.diff.shootRange : 14) && goodAngle && clear && rnd() < 0.35 + 0.65 * smart) || d < 6.5) {
        aimGoal(); p.windup = { t: d < 6.5 ? 0.22 : 0.38 + rnd() * 0.2, c: 0.55 + rnd() * 0.3, aimX }; return;
      }
      if (!s.tech && dribT && nd < 2.4 && rnd() < s.diff.techUse) { startTech(s, p, dribT, 0); return; }
      const m = bestPassTarget(s, p), mine = Math.min(nd, 7);
      if (m && m.score > 0 && ((nd < 2.8 && rnd() < 0.5 + 0.4 * smart) || (m.score > mine + 2.5 && rnd() < 0.4 * smart) || rnd() < 0.04)) {
        const ahead2 = depthOf(p.team, m.p.y) > depthOf(p.team, p.y) + 3;
        pass(s, p, ahead2 && m.open > 3 && rnd() < 0.5 ? 'through' : 'strong', { x: m.p.x - p.x, y: m.p.y - p.y }); return;
      }
    }
    // Conducción: hacia la portería buscando el hueco más libre y lejos de la banda
    const base = Math.atan2(goalY - p.y, cx - p.x);
    let bestA = base, bs = -Infinity;
    for (const off of [0, -0.45, 0.45, -0.9, 0.9]) {
      const a = base + off, px = p.x + Math.cos(a) * 3, py = p.y + Math.sin(a) * 3;
      let free = 9; for (const o of opp) free = Math.min(free, Math.hypot(o.x - px, o.y - py));
      const edge = Math.min(px, F.w - px), pen = edge < 2.5 ? (2.5 - edge) * 3 : 0;
      const sc = Math.min(free, 5) * smart - Math.abs(off) * 0.8 - pen;
      if (sc > bs) { bs = sc; bestA = a; }
    }
    const dx = Math.cos(bestA), dy = Math.sin(bestA);
    const sp = speedOf(s, p, nd > 3 && p.stamina > 0.35);
    p.dvx = dx * sp; p.dvy = dy * sp;
    p.aim = bestA; p.facing = snap8(p.aim);
  }

  function gkAI(s, p, dt) {
    const b = s.ball, half = F.goalW / 2;
    const homeY = ownGoalY(p.team) + attackDir(p.team) * 1.2;
    if (b.owner === p) {
      p.dvx = p.dvy = 0; p.holdT += dt;
      if (p.holdT > 1.1) {
        // Solo pasa en corto a un compañero libre y con la línea limpia; si no, despeja en largo hacia el lado con menos rivales
        // (antes pasaba al defensa que tenía un delantero al lado, o directamente a los pies del rival)
        const m = openMate(s, p), safe = m && m.open >= 4.5 && laneBlock(s, p, m.x, m.y, 1.4, false) === 0;
        if (safe) pass(s, p, 'strong', { x: m.x - p.x, y: m.y - p.y });
        else {
          const foes = s.players.filter(o => o.team !== p.team && o.role !== 'POR');
          const left = foes.filter(o => o.x < cx).length, right = foes.length - left;
          const sx = left === right ? (rnd() < 0.5 ? -1 : 1) : left < right ? -1 : 1;
          clearance(s, p, { x: sx * (0.18 + rnd() * 0.17), y: attackDir(p.team) });
        }
      }
      return;
    }
    if (b.shot && !b.shot.resolved && b.shot.team !== p.team) {
      // Parada especial: el portero usa su técnica si el tiro es peligroso
      if (!p.gkTech) {
        const t = bestTech(p, 'parada');
        const vy0 = Math.abs(b.vy) > 0.1 ? b.vy : 0.1, tt = (ownGoalY(p.team) - b.y) / vy0;
        const onTarget = tt > 0 && Math.abs(b.x + b.vx * tt - cx) < F.goalW / 2 + 0.6;
        if (t && onTarget && (b.shot.tech || b.shot.power > p.gk + 4) && (p.team === 'A' || b.shot.tech || rnd() < s.diff.techUse)) {
          p.gkTech = t; spend(p, t);
          s.events.push({ type: 'techStart', name: t.name, elem: t.elem, kind: 'parada', team: p.team, id: p.id, quick: true });
          s.slow = Math.max(s.slow, 0.9);
        } else p.gkTech = 'none';
      }
      p.react -= dt;
      if (p.react > 0) { p.dvx = p.dvy = 0; return; }
      const vy = Math.abs(b.vy) > 0.1 ? b.vy : 0.1, t = (p.y - b.y) / vy;
      const cross = clamp(t > 0 ? b.x + b.vx * t : b.x, cx - half - 0.8, cx + half + 0.8);
      const dive = 5.6 + p.gk / 28 + (p.gkTech && p.gkTech !== 'none' ? 2 : 0), dx = cross - p.x, dy = homeY - p.y, d = Math.hypot(dx, dy);
      if (d > 0.05) { const sp = Math.min(dive, d / Math.max(dt, 0.001)); p.dvx = dx / d * sp; p.dvy = dy / d * sp; }
      else p.dvx = p.dvy = 0;
      p.diving = true; return;
    }
    p.diving = false; p.gkTech = null;
    p.react = p.team === 'B' ? s.diff.react + 0.05 : 0.09;
    if (!b.owner && inOwnBox(p.team, b)) {
      const opp = s.players.filter(q => q.team !== p.team).reduce((m, q) => Math.min(m, dist(q, b)), 99);
      if (dist(p, b) < opp) { moveTo(s, p, b.x, b.y, true); return; }
    }
    // Un rival se mete con el balón en el área: el portero sale a por él
    if (b.owner && b.owner.team !== p.team && inOwnBox(p.team, b.owner) && dist(p, b.owner) < 5) { moveTo(s, p, b.owner.x, b.owner.y, true); return; }
    // Cubre el ángulo: se pone entre el balón y el centro de la portería y sale un poco si el balón se acerca
    const bd = depthOf(p.team, b.y), out = clamp((14 - bd) * 0.12, 0, 1.4);
    moveTo(s, p, cx + clamp((b.x - cx) * 0.42, -half + 0.3, half - 0.3), homeY + attackDir(p.team) * out, false);
  }

  /* ---------- Balón, paradas, robos y saques ---------- */
  function resolveSave(s, g) {
    const b = s.ball, shot = b.shot;
    shot.resolved = true;
    const gt = g.gkTech && g.gkTech !== 'none' ? g.gkTech : null;
    const saveStr = g.gk + (gt ? techEff(gt, g.bonus.parada) : 0);
    // Desde lejos el tiro pierde fuerza; sin técnica, el portero tiene ventaja
    const far = Math.max(0, shot.dist - 10);
    const edge = shot.power - saveStr - 7 - (shot.tech ? 0 : shot.charged ? 3 : 9) - far * (shot.tech ? 1.8 : 2.2);
    const chance = clamp(1 / (1 + Math.exp(edge / 14)), 0.04, 0.96);
    if (rnd() < chance) {
      if (edge < -14 && !shot.tech) { take(s, g); s.events.push({ type: 'catch', team: g.team, tech: !!gt }); return; }
      // Despeje a un lado, lejos del punto de penalti (antes el rechace caía flojo delante y el delantero lo cazaba siempre)
      const side = Math.abs(b.x - cx) > 0.4 ? Math.sign(b.x - cx) : (rnd() < 0.5 ? -1 : 1);
      b.vx = side * (7 + rnd() * 5); b.vy = attackDir(g.team) * (1.5 + rnd() * 2.5); b.vz = 4; b.shot = null; b.fire = null; b.lastTeam = g.team;
      g.kickLock = 0.5;
      s.events.push({ type: 'save', team: g.team, x: b.x, y: b.y, big: !!shot.tech || !!gt, elem: gt ? gt.elem : null, name: gt ? gt.name : null });
      if (gt || shot.tech) s.hitstop = 0.22;
    } else {
      b.vx *= 0.85; b.vy *= 0.85; g.stun = 0.9;
      if (gt) s.events.push({ type: 'beaten', x: g.x, y: g.y, elem: gt.elem });
    }
  }

  // Balón fuera: saque de banda, de puerta o córner, según por dónde sale y quién la tocó
  function outOfPlay(s) {
    const b = s.ball, other = b.lastTeam === 'A' ? 'B' : 'A';
    let kind, team, x, y;
    if (b.x < 0 || b.x > F.w) { kind = 'banda'; team = other; x = b.x < 0 ? 0.25 : F.w - 0.25; y = clamp(b.y, 1, F.l - 1); }
    else {
      const def = b.y < 0 ? 'B' : 'A';            // quién defiende esa portería
      if (b.lastTeam === def) { kind = 'corner'; team = def === 'A' ? 'B' : 'A'; x = b.x < cx ? 0.5 : F.w - 0.5; y = b.y < 0 ? 0.5 : F.l - 0.5; }
      else { kind = 'puerta'; team = def; const a = toAbs(def, 0, 2.6); x = a.x; y = a.y; }
    }
    Object.assign(b, { vx: 0, vy: 0, vz: 0, shot: null, fire: null, intended: null, offside: null });
    s.events.push({ type: 'setpiece', kind, team });
    s.pause = { t: 1.0, then: () => restart(s, team, x, y, kind) };
  }
  function offsideCall(s, m) {
    const team = m.team === 'A' ? 'B' : 'A', x = clamp(m.x, 1, F.w - 1), y = clamp(m.y, 1, F.l - 1);
    Object.assign(s.ball, { vx: 0, vy: 0, vz: 0, shot: null, fire: null, intended: null, offside: null });
    s.events.push({ type: 'setpiece', kind: 'offside', team, x, y });
    s.pause = { t: 1.2, then: () => restart(s, team, x, y, 'libre') };
  }

  function restart(s, team, x, y, kind) {
    const spot = { x, y };
    const cand = kind === 'puerta' ? s.players.find(p => p.team === team && p.role === 'POR')
      : s.players.filter(p => p.team === team && (p.role !== 'POR' || inOwnBox(team, spot))).sort((a, q) => dist(a, spot) - dist(q, spot))[0];
    cand.x = x; cand.y = y; cand.vx = cand.vy = 0;
    cand.aim = kind === 'corner' ? Math.atan2(oppGoalY(team) + attackDir(team) * -6 - y, cx - x) : Math.atan2(F.l / 2 - y, cx - x);
    cand.facing = snap8(cand.aim);
    const room = kind === 'corner' ? 6 : 4;
    for (const o of s.players) {
      if (o.team === team || o === cand) continue;
      const d = dist(o, spot);
      if (d < room) { const ux = (o.x - x) / (d || 1), uy = (o.y - y) / (d || 1); o.x = clamp(x + ux * room, 0.5, F.w - 0.5); o.y = clamp(y + uy * room, 0.5, F.l - 0.5); }
    }
    take(s, cand);
    s.ball.setPiece = cand.id;   // el primer pase de un saque no puede ser fuera de juego
    cand.think = 0.5;
    s.pause = { t: 0.35 };
  }

  function goal(s, team) {
    s.score[team]++;
    s.ball.fire = null;
    const scorer = s.ball.shot && s.players.find(q => q.id === s.ball.shot.by && q.team === team);
    (s.goalLog = s.goalLog || []).push({ team, key: scorer ? scorer.key : null });
    s.events.push({ type: 'goal', team, x: s.ball.x, y: s.ball.y, tech: s.ball.shot && s.ball.shot.tech ? s.ball.shot.tech.elem : null });
    if (s.ball.shot && s.ball.shot.tech) s.hitstop = 0.3;
    // Golden goal, o «paliza»: con settings.mercy (roguelite = 5) el partido acaba al llegar a esa diferencia de goles
    const mercy = s.settings.mercy > 0 && Math.abs(s.score.A - s.score.B) >= s.settings.mercy;
    if (s.golden || mercy) { if (mercy) s.events.push({ type: 'mercy', team }); s.pause = { t: 2.0, then: () => finish(s) }; return; }
    s.pause = { t: 2.0, then: () => kickoff(s, team === 'A' ? 'B' : 'A') };
  }

  function finish(s) {
    s.over = true;
    s.result = s.score.A > s.score.B ? 'win' : s.score.A < s.score.B ? 'loss' : 'draw';
    s.events.push({ type: 'end', result: s.result });
  }

  function updateBall(s, dt) {
    const b = s.ball;
    if (s.tech && s.tech.tech.type === 'tiro') return;
    if (b.owner) {
      syncBall(s, dt);
      // Aunque regatees al portero, no puedes entrar andando con el balón en la portería: si llegas a la línea de gol
      // (dentro del ancho de la portería) con el balón, el portero se lanza y te lo quita siempre. Para marcar hay que chutar.
      const o = b.owner;
      if (o.role !== 'POR' && !s.tech) {
        const gk = s.players.find(p => p.role === 'POR' && p.team !== o.team), gy = oppGoalY(o.team);
        if (gk && Math.abs(b.y - gy) < 1.6 && Math.abs(b.x - cx) < F.goalW / 2 + 0.8) {
          gk.x = b.x; gk.y = gy + (gy < F.l / 2 ? 0.6 : -0.6); gk.stun = 0;
          o.stun = 0.45; o.kickLock = 0.4; take(s, gk);
          s.events.push({ type: 'msg', text: gk.team === 'A' ? TX('¡Tu portero se la queda!') : TX('¡El portero te la quita!') });
          return;
        }
      }
      // Llevar el balón más allá de una línea = fuera (banda, puerta o córner). Ya no se puede rodear la portería por detrás.
      // Solo cuenta como gol si entras con él por la boca de la portería.
      if (b.y < 0 || b.y > F.l || b.x < 0 || b.x > F.w) {
        const p = b.owner, inMouth = (b.y < 0 || b.y > F.l) && b.x > 0 && b.x < F.w && Math.abs(b.x - cx) < F.goalW / 2;
        Object.assign(b, { owner: null, lastTeam: p.team, vx: 0, vy: 0, vz: 0 });
        if (inMouth) goal(s, b.y < 0 ? 'A' : 'B'); else outOfPlay(s);
      }
      return;
    }
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.vz -= 20 * dt;
    if (b.z < 0) { b.z = 0; b.vz = b.vz < -2 ? -b.vz * 0.45 : 0; }
    const k = b.z > 0.05 ? 0.12 : 0.85, f = Math.exp(-k * dt);
    b.vx *= f; b.vy *= f;
    const sp = Math.hypot(b.vx, b.vy);
    if (b.intended && sp < 1.5) b.intended = null;

    if (b.y < 0 || b.y > F.l) {
      const inMouth = Math.abs(b.x - cx) < F.goalW / 2 && b.z < F.barZ;
      if (inMouth) goal(s, b.y < 0 ? 'A' : 'B'); else outOfPlay(s);
      return;
    }
    if (b.x < 0 || b.x > F.w) { outOfPlay(s); return; }

    if (b.shot && !b.shot.resolved) {
      const g = s.players.find(p => p.role === 'POR' && p.team !== b.shot.team);
      const reach = 1.1 + g.gk / 100 * 0.9 + (g.gkTech && g.gkTech !== 'none' ? 0.5 : 0);
      // Duelo: un tiro especial a puerta siempre se enfrenta al portero cuando pasa a su altura
      const crossed = b.shot.tech && (b.y - g.y) * (b.y - b.vy * dt - g.y) <= 0 && Math.abs(b.x - cx) < F.goalW / 2 + 0.8;
      if (g.stun <= 0 && ((dist(g, b) < reach && b.z < 2.4) || crossed)) resolveSave(s, g);
      if (b.owner) return;
    }

    // Imán suave: el balón suelto y lento se acerca a tu jugador si está cerca
    const me = controlled(s);
    if (me && sp < 7 && b.z < 0.5 && me.stun <= 0 && me.kickLock <= 0) {
      const d = dist(me, b);
      if (d < 2.6 && d > 0.3) { b.vx += (me.x - b.x) / d * 12 * dt; b.vy += (me.y - b.y) / d * 12 * dt; }
    }

    let best = null, bd = Infinity;
    for (const p of s.players) {
      if (p.stun > 0 || p.kickLock > 0) continue;
      const isGK = p.role === 'POR' && inOwnBox(p.team, b);
      if (isGK && b.shot && !b.shot.resolved && b.shot.team !== p.team) continue;
      const r = isGK ? 1.0 : p.id === s.controlledId ? 1.25 : 0.75, maxZ = isGK ? 2.3 : p.id === s.controlledId ? 1.2 : 1.0;
      if (b.z > maxZ) continue;
      if (!isGK && sp > 16 && b.intended !== p.id) continue;
      const d = dist(p, b);
      if (d < r && d < bd) { bd = d; best = p; }
    }
    if (best) {
      if (b.offside && best.id === b.offside) { offsideCall(s, best); return; }
      const prevTeam = b.lastTeam;
      take(s, best);
      if (best.team !== prevTeam && best.team === 'A') s.events.push({ type: 'msg', text: TX('¡Balón recuperado!') });
    }
  }

  function checkSteals(s, dt) {
    const h = s.ball.owner;
    if (!h || h.role === 'POR' || h.invuln > 0) return;
    // Chocar con el portero en su área: se queda el balón (solo se le supera con un regate o una técnica)
    const gk = s.players.find(q => q.role === 'POR' && q.team !== h.team);
    if (gk && gk.stun <= 0 && inOwnBox(gk.team, h) && dist(gk, h) < 1.1) {
      h.stun = 0.45; h.kickLock = 0.4; take(s, gk);
      s.events.push({ type: 'msg', text: gk.team === 'A' ? TX('¡Tu portero se la queda!') : TX('¡El portero te la quita!') });
      return;
    }
    const hs = Math.hypot(h.vx, h.vy);
    for (const d of s.players) {
      if (d.team === h.team || d.stun > 0 || d.tackle || d.dash || dist(d, h) > 0.95) continue;
      const behind = Math.cos(angDiff(Math.atan2(d.y - h.y, d.x - h.x), h.aim)) < 0;
      let rate = (d.team === 'B' ? s.diff.steal : 1.1) * (d.defense / (h.control * 0.6 + h.body * 0.4));
      if (behind && hs > 5) rate *= 0.3;
      if (rnd() < rate * dt) {
        h.stun = 0.45; h.kickLock = 0.4;
        take(s, d);
        if (d.team === 'A') s.events.push({ type: 'msg', text: TX('¡Robo!') });
        return;
      }
    }
  }

  // Búfer de entrada: un botón pulsado se guarda 0,25 s. Así no se pierde si cae en un momento en que tu jugador
  // no puede actuar (justo al recibir, tras una entrada, en el «congelado» de un golpe…) o entre dos fotogramas.
  const BUF_T = 0.25;
  function bufferInput(s, input, dtRaw) {
    const B = s.inBuf || (s.inBuf = {});
    for (const k in B) { B[k] -= dtRaw; if (B[k] <= 0) delete B[k]; }
    for (const a of input.pressed || []) B[a] = BUF_T;
    return Object.assign({}, input, { pressed: { has: a => { if (B[a] > 0) { delete B[a]; return true; } return false; }, peek: a => B[a] > 0,
      keep: a => { if (B[a] > 0) B[a] = BUF_T; } } });   // copia: no se toca la entrada original; keep = alargar la espera
  }

  function update(s, input, dtRaw) {
    if (s.over) return;
    input = bufferInput(s, input, dtRaw);
    if (s.hitstop > 0) { s.hitstop -= dtRaw; return; }   // congelado de impacto
    // Cámara lenta: al cargar una técnica y mientras vuela un tiro especial
    const sm = s.settings.slowmo !== 0, sh = s.ball.shot;
    const flying = sh && sh.tech && !sh.resolved;
    const slowK = s.tech ? (s.tech.tech.type === 'tiro' ? (sm ? 0.3 : 0.6) : (sm ? 0.45 : 0.7))
      : flying ? (sm ? 0.45 : 1) : s.slow > 0 ? (sm ? 0.45 : 0.75) : 1;
    const dt = dtRaw * slowK * GAME_SPEED;
    s.slow = Math.max(0, s.slow - dtRaw);
    if (s.pause) {
      s.pause.t -= dtRaw;
      if (s.pause.t <= 0) { const fn = s.pause.then; s.pause = null; fn && fn(); }
      return;
    }
    s.t += dt;
    s.time -= dt / GAME_SPEED;
    if (s.time <= 0) {
      s.time = 0;
      if (s.score.A === s.score.B && s.settings.golden && !s.golden) {
        s.golden = true; s.time = 60;
        s.events.push({ type: 'golden' });
        s.pause = { t: 1.6, then: () => kickoff(s, Math.random() < 0.5 ? 'A' : 'B') };
        return;
      }
      finish(s); return;
    }

    for (const p of s.players) p.sprint = false;
    assignMarks(s);
    input.dt = dt;
    if (!s.settings.allAI) { autoSwitch(s, dt); handleUser(s, input); }
    for (const p of s.players) if (s.settings.allAI || p.id !== s.controlledId) ai(s, p, dt);
    updateTech(s, dt);

    for (const p of s.players) {
      p.stun = Math.max(0, p.stun - dt); p.recover = Math.max(0, (p.recover || 0) - dt); p.kickT = Math.max(0, p.kickT - dt); p.kickLock = Math.max(0, p.kickLock - dt);
      p.tackleCd = Math.max(0, p.tackleCd - dt); p.invuln = Math.max(0, p.invuln - dt); p.dribbleCd = Math.max(0, (p.dribbleCd || 0) - dt);
      for (const k in p.cd) p.cd[k] = Math.max(0, p.cd[k] - dt);
      if (p.dash) updateDash(s, p, dt);
      else if (p.tackle) updateTackle(s, p, dt);
      else if (p.stun > 0 || p.recover > 0) { p.dvx = p.dvy = 0; }
      // Aceleración alta = frenadas y giros secos, sin deslizar
      const accRate = p.diving ? 60 : (p.tackle || p.dash) ? 90 : p.id === s.controlledId ? 55 : 38;
      const acc = accRate * dt;
      let ax = p.dvx - p.vx, ay = p.dvy - p.vy; const al = Math.hypot(ax, ay);
      if (al > acc) { ax *= acc / al; ay *= acc / al; }
      p.vx += ax; p.vy += ay;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const e = 1.3;   // no se meten en las gradas
      p.x = clamp(p.x, -e, F.w + e); p.y = clamp(p.y, -e, F.l + e);
      if (p.role === 'POR' && s.ball.owner === p) keepInBox(p);
      const spd = Math.hypot(p.vx, p.vy);
      p.moving = spd > 0.6;
      if (p.id !== s.controlledId && spd > 0.8 && !p.tackle && !p.dash && s.ball.owner !== p) { p.aim = Math.atan2(p.vy, p.vx); p.facing = snap8(p.aim); }
      if (p.sprint && p.moving) { p.stamina -= 0.24 * p.stamDrain * dt; if (p.stamina <= 0) { p.stamina = 0; p.tired = true; } }
      else p.stamina = Math.min(1, p.stamina + 0.1 * (p.bonus.recobro || 1) * dt);
      if (p.tired && p.stamina > 0.3) p.tired = false;
      if (!(s.tech && s.tech.p === p)) p.z = Math.max(0, p.z - 6 * dt);
    }
    const ps = s.players;
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i], c = ps[j], dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy);
      if (d > 0 && d < 0.7) { const push = (0.7 - d) / 2; a.x -= dx / d * push; a.y -= dy / d * push; c.x += dx / d * push; c.y += dy / d * push; }
    }
    updateBall(s, dt);
    if (!s.pause) checkSteals(s, dt);
  }

  return { FIELD: F, DRIBBLE_CD, techChoices, createMatch, update, possession, controlled, contextTech, _t: { take, startTech, shoot, goal } };
})();
