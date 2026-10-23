/* =====================================================================
   CONTROLES: en PC (ratón y teclado) se quitan el joystick y los botones
   de la pantalla; en móvil y tablet se muestran. Se puede forzar en Ajustes.
   ===================================================================== */
const Controls = (() => {
  const mm = q => { try { return matchMedia(q).matches; } catch (_) { return false; } };
  let sawTouch = mm('(pointer: coarse)') || (navigator.maxTouchPoints > 0 && !mm('(pointer: fine)'));
  const pref = () => { try { return App.settings.controls || 'auto'; } catch (_) { return 'auto'; } };   // App aún no existe al cargar
  const isTouch = () => { const c = pref(); return c === 'tactil' ? true : c === 'teclado' ? false : sawTouch; };
  function apply() {
    document.documentElement.classList.toggle('pc', !isTouch());
    let k = 1; try { k = App.settings.padSize === 'grande' ? 1.15 : App.settings.padSize === 'pequeno' ? 0.88 : 1; } catch (_) {}
    document.documentElement.style.setProperty('--padk', k);
  }
  addEventListener('pointerdown', e => { if (e.pointerType === 'touch' && !sawTouch) { sawTouch = true; apply(); } }, { capture: true });
  apply();
  return { apply, isTouch, pc: () => !isTouch() };
})();

// Textos fijos del HTML (data-tx en shell.html), para la traducción: TX('Saltar ▶▶') TX('Tú') TX('Rival') TX('Pausa') TX('Espacio') TX('Técnica')

/* ---------- Sin zoom en el navegador ----------
   El iPhone ignora «user-scalable=no», así que se bloquean a mano: pellizco
   y, en ordenador, Ctrl + rueda o Ctrl + / Ctrl -. */
(() => {
  const no = e => { e.preventDefault(); };
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(t => document.addEventListener(t, no, { passive: false }));
  document.addEventListener('touchmove', e => { if (e.touches && e.touches.length > 1) e.preventDefault(); }, { passive: false });
  // El doble toque ya lo quita «touch-action: manipulation» (CSS), sin comerse toques rápidos en los botones
  document.addEventListener('dblclick', no, { passive: false });
  addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
  addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key)) e.preventDefault(); });
})();

/* =====================================================================
   ENTRADA: teclado + joystick táctil + botones.
   ===================================================================== */
const Input = (() => {
  const keys = new Set(), pressed = new Set();
  const joy = { x: 0, y: 0, id: null, ox: 0, oy: 0 };
  let shootTouch = null;
  // Joystick (móvil): más grande que antes (36 px) para poder apuntar fino; zona muerta para que el dedo quieto no mueva al jugador;
  // el esprint solo al llevar el dedo MÁS ALLÁ del aro (antes cualquier empujón a tope esprintaba y el jugador se cansaba sin querer);
  // y si el dedo se aleja mucho, el joystick lo sigue (así girar en seco responde al momento).
  const R = 44, DEAD = 0.16, SPRINT_AT = 1.3, FOLLOW = 1.9;
  const shell = document.getElementById('shell'), touch = document.getElementById('touch');
  const stick = document.getElementById('stick'), knob = document.getElementById('knob');
  // Teclas (Ajustes → «Teclas del ordenador»): «nuevas» = J pase · K tiro/cambiar · L saque largo (portero) · E técnica;
  // «clásicas» = como hasta la 0.31.1: J pase · K saque largo (portero) · L tiro · Q cambiar · U técnica. (El pase al hueco ya no existe.) Z X C V valen en las dos (con las flechas).
  const COMMON = { KeyZ: 'A', KeyX: 'switch', KeyC: 'B', KeyV: 'dribble', Space: 'tech', KeyQ: 'switch', KeyU: 'techNext', KeyE: 'techNext' };
  const PASS_KEYS = ['KeyJ', 'KeyZ'];
  const STD = { move: { up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'], left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'] },
    sprint: ['ShiftLeft', 'ShiftRight'], pass: PASS_KEYS, pause: ['KeyP', 'Escape'] };
  const SCHEMES = {
    nuevas: Object.assign({ map: Object.assign({}, COMMON, { KeyJ: 'A', KeyK: 'switch', KeyL: 'B', KeyI: 'dribble' }), shoot: ['KeyK', 'KeyX'] }, STD),
    clasicas: Object.assign({ map: Object.assign({}, COMMON, { KeyJ: 'A', KeyK: 'B', KeyI: 'dribble' }), shoot: ['KeyL', 'KeyX'] }, STD),
  };
  // «A tu gusto» (Ajustes → Teclas del ordenador): cada acción, también moverse, con la tecla que elijas.
  // Tiro y Cambiar de jugador pueden compartir tecla (como la K de las nuevas: con balón chuta, sin balón cambia).
  const CUSTOM_DEF = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', sprint: 'ShiftLeft', pass: 'KeyJ', shoot: 'KeyK', switch: 'KeyK',
    through: 'KeyL', dribble: 'KeyI', tech: 'Space', techNext: 'KeyE', pause: 'KeyP' };
  const customKeys = () => { let m = null; try { m = App.settings.keyMap; } catch (_) {} return Object.assign({}, CUSTOM_DEF, m || {}); };
  let customSig = '', customCache = null;
  function customScheme() {
    const k = customKeys(), sig = JSON.stringify(k);
    if (sig === customSig) return customCache;
    const map = {};
    [['techNext', 'techNext'], ['tech', 'tech'], ['dribble', 'dribble'], ['through', 'B'], ['switch', 'switch'], ['pass', 'A']].forEach(([a, act]) => { if (k[a]) map[k[a]] = act; });
    customSig = sig;
    return (customCache = { map, shoot: [k.shoot], pass: [k.pass], sprint: [k.sprint], pause: [k.pause, 'Escape'], move: { up: [k.up], down: [k.down], left: [k.left], right: [k.right] } });
  }
  const scheme = () => { try { return App.settings.keys === 'custom' ? customScheme() : SCHEMES[App.settings.keys] || SCHEMES.nuevas; } catch (_) { return SCHEMES.nuevas; } };
  const inScheme = (K, c) => !!K.map[c] || K.shoot.includes(c) || K.sprint.includes(c) || Object.values(K.move).some(l => l.includes(c));
  // Nombre corto de una tecla para enseñarlo (con la letra de tu teclado si se guardó al elegirla, p. ej. Ñ)
  function keyName(c) {
    let L = null; try { L = App.settings.keyLabels; } catch (_) {}
    if (!c) return '—';
    if (L && L[c]) return L[c];
    if (c.startsWith('Key')) return c.slice(3);
    if (c.startsWith('Digit')) return c.slice(5);
    if (c.startsWith('Numpad')) return 'Num ' + c.slice(6);
    return { Space: TX('Espacio'), ShiftLeft: 'Shift', ShiftRight: TX('Shift dcho.'), ControlLeft: 'Ctrl', ControlRight: TX('Ctrl dcho.'), AltLeft: 'Alt', AltRight: 'AltGr',
      ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Enter: 'Enter', Tab: 'Tab', Backspace: '⌫', CapsLock: TX('Bloq Mayús') }[c] || c;
  }
  let capture = null;   // Ajustes: esperando a que pulses la tecla nueva para una acción
  let passTouch = null;
  const BLOCK = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];

  addEventListener('keydown', e => {
    if (capture) { e.preventDefault(); e.stopPropagation(); if (e.repeat) return; const f = capture; capture = null; f(e); return; }
    const K = scheme();
    if (App.inMatch() && (BLOCK.includes(e.code) || inScheme(K, e.code))) e.preventDefault();
    if (e.repeat) return;
    if (App.menuKey && App.menuKey(e)) return;   // teclas en menús e intro (Esc = volver…)
    keys.add(e.code);
    if (K.map[e.code]) pressed.add(K.map[e.code]);
    if (K.shoot.includes(e.code)) pressed.add('shoot');
    if (K.pause.includes(e.code)) App.togglePause();
  }, true);
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => { keys.clear(); shootTouch = null; passTouch = null; });

  touch.addEventListener('pointerdown', e => {
    if (joy.id !== null) return;
    if (Controls.pc() && e.pointerType === 'mouse') return;   // en PC el ratón no hace de joystick
    const r = shell.getBoundingClientRect();
    if (e.clientX - r.left > r.width * 0.6) return;
    joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY;
    stick.className = 'live';
    stick.style.left = (e.clientX - r.left) + 'px'; stick.style.top = (e.clientY - r.top) + 'px';
    try { touch.setPointerCapture(e.pointerId); } catch (_) {}
  });
  touch.addEventListener('pointermove', e => {
    if (e.pointerId !== joy.id) return;
    let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy, len = Math.hypot(dx, dy);
    if (len > R * FOLLOW) {   // el centro sigue al dedo
      const k = (len - R * FOLLOW) / len; joy.ox += dx * k; joy.oy += dy * k; dx -= dx * k; dy -= dy * k; len = R * FOLLOW;
      const r = shell.getBoundingClientRect(); stick.style.left = (joy.ox - r.left) + 'px'; stick.style.top = (joy.oy - r.top) + 'px';
    }
    const sprint = len > R * SPRINT_AT, m = len < R * DEAD ? 0 : Math.min(1, (len - R * DEAD) / (R * (1 - DEAD)));
    const out = sprint ? 1 : m * 0.92;   // por debajo de 0,95: corre sin esprintar
    joy.x = len ? dx / len * out : 0; joy.y = len ? dy / len * out : 0;
    const kl = Math.min(len, R); knob.style.transform = `translate(${len ? dx / len * kl : 0}px,${len ? dy / len * kl : 0}px)`;
    stick.classList.toggle('sprint', sprint);
  });
  const end = e => {
    if (e.pointerId !== joy.id) return;
    joy.id = null; joy.x = joy.y = 0; knob.style.transform = '';
    stick.className = 'rest'; stick.style.left = stick.style.top = '';
  };
  touch.addEventListener('pointerup', end);
  touch.addEventListener('pointercancel', end);
  addEventListener('pointerup', e => { if (shootTouch === e.pointerId) shootTouch = null; if (passTouch === e.pointerId) passTouch = null; });
  addEventListener('pointercancel', e => { if (shootTouch === e.pointerId) shootTouch = null; if (passTouch === e.pointerId) passTouch = null; });

  // Mando (Xbox/PlayStation/genérico, mapeo estándar): A pase · X tiro (mantener) · B saque largo del portero · Y técnica · RB regate
  // LB cambiar jugador · LT cambiar técnica · RT esprint · Start pausa · stick izquierdo o cruceta para moverte
  const GP = { 0: 'A', 1: 'B', 3: 'tech', 5: 'dribble', 4: 'switch', 6: 'techNext' };
  let gpPrev = [], gpState = { x: 0, y: 0, sprint: false, shoot: false, pass: false };
  addEventListener('gamepadconnected', e => { try { UI.toast(TX('🎮 Mando conectado: ') + (e.gamepad.id || '').split('(')[0].trim().slice(0, 30), 2200); } catch (_) {} document.body.classList.add('gamepad'); });
  addEventListener('gamepaddisconnected', () => { try { UI.toast(TX('Mando desconectado'), 1600); } catch (_) {} if (![...(navigator.getGamepads ? navigator.getGamepads() : [])].some(Boolean)) document.body.classList.remove('gamepad'); });
  function pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const g = [...pads].find(p => p && p.connected);
    gpState = { x: 0, y: 0, sprint: false, shoot: false, pass: false };
    if (!g) return;
    const b = i => !!(g.buttons[i] && (g.buttons[i].pressed || g.buttons[i].value > 0.5));
    let x = g.axes[0] || 0, y = g.axes[1] || 0;
    if (Math.hypot(x, y) < 0.18) x = y = 0;
    if (b(14)) x = -1; if (b(15)) x = 1; if (b(12)) y = -1; if (b(13)) y = 1;
    gpState = { x, y, sprint: b(7), shoot: b(2), pass: b(0) };
    for (const i in GP) if (b(i) && !gpPrev[i]) pressed.add(GP[i]);
    if (b(2) && !gpPrev[2]) pressed.add('shoot');
    if (b(9) && !gpPrev[9]) App.togglePause();
    gpPrev = g.buttons.map((_, i) => b(i));
  }
  function read() {
    pollPad();
    let x = 0, y = 0;
    const K = scheme(), on = l => l.some(k => keys.has(k));
    if (on(K.move.left)) x -= 1;
    if (on(K.move.right)) x += 1;
    if (on(K.move.up)) y -= 1;
    if (on(K.move.down)) y += 1;
    if (x || y) { const l = Math.hypot(x, y); x /= l; y /= l; }
    x += joy.x + gpState.x; y += joy.y + gpState.y;
    const out = { move: { x, y }, sprint: on(K.sprint) || gpState.sprint,
      shootHeld: on(K.shoot) || shootTouch !== null || gpState.shoot, passHeld: on(K.pass) || passTouch !== null || gpState.pass, pressed: new Set(pressed) };
    pressed.clear();
    return out;
  }
  return {
    read,
    CUSTOM_DEF, customKeys, keyName,
    capture: f => { capture = f; },
    press: a => pressed.add(a),
    holdShoot: (on, id) => { if (on) { shootTouch = id; pressed.add('shoot'); } else if (id === undefined || shootTouch === id) shootTouch = null; },
    holdPass: (on, id) => { if (on) passTouch = id; else if (id === undefined || passTouch === id) passTouch = null; },
  };
})();

/* =====================================================================
   BOTONES TÁCTILES: cambian según tu equipo tenga el balón o no.
   ===================================================================== */
const Pad = (() => {
  const SETS = {
    attack: [
      { label: TX('Tiro'), sub: 'mantener', cls: 'big', hold: true },
      { label: TX('Pase'), sub: TX('mantén'), cls: 's2', action: 'A', holdPass: true },
      { label: TX('Técnica'), cls: 's3 fire', action: 'tech', tech: true },
      { label: '⇄', cls: 's6 tnext', action: 'techNext' },
      { label: TX('Regate'), cls: 's5', action: 'dribble' },
    ],
    gk: [
      { label: TX('Despeje'), sub: 'suelta', cls: 'big', hold: true },
      { label: TX('Pase'), sub: TX('mantén'), cls: 's2', action: 'A', holdPass: true },
      { label: TX('Saque<br>largo'), cls: 's4', action: 'B' },
    ],
    defense: [   // «Cambiar» va donde Regate, no donde Pase: al perder el balón, un toque en Pase ya no te cambia de jugador sin querer
      { label: TX('Entrada'), cls: 'big', action: 'A' },
      { label: TX('Cambiar'), cls: 's5', action: 'switch' },
      { label: TX('Técnica'), cls: 's3 fire', action: 'tech', tech: true },
      { label: '⇄', cls: 's6 tnext', action: 'techNext' },
    ],
  };
  const pad = document.getElementById('pad'), kh = document.getElementById('keyhud');
  const KEYS_CLASICAS = {
    attack: '<b>WASD</b>/<b>' + TX('flechas') + '</b> ' + TX('mover ·') + ' <b>' + TX('Shift') + '</b> ' + TX('esprint ·') + ' <b>J/Z</b> ' + TX('pase (mantén = fuerte) ·') + ' <b>I/V</b> ' + TX('regate ·') + ' <b>L/X</b> ' + TX('tiro (mantén) ·') + ' <b>U</b> ' + TX('cambiar técnica'),
    defense: '<b>WASD</b>/<b>' + TX('flechas') + '</b> ' + TX('mover ·') + ' <b>' + TX('Shift') + '</b> ' + TX('esprint ·') + ' <b>J/Z</b> ' + TX('entrada ·') + ' <b>Q/X</b> ' + TX('cambiar ·') + ' <b>U</b> ' + TX('cambiar técnica'),
    gk: '<b>' + TX('Portero') + '</b>: <b>WASD</b>/<b>' + TX('flechas') + '</b> ' + TX('mover por el área ·') + ' <b>J/Z</b> ' + TX('pase (mantén = fuerte) ·') + ' <b>K/C</b> ' + TX('saque largo ·') + ' <b>L/X</b> ' + TX('despeje'),
  };
  const KEYS = {
    attack: '<b>WASD</b>/<b>' + TX('flechas') + '</b> ' + TX('mover ·') + ' <b>' + TX('Shift') + '</b> ' + TX('esprint ·') + ' <b>J/Z</b> ' + TX('pase (mantén = fuerte) ·') + ' <b>K/X</b> ' + TX('tiro (mantén) ·') + ' <b>I/V</b> ' + TX('regate ·') + ' <b>E</b> ' + TX('cambiar técnica'),
    defense: '<b>WASD</b>/<b>' + TX('flechas') + '</b> ' + TX('mover ·') + ' <b>' + TX('Shift') + '</b> ' + TX('esprint ·') + ' <b>J/Z</b> ' + TX('entrada ·') + ' <b>K/X</b> ' + TX('cambiar ·') + ' <b>E</b> ' + TX('cambiar técnica'),
    gk: '<b>' + TX('Portero') + '</b>: <b>WASD</b>/<b>' + TX('flechas') + '</b> ' + TX('mover por el área ·') + ' <b>J/Z</b> ' + TX('pase (mantén = fuerte) ·') + ' <b>K/X</b> ' + TX('despeje ·') + ' <b>L/C</b> ' + TX('saque largo'),
  };
  // Barra de teclas con las teclas «A tu gusto»
  function customHud(m) {
    const k = Input.customKeys(), n = c => '<b>' + esc(Input.keyName(c)) + '</b>';
    const mv = [k.up, k.left, k.down, k.right].every(c => /^Key.$/.test(c)) ? '<b>' + [k.up, k.left, k.down, k.right].map(c => c.slice(3)).join('') + '</b>' : [k.up, k.left, k.down, k.right].map(n).join('');
    const sp = ' ' + n(k.sprint) + ' ' + TX('esprint ·') + ' ';
    const parts = {
      attack: mv + ' ' + TX('mover ·') + sp + n(k.pass) + ' ' + TX('pase (mantén = fuerte) ·') + ' ' + n(k.shoot) + ' ' + TX('tiro (mantén) ·') + ' ' + n(k.dribble) + ' ' + TX('regate ·') + ' ' + n(k.techNext) + ' ' + TX('cambiar técnica'),
      defense: mv + ' ' + TX('mover ·') + sp + n(k.pass) + ' ' + TX('entrada ·') + ' ' + n(k.switch) + ' ' + TX('cambiar ·') + ' ' + n(k.techNext) + ' ' + TX('cambiar técnica'),
      gk: '<b>' + TX('Portero') + '</b>: ' + mv + ' ' + TX('mover por el área ·') + ' ' + n(k.pass) + ' ' + TX('pase (mantén = fuerte) ·') + ' ' + n(k.shoot) + ' ' + TX('despeje ·') + ' ' + n(k.through) + ' ' + TX('saque largo'),
    };
    return (parts[m] || parts.attack) + ' · ' + n(k.pause) + ' ' + TX('pausa');
  }
  let mode = null, techBtn = null, techLbl = null, lastName = null, lastKH = null, dribBtn = null, lastDrib = -1, nextBtn = null;
  const down = new Set();   // dedos sobre los botones: mientras haya alguno, los botones no cambian (si no, el botón desaparecía bajo el dedo)
  function render(m) {
    if (m === mode || down.size) return;
    let sch = 'nuevas'; try { sch = App.settings.keys || 'nuevas'; } catch (_) {}
    kh.querySelector('.kh-keys').innerHTML = sch === 'custom' ? customHud(m) : (sch === 'clasicas' ? KEYS_CLASICAS : KEYS)[m] + ' · <b>P</b> ' + TX('pausa');
    mode = m; pad.innerHTML = ''; techBtn = null; dribBtn = null; nextBtn = null; lastDrib = -1; lastName = null;
    Input.holdShoot(false); Input.holdPass(false);
    SETS[m].forEach(b => {
      const el = document.createElement('button');
      el.className = 'act ' + b.cls;
      applyLayout(el, b.cls.split(' ')[0]);   // posición y tamaño a tu gusto (Ajustes → Colocar los botones)
      el.innerHTML = (b.tech ? `<span class="tt">${b.label}</span>` : b.label) + (b.sub ? `<small>${b.sub}</small>` : '') + (b.tech ? '<small class="tn"></small>' : '');
      el.addEventListener('pointerdown', e => {
        e.preventDefault(); el.classList.add('down'); down.add(e.pointerId);
        if (b.hold) { Input.holdShoot(true, e.pointerId); try { el.setPointerCapture(e.pointerId); } catch (_) {} }
        else { Input.press(b.action); if (b.holdPass) { Input.holdPass(true, e.pointerId); try { el.setPointerCapture(e.pointerId); } catch (_) {} } }
      });
      const up = e => { el.classList.remove('down'); down.delete(e.pointerId); if (b.hold) Input.holdShoot(false, e.pointerId); if (b.holdPass) Input.holdPass(false, e.pointerId); };
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => el.addEventListener(t, up));
      el.addEventListener('pointerleave', () => { if (!b.hold) el.classList.remove('down'); });
      if (b.tech) { techBtn = el; techLbl = el.querySelector('.tn'); }
      if (b.action === 'dribble') dribBtn = el;
      if (b.action === 'techNext') nextBtn = el;
      pad.appendChild(el);
    });
  }
  function setTech(ctx) {
    const khKey = ctx ? ctx.tech.name + '|' + (ctx.ready ? 1 : Math.round(ctx.frac * 20)) : '';
    if (khKey !== lastKH) {   // en PC: nombre de la técnica y su recarga junto a la tecla Espacio
      lastKH = khKey;
      const t = kh.querySelector('.kh-tech');
      t.classList.toggle('off', !ctx); t.classList.toggle('ready', !!(ctx && ctx.ready));
      t.dataset.elem = ctx ? ctx.tech.elem : '';
      t.querySelector('span').textContent = ctx ? ctx.tech.name : TX('Sin técnica');
      t.style.setProperty('--cd', ctx && !ctx.ready ? ctx.frac.toFixed(2) : 0);
    }
    if (!techBtn) return;
    techBtn.classList.toggle('off', !ctx);
    techBtn.style.setProperty('--cd', ctx && !ctx.ready ? ctx.frac.toFixed(3) : 0);
    const n = ctx ? ctx.tech.name : '—';
    if (n !== lastName) { techLbl.textContent = n; lastName = n; }
    techBtn.dataset.elem = ctx ? ctx.tech.elem : '';
  }
  // Recarga del regate normal (círculo oscuro que se va vaciando)
  function setChoices(n) { if (nextBtn) nextBtn.hidden = n < 2; }
  function setDribble(frac) {
    const k = Math.round(frac * 30); if (!dribBtn || k === lastDrib) return; lastDrib = k;
    dribBtn.style.setProperty('--cd', (k / 30).toFixed(2)); dribBtn.classList.toggle('cool', k > 0);
  }
  addEventListener('pointerup', e => down.delete(e.pointerId)); addEventListener('pointercancel', e => down.delete(e.pointerId));
  // Botones colocados a tu gusto: settings.padLayout = { big: { x, y, s }, s2: …, s3, s4, s5, s6 } (desplazamiento en px y tamaño)
  function applyLayout(el, key) {
    let L = null; try { L = (App.settings.padLayout || {})[key]; } catch (_) {}
    el.style.translate = L && (L.x || L.y) ? `${L.x || 0}px ${L.y || 0}px` : '';
    el.style.scale = L && L.s && L.s !== 1 ? String(L.s) : '';
  }
  function refresh() { mode = null; }
  function show(on) { if (!on) down.clear(); pad.hidden = !on; document.getElementById('stick').hidden = !on; kh.hidden = !on; }
  return { render, setTech, setDribble, setChoices, show, refresh, applyLayout };
})();

/* =====================================================================
   HUD y mensajes (DOM)
   ===================================================================== */
const UI = (() => {
  const $ = id => document.getElementById(id);
  let toastT, bannerT, last = {};
  function toast(text, ms = 1300) {
    const t = $('toast'); t.textContent = text; t.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms);
  }
  function banner(text, cls = '', ms = 1500) {
    const b = $('banner'); b.textContent = text; b.className = 'banner on ' + cls;
    clearTimeout(bannerT); bannerT = setTimeout(() => b.className = 'banner ' + cls, ms);
  }
  let fpsT = performance.now(), fps = 60, dbgT = 0;
  function debug(s) {   // datos en pantalla del modo desarrollador
    const now = performance.now(); fps = fps * 0.9 + 100 / Math.max(1, now - fpsT); fpsT = now;
    const el = $('dbg'); if (!App.settings.debug) { el.hidden = true; return; }
    if (now - dbgT < 250) return; dbgT = now; el.hidden = false;
    const me = Logic.controlled(s), b = s.ball;
    el.textContent = `FPS ${fps.toFixed(0)} ${TX('· velocidad')} ${GAME_SPEED} · ${s.settings.difficulty}${'\\n'}` +
      `${TX('balón')} ${Math.hypot(b.vx, b.vy).toFixed(1)} ${TX('m/s · z')} ${b.z.toFixed(1)}${b.shot ? TX(' · tiro ') + b.shot.power.toFixed(0) : ''}${'\\n'}` +
      `${me.name}: ${me.techs.map(t => t.name + ' ' + Math.ceil(me.cd[t.id] || 0) + 's').join(' · ') || TX('sin técnicas')}`;
  }
  function update(s) {
    debug(s);
    const clock = (s.golden ? TX('Oro ') : '') + Math.floor(s.time / 60) + ':' + String(Math.floor(s.time % 60)).padStart(2, '0');
    if (last.clock !== clock) { $('clock').textContent = clock; last.clock = clock; }
    if (last.a !== s.score.A) { $('sA').textContent = s.score.A; last.a = s.score.A; }
    if (last.b !== s.score.B) { $('sB').textContent = s.score.B; last.b = s.score.B; }
    if (last.nb !== s.teams.B.name) { $('nB').textContent = s.teams.B.name; last.nb = s.teams.B.name; const T = TEAM(s.teams.B.name); $('cB').src = 'ui/crest' + (T && T.crest || 2) + '.png'; }
    const me = Logic.controlled(s);
    Pad.render(me && me.role === 'POR' && s.ball.owner === me ? 'gk' : Logic.possession(s) === 'A' ? 'attack' : 'defense');
    Pad.setTech(Logic.contextTech(s, Logic.controlled(s)));
    Pad.setDribble(me ? (me.dribbleCd || 0) / Logic.DRIBBLE_CD : 0);
    Pad.setChoices(Logic.techChoices(s, me));
  }
  function reset() { last = {}; }
  // Presentación de una supertécnica: franja con el retrato del jugador y el nombre
  let cutT;
  function cutin(name, elem, team, kind, ref, ms) {
    const c = $('cutin');
    c.className = 'cutin'; void c.offsetWidth;
    c.className = 'cutin on ' + (EL(elem).css || 'neutro') + (team === 'B' ? ' rival' : '');
    c.querySelector('.ci-txt b').textContent = name;
    c.querySelector('.ci-txt small').textContent = (team === 'B' ? TX('Rival · ') : '') + (TYPE_TXT[kind] || TX('Supertécnica'));
    const slot = c.querySelector('.ci-face'); slot.innerHTML = '';
    if (ref) slot.appendChild(Sprites.face(ref, 80));
    clearTimeout(cutT);
    cutT = setTimeout(() => { c.classList.add('out'); cutT = setTimeout(() => { c.className = 'cutin'; }, 240); }, ms);
  }
  return { toast, banner, update, reset, cutin };
})();

/* =====================================================================
   DIBUJO CON PHASER: solo lee el estado de la lógica y lo pinta.
   ===================================================================== */
const PX = 18;
const COLORS = { runoff: 0x2a6a2c, stripeA: 0x3f8f3a, stripeB: 0x479c41, line: 0xf2f6ec, fire: 0xff7a1a };
// Colores de cada elemento para los efectos
const ELEM = {
  fuego:   { main: 0xff7a1a, tints: [0xfff1a0, 0xffc23a, 0xff7a1a, 0xe8361a], tex: 'spark', css: 'fuego' },
  viento:  { main: 0x6fe3ff, tints: [0xffffff, 0xd2f7ff, 0x8fe9ff, 0x3fb6e8], tex: 'streak', css: 'viento' },
  bosque:  { main: 0x5ccf4a, tints: [0xe2ffa8, 0x9ee860, 0x52b83e, 0x2c7d2c], tex: 'leaf', css: 'bosque' },
  montaña: { main: 0xd29a4a, tints: [0xffe6b0, 0xe0aa60, 0xae7232, 0x6e4622], tex: 'shard', css: 'montana' },
  neutro:  { main: 0xffffff, tints: [0xffffff, 0xdddddd], tex: 'spark', css: '' },
};
const EL = e => ELEM[e] || ELEM.neutro;
// Fotogramas del juego de DS: 5 direcciones base; el resto se voltea
const ANIM = {
  stand: [0, 6, 10, 14, 18],
  run: [[21,20,21,0,22,23,22,0],[25,24,25,6,26,27,26,6],[29,28,29,10,30,31,30,10],[33,32,33,14,34,35,34,14],[37,36,37,18,38,39,38,18]],
  runT: [2,6,2,4,2,6,2,4],
  kick: [[22,48],[26,49],[30,50],[34,51],[38,52]],
  down: [62, 63],
};
// Fotogramas guardados (47 de los 64 originales) y su posición en la hoja
const NF = GAME.frames.length;
const FR = {}; GAME.frames.forEach((f, i) => { FR[f] = i; });
function dirOf(facing) {
  const k = ((Math.round(facing / (Math.PI / 4)) % 8) + 8) % 8;
  return [[2, true], [1, true], [0, false], [1, false], [2, false], [3, false], [4, false], [3, true]][k];
}

// Campos: colores del césped, líneas y partículas de ambiente
const FIELDS = {
  normal:    { runoff: 0x2a6a2c, a: 0x3f8f3a, b: 0x479c41, line: 0xf2f6ec, bg: '#1d4a22' },
  noche:     { runoff: 0x0f2a24, a: 0x1f4a3c, b: 0x255443, line: 0xcfe8ff, bg: '#0a1714', dark: 0.25, stands: 0x8a92b8, amb: { tex: 'spark', tint: [0xbfe3ff, 0xffffff], up: false, n: 0.5 } },
  jungla:    { runoff: 0x1d3f17, a: 0x2f6a24, b: 0x377a2b, line: 0xe8f5d0, bg: '#102a0d', amb: { tex: 'leaf', tint: [0x6fbf3a, 0x9ee860, 0x3f8f2a], up: false, n: 0.7 } },
  atardecer: { runoff: 0x5a5a22, a: 0x6c8a32, b: 0x789a3a, line: 0xfff1d0, bg: '#3a3016', tint: 0xffb070, stands: 0xffd8b0 },
  nieve:     { runoff: 0xb8c8d4, a: 0xd8e6ef, b: 0xe6f0f6, line: 0x5a7fa0, bg: '#9fb3c2', amb: { tex: 'spark', tint: [0xffffff], up: false, n: 1.4 } },
  acero:     { runoff: 0x2a2e34, a: 0x3d5a40, b: 0x456446, line: 0xe0e6ec, bg: '#181b1f', dark: 0.12, stands: 0xb0b8c4 },
  cielo:     { runoff: 0xd8c890, a: 0x7fbf6a, b: 0x8ccc76, line: 0xfff6c8, bg: '#c9b878', amb: { tex: 'spark', tint: [0xfff2a0, 0xffffff], up: true, n: 0.8 } },
  niebla:    { runoff: 0x161026, a: 0x22402f, b: 0x284a35, line: 0xe2d4ff, bg: '#0b0714', dark: 0.3, tint: 0x14062a, stands: 0x9a7ab8, fog: true, amb: { tex: 'spark', tint: [0xff8a1a, 0xffc04a, 0xb07aff], up: true, n: 0.45 } },
  volcan:    { runoff: 0x2a120c, a: 0x4a2a1c, b: 0x55311f, line: 0xffb070, bg: '#160806', dark: 0.18, stands: 0xc8907a, amb: { tex: 'spark', tint: [0xff7a1a, 0xffc23a, 0xe8361a], up: true, n: 1.6 } },
};
// Gradas: cuatro texturas (una por lado) con la valla de publicidad y el público en pixel art
const STAND = { len: 240, deep: 260, side: 1.8, end: 2.7 };
function makeStands(scene) {
  if (scene.textures.exists('standD')) return;
  const SHIRTS = [0xe8e8e8, 0xd84a3a, 0x3a6ad8, 0xf0c030, 0x40a050, 0xff8a2a, 0x7a4ad8, 0x2a2a2a, 0x9fd0ff, 0xff9fc0];
  const SKIN = [0xf0c8a0, 0xd9a878, 0xb8875a, 0xf6d8b8], HAIR = [0x2a1a10, 0x5a3a1a, 0x111111, 0xc89a40];
  const ADS = [0x1f2e68, 0xff7a1a, 0xffd23a, 0xd8361a, 0x2f8f3a, 0xe8e8e8];
  const L = STAND.len, D = STAND.deep;
  for (const key of ['standD', 'standU', 'standL', 'standR']) {
    let seed = 7; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const vert = key === 'standL' || key === 'standR';
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    // u: a lo largo de la grada · v: distancia al campo. Se pasa a x/y según el lado
    const rect = (u, v, w, h, c) => {
      const q = key === 'standD' ? [u, v, w, h] : key === 'standU' ? [u, D - v - h, w, h] : key === 'standR' ? [v, u, h, w] : [D - v - h, u, h, w];
      g.fillStyle(c, 1).fillRect(q[0], q[1], q[2], q[3]);
    };
    for (let u = 0, k = 0; u < L; u += 40, k++) { rect(u, 0, 40, 8, ADS[k % ADS.length]); rect(u, 3, 40, 1, 0xffffff); rect(u, 0, 1, 8, 0x111111); }
    rect(0, 8, L, 4, 0x1e2024);
    for (let v = 12, row = 0; v < D; v += 9, row++) {
      rect(0, v, L, 9, row % 2 ? 0x5a5f6a : 0x50555f);
      rect(0, v + 8, L, 1, 0x34373f);
      for (let u = (row % 2) * 2; u < L - 4; u += 5) {
        if (r() < 0.3) continue;
        const shirt = SHIRTS[Math.floor(r() * SHIRTS.length)], head = SKIN[Math.floor(r() * SKIN.length)], hair = HAIR[Math.floor(r() * HAIR.length)];
        if (!vert) {
          // de frente (grada de arriba) o de espaldas (grada de abajo): cabeza encima del cuerpo en pantalla
          const top = key === 'standU' ? D - v - 9 : v;
          g.fillStyle(shirt, 1).fillRect(u, top + 4, 3, 4);
          g.fillStyle(key === 'standU' ? head : hair, 1).fillRect(u + 0.5, top + 1.5, 2, 2.5);
        } else {
          const left = key === 'standR' ? v : D - v - 9;
          g.fillStyle(shirt, 1).fillRect(left + 2, u + 2, 4, 3);
          g.fillStyle(head, 1).fillRect(left + (key === 'standR' ? 2 : 4), u, 2, 2);
        }
      }
    }
    g.generateTexture(key, vert ? D : L, vert ? L : D); g.destroy();
  }
}
function drawStands(scene, F, T) {
  const W = F.w * PX, L = F.l * PX, sg = STAND.side * PX, eg = STAND.end * PX, D = STAND.deep, X = 420;
  const tint = T.stands || 0xffffff;
  const add = (x, y, w, h, key) => scene.add.tileSprite(x, y, w, h, key).setOrigin(0, 0).setDepth(-999).setTint(tint);
  return [add(-X, -eg - D, W + 2 * X, D, 'standU'), add(-X, L + eg, W + 2 * X, D, 'standD'),
    add(-sg - D, -eg, D, L + 2 * eg, 'standL'), add(W + sg, -eg, D, L + 2 * eg, 'standR')];
}
function drawPitch(scene, F, theme) {
  const T = FIELDS[theme] || FIELDS.normal;
  const W = F.w * PX, L = F.l * PX, m = F.margin * PX, cx = W / 2;
  const g = scene.add.graphics().setDepth(-1000);
  g.fillStyle(T.runoff).fillRect(-m - 200, -m - 240, W + 2 * m + 400, L + 2 * m + 480);
  for (let i = 0, y = 0; y < L; i++, y += 4 * PX) g.fillStyle(i % 2 ? T.b : T.a).fillRect(0, y, W, Math.min(4 * PX, L - y));
  if (theme === 'volcan') {   // grietas de lava en la banda
    g.lineStyle(3, 0xff5a1a, 0.7);
    for (let y = 30; y < L; y += 90) { g.lineBetween(-m + 10, y, -14, y + 30); g.lineBetween(W + 14, y + 40, W + m - 10, y + 70); }
  }
  g.lineStyle(2, T.line, 0.9);
  g.strokeRect(0, 0, W, L);
  g.lineBetween(0, L / 2, W, L / 2);
  g.strokeCircle(cx, L / 2, F.circleR * PX);
  g.fillStyle(COLORS.line, 0.9).fillCircle(cx, L / 2, 3);
  const a0 = Math.asin((F.boxD - F.spot) / F.circleR);
  [[0, 1], [L, -1]].forEach(([base, s]) => {
    g.strokeRect(cx - F.boxW * PX / 2, s > 0 ? base : base - F.boxD * PX, F.boxW * PX, F.boxD * PX);
    g.strokeRect(cx - F.smallW * PX / 2, s > 0 ? base : base - F.smallD * PX, F.smallW * PX, F.smallD * PX);
    const spotY = base + s * F.spot * PX;
    g.fillCircle(cx, spotY, 3);
    g.beginPath();
    if (s > 0) g.arc(cx, spotY, F.circleR * PX, a0, Math.PI - a0, false);
    else g.arc(cx, spotY, F.circleR * PX, Math.PI + a0, Math.PI * 2 - a0, false);
    g.strokePath();
  });
  [[0, 0, 0, Math.PI / 2], [W, 0, Math.PI / 2, Math.PI], [0, L, -Math.PI / 2, 0], [W, L, Math.PI, Math.PI * 1.5]]
    .forEach(([x, y, a, b]) => { g.beginPath(); g.arc(x, y, PX, a, b, false); g.strokePath(); });
  const objs = [g, ...drawStands(scene, F, T), ...drawGoal(scene, F, 0, -1), ...drawGoal(scene, F, L, 1)];
  scene.cameras.main.setBackgroundColor(T.bg);
  return objs;
}

function drawGoal(scene, F, lineY, outward) {
  const cx = F.w * PX / 2, half = F.goalW * PX / 2, depth = F.goalDepth * PX, h = 26;
  const net = scene.add.graphics().setDepth(outward < 0 ? -500 : lineY + 3);
  const y0 = outward < 0 ? lineY - depth : lineY;
  net.fillStyle(0xffffff, 0.14).fillRect(cx - half, y0, half * 2, depth);
  net.lineStyle(1, 0xffffff, 0.3);
  for (let x = cx - half; x <= cx + half; x += 6) net.lineBetween(x, y0, x, y0 + depth);
  for (let y = y0; y <= y0 + depth; y += 6) net.lineBetween(cx - half, y, cx + half, y);
  const frame = scene.add.graphics().setDepth(outward < 0 ? 0 : lineY + 4);
  frame.fillStyle(0x000000, 0.25).fillRect(cx - half, lineY - 1, half * 2, 4);
  frame.lineStyle(4, 0xffffff, 1);
  frame.lineBetween(cx - half, lineY, cx - half, lineY - h);
  frame.lineBetween(cx + half, lineY, cx + half, lineY - h);
  frame.lineBetween(cx - half - 2, lineY - h, cx + half + 2, lineY - h);
  return [net, frame];
}

function makePlayerView(scene, p) {
  const root = scene.add.container(0, 0);
  const shadow = scene.add.ellipse(0, 1, 26, 10, 0x000000, 0.32);
  const ground = scene.add.container(0, 0).setScale(1, 0.5);
  const ring = scene.add.graphics(); ring.lineStyle(3, COLORS.fire, 1).strokeCircle(0, 0, 15);
  const arrow = scene.add.graphics();
  ground.add([ring, arrow]);
  const spr = scene.add.sprite(0, 0, 'match', p.row * NF).setOrigin(24 / 48, 43 / 48).setScale(1.4);
  const ghost = scene.add.sprite(0, 0, 'match', p.row * NF).setOrigin(24 / 48, 43 / 48).setScale(1.4).setAlpha(0.35).setVisible(false);
  const fig = scene.add.container(0, 0, [ghost, spr]);
  const marker = scene.add.graphics();
  marker.fillStyle(COLORS.fire).fillTriangle(-6, 0, 6, 0, 0, 8);
  const warn = scene.add.text(0, -62, '!', { fontFamily: 'Arial Black, Arial', fontSize: '18px', color: '#ffd23a', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setVisible(false);
  const tag = scene.add.text(0, 12, p.name.split(' ')[0], { fontFamily: 'InaPixel, Arial, sans-serif', fontSize: '12px',
    color: '#ffffff', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5, 0);
  root.add([shadow, ground, fig, marker, warn, tag]);
  return { root, ring, arrow, fig, spr, ghost, marker, warn, tag, ctrl: null, shadow, animT: 0 };
}

function paintControl(v, on) {
  if (v.ctrl === on) return;
  v.ctrl = on;
  v.arrow.clear();
  v.arrow.fillStyle(on ? COLORS.fire : 0xffffff, on ? 1 : 0.55).fillTriangle(24, 0, 15, -6, 15, 6);
  v.ring.setVisible(on); v.marker.setVisible(on); v.tag.setVisible(on);
}

class MatchScene extends Phaser.Scene {
  constructor() { super('match'); }
  create() {
    const F = Logic.FIELD, m = F.margin * PX;
    this.makeTextures();
    this.setField('normal');
    this.views = new Map();
    this.ballShadow = this.add.ellipse(0, 0, 11, 5, 0x000000, 0.35);
    const bg = this.add.graphics();
    bg.fillStyle(0xffffff).fillCircle(0, 0, 5); bg.lineStyle(1.2, 0x111111, 0.9).strokeCircle(0, 0, 5);
    bg.fillStyle(0x222222).fillCircle(1.3, -0.8, 1.8);
    this.ballC = this.add.container(0, 0, [bg]);
    // Un rastro y un emisor de partículas por elemento
    this.trails = {}; this.fx = {};
    for (const [k, e] of Object.entries(ELEM)) {
      const tr = this.add.particles(0, 0, e.tex, { lifespan: 380, speed: { min: 10, max: 60 }, scale: { start: 0.9, end: 0 },
        alpha: { start: 0.9, end: 0 }, tint: e.tints, blendMode: k === 'montaña' ? 'NORMAL' : 'ADD', frequency: 14, quantity: 2,
        rotate: { min: 0, max: 360 }, emitting: false });
      tr.startFollow(this.ballC);
      this.trails[k] = tr;
      this.fx[k] = this.add.particles(0, 0, e.tex, { lifespan: 480, speed: { min: 20, max: 120 }, scale: { start: 0.9, end: 0 },
        alpha: { start: 1, end: 0 }, tint: e.tints, blendMode: k === 'montaña' ? 'NORMAL' : 'ADD', rotate: { min: 0, max: 360 }, emitting: false });
    }
    this.dust = this.add.particles(0, 0, 'spark', { lifespan: 380, speed: { min: 20, max: 70 }, scale: { start: 0.7, end: 0 },
      alpha: { start: 0.6, end: 0 }, tint: [0xe8dcb8, 0xc9b98a], emitting: false });
    this.ui = this.add.graphics().setDepth(5000);
    this.shield = [];
    const cam = this.cameras.main;
    cam.setBounds(-m, -m - 40, F.w * PX + 2 * m, F.l * PX + 2 * m + 80);
    cam.setFollowOffset(0, 60);
    this.camT = { x: 0, y: 0 };          // punto que sigue la cámara; se desliza suave hacia tu jugador
    cam.startFollow(this.camT, true, 1, 1);
    this.camInit = false;
    this.tfx = new TechFX(this);
    App.scene = this;
    if (App.match && App.matchSheet) this.bind(App.match, App.matchSheet);
  }

  makeTextures() {
    const mk = (key, w, h, draw) => { const g = this.make.graphics({ x: 0, y: 0, add: false }); draw(g); g.generateTexture(key, w, h); g.destroy(); };
    mk('spark', 16, 16, g => { for (let r = 8; r > 0; r--) { g.fillStyle(0xffffff, 0.14 + (8 - r) * 0.1); g.fillCircle(8, 8, r); } });
    mk('streak', 20, 6, g => { g.fillStyle(0xffffff, 0.5); g.fillRoundedRect(0, 1, 20, 4, 2); g.fillStyle(0xffffff, 1); g.fillRoundedRect(4, 2, 12, 2, 1); });
    mk('leaf', 12, 8, g => { g.fillStyle(0xffffff, 1); g.fillEllipse(6, 4, 12, 7); g.fillStyle(0x000000, 0.25); g.fillRect(1, 3.5, 10, 1); });
    makeStands(this);
    mk('shard', 10, 10, g => { g.fillStyle(0xffffff, 1); g.fillTriangle(5, 0, 10, 8, 0, 10); g.fillStyle(0x000000, 0.25); g.fillTriangle(5, 0, 10, 8, 6, 9); });
  }

  // Cambia el campo (césped, colores y ambiente)
  setField(theme) {
    (this.pitch || []).forEach(o => o.destroy());
    if (this.amb) { this.amb.destroy(); this.amb = null; }
    if (this.shade) { this.shade.destroy(); this.shade = null; }
    if (this.fog) { this.fog.forEach(o => { this.tweens.killTweensOf(o); o.destroy(); }); this.fog = null; }
    this.pitch = drawPitch(this, Logic.FIELD, theme);
    const T = FIELDS[theme] || FIELDS.normal, cam = this.cameras.main;
    if (T.amb) {
      const w = cam.width || 400, h = cam.height || 800;
      this.amb = this.add.particles(0, 0, T.amb.tex, { x: { min: -20, max: w + 20 }, y: T.amb.up ? h + 10 : -10,
        speedY: T.amb.up ? { min: -70, max: -30 } : { min: 30, max: 70 }, speedX: { min: -20, max: 20 }, lifespan: 9000,
        scale: { min: 0.25, max: 0.6 }, alpha: { start: 0.9, end: 0.2 }, tint: T.amb.tint, rotate: { min: 0, max: 360 },
        frequency: 160 / T.amb.n, blendMode: T.amb.up ? 'ADD' : 'NORMAL' }).setScrollFactor(0).setDepth(4000);
    }
    if (T.dark || T.tint) {   // velo de color para noche, atardecer, volcán…
      this.shade = this.add.rectangle(0, 0, 4000, 4000, T.tint || 0x000820, T.dark || 0.12).setOrigin(0).setScrollFactor(0).setDepth(3900);
    }
    if (T.fog) {   // niebla suave: nubes grandes y difusas que se mecen despacio por encima del campo
      if (!this.textures.exists('fogpuff')) {
        const g = this.make.graphics({ x: 0, y: 0, add: false });
        for (let i = 14; i > 0; i--) { g.fillStyle(0xd8d0f0, 0.045); g.fillCircle(64, 64, i * 4.5); }
        g.generateTexture('fogpuff', 128, 128); g.destroy();
      }
      const w = cam.width || 400, h = cam.height || 800;
      this.fog = [];
      for (let i = 0; i < 8; i++) {
        const o = this.add.image(Math.random() * w, (i + 0.5) * h / 8, 'fogpuff').setScrollFactor(0).setDepth(3950)
          .setScale(3 + Math.random() * 2.5, 1.4 + Math.random()).setAlpha(0.5 + Math.random() * 0.3);
        this.tweens.add({ targets: o, x: o.x + (i % 2 ? -1 : 1) * (120 + Math.random() * 120), alpha: o.alpha * 0.55, duration: 7000 + Math.random() * 7000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        this.fog.push(o);
      }
    }
  }
  bind(s, sheet) {
    this.setField(s.settings.field || 'normal');
    if (sheet) {
      if (this.textures.exists('match')) this.textures.remove('match');
      this.textures.addSpriteSheet('match', sheet, { frameWidth: 48, frameHeight: 48 });
      this.textures.get('match').setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
    for (const v of this.views.values()) v.root.destroy();
    this.views = new Map();
    for (const p of s.players) this.views.set(p.id, makePlayerView(this, p));
    this.camInit = false;
    for (const t of Object.values(this.trails)) t.stop();
    this.tfx.reset();
    this.cameras.main.setZoom(1);
  }

  fxRing(x, y, color, scale, depth, width = 4) {
    const g = this.add.graphics({ x, y }).setDepth(depth);
    g.lineStyle(width, color, 1).strokeEllipse(0, 0, 40, 20);
    this.tweens.add({ targets: g, scaleX: scale, scaleY: scale, alpha: 0, duration: 450, ease: 'Cubic.easeOut', onComplete: () => g.destroy() });
  }
  burst(elem, x, y, n, depth) { const e = this.fx[elem] || this.fx.neutro; e.setDepth(depth); e.explode(n, x, y); }

  update(time, delta) {
    const s = App.match;
    if (!s || !this.views.size) return;
    if (App.running) Logic.update(s, Input.read(), Math.min(delta / 1000, 0.05)); else Input.read();

    for (const p of s.players) {
      const v = this.views.get(p.id);
      v.root.setPosition(p.x * PX, p.y * PX).setDepth(p.y * PX);
      v.arrow.rotation = p.aim;
      paintControl(v, p.id === s.controlledId);
      const [di, flip] = dirOf(p.facing);
      let f = ANIM.stand[di];
      const techP = s.tech && s.tech.p === p;
      const spd = Math.hypot(p.vx, p.vy);
      const down = p.stun > 0.3 && !p.tackle && !p.dash;
      // Caído: el fotograma de pie tumbado (los fotogramas de caído del juego no traen el cuerpo en muchos jugadores)
      if (down) f = ANIM.stand[2];
      else if (p.tackle || (p.dash && p.dash.tech.type === 'bloqueo')) f = ANIM.run[di][(Math.floor(time / 70) % 2) * 4 + 1];
      else if (p.kickT > 0) f = ANIM.kick[di][1];
      else if (techP || p.windup || p.tkWind > 0 || (s.shoot.charging && p.id === s.controlledId)) f = ANIM.kick[di][0];
      else if (spd > 0.6) {
        // La animación avanza según la distancia recorrida: los pies no patinan
        v.animT += delta / 1000 * spd * 13 * GAME_SPEED;
        let t = v.animT % 28, k = 0;
        while (t >= ANIM.runT[k]) { t -= ANIM.runT[k]; k++; }
        f = ANIM.run[di][k];
      }
      v.spr.setFrame(p.row * NF + FR[f]).setFlipX(flip);
      if (down !== !!v.down) { v.down = down; v.spr.setAngle(down ? (flip ? -82 : 82) : 0).setY(down ? -10 : 0); }
      if (p.tackle) {   // carga: estela de polvo y un fantasma detrás
        this.dust.setDepth(p.y * PX - 1); this.dust.emitParticleAt(p.x * PX, p.y * PX, 2);
        v.ghost.setVisible(true).setFrame(p.row * NF + FR[f]).setFlipX(flip).setPosition(-Math.cos(p.aim) * 10, -Math.sin(p.aim) * 6);
      } else v.ghost.setVisible(false);
      // Parada especial: escudo grande del elemento delante del portero mientras llega el tiro
      if (p.gkTech && p.gkTech !== 'none' && s.ball.shot && !s.ball.shot.resolved) {
        const e = this.fx[p.gkTech.elem] || this.fx.neutro; e.setDepth(p.y * PX + 2);
        for (let k = 0; k < 4; k++) { const a = time * 0.02 + k * 1.57; e.emitParticleAt(p.x * PX + Math.cos(a) * 34, p.y * PX - 22 + Math.sin(a) * 26, 1); }
      }
      v.spr.setTint(p.invuln > 0 && p.dash && !p.dash.tech.plain ? 0xfff2c0 : 0xffffff);
      v.fig.y = -p.z * PX;
      v.warn.setVisible(p.tkWind > 0);
      if (v.ctrl) v.marker.y = -56 - p.z * PX + Math.sin(time / 220) * 2;
      if (p.dash && !p.dash.tech.plain && Math.random() < 0.6) this.burst(p.dash.tech.elem, p.x * PX, p.y * PX - 14, 1, p.y * PX - 1);
    }

    const b = s.ball;
    this.ballShadow.setPosition(b.x * PX, b.y * PX + 1).setDepth(b.y * PX - 0.5).setScale(Math.max(0.4, 1 - b.z * 0.15));
    this.ballC.setPosition(b.x * PX, (b.y - b.z) * PX - 4).setDepth(b.y * PX + 0.6 + (b.z > 1.2 ? 2000 : 0));
    for (const [k, tr] of Object.entries(this.trails)) {
      const on = b.fire === k;
      tr.setDepth(this.ballC.depth - 0.3);
      if (on && !tr.emitting) tr.start();
      if (!on && tr.emitting) tr.stop();
    }

    if (s.tech) {
      const p = s.tech.p, k = s.tech.t / s.tech.dur, e = this.fx[s.tech.tech.elem] || this.fx.neutro;
      e.setDepth(p.y * PX + 1);
      const n = s.tech.tech.type === 'tiro' ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const a = time * 0.02 + i * 2.094;
        e.emitParticleAt(p.x * PX + Math.cos(a) * 20, p.y * PX - p.z * PX + Math.sin(a) * 9 - k * 34, 1);
      }
    }

    this.tfx.update(s, time, delta);
    const me = Logic.controlled(s), foc = this.tfx.focus(s, me), bl = s.ball;
    let tx = foc.x, ty = foc.y;
    if (foc.z === 1) {
      // Juego normal: la cámara mira a tu jugador pero se inclina hacia el balón; con el balón en el aire
      // (un pase) lo acompaña a él, así al cambiar de jugador no pega un salto
      const w = bl.owner ? (bl.owner === me ? 0 : 0.35) : 0.65;
      tx = (me.x + (bl.x - me.x) * w) * PX; ty = (me.y + (bl.y - me.y) * w) * PX;
      const bv = bl.owner ? me : bl;   // un poco de adelanto en la dirección de la jugada
      tx += Math.max(-40, Math.min(40, (bv.vx || 0) * 3)); ty += Math.max(-60, Math.min(60, (bv.vy || 0) * 4));
    }
    if (!this.camInit) { this.camT.x = tx; this.camT.y = ty; this.camV = { x: 0, y: 0 }; this.camInit = true; }
    // Muelle amortiguado: acelera y frena suave, sin tirones (con tope de velocidad)
    const dt = Math.min(0.05, delta / 1000), W = foc.z === 1 ? 4.2 : 6.5, V = this.camV;
    V.x += ((tx - this.camT.x) * W * W - V.x * 2 * W) * dt; V.y += ((ty - this.camT.y) * W * W - V.y * 2 * W) * dt;
    const vl = Math.hypot(V.x, V.y), VMAX = 1100;
    if (vl > VMAX) { V.x *= VMAX / vl; V.y *= VMAX / vl; }
    this.camT.x += V.x * dt; this.camT.y += V.y * dt;
    this.drawUI(s, me);
    this.handleEvents(s);
    UI.update(s);
  }

  drawUI(s, me) {
    const g = this.ui; g.clear();
    for (const sh of this.shield) {   // escudo del portero
      const r = 30 + Math.sin(sh.t / 60) * 3;
      g.fillStyle(sh.c, 0.28).fillEllipse(sh.x, sh.y, r * 2.2, r * 2.4);
      g.lineStyle(4, sh.c, 0.95).strokeEllipse(sh.x, sh.y, r * 2.2, r * 2.4);
      g.lineStyle(2, 0xffffff, 0.8).strokeEllipse(sh.x, sh.y, r * 1.6, r * 1.8);
    }
    this.shield.length = 0;
    const x = me.x * PX, y = me.y * PX;
    if (me.stamina < 0.99) {
      g.fillStyle(0x000000, 0.5).fillRect(x - 15, y + 26, 30, 4);
      g.fillStyle(me.tired ? 0xe04a3a : 0x7ee36a).fillRect(x - 15, y + 26, 30 * me.stamina, 4);
    }
    if (s.pass && s.pass.charge > 0.12) {   // fuerza del pase
      const c = s.pass.charge;
      g.fillStyle(0x000000, 0.55).fillRect(x - 18, y - 74, 36, 6);
      g.fillStyle(c > 0.85 ? 0xffffff : 0x6fe3ff).fillRect(x - 18, y - 74, 36 * c, 6);
    }
    for (const q of s.players) if (q.windup) {     // la IA cargando el tiro
      const qx = q.x * PX, qy = q.y * PX, c = q.windup.c;
      g.fillStyle(0x000000, 0.55).fillRect(qx - 18, qy - 74, 36, 6);
      g.fillStyle(c > 0.85 ? 0xff7a1a : 0xffd23a).fillRect(qx - 18, qy - 74, 36 * c, 6);
    }
    if (s.shoot.charging) {
      const c = s.shoot.charge;
      g.fillStyle(0x000000, 0.55).fillRect(x - 18, y - 74, 36, 6);
      g.fillStyle(c > 0.85 ? 0xff7a1a : 0xffd23a).fillRect(x - 18, y - 74, 36 * c, 6);
      const F = Logic.FIELD, half = F.goalW / 2 - 0.35;
      const tx = (F.w / 2 + Math.max(-1, Math.min(1, s.shoot.aimX)) * half) * PX;
      g.lineStyle(2, 0xffd23a, 1).strokeCircle(tx, -12, 7);
      g.lineBetween(tx - 10, -12, tx + 10, -12); g.lineBetween(tx, -22, tx, -2);
    }
  }

  handleEvents(s) {
    for (const e of s.events) {
      this.tfx.event(e, s);
      switch (e.type) {
        case 'goal':
          Sound.sfx('goal'); Sound.jingle(e.team === 'A' ? 'goal' : null);
          UI.banner(e.team === 'A' ? TX('¡Gol!') : TX('Gol de ') + s.teams.B.name, e.team === 'A' ? '' : 'rival', 1800);
          this.cameras.main.shake(260, 0.006);
          break;
        case 'golden': UI.banner(TX('¡Gol de oro!'), 'gold', 1600); UI.toast(TX('El primero que marque, gana'), 2000); break;
        case 'mercy': UI.toast(e.team === 'A' ? TX('¡5 goles de diferencia! Partido ganado') : TX('5 goles de diferencia: se acabó el partido'), 2400); break;
        case 'save':
          Sound.sfx('save');
          if (e.elem) { this.cameras.main.shake(220, 0.008); UI.banner(TX('¡Parada!'), 'gold', 900); }
          UI.toast(e.team === 'A' ? TX('¡Paradón!') : TX('¡Para el portero rival!'));
          this.fxRing(e.x * PX, e.y * PX, e.elem ? EL(e.elem).main : 0xffffff, e.big ? 3.4 : 2, e.y * PX + 5);
          if (e.elem) this.burst(e.elem, e.x * PX, e.y * PX - 10, 26, e.y * PX + 6);
          break;
        case 'catch': UI.toast(e.team === 'A' ? TX('Tu portero la atrapa') : TX('El portero rival la atrapa')); break;
        case 'beaten': UI.toast(TX('¡La técnica supera al portero!')); break;
        case 'setpiece': {
          Sound.sfx('whistle');
          const who = e.team === 'A' ? TX('para ti') : 'para ' + s.teams.B.name;
          const T = { banda: TX('Saque de banda'), puerta: TX('Saque de puerta'), corner: TX('Córner'), offside: TX('¡Fuera de juego!') }[e.kind];
          if (e.kind === 'offside' || e.kind === 'corner') UI.banner(T, e.kind === 'offside' ? 'flag' : 'gold', 1100);
          UI.toast(T + ' ' + who, 1400);
          break;
        }
        case 'tackle':
          Sound.sfx(e.ok ? 'tackle' : 'whiff');
          if (e.ok) { this.dust.setDepth(e.y * PX + 5); this.dust.explode(14, e.x * PX, e.y * PX); if (e.team === 'A') UI.toast(TX('¡Entrada!')); }
          break;
        case 'shot': Sound.sfx('kick'); break;
        case 'dribble': Sound.sfx('whiff'); this.dust.setDepth(e.y * PX - 1); this.dust.explode(6, e.x * PX, e.y * PX); break;
        case 'pass': Sound.sfx('pass'); break;
        case 'switch': if (!e.auto) Sound.sfx('click'); break;
        case 'kickoff': Sound.sfx('whistle'); break;
        case 'techStart': {
          Sound.sfx('tech');
          if (e.kind === 'parada') {
            const c = Phaser.Display.Color.IntegerToRGB(EL(e.elem).main);
            this.cameras.main.flash(180, c.r, c.g, c.b);
          }
          const p = s.players.find(q => q.id === e.id);
          if (p) { this.fxRing(p.x * PX, p.y * PX, EL(e.elem).main, 2.4, p.y * PX + 5, 3); this.burst(e.elem, p.x * PX, p.y * PX - 16, 16, p.y * PX + 2); }
          break;
        }
        case 'techKick':
          this.fxRing(e.x * PX, e.y * PX, EL(e.elem).main, 3.2, e.y * PX + 5);
          this.burst(e.elem, e.x * PX, e.y * PX - 20, 30, e.y * PX + 6);
          this.cameras.main.shake(180, e.elem === 'montaña' ? 0.009 : 0.005);
          break;
        case 'techBurst': this.burst(e.elem, e.x * PX, e.y * PX - 14, 22, e.y * PX + 2); break;
        case 'knock': this.burst(e.elem, e.x * PX, e.y * PX - 14, 8, e.y * PX + 2); break;
        case 'blockOk':
          this.fxRing(e.x * PX, e.y * PX, EL(e.elem).main, 2.6, e.y * PX + 5);
          this.burst(e.elem, e.x * PX, e.y * PX - 14, 24, e.y * PX + 3);
          if (e.team === 'A') UI.toast(TX('¡Bloqueo!'));
          break;
        case 'dodgeFail': UI.toast(TX('¡') + e.name + TX(' lee el regate!')); break;
        case 'msg': UI.toast(e.text); break;
        case 'end': Sound.sfx('whistleEnd'); App.matchEnded(s); break;
      }
    }
    s.events.length = 0;
  }
}
