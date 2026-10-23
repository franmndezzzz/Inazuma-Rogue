/* =====================================================================
   APP: menús, modos, gacha, plantilla, recorridos y pantallas (DOM).
   ===================================================================== */
const ELEM_LABEL = { fuego: TX('Fuego'), viento: TX('Viento'), bosque: TX('Bosque'), 'montaña': TX('Montaña'), neutro: '—' };
const TYPE_LABEL = { tiro: TX('Tiro'), regate: TX('Regate'), bloqueo: TX('Bloqueo'), parada: TX('Parada') };
const ROLE_LABEL = { POR: TX('Portero'), DEF: TX('Defensa'), MED: TX('Medio'), DEL: TX('Delantero') };
const ROLES4 = ['POR', 'DEF', 'MED', 'DEL'];
// Abreviatura del puesto para mostrar (en inglés: GK, DF, MF, FW) y curso del jugador («3º curso» / «Year 3»)
const RAB = r => (I18N.en() ? { POR: 'GK', DEF: 'DF', MED: 'MF', DEL: 'FW' }[r] : null) || r;
const yearTx = n => TX('{0}º curso', n);
const ordTx = n => I18N.en() ? n + ([, 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] || 'th') : n + 'º';
const FIELD_LABEL = { normal: TX('Campo clásico'), noche: TX('Campo nocturno'), niebla: TX('Campo nocturno con niebla'), jungla: TX('Campo de la jungla'), atardecer: TX('Campo al atardecer'), nieve: TX('Campo nevado'), acero: TX('Estadio de acero'), cielo: TX('Campo celestial'), volcan: TX('Campo volcánico') };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const chip = e => `<span class="chip ${EL(e).css}">${ELEM_LABEL[e] || e}</span>`;
const rchip = r => `<span class="rar ${r}">${RARITY[r].label}</span>`;
const stars = n => `<span class="stars">${'★'.repeat(n)}<s>${'★'.repeat(MAX_STARS - n)}</s></span>`;
const TYPE_ICON = { tiro: '⚽', regate: '💨', bloqueo: '🛡️', parada: '✋' };
const techLine = t => `<span class="tline">${chip(t.elem)}<b>${esc(t.name)}</b><i>${TYPE_LABEL[t.type] || ''} · ${t.power}</i></span>`;

const VERSION = '0.31.10';
const DISCORD_URL = 'https://discord.gg/G6SyT2rZW', DISCORD_GIFT = 10;   // servidor de la comunidad (lo hizo un colega de Fran)
const BETA = false;   // solo la beta privada (artefacto) lo pone a true: ahí está el modo desarrollador
const App = (() => {
  const $ = id => document.getElementById(id);
  const settings = { minutes: 3, techMode: 'boton', formation: '1-2-1-1', slowmo: 1, intro: 1, controls: 'auto', autoSwitch: 1 };
  try { Object.assign(settings, JSON.parse(localStorage.getItem('inazuma-ajustes') || '{}')); } catch (_) {}
  const saveSettings = () => { try { localStorage.setItem('inazuma-ajustes', JSON.stringify(settings)); } catch (_) {} };
  // Fuera de la beta no hay modo desarrollador: si alguien lo tenía encendido, se apaga sin avisar
  if (!BETA && (settings.dev || settings.debug || settings.hwForce || settings.devWin || settings.speed)) {
    settings.dev = false; settings.debug = 0; settings.hwForce = false; settings.devWin = 0; settings.speed = 0; saveSettings();
  }
  Profile.load();
  Halloween.forced = Halloween.forced || !!settings.hwForce;   // la beta lo trae encendido de serie

  const api = { match: null, matchSheet: null, running: false, scene: null, mode: null, run: null, settings, pick: null, draft: null };
  const body = $('screenBody');
  api.inMatch = () => api.running;

  function show(id) {
    ['screen', 'pause'].forEach(k => $(k).hidden = k !== id);
    Pad.show(!id);
    $('hud').hidden = !!id && id !== 'pause';
    $('pauseBtn').hidden = !!id;
  }
  // Fondo de cada pantalla: imágenes del juego (carpeta ui/); sin fondo = rayas azules del menú
  function screen(html, bg) {
    const sc = $('screen');
    sc.classList.remove('hwtheme'); sc.querySelectorAll('.hwfx').forEach(x => x.remove());
    sc.classList.toggle('bg-cover', !!bg);
    sc.style.backgroundImage = bg ? `url("ui/${bg}.png")` : '';
    body.classList.toggle('cardbg-clear', !!bg);
    body.innerHTML = html; sc.scrollTop = 0; show('screen');
  }
  const crestOf = key => (TEAM(key) || {}).crest || 1;
  // Barra fija arriba con «Volver» y el título; barra fija abajo para el botón principal
  const top = (title, id = 'back', label = TX('Volver')) => `<div class="top"><button class="ghost back" id="${id}">◀ ${label}</button><h2>${title}</h2></div>`;
  const bottom = html => `<div class="bottom">${html}</div>`;
  const face = (ref, size) => Sprites.face(ref, size);
  // Cara del mánager (Ray Dark no está en las hojas de sprites: tiene su retrato en ui/raydark.png)
  function mgrFace(id, size) {
    const pd = PLAYER(id);
    if (pd && pd.faceImg) { const i = document.createElement('img'); i.src = pd.faceImg; i.alt = ''; i.width = i.height = size; i.className = 'mgrcrest pix'; return i; }
    return face(Sprites.refOf(pd), size);
  }
  function wallet() { const P = Profile.data; return `<div class="runbar"><span>🪙 ${P.coins}</span><span>🎟️ ${P.tickets}</span><span title="${TX('Rayos Raimon')}">⚡ ${P.rayos}</span><span>👥 ${Profile.ids().length}</span></div>`; }
  function opts(group, key, list, obj = settings) {
    return `<div class="group"><label>${group}</label><div class="opts">${list.map(([v, t]) =>
      `<button data-k="${key}" data-v="${v}" aria-pressed="${obj[key] == v}">${t}</button>`).join('')}</div></div>`;
  }
  function bindOpts(obj, onChange) {
    body.querySelectorAll('.opts button[data-k]').forEach(b => b.addEventListener('click', () => {
      obj[b.dataset.k] = isNaN(+b.dataset.v) ? b.dataset.v : +b.dataset.v;
      b.parentNode.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
      onChange && onChange(b.dataset.k);
    }));
  }
  const formSelect = (obj, key = 'formation') => `<div class="group"><label>${TX('Formación')}</label><select id="formSel">${Object.entries(FORMATIONS).map(([k, f]) =>
    `<option value="${k}" ${obj[key] === k ? 'selected' : ''}>${k} · ${f.name}</option>`).join('')}</select></div>`;
  document.addEventListener('pointerdown', () => Sound.unlock(), { capture: true });

  /* ---------- Menú principal: modos ---------- */
  function renderMenu() {
    if (!Profile.data.firstDone) return renderWelcome();
    if (Cloud.state.conflict) return renderConflict(renderMenu);
    let traida = false; try { traida = !!localStorage.getItem('inazuma-traida'); if (traida) localStorage.removeItem('inazuma-traida'); } catch (_) {}
    if (traida) { setTimeout(() => UI.toast(Cloud.enabled() && !Cloud.loggedIn() ? TX('¡Partida traída! Crea una cuenta en 👤 Cuenta para tenerla siempre a salvo') : TX('¡Partida traída!'), 3500), 300); }
    const P = Profile.data, runs = Run.all(), RUN_ORDER = ['story', 'special', 'chain', 'infinite'], open = RUN_ORDER.filter(k => runs[k]).map(k => runs[k]);
    const done = P.story.s1.done;
    screen(`<div class="title"><img class="logo" id="logo" src="ui/logo_rogue.png" alt="Inazuma Rogue"><span>${TX('5 contra 5 · roguelite')}</span></div>${wallet()}
      ${Halloween.active() ? hwMenuBtn() : ''}
      ${open.map(r => `<button class="cta" data-cont="${r.kind}">${TX('Continuar:')} ${esc(r.name)}<small>${TX('Partido')} ${r.index + 1}${r.kind === 'infinite' ? '' : TX(' de ') + r.schedule.length} · ${'♥'.repeat(r.lives)}</small></button>`).join('')}
      <div class="modes">
        <button class="mode" id="mCareer"><span class="cicon">🏆</span><span class="mt"><b>${TX('Modo Carrera')}</b><small>${Career.data && !Career.data.over ? TX('Temporada ') + Career.data.season + ' · ' + DIV_NAME[Career.myDiv()] + TX(' · semana ') + Career.data.week : TX('Eres el mánager: 3 divisiones y ascensos')}</small></span></button>
        <button class="mode" id="mStory">${Sprites.crest(1)}<span class="mt"><b>${TX('Historia')}</b><small>${P.story.s4.done ? TX('Etapas 1, 2 y 3 completadas ✓') : P.story.s3.done ? TX('Etapa 3 · Fase 2 abierta (mejor: ') + P.story.s4.best + ')' : P.story.s2.done ? TX('Etapa 3 abierta: el Inazuma 3') : done ? TX('Etapa 1 ✓ · Etapa 2 abierta (mejor: ') + P.story.s2.best + ')' : TX('Etapa 1 · mejor: ') + P.story.s1.best + TX(' victorias')}</small></span></button>
        <button class="mode" id="mSpecial">${Sprites.crest(588)}<span class="mt"><b>${TX('Equipos especiales')}</b><small>${SPECIALS.filter(x => Profile.unlocked({ special: x })).length} ${TX('de')} ${SPECIALS.length} ${TX('abiertos')}</small></span></button>
        <button class="mode ${done ? '' : 'locked'}" id="mChain">${Sprites.crest(599)}<span class="mt"><b>${TX('Cadenas')}</b><small>${done ? TX('Desafíos cortos · premio: Rayo Raimon') : TX('🔒 Completa la Etapa 1')}</small></span></button>
        <button class="mode ${done ? '' : 'locked'}" id="mInf">${Sprites.crest(15)}<span class="mt"><b>${TX('Infinito')}</b><small>${done ? TX('Por oleadas · récord: ') + P.infBest : TX('🔒 Completa la Etapa 1')}</small></span></button>
      </div>
      <div class="grid2">
        <button class="ghost big" id="mGacha">${TX('Gacha')}<small>${P.tickets} ${TX('tickets')}</small></button>
        <button class="ghost big" id="mTeam">${TX('Plantilla')}<small>${TX('Entrenar y Rayos')}</small></button>
        <button class="ghost big" id="mQuick">${TX('Partido rápido')}<small>${TX('Tus mejores 5')}</small></button>
        <button class="ghost big" id="mSound">${TX('Ajustes')}<small>${TX('Partido, controles y sonido')}</small></button>
      </div>
      <div class="grid2"><button class="ghost" id="mGift">${TX('🎁 Código de regalo')}</button><button class="ghost" id="mSaves">${TX('👤 Cuenta')}${Cloud.loggedIn() ? ' · ' + esc(Cloud.user()) : ''}</button></div>
      <button class="ghost" id="mNews">${TX('📰 Novedades')} · v${VERSION}${settings.seenNews !== VERSION ? ' <i class="newdot"></i>' : ''}</button>
      <button class="ghost discordbtn" id="mDiscord">${P.discordGift ? TX('💬 Únete al Discord de la comunidad') : TX('💬 Únete al Discord · +10 tickets 🎟️')}</button>
      <div data-cloudline>${cloudLine()}</div>
      ${Controls.pc() ? `<p class="note gpnote">${TX('🎮 ¿Tienes mando? Conéctalo y juega: Xbox, PlayStation o genérico.')} <small>${TX('Los botones están en Ajustes.')}</small></p>` : ''}
      ${open.map(r => `<button class="ghost" data-aband="${r.kind}">${TX('Abandonar:')} ${esc(r.name)}</button>`).join('')}
      <button class="ver" id="ver">v${VERSION}${settings.dev ? TX(' · dev') : ''}</button>`, 'bg_title');
    let vt = 0, vtT = 0;   // 20 toques seguidos en la versión: modo desarrollador
    $('ver').onclick = () => {
      const now = Date.now(); vt = now - vtT < 1500 ? vt + 1 : 1; vtT = now;
      if (!BETA) return;
      if (vt >= 20) { vt = 0; if (!settings.dev) { settings.dev = true; settings.devWin = 1; saveSettings(); UI.toast(TX('Modo desarrollador activado'), 1800); } Sound.sfx('reveal'); renderDev(); }
      else if (vt >= 15) UI.toast(TX('Faltan ') + (20 - vt) + TX(' toques…'), 600);
    };
    // Cada modo guarda su partida: si ya tienes una de ese modo, el botón la continúa (puedes tener varias a la vez)
    const resume = k => { if (!runs[k]) return false; api.run = runs[k]; openRun(); return true; };
    body.querySelectorAll('[data-cont]').forEach(b => b.onclick = () => resume(b.dataset.cont));
    body.querySelectorAll('[data-aband]').forEach(b => b.onclick = () => {
      if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = TX('¿Seguro? Toca otra vez para abandonar'); return; }
      Run.clear(b.dataset.aband); if (api.run && api.run.kind === b.dataset.aband) api.run = null; renderMenu();
    });
    $('mStory').onclick = () => { if (!resume('story')) renderStory(); };
    $('mCareer').onclick = () => renderCareer();
    $('mSpecial').onclick = () => { if (!resume('special')) renderSpecials(); };
    $('mChain').onclick = () => { if (!done) return UI.toast(TX('Completa la Etapa 1 de la Historia')); if (!resume('chain')) renderChains(); };
    $('mInf').onclick = () => { if (!done) return UI.toast(TX('Completa la Etapa 1 de la Historia')); if (!resume('infinite')) { newDraft('infinite', {}); tutorial('infinite'); } };
    $('mGacha').onclick = renderGacha; $('mTeam').onclick = () => renderTeam();
    $('mGift').onclick = renderGift;
    $('mNews').onclick = () => renderNews(renderMenu);
    $('mDiscord').onclick = () => {
      Sound.sfx('click');
      // Regalo de bienvenida: 10 tickets la primera vez que se pulsa (una sola vez por perfil)
      if (!P.discordGift) { P.discordGift = Date.now(); P.tickets += DISCORD_GIFT; Profile.save(); setTimeout(() => { renderMenu(); UI.toast(TX('¡Gracias por unirte! +10 tickets 🎟️'), 2600); }, 400); }
      try { window.open(DISCORD_URL, '_blank', 'noopener'); } catch (_) { location.href = DISCORD_URL; }
    };
    if (settings.seenNews !== VERSION && settings.newsShown !== VERSION) { settings.newsShown = VERSION; saveSettings(); setTimeout(() => { if ($('mNews')) renderNews(renderMenu); }, 400); }   // la primera vez tras actualizar
    $('mSaves').onclick = () => renderAccount(renderMenu);
    body.querySelector('[data-cloudline]').onclick = () => renderAccount(renderMenu);
    $('mQuick').onclick = startQuick; $('mSound').onclick = renderSettings;
    if ($('mHw')) { $('mHw').onclick = renderHalloween; hwDecor(); }
    if (settings.seenNews === VERSION || settings.newsShown === VERSION) setTimeout(aviso, 500);
    Sound.music('menu');
  }

  const mini = keys => `<span class="mini">${keys.map(k => Sprites.crest(crestOf(k))).join('')}</span>`;
  /* ---------- Tutoriales: se enseñan la primera vez que entras en cada modo (y con el botón ❓) ---------- */
  const TUTS = {
    story: [TX('Historia'), TX('Recorre los torneos del 1, 2 y 3 con tu equipo. Es') + ' <b>' + TX('roguelite') + '</b>' + TX(': tienes vidas ♥, tras cada victoria eliges una mejora (técnica, habilidad o fichaje temporal) y todo eso se pierde al acabar el intento. Completar una etapa la deja superada para siempre y abre más modos.')],
    special: [TX('Equipos especiales'), TX('Un solo partido, sin segundas oportunidades. Si ganas,') + ' <b>' + TX('su estrella se une a tu plantilla') + '</b> ' + TX('(o sube una ★ si ya la tenías).')],
    chains: [TX('Cadenas'), TX('Varios partidos seguidos') + ' <b>' + TX('sin recuperar vidas') + '</b>' + TX('. Al completarla: Rayo Raimon, tickets, monedas y la estrella del último rival. La primera vez, una técnica legendaria. Sin perder vidas, 💎 extra. Medallas 🥉🥈🥇 al repetirlas.')],
    infinite: [TX('Infinito'), TX('Oleadas de rivales cada vez más fuertes hasta que te quedes sin vidas. Cada 5 oleadas, un jefe. Intenta batir tu récord.') + ' <b>' + TX('∞ Al ganar a cada jefe eliges una versión especial de un jugador (del 2, del 3…) que no sale en el gacha: cuanto más lejos llegues, más rara.') + '</b>'],
    gacha: [TX('Gacha'), TX('Gasta tickets para tirar: gira la manivela de la máquina y abre las cápsulas. Probabilidades: común 60 %, rara 28 %, épica 10 %, legendaria 2 % (cada 10 tiradas sin épica, la siguiente lo es seguro). Los repetidos suben estrellas a tu jugador.')],
    team: [TX('Plantilla'), '<b>' + TX('Mi equipo') + '</b>' + TX(': elige formación y quién juega (a portería solo porteros).') + ' <b>' + TX('Jugadores') + '</b>' + TX(': busca y entrena (monedas) o usa Rayos Raimon para subir estrellas.') + ' <b>' + TX('Técnicas') + '</b>' + TX(': equipa las supertécnicas.')],
    career: [TX('Modo Carrera'), TX('Eres el mánager de un instituto: 3 divisiones, Copa y playoffs. Cada semana haz una actividad (entrenar, ojear…), juega o simula el partido y ficha (también a jugadores del extranjero). Tus titulares') + ' <b>' + TX('suben o bajan') + '</b> ' + TX('según su rendimiento. Los jugadores se') + ' <b>' + TX('gradúan al acabar 6º curso') + '</b> ' + TX('y la cantera trae chavales nuevos. Cuida la fama: si llega a 0, cierran el club. Cada 3 temporadas,') + ' <b>' + TX('el Mundial') + '</b>.'],
    wc: [TX('El Mundial'), TX('Eres el seleccionador de Inazuma Japón. Convoca a') + ' <b>' + TX('10 jugadores') + '</b> ' + TX('(dos equipos de 5) y elige qué 5 juegan cada partido. Grupo de 4 (pasan 2), semifinal y final, con penaltis si hay empate.')],
  };
  function tutorial(key, force) {
    const T = TUTS[key]; settings.tuts = settings.tuts || {};
    if (!T || (settings.tuts[key] && !force)) return;
    settings.tuts[key] = 1; saveSettings();
    const d = document.createElement('div'); d.className = 'tutbox';
    d.innerHTML = `<div class="tutin"><h2>❓ ${T[0]}</h2><p>${T[1]}</p><button class="cta">${TX('¡Entendido!')}</button></div>`;
    d.querySelector('button').onclick = () => d.remove();
    document.body.appendChild(d);
  }
  // Aviso que sale una sola vez al entrar al menú (cambia AVISO.key para sacar uno nuevo)
  const AVISO = { key: 'munecos-ie3', title: TX('🎨 ¡Muñecos del Inazuma 3 arreglados!'),
    text: TX('Muchos jugadores del 3 llevaban en el campo un muñeco que no era el suyo. Ahora todos llevan su muñeco de verdad, sacado del juego original: su peinado, sus colores y su tono de piel. Mac Robingo, Hector Helio, Edgar Partinus, Dylan Keith, Byron Love y muchos más ya se ven como tienen que verse.') };
  function aviso() {
    if (!Profile.data.firstDone || settings.aviso === AVISO.key || document.querySelector('.tutbox') || $('newsOk') || !$('mNews')) return;   // no encima de las Novedades
    settings.aviso = AVISO.key; saveSettings();
    const d = document.createElement('div'); d.className = 'tutbox';
    d.innerHTML = `<div class="tutin"><h2>${AVISO.title}</h2><p>${AVISO.text}</p><button class="cta">${TX('¡A jugar!')}</button></div>`;
    d.querySelector('button').onclick = () => d.remove();
    document.body.appendChild(d);
  }
  const tutBtn = key => `<button class="ghost mini tutq" data-tut="${key}">${TX('❓ Cómo funciona')}</button>`;
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-tut]'); if (b) tutorial(b.dataset.tut, true); });
  function renderStory() {
    const P = Profile.data;
    screen(`${top(TX('Historia'))}${wallet()}
      <div class="modes">${STAGES.map((s, i) => { const open = s.available && Profile.unlocked({ stage: s }), ord = STAGE_ORDER[s.key] || [];
        return `<button class="mode ${open ? '' : 'locked'}" data-st="${s.key}">${Sprites.crest([1, 33, 3021, 3057][i] || 15)}<span class="mt"><b>${s.name}</b>
        <small>${open ? (P.story[s.key] && P.story[s.key].done ? TX('Completada ✓ · puedes repetirla') : ord.length ? TX('De ') + esc(ord[0]) + ' a ' + esc(ord[ord.length - 1]) : '') : '🔒 ' + s.note}</small>${open && ord.length ? mini(ord) : ''}</span></button>`; }).join('')}</div>
      <p class="note">${TX('Cada intento es roguelite: las técnicas, habilidades y fichajes se pierden al acabar. La etapa que completas queda superada para siempre y abre las Cadenas, el Infinito y más equipos especiales.')}</p>
`, 'bg_team');
    body.querySelectorAll('[data-st]').forEach(b => b.onclick = () => {
      const st = STAGES.find(s => s.key === b.dataset.st);
      if (!st.available || !Profile.unlocked({ stage: st })) return UI.toast(st.note);
      newDraft('story', { diff: 'medio', stage: st.key });
    });
    tutorial('story'); if (!$('tutq-story')) body.insertAdjacentHTML('beforeend', `<p class="note" id="tutq-story">${tutBtn('story')}</p>`);
    $('back').onclick = renderMenu;
  }
  function renderSpecials() {
    const P = Profile.data;
    screen(`${top(TX('Especiales'))}${wallet()}
      <p class="note">${TX('Un solo partido, sin segundas oportunidades. Si ganas, te llevas a su estrella para tu plantilla (o una estrella más si ya la tienes).')}</p>
      <div class="modes" id="sp"></div>`);
    SPECIALS.forEach(x => {
      const t = TEAM(x.key), open = Profile.unlocked({ special: x });
      const star = teamStar(t.key, true);
      const b = document.createElement('button'); b.className = 'mode' + (open ? '' : ' locked');
      b.innerHTML = `${Sprites.crest(t.crest)}<span class="mt"><b>${esc(t.name)}</b><small>${open ? `${FIELD_LABEL[TEAM_FIELD[t.key]] || ''} ${TX('· Premio:')} ${star ? esc(star.name) : '—'}${P.specials[t.key] ? TX(' · ganado ×') + P.specials[t.key] : ''}`
        : '🔒 ' + (x.unlock === 'done' ? TX('Completa la Etapa 1') : x.unlock === 'done2' ? TX('Completa la Etapa 2') : `${TX('Gana')} ${x.unlock} ${TX('partidos en la Etapa 1')}`)}</small></span>`;
      b.onclick = () => { if (!open) return UI.toast(TX('Aún bloqueado')); newDraft('special', { team: t.key }); };
      $('sp').appendChild(b);
    });
    tutorial('special'); if (!$('tutq-special')) body.insertAdjacentHTML('beforeend', `<p class="note" id="tutq-special">${tutBtn('special')}</p>`);
    $('back').onclick = renderMenu;
  }
  function renderChains() {
    const P = Profile.data;
    screen(`${top(TX('Cadenas'))}${wallet()}
      <p class="note">${TX('Varios partidos seguidos sin recuperar vidas.')} <b>${TX('Premios por completarla:')}</b> ${TX('⚡ Rayo Raimon · 5 🎟️ · 150 🪙 · la estrella del último rival se une a tu plantilla (o sube una ★).')}
      <b>${TX('La primera vez:')}</b> ${TX('una técnica legendaria y 10 🎟️ más.')} <b>${TX('Sin perder vidas:')}</b> +5 🎟️ 💎. <b>${TX('Medallas:')}</b> ${TX('🥉 1 vez · 🥈 3 veces · 🥇 5 veces (15 🎟️ y otro Rayo).')}</p>
      <div class="modes">${CHAINS.map(c => { const open = Profile.unlocked({ chain: c });
        return `<button class="mode${open ? '' : ' locked'}" data-ch="${c.key}">${Sprites.crest(crestOf(c.teams[0]))}<span class="mt"><b>${open ? '' : '🔒 '}${esc(c.name)}</b><small>${open ? esc(c.desc) : c.needs === 's4' ? TX('Completa la Etapa 3') : TX('Completa la Etapa 2')} · ${c.teams.length} ${TX('partidos ·')} ${'♥'.repeat(c.lives)}${P.chains[c.key] ? ' · ' + (P.chains[c.key] >= 5 ? '🥇' : P.chains[c.key] >= 3 ? '🥈' : '🥉') + ' ×' + P.chains[c.key] + (P.chainPerfect && P.chainPerfect[c.key] ? ' 💎' : '') : TX(' · 📜 técnica legendaria la 1.ª vez')}</small>${mini(c.teams)}</span></button>`; }).join('')}</div>`);
    body.querySelectorAll('[data-ch]').forEach(b => b.onclick = () => {
      const c = CHAINS.find(x => x.key === b.dataset.ch);
      if (!Profile.unlocked({ chain: c })) return UI.toast(TX('Se abre al completar la Etapa 2'));
      newDraft('chain', { chain: c.key });
    });
    tutorial('chains'); if (!$('tutq-chains')) body.insertAdjacentHTML('beforeend', `<p class="note" id="tutq-chains">${tutBtn('chains')}</p>`);
    $('back').onclick = renderMenu;
  }

  function renderWelcome() {
    screen(`<div class="title"><img class="logo" src="ui/logo_rogue.png" alt="Inazuma Rogue"><span>${TX('¡Bienvenido!')}</span></div>
      <p class="note">${TX('Tu plantilla empieza vacía. Haz tu tirada de bienvenida:')} <b>${TX('10 jugadores')}</b> ${TX('del juego, con un')} <b>${TX('portero asegurado')}</b> ${TX('y al menos uno épico o mejor. Además recibes 60 monedas para entrenar.')}</p>
      <p class="note">${TX('Probabilidades: común 60 % · rara 28 % · épica 10 % · legendaria 2 %. Cada 10 tiradas sin épica, la siguiente lo es seguro.')}</p>
      <button class="cta" id="wPull">${TX('Tirada de bienvenida ×10')}</button>
      ${Cloud.enabled() && !Cloud.loggedIn() ? `<div class="grid2"><button class="ghost big" id="wIn">${TX('Ya tengo cuenta')}<small>${TX('Recuperar mi partida')}</small></button><button class="ghost big" id="wUp">${TX('Crear cuenta')}<small>${TX('Guardar en la nube')}</small></button></div>` : ''}
      <button class="ghost" id="wLang">🌐 ${I18N.lang === 'en' ? 'Español' : 'English'}</button>
      <button class="ghost big" id="wOld">${TX('¿Jugabas en la versión antigua?')}<small>${TX('Trae tu partida aquí')}</small></button>
      <div data-cloudline>${Cloud.loggedIn() ? cloudLine() : ''}</div>`, 'bg_title');
    $('wOld').onclick = () => renderTransfer(renderMenu);
    $('wLang').onclick = () => { const l = I18N.lang === 'en' ? 'es' : 'en'; I18N.set(l); screen(`<div class="title"><img class="logo" src="ui/logo_rogue.png" alt="Inazuma Rogue"><span>${l === 'en' ? 'Changing language…' : 'Cambiando el idioma…'}</span></div>`, 'bg_title'); setTimeout(() => location.reload(), 250); };
    if ($('wIn')) { $('wIn').onclick = () => renderLogin(renderMenu, 'in'); $('wUp').onclick = () => renderLogin(renderMenu, 'up'); }
    $('wPull').onclick = () => {
      Sound.unlock();
      Profile.data.pity = 0;
      const res = Gacha.pull(10, { keeper: true });
      Profile.data.firstDone = true; Profile.data.coins += 60; Profile.save();
      renderMachine(res, 1, renderMenu, TX('Tirada de bienvenida'));
    };
  }

  /* ---------- Gacha ---------- */
  function renderGacha() {
    const P = Profile.data, B = BANNERS.find(b => b.id === P.banner) || BANNERS[0];
    screen(`${top(TX('Gacha'))}${wallet()}
      <div class="banners" id="bn"></div>
      <p class="note">${TX('Común 60 % · Rara 28 % · Épica 10 % · Legendaria 2 %. En el tramo legendario, la mitad de las veces sale una')} <b>${TX('técnica legendaria')}</b> ${TX('(de las más fuertes del juego).')}<br>
      ${TX('Épica o mejor asegurada cada 10 tiradas (llevas')} ${P.pity} ${TX('de 10). Los repetidos suben una estrella (máx.')} ${MAX_STARS}${TX('); con 5 estrellas, o una técnica repetida, dan monedas.')}</p>
      <p class="note">${TX('Tickets: Historia (1 por victoria y 3 al completarla), Especiales (2), Cadenas (2 al completarlas) e Infinito (2 por oleada especial).')}</p>
      ${bottom(`<div class="grid2"><button class="cta" id="g1" ${P.tickets < 1 ? 'disabled' : ''}>${TX('Tirar ×1')}<small>${TX('1 ticket')}</small></button><button class="cta" id="g10" ${P.tickets < 10 ? 'disabled' : ''}>${TX('Tirar ×10')}<small>${TX('10 tickets')}</small></button></div>`)}`, 'bg_green');
    BANNERS.forEach(b => {
      const seenL = new Set(), legs = GAME.players.filter(p => p.banner === b.id && p.rarity === 'legendaria').filter(p => { const k = p.full.replace(/ \((IE2|IE3)\)$/, ''); return !seenL.has(k) && seenL.add(k); });
      const el = document.createElement('button');
      el.className = 'banner-card' + (b.id === B.id ? ' sel' : '');
      const n = GAME.players.filter(p => p.banner === b.id && p.gacha !== false).length;
      el.innerHTML = `${Sprites.crest(b.crest)}<span class="mt"><b>${esc(b.name)}</b><small>${esc(b.desc)} · ${n} ${TX('jugadores')}</small><span class="legs"></span></span>`;
      legs.forEach(p => el.querySelector('.legs').appendChild(face(Sprites.refOf(p), 32)));
      el.onclick = () => { P.banner = b.id; Profile.save(); Sound.sfx('click'); renderGacha(); };
      $('bn').appendChild(el);
    });
    const go = n => { if (P.tickets < n) return; P.tickets -= n; Profile.save(); renderMachine(Gacha.pull(n, { banner: B.id }), B.id, renderGacha); };
    $('g1').onclick = () => go(1); $('g10').onclick = () => go(10); $('back').onclick = renderMenu;
    tutorial('gacha'); if (!$('tutq-gacha')) body.insertAdjacentHTML('beforeend', `<p class="note" id="tutq-gacha">${tutBtn('gacha')}</p>`);
  }
  // Legendarios de Halloween: marco naranja apagado, estilo miedo (clase .hw)
  const hwc = pd => pd && pd.halloween ? ' hw' : pd && pd.inf ? ' inf' : '';   // marcos especiales: Halloween y versiones del Infinito
  // Carta de un resultado del gacha (jugador o técnica legendaria)
  function makeCard(r) {
    const c = document.createElement('div');
    c.className = 'gcard ' + r.tier + (r.tech == null ? hwc(PLAYER(r.id)) : '');
    if (r.tech != null) {
      const t = TECH(r.tech);
      c.classList.add('techcard', EL(t.elem).css);
      c.innerHTML = `<div class="scroll">${TYPE_ICON[t.type] || '★'}</div><div class="gname">${esc(t.name)}</div>
        <div class="gmeta">${rchip('legendaria')}${chip(t.elem)}</div><div class="gmeta">${TYPE_LABEL[t.type]} · ${t.power}</div>
        <div class="gtag">${r.isNew ? TX('¡TÉCNICA NUEVA!') : '+' + r.coins + ' 🪙'}</div>`;
      return c;
    }
    const pd = PLAYER(r.id);
    c.appendChild(face(Sprites.refOf(pd), 80));
    c.insertAdjacentHTML('beforeend', `<div class="gname">${pd.halloween ? '🎃' : ''}${esc(pd.name)}</div><div class="gmeta">${rchip(r.tier)}<span>${RAB(pd.role)}</span>${chip(pd.elem)}</div>
      <div class="gtag">${r.isNew ? 'NUEVO' : r.coins ? '+' + r.coins + ' 🪙' : '★ ' + r.star}</div>`);
    return c;
  }
  function renderReveal(res, done, title = TX('¡Nuevos jugadores!')) {
    screen(`<h2>${title}</h2><div class="reveal" id="rv"></div>${bottom('<button class="cta" id="ok" hidden>' + TX('Continuar') + '</button>')}`, 'bg_whistle');
    const box = $('rv');
    res.forEach((r, i) => {
      const c = makeCard(r); c.style.animationDelay = (i * 0.18) + 's'; box.appendChild(c);
      setTimeout(() => Sound.sfx(r.tier === 'legendaria' || r.tier === 'epica' ? 'reveal' : 'click'), i * 180);
    });
    setTimeout(() => { $('ok').hidden = false; }, res.length * 180 + 300);
    $('ok').onclick = done;
  }

  /* ---------- Máquina de gachapón ---------- */
  const MACHINE_COLORS = { 1: ['#e8c21a', '#1f4fc0'], 2: ['#2a5fd0', '#e8e8f0'], 3: ['#5a1a8a', '#e01a4a'], 4: ['#b8742a', '#f2e6c0'], [HW_BANNER]: ['#ff7a1a', '#6a2aa8'] };
  const CAP_COLORS = { comun: '#b8bcc8', rara: '#3f8fff', epica: '#a24cff', legendaria: '#ffcc22' };
  function drawMachine(cv, st) {
    const g = cv.getContext('2d'), [c1, c2] = st.colors;
    g.imageSmoothingEnabled = false; g.clearRect(0, 0, 96, 128);
    const ring = (x, y, r, fill, line) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); if (fill) { g.fillStyle = fill; g.fill(); } if (line) { g.strokeStyle = line; g.lineWidth = 2; g.stroke(); } };
    // cúpula con cápsulas dentro
    ring(48, 40, 34, 'rgba(190,225,255,.25)', '#10183a');
    g.save(); g.beginPath(); g.arc(48, 40, 32, 0, Math.PI * 2); g.clip();
    st.balls.forEach(b => {
      const y = b.y + (st.shake ? Math.sin(st.t / 30 + b.x) * 1.5 : 0);
      g.beginPath(); g.arc(b.x, y, 6, Math.PI, 0); g.fillStyle = b.c; g.fill();
      g.beginPath(); g.arc(b.x, y, 6, 0, Math.PI); g.fillStyle = '#f4f4f4'; g.fill();
      g.strokeStyle = '#10183a'; g.lineWidth = 1; g.beginPath(); g.arc(b.x, y, 6, 0, Math.PI * 2); g.stroke();
    });
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 2; g.beginPath(); g.arc(48, 40, 27, Math.PI * 1.1, Math.PI * 1.45); g.stroke();
    // cuerpo
    g.fillStyle = '#10183a'; g.fillRect(12, 66, 72, 58);
    g.fillStyle = c1; g.fillRect(14, 68, 68, 54);
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(70, 68, 12, 54);
    g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(14, 68, 4, 54);
    g.fillStyle = c2; g.fillRect(14, 72, 68, 6);
    g.fillStyle = '#10183a'; g.fillRect(10, 64, 76, 4);
    if (st.crest && st.crest.complete) g.drawImage(st.crest, 22, 82, 24, 24);
    // ranura de salida
    g.fillStyle = '#10183a'; g.fillRect(30, 108, 24, 12); g.fillStyle = '#2a2a3a'; g.fillRect(32, 110, 20, 8);
    g.fillStyle = c2; g.fillRect(32, 110, 20, 3);
    // manivela
    ring(66, 94, 9, '#9aa4b8', '#10183a'); ring(66, 94, 4, '#5a6478');
    const hx = 66 + Math.cos(st.crank) * 9, hy = 94 + Math.sin(st.crank) * 9;
    g.strokeStyle = '#10183a'; g.lineWidth = 4; g.beginPath(); g.moveTo(66, 94); g.lineTo(hx, hy); g.stroke();
    g.strokeStyle = '#d8dce6'; g.lineWidth = 2; g.beginPath(); g.moveTo(66, 94); g.lineTo(hx, hy); g.stroke();
    ring(hx, hy, 4, c2, '#10183a');
    // pie
    g.fillStyle = '#10183a'; g.fillRect(16, 122, 64, 6);
  }
  function renderMachine(res, bannerId, done, title) {
    const B = BANNERS.find(b => b.id === bannerId) || (bannerId === HW_BANNER ? { name: TX('Sobre Calabaza'), crest: 3 } : BANNERS[0]);
    screen(`<h2>${esc(title || B.name)}</h2>
      <div class="gmach"><canvas id="mc" width="96" height="128"></canvas><div class="gm-hint" id="mHint">${Controls.pc() ? TX('Arrastra la manivela en círculo (o pulsa Espacio)') : TX('Gira la manivela con el dedo ↻')}</div></div>
      <div class="caps" id="caps"></div>
      ${bottom('<div class="grid2"><button class="ghost" id="mSkip">' + TX('Saltar') + '</button><button class="cta" id="mAll" hidden>' + TX('Abrir todas') + '</button></div><button class="cta" id="mOk" hidden>' + TX('Continuar') + '</button>')}`, 'bg_whistle');
    const cv = $('mc'), caps = $('caps');
    const crest = new Image(); crest.src = `ui/crest${B.crest}.png`;
    let seed = bannerId * 97; const rr = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const ballCols = Object.values(CAP_COLORS);
    const balls = Array.from({ length: 22 }, () => { const a = rr() * Math.PI * 2, d = Math.sqrt(rr()) * 26; return { x: 48 + Math.cos(a) * d, y: 40 + Math.abs(Math.sin(a)) * d * 0.9, c: ballCols[Math.floor(rr() * 4)] }; });
    const st = { colors: MACHINE_COLORS[bannerId] || MACHINE_COLORS[1], crest, balls, crank: -Math.PI / 2, shake: false, t: 0 };
    let raf = 0, dispensed = false, alive = true;
    const loop = t => { if (!alive || !cv.isConnected) return; st.t = t; drawMachine(cv, st); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    crest.onload = () => drawMachine(cv, st);
    // Cápsulas: a veces una legendaria llega disfrazada de épica y sube al abrirla
    const items = res.map(r => ({ r, shown: r.tier === 'legendaria' && Math.random() < 0.5 ? 'epica' : r.tier, opened: false }));
    let left = items.length;
    const finish = () => { $('mHint').textContent = TX('¡Ya están todas abiertas!'); $('mAll').hidden = true; $('mSkip').hidden = true; $('mOk').hidden = false; };
    function openCap(it, el) {
      if (it.opened) return Promise.resolve(); it.opened = true;
      return new Promise(res2 => {
        const up = it.shown !== it.r.tier;
        el.classList.add('shake'); Sound.sfx('click');
        setTimeout(() => {
          if (up) { el.classList.remove('t-' + it.shown); el.classList.add('t-' + it.r.tier, 'upgrade'); Sound.sfx('tech'); flash(CAP_COLORS.legendaria); }
          setTimeout(() => {
            el.classList.remove('shake'); el.classList.add('open');
            if (it.r.tier === 'legendaria' || it.r.tier === 'epica') { flash(CAP_COLORS[it.r.tier]); Sound.sfx('reveal'); } else Sound.sfx('pass');
            setTimeout(() => {
              const card = makeCard(it.r); card.classList.add('fromcap'); if (items.length === 1) card.classList.add('solo'); el.replaceWith(card);
              if (--left === 0) finish();
              res2();
            }, 260);
          }, up ? 700 : 0);
        }, up ? 900 : 380);
      });
    }
    function flash(col) { const f = document.createElement('div'); f.className = 'gflash'; f.style.background = col; document.body.appendChild(f); setTimeout(() => f.remove(), 450); }
    function dispense() {
      if (dispensed) return; dispensed = true; st.shake = true;
      $('mHint').textContent = items.length > 1 ? TX('Toca cada cápsula para abrirla') : TX('Toca la cápsula para abrirla');
      items.forEach((it, i) => setTimeout(() => {
        const el = document.createElement('button');
        el.className = 'cap t-' + it.shown + (items.length === 1 ? ' big' : '');
        el.innerHTML = '<i class="ct"></i><i class="cb"></i>';
        el.onclick = () => openCap(it, el);
        caps.appendChild(el); Sound.sfx('pass');
        if (i === items.length - 1) { st.shake = false; if (items.length > 1) $('mAll').hidden = false; }
      }, 250 + i * 140));
    }
    // Manivela: arrastrar en círculo; un toque la hace girar sola
    let drag = null, total = 0, lastTick = 0;
    const center = () => { const b = cv.getBoundingClientRect(); return { x: b.left + 66 / 96 * b.width, y: b.top + 94 / 128 * b.height }; };
    const turn = d => { st.crank += d; total += Math.abs(d); if (total - lastTick > Math.PI / 2) { lastTick = total; Sound.sfx('click'); } if (total >= Math.PI * 2) dispense(); };
    const autoSpin = () => { if (dispensed || autoSpin.on) return; autoSpin.on = true; let k = 0; const iv = setInterval(() => { turn(Math.PI / 10); if (++k >= 20 || dispensed) { clearInterval(iv); dispense(); } }, 35); };
    cv.addEventListener('pointerdown', e => { if (dispensed) return; const c = center(); drag = { a: Math.atan2(e.clientY - c.y, e.clientX - c.x), moved: 0, t: Date.now() }; try { cv.setPointerCapture(e.pointerId); } catch (_) {} });
    cv.addEventListener('pointermove', e => {
      if (!drag || dispensed) return; const c = center(), a = Math.atan2(e.clientY - c.y, e.clientX - c.x);
      let d = a - drag.a; if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
      drag.a = a; drag.moved += Math.abs(d); turn(Math.abs(d));
    });
    cv.addEventListener('pointerup', () => { if (drag && drag.moved < 0.3) autoSpin(); drag = null; });
    const key = e => { if (!cv.isConnected) return removeEventListener('keydown', key); if ((e.code === 'Space' || e.code === 'Enter') && !dispensed) { e.preventDefault(); autoSpin(); } };
    addEventListener('keydown', key);
    $('mAll').onclick = async () => { $('mAll').hidden = true; for (const el of [...caps.querySelectorAll('.cap')]) { const it = items[[...caps.children].indexOf(el)]; await openCap(it, el); await new Promise(r => setTimeout(r, 120)); } };
    $('mSkip').onclick = () => { alive = false; cancelAnimationFrame(raf); removeEventListener('keydown', key); renderReveal(res, done, title || TX('¡Nuevos jugadores!')); };
    $('mOk').onclick = () => { alive = false; cancelAnimationFrame(raf); removeEventListener('keydown', key); done(); };
  }

  /* =====================================================================
     EVENTO DE HALLOWEEN (pantalla propia, fuera de los modos)
     ===================================================================== */
  function hwMenuBtn() {
    const H = Halloween.data(), gift = H.daily !== Halloween.today() || Halloween.loginReady(), n = Halloween.pending();
    return `<button class="mode hwmode" id="mHw"><span class="cicon">🎃</span><span class="mt"><b>${TX('Halloween')}${gift || n ? ' <i class="hwdot"></i>' : ''}</b><small>${TX('Sobre Calabaza, partido jefe y retos')} · 🍬 ${H.candy}${gift ? ' · ' + TX('🎁 regalo') : ''}</small></span></button>`;
  }
  // Calabazas y niebla suave
  function hwDecor() {
    const sc = $('screen'); sc.classList.add('hwtheme');
    sc.insertAdjacentHTML('afterbegin', `<div class="hwfx" aria-hidden="true"><i class="fog f1"></i><i class="fog f2"></i><i class="fog f3"></i>
      <span class="pk p1">🎃</span><span class="pk p2">🎃</span></div>`);
  }
  function renderHalloween() {
    if (!Halloween.active()) return renderMenu();
    const gift = Halloween.daily(), H = Halloween.data(), d = Halloween.daysLeft();
    const legs = HW_LEGENDS.map(L => PLAYER(L.id)).filter(Boolean);
    const retos = Halloween.RETOS.map(R => {
      const st = Halloween.retoState(R), v = Math.min(R.goal, R.val(H));
      return `<div class="hwreto ${st}"><div><b>${R.name}</b><small>${R.desc} · ${v}/${R.goal}</small><small>${TX('Premio:')} ${R.reward.candy} 🍬 · ${R.reward.tickets} 🎟️</small></div>
        ${st === 'got' ? '<span class="hwok">✓</span>' : `<button class="cta" data-reto="${R.id}" ${st === 'ready' ? '' : 'disabled'}>${TX('Recoger')}</button>`}</div>`;
    }).join('');
    const daily = Halloween.DAILY.map(R => {
      const st = Halloween.dailyState(R), v = Math.min(R.goal, R.val(Halloween.dayData()));
      return `<div class="hwreto ${st}"><div><b>${R.name}</b><small>${R.desc} · ${v}/${R.goal}</small><small>${TX('Premio:')} ${R.reward.candy} 🍬 · ${R.reward.tickets} 🎟️</small></div>
        ${st === 'got' ? '<span class="hwok">✓</span>' : `<button class="cta" data-daily="${R.id}" ${st === 'ready' ? '' : 'disabled'}>${TX('Recoger')}</button>`}</div>`;
    }).join('');
    screen(`${top('🎃 ' + TX('Halloween'))}
      <div class="runbar hwbar"><span>🍬 ${H.candy}</span><span>🎟️ ${Profile.data.tickets}</span><span>${d <= 1 ? TX('¡Último día!') : TX('Quedan') + ' ' + d + ' ' + TX('días')}</span></div>
      <h3>${TX('Premios por entrar')} <small>${TX('5 días del evento (no hace falta que sean seguidos)')}</small></h3>
      <div class="hwlogin">${Halloween.LOGIN.map((R, i) => { const L = Halloween.login(), st = i < L.n ? 'got' : i === L.n && Halloween.loginReady() ? 'ready' : 'locked';
        return `<div class="hwday ${st}"><small>${TX('Día {0}', i + 1)}</small><span>${st === 'got' ? '✓' : R.icon}</span><small>${esc(R.label)}</small></div>`; }).join('')}</div>
      ${Halloween.loginReady() ? `<button class="cta" id="hwLogin">${TX('🎁 Recoger el premio del día {0}', Halloween.login().n + 1)}</button>` : Halloween.login().n < Halloween.LOGIN.length ? `<p class="note">${TX('Vuelve mañana a por el siguiente premio.')}</p>` : ''}
      <h3>${TX('Sobre Calabaza')}</h3>
      <div class="hwlegs" id="hwLegs"></div>
      <p class="note">${TX('Solo jugadores villanos y de miedo, y 6 legendarios exclusivos de Halloween.')}<br>
        ${TX('Legendario 3 % · Épica 15 % · Rara 32 % · Común 50 %. Legendario asegurado a las')} ${HW_PITY} ${TX('tiradas (llevas')} ${H.pity}${TX(').')}</p>
      <div class="grid2"><button class="cta" id="hw1" ${H.candy < HW_PRICE ? 'disabled' : ''}>${TX('Tirar ×1')}<small>${HW_PRICE} 🍬</small></button><button class="cta" id="hw10" ${H.candy < HW_PRICE * 10 ? 'disabled' : ''}>${TX('Tirar ×10')}<small>${HW_PRICE * 10} 🍬</small></button></div>
      <h3>${TX('Partido jefe')}</h3>
      <button class="mode hwmode" id="hwBoss">${Sprites.crest(3)}<span class="mt"><b>${TX('Instituto Ocultismo')}</b><small>${TX('Versión jefe · campo nocturno con niebla')}<br>${Halloween.bossDone() ? TX('Premio de hoy ya cobrado (puedes repetir)') : TX('Gánale: +60 🍬 (una vez al día)')}</small></span></button>
      <h3>${TX('Retos del día')} <small>${TX('se renuevan cada medianoche')}</small></h3>
      <div class="hwretos">${daily}</div>
      <h3>${TX('Retos del evento')}</h3>
      <div class="hwretos">${retos}</div>
      <p class="note">${Halloween.rayUnlocked() ? '<b>' + TX('✓ Ray Dark ya es mánager en el Modo Carrera (+10 % de ingresos).') + '</b>' : TX('Completa los 3 retos y') + ' <b>' + TX('Ray Dark') + '</b> ' + TX('se podrá elegir como mánager en el Modo Carrera, con') + ' <b>' + TX('+10 % de ingresos') + '</b>.'}</p>
      <p class="note">${TX('Caramelos: +5 por partido en cualquier modo (+10 más si ganas), +20 de regalo cada día, +60 al ganar al Ocultismo jefe, los retos del día y los del evento. El evento dura hasta el 3 de noviembre; los jugadores que consigas son tuyos para siempre.')}</p>`, 'bg_title');
    hwDecor();
    legs.forEach(p => { const w = document.createElement('div'); w.className = 'hwleg' + (Profile.data.coll[p.id] ? ' own' : ''); w.appendChild(face(Sprites.refOf(p), 48)); w.insertAdjacentHTML('beforeend', `<small>${esc(p.full.replace(/ \(Halloween\)$/, ''))}</small>`); $('hwLegs').appendChild(w); });
    const go = n => { const res = Halloween.pull(n); if (!res) return UI.toast(TX('No tienes caramelos suficientes')); renderMachine(res, HW_BANNER, renderHalloween, TX('Sobre Calabaza')); };
    $('hw1').onclick = () => go(1); $('hw10').onclick = () => go(10);
    $('hwBoss').onclick = startBoss;
    if ($('hwLogin')) $('hwLogin').onclick = () => {
      const R = Halloween.LOGIN[Halloween.login().n];
      if (R.pick) return renderHwPick();
      const out = Halloween.claimLogin(); if (!out) return;
      Sound.sfx('reveal');
      if (out.players.length) return renderReveal(out.players, renderHalloween, TX('¡Premio del día {0}!', out.day));
      UI.toast(TX('Día {0}:', out.day) + ' ' + R.label, 2400); renderHalloween();
    };
    body.querySelectorAll('[data-daily]').forEach(b => b.onclick = () => {
      const r = Halloween.claimDaily(b.dataset.daily); if (!r) return;
      Sound.sfx('reveal'); renderHalloween(); UI.toast('+' + r.candy + ' 🍬 · +' + r.tickets + ' 🎟️', 2600);
    });
    body.querySelectorAll('[data-reto]').forEach(b => b.onclick = () => {
      const r = Halloween.claim(b.dataset.reto); if (!r) return;
      Sound.sfx('reveal'); renderHalloween();
      UI.toast(r.ray ? TX('¡Ray Dark desbloqueado como mánager!') : '+' + r.reward.candy + ' 🍬 · +' + r.reward.tickets + ' 🎟️', 3200);
    });
    $('back').onclick = renderMenu;
    if (gift) setTimeout(() => UI.toast(TX('🎁 Regalo diario:') + ' +' + gift + ' 🍬', 2400), 300);
    Sound.music('menu');
  }
  // Día 4: eliges 1 de 3 jugadores de +80 (las 3 opciones no cambian aunque salgas)
  function renderHwPick() {
    const ids = Halloween.pickOptions();
    screen(`${top('🎃 ' + TX('Elige a tu jugador'), 'back', TX('Volver'))}
      <p class="note">${TX('Premio del día 4: quédate con uno de estos tres jugadores de media 80 o más.')}</p>
      <div class="hwpick" id="hwPick"></div>`, 'bg_title');
    hwDecor();
    ids.forEach(id => {
      const pd = PLAYER(id), b = document.createElement('button'); b.className = 'hwpk';
      b.appendChild(face(Sprites.refOf(pd), 72));
      b.insertAdjacentHTML('beforeend', `<b>${esc(pd.name)}</b><small>${rchip(pd.rarity)} ${RAB(pd.role)} ${chip(pd.elem)}</small><small>${TX('media')} ${Math.round(Halloween.avgOf(pd))}${Profile.data.coll[id] ? ' · ' + TX('ya lo tienes (+1 ★)') : ''}</small>`);
      b.onclick = () => { const out = Halloween.claimLogin(id); if (!out) return; Sound.sfx('reveal'); renderReveal(out.players, renderHalloween, TX('¡Premio del día {0}!', out.day)); };
      $('hwPick').appendChild(b);
    });
    $('back').onclick = renderHalloween;
  }
  function startBoss() {
    const T = savedTeam(), F = FORMATIONS[T.formation], pos = layout(F.roles), L = T.ids;
    if (L.some(x => x == null)) return UI.toast(TX('Completa tu equipo en Plantilla'));
    api.mode = 'hwboss';
    const A = { name: TX('Tu equipo'), players: L.map((id, i) => {
      const pd = PLAYER(id);
      return Object.assign(buildMatchPlayer(id, F.roles[i], k => statOf(id, Profile.owned(id), k), runMember(id).techs, [], i, pos[i]), { sprite: mySprite(pd, F.roles[i]) });
    }) };
    startMatch({ A, B: Halloween.bossTeam() }, false, 'niebla', 'match', 'Occult');
  }
  function renderBossEnd(s, candy, bonus) {
    const a = s.score.A, b = s.score.B;
    screen(`<img class="finimg" src="ui/fin.png" alt="${TX('Fin del partido')}"><h2>${a > b ? TX('¡Has vencido al Ocultismo!') : a < b ? TX('El Ocultismo te ha asustado…') : TX('Empate')}</h2>
      ${scoreLine(s)}
      <p class="note">${candy ? '+' + candy + ' 🍬 ' + TX('por jugar') : ''}${bonus ? '<br><b>+' + bonus + ' 🍬 ' + TX('¡premio del jefe!') + '</b>' : a > b ? '<br>' + TX('El premio del jefe ya lo cobraste hoy.') : ''}</p>
      <button class="cta" id="again">${TX('Volver a Halloween')}</button><button class="ghost" id="toMenu">${TX('Menú')}</button>`, a > b ? 'ill27' : a < b ? 'ill15' : 'ill28');
    $('again').onclick = renderHalloween; $('toMenu').onclick = renderMenu;
  }

  /* ---------- Plantilla, entrenamiento y Rayos ---------- */
  const RORDER = { legendaria: 0, epica: 1, rara: 2, comun: 3 };
  function sortedIds(filter) {
    return Profile.ids().filter(id => !filter || PLAYER(id).role === filter)
      .sort((a, b) => RORDER[PLAYER(a).rarity] - RORDER[PLAYER(b).rarity] || Profile.owned(b).stars - Profile.owned(a).stars || PLAYER(a).name.localeCompare(PLAYER(b).name));
  }
  function miniCard(id, extra = '') {
    const pd = PLAYER(id), o = Profile.owned(id);
    const el = document.createElement('button'); el.className = 'pcard ' + pd.rarity + hwc(pd);
    el.appendChild(face(Sprites.refOf(pd), 56));
    el.insertAdjacentHTML('beforeend', `<div class="pinfo"><div class="pname">${esc(pd.name)}</div>
      <div class="pmeta">${rchip(pd.rarity)} ${ROLE_LABEL[pd.role]} ${chip(pd.elem)} ${o ? stars(o.stars) : ''}</div>${extra}</div>`);
    return el;
  }
  // Ficha pequeña para cuadrículas (plantilla y elegir jugador)
  function tile(id, extra = '') {
    const pd = PLAYER(id), o = Profile.owned(id);
    const el = document.createElement('button'); el.className = 'ptile ' + pd.rarity + hwc(pd);
    el.appendChild(face(Sprites.refOf(pd), 64));
    el.insertAdjacentHTML('beforeend', `<span class="tn">${esc(pd.name)}</span><span class="tm">${rchip(pd.rarity)}<i>${RAB(pd.role)}</i></span>${o ? stars(o.stars) : ''}${extra}`);
    return el;
  }
  let teamFilter = '', teamSort = 'rareza', teamTab = 'equipo';
  // Buscador y filtros de jugadores (plantilla y elegir jugador)
  const PF = { q: '', rar: '', elem: '', game: '' };
  const norm = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const gameOf = id => id >= 30000 ? '3' : id >= 20000 ? '2' : '1';
  function pfMatch(id) {
    const p = PLAYER(id);
    if (PF.q) { const q = norm(PF.q.trim()); if (q && !norm(p.name).includes(q) && !norm(p.full).includes(q)) return false; }
    return (!PF.rar || p.rarity === PF.rar) && (!PF.elem || p.elem === PF.elem) && (!PF.game || gameOf(id) === PF.game);
  }
  const pfActive = () => !!(PF.q || PF.rar || PF.elem || PF.game);
  function pfBar() {
    const opt = (v, t, cur) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${t}</option>`;
    return `<div class="pfbar"><div class="pfq"><input id="pfQ" type="search" placeholder="${TX('Buscar por nombre o mote…')}" value="${esc(PF.q)}" autocomplete="off"><button class="ghost" id="pfX" ${pfActive() ? '' : 'hidden'} title="${TX('Quitar filtros')}">✕</button></div>
      <div class="pfsel"><select id="pfR" aria-label="${TX('Rareza')}">${opt('', TX('Rareza'), PF.rar)}${['legendaria', 'epica', 'rara', 'comun'].map(r => opt(r, RARITY[r].label, PF.rar)).join('')}</select>
      <select id="pfE" aria-label="${TX('Elemento')}">${opt('', TX('Elemento'), PF.elem)}${['fuego', 'bosque', 'viento', 'montaña'].map(e => opt(e, ELEM_LABEL[e], PF.elem)).join('')}</select>
      <select id="pfG" aria-label="${TX('Juego')}">${opt('', TX('Juego'), PF.game)}${opt('1', TX('Inazuma 1'), PF.game)}${opt('2', TX('Inazuma 2'), PF.game)}${opt('3', TX('Inazuma 3'), PF.game)}</select></div></div>`;
  }
  // Conecta la barra: al escribir solo se redibuja la lista (no se pierde el foco)
  function pfWire(root, redrawList, redrawAll) {
    const q = root.querySelector('#pfQ'), x = root.querySelector('#pfX');
    q.oninput = () => { PF.q = q.value; x.hidden = !pfActive(); redrawList(); };
    [['#pfR', 'rar'], ['#pfE', 'elem'], ['#pfG', 'game']].forEach(([s, k]) => root.querySelector(s).onchange = e => { PF[k] = e.target.value; redrawAll(); });
    x.onclick = () => { PF.q = PF.rar = PF.elem = PF.game = ''; redrawAll(); };
  }
  const SORTS = { rareza: null, fuerza: (a, b) => sumIE(b) - sumIE(a), nombre: (a, b) => PLAYER(a).name.localeCompare(PLAYER(b).name) };
  const sumIE = id => STAT_KEYS.reduce((t, k) => t + statOf(id, Profile.owned(id), k), 0);

  /* ---------- Mi equipo: pizarra con el campo, puestos y candidatos ---------- */
  const st = (id, k) => statOf(id, Profile.owned(id), k);
  // Nota de un jugador para un puesto (media de lo que importa en ese puesto)
  const ROLE_RATE = {
    POR: id => (st(id, 'defensa') + st(id, 'fisico')) / 2,
    DEF: id => (st(id, 'defensa') * 2 + st(id, 'fisico') + st(id, 'rapidez')) / 4,
    MED: id => (st(id, 'control') * 2 + st(id, 'tiro') + st(id, 'rapidez')) / 4,
    DEL: id => (st(id, 'tiro') * 2 + st(id, 'rapidez') + st(id, 'control')) / 4,
  };
  const rate = (id, role) => Math.round(ROLE_RATE[role](id) * (playsAs(PLAYER(id), role) ? 1 : 0.85));
  function bestFor(roles, pool) {   // el mejor de cada puesto, porteros primero
    const used = new Set(), out = roles.map(() => null);
    const order = roles.map((r, i) => i).sort((a, b) => (roles[a] === 'POR' ? -1 : 0) - (roles[b] === 'POR' ? -1 : 0));
    for (const i of order) {
      const free = pool.filter(id => !used.has(id)), gks = free.filter(id => playsAs(PLAYER(id), 'POR'));
      const c = (roles[i] === 'POR' && gks.length ? gks : free).sort((a, b) => rate(b, roles[i]) - rate(a, roles[i]))[0];   // la portería, solo para porteros
      if (c != null) { out[i] = c; used.add(c); }
    }
    return out;
  }
  const autoLineup = formation => bestFor(FORMATIONS[formation].roles, Profile.ids());
  function savedTeam() {
    const t = settings.team, owned = new Set(Profile.ids());
    if (t && FORMATIONS[t.formation] && Array.isArray(t.ids) && t.ids.length === 5) {
      const ids = t.ids.map(id => owned.has(id) ? id : null);
      if (ids.some(x => x == null)) {   // huecos (jugador que ya no está): se rellenan solos
        const roles = FORMATIONS[t.formation].roles, rest = Profile.ids().filter(id => !ids.includes(id));
        ids.forEach((id, i) => { if (id == null) { const c = rest.sort((a, b) => rate(b, roles[i]) - rate(a, roles[i])).shift(); ids[i] = c ?? null; } });
      }
      return { formation: t.formation, ids };
    }
    return { formation: settings.formation, ids: autoLineup(settings.formation) };
  }
  function saveTeam(t) { settings.team = { formation: t.formation, ids: t.ids.slice() }; settings.formation = t.formation; saveSettings(); }
  const firstName = n => n.split(' ')[0];

  // Campo con los 5 puestos. items[i] = { ref, name, rarity, badge } o null
  function pitch(roles, items, sel, onSlot) {
    const pos = layout(roles), el = document.createElement('div');
    el.className = 'pitch';
    el.innerHTML = '<i class="pl-mid"></i><i class="pl-circle"></i><i class="pl-box"></i><i class="pl-small"></i>';
    roles.forEach((r, i) => {
      const it = items[i], b = document.createElement('button');
      b.className = 'pslot' + (i === sel ? ' sel' : '') + (it ? ' ' + (it.rarity || '') + hwc(it) : ' empty');
      b.style.left = (50 + pos[i].home[0] / 17 * 44) + '%';
      b.style.top = (85 - pos[i].home[1] / 31 * 71) + '%';
      const fc = document.createElement('span'); fc.className = 'pf';
      if (it) fc.appendChild(face(it.ref, 46)); else fc.textContent = '+';
      b.appendChild(fc);
      b.insertAdjacentHTML('beforeend', `<span class="pr">${RAB(r)}${it && it.badge != null ? ' · ' + it.badge : ''}</span><span class="pn">${it ? esc(firstName(it.name)) : TX('Elegir')}</span>${it && it.elem ? `<span class="pe">${chip(it.elem)}</span>` : ''}`);
      b.onclick = () => onSlot(i);
      el.appendChild(b);
    });
    return el;
  }
  // Editor completo: formación, campo y lista de candidatos para el puesto marcado
  function teamEditor(box, t, onChange) {
    const roles = FORMATIONS[t.formation].roles;
    if (t.sel == null || t.sel > 4) t.sel = Math.max(0, t.ids.findIndex(x => x == null));
    t.show = t.show || 'pos';
    const role = roles[t.sel];
    const avg = t.ids.every(x => x != null) ? Math.round(t.ids.reduce((a, id, i) => a + rate(id, roles[i]), 0) / 5) : null;
    box.innerHTML = `${formSelect(t)}
      <div class="edbar"><button class="ghost" id="edAuto">${TX('⚡ Mejor equipo')}</button><span class="note">${avg != null ? TX('Media del equipo:') + ' <b>' + avg + '</b>' : TX('Faltan jugadores')}</span></div>
      <div id="edPitch"></div>
      <h3>${TX('Puesto:')} ${ROLE_LABEL[role]} <small>${TX('toca un jugador para ponerlo; toca otro puesto del campo para cambiarlo')}</small></h3>
      ${pfBar()}<div class="opts small" id="edShow"><button data-v="pos" aria-pressed="${t.show === 'pos'}">${TX('De')} ${ROLE_LABEL[role].toLowerCase()}</button><button data-v="all" aria-pressed="${t.show === 'all'}">${TX('Todos')}</button></div>
      <div class="pgrid" id="edList"></div>`;
    const redraw = () => { onChange && onChange(); teamEditor(box, t, onChange); };
    box.querySelector('#edPitch').appendChild(pitch(roles, t.ids.map((id, i) => id == null ? null :
      { ref: Sprites.refOf(PLAYER(id)), name: PLAYER(id).name, rarity: PLAYER(id).rarity, halloween: PLAYER(id).halloween, inf: PLAYER(id).inf, elem: PLAYER(id).elem, badge: rate(id, roles[i]) }), t.sel, i => { t.sel = i; Sound.sfx('click'); teamEditor(box, t, onChange); }));
    box.querySelector('#formSel').onchange = e => {   // al cambiar de formación se recolocan los mismos 5
      t.formation = e.target.value; const keep = t.ids.filter(x => x != null);
      t.ids = bestFor(FORMATIONS[t.formation].roles, keep.length === 5 ? keep : Profile.ids()); t.sel = 0; redraw();
    };
    box.querySelector('#edAuto').onclick = () => { t.ids = autoLineup(t.formation); Sound.sfx('reveal'); redraw(); };
    box.querySelectorAll('#edShow button').forEach(b => b.onclick = () => { t.show = b.dataset.v; teamEditor(box, t, onChange); });
    let pool = Profile.ids();
    if (t.show === 'pos' || role === 'POR') pool = pool.filter(id => playsAs(PLAYER(id), role));   // a portería solo van porteros
    pool.sort((a, b) => rate(b, role) - rate(a, role));
    const list = box.querySelector('#edList');
    const drawList = () => {
    const ids = pool.filter(pfMatch); list.innerHTML = '';
    if (!ids.length) list.innerHTML = pool.length ? '<p class="note">' + TX('Ningún jugador coincide con la búsqueda.') + '</p>' : '<p class="note">' + TX('No tienes jugadores de este puesto. Toca «Todos».') + '</p>';
    ids.forEach(id => {
      const at = t.ids.indexOf(id);
      const c = tile(id, `<span class="slot">${at >= 0 ? TX('En el equipo · ') + RAB(roles[at]) : TX('Nota ') + rate(id, role)} ${chip(PLAYER(id).elem)}</span>`);
      if (at >= 0) c.classList.add('sel');
      c.onclick = () => {
        if (at >= 0 && roles[at] === 'POR' && t.ids[t.sel] != null && !playsAs(PLAYER(t.ids[t.sel]), 'POR')) return UI.toast(TX('Así la portería se quedaría sin portero'));
        if (at >= 0) t.ids[at] = t.ids[t.sel];   // si ya juega, se cambian de puesto
        t.ids[t.sel] = id; Sound.sfx('click');
        const empty = t.ids.findIndex(x => x == null); if (empty >= 0) t.sel = empty;
        redraw();
        box.querySelector('#edPitch').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      };
      list.appendChild(c);
    });
    };
    pfWire(box, drawList, () => teamEditor(box, t, onChange)); drawList();
  }

  function renderTeam() {
    const myTechs = Object.keys(Profile.data.techs).map(Number).filter(t => TECH(t));
    const tabs = `<div class="opts" id="tt"><button data-t="equipo" aria-pressed="${teamTab === 'equipo'}">${TX('Mi equipo')}</button><button data-t="jug" aria-pressed="${teamTab === 'jug'}">${TX('Jugadores (')}${Profile.ids().length})</button><button data-t="tec" aria-pressed="${teamTab === 'tec'}">${TX('Técnicas (')}${myTechs.length})</button></div>`;
    if (teamTab === 'tec') {
      screen(`${top(TX('Plantilla'))}${tabs}<p class="note">${TX('Técnicas legendarias que has sacado en el gacha. Las puede equipar cualquier jugador de su elemento desde su ficha.')}</p><div class="cards" id="tk"></div>`);
      if (!myTechs.length) $('tk').innerHTML = '<p class="note">' + TX('Aún no tienes ninguna. Salen en el tramo legendario del gacha.') + '</p>';
      myTechs.forEach(tid => {
        const t = TECH(tid), who = Profile.ids().filter(id => Profile.learnable(id).gacha.includes(tid));
        const c = document.createElement('div'); c.className = 'pcard techrow ' + EL(t.elem).css;
        c.innerHTML = `<div class="scroll small">${TYPE_ICON[t.type] || '★'}</div><div class="pinfo">${techLine(t)}<div class="pmeta">${who.length ? who.length + TX(' de tus jugadores pueden equiparla') : TX('Ninguno de tus jugadores es de ') + (ELEM_LABEL[t.elem] || t.elem)}</div></div>`;
        $('tk').appendChild(c);
      });
    } else if (teamTab === 'equipo') {
      screen(`${top(TX('Plantilla'))}${tabs}<p class="note">${TX('Este es el equipo que sale en el partido rápido y al empezar cualquier modo. Se guarda solo.')}</p>
        <h3>${TX('Equipación')} <small>${TX('la llevan tus jugadores de campo en todos los modos (menos en la Carrera)')}</small></h3><div id="kitEd"></div><div id="ed"></div>`);
      if (!api.myTeam) api.myTeam = savedTeam();
      const drawKits = () => {
        const k = myKit(), sw = (key, v) => `<div class="swatches">${KIT_COLORS.map(col => `<button class="sw" data-k="${key}" data-c="${col}" style="background:${col}" aria-pressed="${v === col}"></button>`).join('')}</div>`;
        const who = PLAYER((api.myTeam.ids || []).find(id => id != null && PLAYER(id).role !== 'POR') || 10);
        $('kitEd').innerHTML = `<div class="clubpv"><span id="kitPv"></span><div><b>${k ? TX('Tu equipación') : TX('Equipación del Raimon')}</b><small>${k ? '' : TX('Elige colores para crear la tuya')}</small></div></div>
          <p class="note">${TX('Camiseta')}</p>${sw('a', k && k.a)}<p class="note">${TX('Mangas y pantalón')}</p>${sw('b', k && k.b)}
          <p class="note">${TX('Diseño')}</p><div class="opts kitdz">${KIT_DESIGNS.map(([d, n]) => `<button data-dz="${d}" aria-pressed="${!!k && (k.d || '') === d}">${n}</button>`).join('')}</div>
          ${k ? `<button class="ghost mini" id="kitReset">${TX('Volver a la del Raimon')}</button>` : ''}`;
        $('kitPv').appendChild(k ? Sprites.kitPreview(Sprites.refOf(who), k, 2) : Sprites.portrait(Sprites.refOf(who), 2));
        const set = ch => { Profile.data.kit = Object.assign({ a: '#e8c21a', b: '#1f4fc0', d: '' }, myKit() || {}, ch); Profile.save(); Sound.sfx('click'); drawKits(); };
        $('kitEd').querySelectorAll('.sw').forEach(b => b.onclick = () => set({ [b.dataset.k]: b.dataset.c }));
        $('kitEd').querySelectorAll('[data-dz]').forEach(b => b.onclick = () => set({ d: b.dataset.dz }));
        if ($('kitReset')) $('kitReset').onclick = () => { Profile.data.kit = null; Profile.save(); Sound.sfx('click'); drawKits(); };
      };
      drawKits();
      teamEditor($('ed'), api.myTeam, () => saveTeam(api.myTeam));
    } else {
      const all = sortedIds(teamFilter); if (SORTS[teamSort]) all.sort(SORTS[teamSort]);
      screen(`${top(TX('Plantilla'))}${tabs}${wallet()}${pfBar()}
        <div class="opts" id="tf">${[['', TX('Todos')], ...ROLES4.map(r => [r, RAB(r)])].map(([v, t]) => `<button data-f="${v}" aria-pressed="${teamFilter === v}">${t}</button>`).join('')}</div>
        <div class="sortrow"><span id="tcount"></span><span class="opts small" id="ts">${Object.keys(SORTS).map(k => `<button data-s="${k}" aria-pressed="${teamSort === k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</span></div>
        <div class="pgrid" id="tl"></div>`);
      body.querySelectorAll('#tf button').forEach(b => b.onclick = () => { teamFilter = b.dataset.f; renderTeam(); });
      body.querySelectorAll('#ts button').forEach(b => b.onclick = () => { teamSort = b.dataset.s; renderTeam(); });
      const drawList = () => {
        const ids = all.filter(pfMatch), tl = $('tl'); tl.innerHTML = '';
        $('tcount').textContent = (pfActive() ? ids.length + TX(' de ') + all.length : ids.length) + TX(' jugadores · toca uno para entrenarlo');
        if (!ids.length) tl.innerHTML = '<p class="note">' + TX('Ningún jugador coincide. Prueba con otro nombre o quita filtros (✕).') + '</p>';
        ids.forEach(id => { const pd = PLAYER(id), c = tile(id, `<span class="slot">${TX('Nota ')}${rate(id, pd.role)} ${chip(pd.elem)}</span>`); c.onclick = () => renderPlayer(id); tl.appendChild(c); });
      };
      pfWire(body, drawList, renderTeam); drawList();
    }
    body.querySelectorAll('#tt button').forEach(b => b.onclick = () => { teamTab = b.dataset.t; renderTeam(); });
    tutorial('team'); if (!$('tutq-team')) body.insertAdjacentHTML('beforeend', `<p class="note" id="tutq-team">${tutBtn('team')}</p>`);
    $('back').onclick = renderMenu;
  }
  function renderPlayer(id) {
    const pd = PLAYER(id), o = Profile.owned(id), P = Profile.data;
    screen(`${top(esc(pd.name))}<div class="phead" id="ph"></div>${wallet()}
      <button class="cta" id="rayo" ${P.rayos < 1 || o.stars >= MAX_STARS ? 'disabled' : ''}>${TX('⚡ Usar Rayo Raimon')}<small>${o.stars >= MAX_STARS ? TX('Ya tiene 5 estrellas') : TX('+1 estrella sin necesitar repetidos (tienes ') + P.rayos + ')'}</small></button>
      <h3>${TX('Entrenar')} <small>${TX('+3 por mejora; el límite sube con las estrellas')}</small></h3><div class="ups" id="ups"></div>
      <h3>${TX('Técnicas equipadas')} <small>${TX('las')} ${TECH_SLOTS} ${TX('con las que empieza cada partida · toca un hueco y elige')}</small></h3>
      <div class="eqslots" id="eqs"></div>
      <h3>${TX('Puede aprender')}</h3><div class="eqlist" id="eql"></div>
      <p class="note">${TX('Puede equipar sus propias técnicas y las técnicas legendarias del gacha de su elemento (')}${ELEM_LABEL[pd.elem] || pd.elem}).</p>`);
    const eq = Profile.equipOf(id), L = Profile.learnable(id);
    api.eqSlot = Math.min(api.eqSlot || 0, TECH_SLOTS - 1);
    for (let k = 0; k < TECH_SLOTS; k++) {
      const t = eq[k] != null ? TECH(eq[k]) : null, b = document.createElement('button');
      b.className = 'eqslot' + (k === api.eqSlot ? ' sel' : '');
      b.innerHTML = `<i>${TX('Hueco')} ${k + 1}</i>${t ? techLine(t) : '<span class="tline">' + TX('Vacío') + '</span>'}`;
      b.onclick = () => { api.eqSlot = k; renderPlayer(id); };
      $('eqs').appendChild(b);
    }
    const addOpt = (tid, src) => {
      const t = TECH(tid), on = eq.includes(tid), b = document.createElement('button');
      b.className = 'eqopt' + (on ? ' on' : '') + (src === 'gacha' ? ' leg' : '');
      b.innerHTML = `${techLine(t)}<i>${on ? TX('Equipada') : src === 'gacha' ? TX('Del gacha') : TX('Suya')}${EVO(tid) != null ? TX(' · evoluciona a ') + esc(TECH(EVO(tid)).name) : ''}</i>`;
      b.onclick = () => { Profile.setEquip(id, api.eqSlot, tid); Sound.sfx('click'); api.eqSlot = (api.eqSlot + 1) % TECH_SLOTS; renderPlayer(id); };
      $('eql').appendChild(b);
    };
    L.gacha.forEach(t => addOpt(t, 'gacha')); L.own.forEach(t => addOpt(t, 'own'));
    if (!L.own.length && !L.gacha.length) $('eql').innerHTML = '<p class="note">' + TX('No tiene técnicas que aprender.') + '</p>';
    const ph = $('ph'); ph.appendChild(face(Sprites.refOf(pd), 112));
    ph.insertAdjacentHTML('beforeend', `<div><div class="pname">${esc(pd.name)}</div>${pd.full !== pd.name ? `<div class="pfull">${esc(pd.full)}</div>` : ''}${pd.also ? `<div class="pfull">${TX('También:')} ${pd.also.map(esc).join(' · ')}</div>` : ''}<div class="pmeta">${rchip(pd.rarity)} ${pd.anyRole ? TX('Todos los puestos') : ROLE_LABEL[pd.role]} ${chip(pd.elem)} ${stars(o.stars)}</div></div>`);
    STAT_KEYS.forEach(k => {
      const b = document.createElement('button'), can = Profile.canUpgrade(id, k), cost = Profile.upgradeCost(id, k);
      b.innerHTML = `${STAT_LABEL[k]} <b>${statOf(id, o, k)}</b><small>${can ? '+3 · ' + cost + '🪙' : TX('máx. ') + statCap(id, o, k)}</small>`;
      b.disabled = !can || P.coins < cost;
      b.onclick = () => { if (Profile.upgrade(id, k)) { Sound.sfx('click'); renderPlayer(id); } };
      $('ups').appendChild(b);
    });
    $('rayo').onclick = () => { if (Profile.useRayo(id)) { Sound.sfx('reveal'); UI.toast(pd.name + TX(' sube a ') + Profile.owned(id).stars + TX(' estrellas')); renderPlayer(id); } };
    $('back').onclick = () => renderTeam();
  }

  /* ---------- Antes de empezar un modo: tu equipo y la dificultad ---------- */
  function newDraft(kind, o) {
    const t = savedTeam();
    api.draft = { kind, o, formation: t.formation, diff: o.diff || 'medio', ids: t.ids };
    renderDraft();
  }
  const KIND_TITLE = { story: TX('Historia'), special: TX('Equipo especial'), chain: TX('Cadena'), infinite: TX('Infinito') };
  function renderDraft() {
    const d = api.draft;
    const sub = d.kind === 'special' ? esc(d.o.team) : d.kind === 'chain' ? esc(CHAINS.find(c => c.key === d.o.chain).name) : '';
    screen(`${top(KIND_TITLE[d.kind] + (d.kind === 'story' ? ' · ' + STAGE_NAME[d.o.stage || 's1'] : '') + (sub ? ' · ' + sub : ''))}
      ${d.kind === 'story' ? opts(TX('Dificultad'), 'diff', [['facil', TX('Fácil')], ['medio', TX('Medio')], ['dificil', TX('Difícil')]], d) +
        '<p class="note">' + TX('Fácil: 5 partidos y 3 vidas · Medio: 6 y 2 · Difícil: 7 y 1.') + '</p>' : ''}
      ${d.kind === 'infinite' ? '<p class="note">' + TX('Rivales cada vez más fuertes y 2 vidas. Cada 5 partidos, una oleada especial con premio extra.') + '</p>' : ''}
      <div id="ed"></div>
      <p class="note">${TX('Las técnicas, habilidades y fichajes se pierden al acabar; monedas, tickets y Rayos se quedan.')}</p>
      ${bottom(`<button class="cta" id="go">${TX('Empezar')}</button>`)}`);
    bindOpts(d);
    const go = $('go'), sync = () => { go.disabled = d.ids.some(x => x == null); saveTeam(d); api.myTeam = null; };
    teamEditor($('ed'), d, sync); sync();
    go.onclick = () => {
      if (d.ids.some(x => x == null)) return;
      api.run = Run.create(d.kind, d.ids, Object.assign({}, d.o, { diff: d.diff, formation: d.formation }));
      Run.save(api.run); api.pick = null; openRun();
    };
    $('back').onclick = renderMenu;
  }

  /* ---------- Partidos ---------- */
  async function startMatch(teams, golden, field, musicRole, rival) {
    GAME_SPEED = settings.dev && settings.speed ? +settings.speed : 0.75;
    const hasPad = [...(navigator.getGamepads ? navigator.getGamepads() : [])].some(Boolean);
    if (Controls.pc() && !hasPad && (settings.padTip || 0) < 3) { settings.padTip = (settings.padTip || 0) + 1; saveSettings(); setTimeout(() => UI.toast(TX('🎮 También puedes jugar con mando'), 2600), 1800); }
    const s = Object.assign({}, settings, { golden, field, difficulty: api.mode === 'run' ? api.run.diff : api.mode === 'career' || api.mode === 'wc' ? Career.matchDiff() : 'facil' });
    s.mercy = api.mode === 'run' ? 5 : 0;   // roguelite: con 5 goles de diferencia se acaba el partido
    screen('<h2>' + TX('Cargando…') + '</h2>');
    try {
      api.matchSheet = await Sprites.matchSheet([...teams.A.players, ...teams.B.players].map(p => p.sprite));
    } catch (e) { screen(`<h2>${TX('No se pudieron cargar los jugadores')}</h2><p class="note">${esc(e.message)}</p><button class="cta" id="back">${TX('Volver')}</button>`); $('back').onclick = renderMenu; return; }
    api.match = Logic.createMatch(s, teams);
    $('cA').src = api.mode === 'wc' ? 'ui/crest3016.png' : api.mode === 'career' && Career.data ? ClubCrest.url(Career.data.crest, Career.data.school) : 'ui/crest1.png';
    $('nA').textContent = api.mode === 'wc' ? TX('Japón') : api.mode === 'career' && Career.data ? Career.data.school.replace(/^Instituto\s+/i, '') : TX('Tú');
    UI.reset();
    api.scene && api.scene.bind(api.match, api.matchSheet);
    show(null);
    api.running = true;
    Sound.music(musicRole || 'match', rival);
    if (field && field !== 'normal') UI.toast(FIELD_LABEL[field] || '', 1600);
  }
  function startQuick() {
    api.mode = 'quick';
    const T = savedTeam(), F = FORMATIONS[T.formation], pos = layout(F.roles), L = T.ids;
    if (L.some(x => x == null)) return UI.toast(TX('Completa tu equipo en Plantilla'));
    const A = { name: TX('Tu equipo'), players: L.map((id, i) => {
      const pd = PLAYER(id);
      return Object.assign(buildMatchPlayer(id, F.roles[i], k => statOf(id, Profile.owned(id), k), runMember(id).techs, [], i, pos[i]), { sprite: mySprite(pd, F.roles[i]) });
    }) };
    const key = RIVAL_ORDER[Math.floor(Math.random() * RIVAL_ORDER.length)];
    startMatch({ A, B: rivalTeam(key, 0.9, 0.5) }, false, TEAM_FIELD[key], 'match', key);
  }
  api.togglePause = () => {
    if (!api.match || api.match.over || !$('screen').hidden) return;
    if (api.running) {
      api.running = false;
      $('pauseBody').innerHTML = `<h1>${TX('Pausa')}</h1><button class="cta" id="pResume">${TX('Seguir')}</button>
        <div class="group"><label>${TX('Supertécnicas')}</label><div class="opts">${[['boton', TX('Con botón')], ['auto', TX('Automáticas')]].map(([v, t]) => `<button data-v="${v}" aria-pressed="${settings.techMode === v}">${t}</button>`).join('')}</div></div>
        ${settings.dev && settings.devWin ? '<button class="ghost" id="pWin">' + TX('🛠 Ganar ahora (desarrollador)') + '</button>' : ''}
        <button class="ghost" id="pGuide">${TX('🎮 Guía de controles')}</button>
        <button class="ghost" id="pQuit">${api.mode === 'run' || api.mode === 'career' || api.mode === 'wc' ? TX('Rendirse (cuenta como derrota)') : TX('Salir al menú')}</button>`;
      $('pauseBody').querySelectorAll('.opts button').forEach(b => b.addEventListener('click', () => {
        settings.techMode = b.dataset.v; saveSettings(); api.match.settings.techMode = b.dataset.v;
        b.parentNode.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
      }));
      $('pResume').onclick = () => api.togglePause();
      if ($('pWin')) $('pWin').onclick = () => { const m = api.match; m.score.A = m.score.B + 1; m.time = 0.01; m.golden = false; api.togglePause(); };
      $('pGuide').onclick = () => renderControlsGuide(() => show('pause'));
      $('pQuit').onclick = () => {
        api.match.quit = true;   // rendirse no da caramelos
        if (api.mode === 'run') { api.match.over = true; api.match.result = 'loss'; api.matchEnded(api.match); }
        else if (api.mode === 'career' || api.mode === 'wc') { const m = api.match; m.over = true; m.score.A = 0; m.score.B = Math.max(3, m.score.B); m.result = 'loss'; api.matchEnded(m); }
        else { api.match.over = true; Sound.stop(0.3); api.mode === 'hwboss' ? renderHalloween() : renderMenu(); }
      };
      show('pause');
    } else { show(null); api.running = true; }
  };
  api.matchEnded = s => {
    api.running = false;
    setTimeout(() => {
      Sound.stop(0.6);
      setTimeout(() => { try { Cloud.flush(); } catch (_) {} }, 2000);   // al acabar el partido se sube ya lo pendiente a la nube
      // Halloween: caramelos por jugar en cualquier modo (+5, +10 más si ganas)
      const candy = s.quit ? 0 : Halloween.matchPlayed(s.score.A > s.score.B);
      if (candy && api.mode !== 'hwboss') setTimeout(() => UI.toast('+' + candy + ' 🍬 ' + TX('caramelos de Halloween'), 2200), 500);
      if (api.mode === 'hwboss') { const won = s.score.A > s.score.B, bonus = Halloween.bossResult(won); Sound.jingle(won ? 'win' : s.score.A < s.score.B ? 'lose' : null); renderBossEnd(s, candy, bonus); }
      else if (api.mode === 'wc') { const r = Career.wcResult(s.score.A, s.score.B); Sound.jingle(r.gA > r.gB || (r.pens && r.pens[0] > r.pens[1]) ? 'win' : r.gA === r.gB && !r.pens ? null : 'lose'); renderWC(r); }
      else if (api.mode === 'career') {
        const nm = Career.nextMatch();
        const pens = nm && nm.ko && s.score.A === s.score.B ? Career.penalties(Career.myRating(), Career.rating(nm.rival)) : null;
        const out = Career.finishMatch(s.score.A, s.score.B, pens, 0, (s.goalLog || []).filter(g => g.team === 'A' && g.key != null).map(g => g.key));
        jingleFor(out);
        renderCareerJornada(out);
      } else if (api.mode === 'run') {
        Run.applyResult(api.run, s.result === 'win' ? 'win' : 'loss', s.score.A);
        Run.save(api.run);
        Sound.jingle(api.run.last.result === 'win' ? 'win' : 'lose');
        renderResult(s);
      } else {
        let rayo = false;
        if (s.result === 'win') rayo = Profile.addWin();
        Sound.jingle(s.result === 'win' ? 'win' : s.result === 'loss' ? 'lose' : null); renderQuickEnd(s, rayo);
      }
    }, 900);
  };

  /* ---------- Partida en curso ---------- */
  function runHeader() {
    const r = api.run;
    return `<div class="runbar"><span>${esc(r.name)}${r.kind === 'story' ? ' · ' + { facil: TX('Fácil'), medio: TX('Medio'), dificil: TX('Difícil') }[r.diff] : ''}</span>
      <span class="hearts">${'♥'.repeat(r.lives)}<s>${'♥'.repeat(Math.max(0, r.maxLives - r.lives))}</s></span>
      <span>🪙 +${r.coinsEarned}</span><span>🎟️ +${r.ticketsEarned}</span><span>⚡ ${Profile.data.rayos}</span></div>`;
  }
  function memberCard(mi, slot) {
    const r = api.run, m = r.roster[mi], pd = PLAYER(m.id), o = m.temp ? null : Profile.owned(m.id);
    const el = document.createElement('div');
    el.className = 'pcard ' + pd.rarity + hwc(pd) + (api.pick === mi ? ' sel' : '');
    el.appendChild(face(Sprites.refOf(pd), 56));
    el.insertAdjacentHTML('beforeend', `<div class="pinfo"><div class="pname">${esc(pd.name)}${m.temp ? ' <em>' + TX('temporal') + '</em>' : ''}</div>
      <div class="pmeta"><b>${RAB(slot)}</b> · ${ROLE_LABEL[pd.role]} ${chip(pd.elem)} ${o ? stars(o.stars) : ''}</div>
      <div class="ptechs">${m.techs.map(TECH).map(techLine).join('') || '<i>' + TX('Sin técnicas') + '</i>'}</div>
      ${m.passives.length ? `<div class="ppass">${m.passives.map(n => esc(TX(n))).join(' · ')}</div>` : ''}</div>`);
    return el;
  }
  function openRun() {
    const r = api.run;
    if (r.state === 'reward') return renderReward();
    if (r.state === 'over') return renderOver();
    renderMap();
  }
  function renderMap() {
    const r = api.run, rival = Run.rivalName(r), F = FORMATIONS[r.formation];
    const path = r.kind === 'infinite'
      ? `<p class="note">${TX('Oleada')} ${r.index + 1}${Run.isBoss(r) ? ' · <b>' + TX('¡oleada especial!') + '</b>' : ''} ${TX('· récord')} ${Profile.data.infBest}</p>`
      : `<ol class="path">${r.schedule.map((t, i) => `<li class="${i < r.index ? 'done' : i === r.index ? 'now' : ''}">${Sprites.crest(crestOf(t))}<span>${esc(t)}</span></li>`).join('')}</ol>`;
    screen(`${top(r.kind === 'infinite' ? TX('Oleada ') + (r.index + 1) : TX('Partido ') + (r.index + 1) + TX(' de ') + r.schedule.length, 'toMenu', TX('Menú'))}${runHeader()}
      ${path}<div class="vsrow">${Sprites.crest(crestOf(rival))}<div><b>${esc(rival)}</b><span class="note">${FIELD_LABEL[Run.field(r)] || ''}</span><div class="faces" id="rfaces"></div></div></div>
      ${formSelect(r)}
      <h3>${TX('Alineación')} <small>${TX('toca un puesto y luego un suplente (u otro puesto) para cambiarlos')}</small></h3>
      <div id="lineup"></div>
      <h3>${TX('Banquillo')}</h3><div class="pgrid" id="bench"></div>
      <details class="techs"><summary>${TX('Ver técnicas del equipo')}</summary><div class="cards" id="tdet"></div></details>
      ${bottom(`<button class="cta" id="goMatch">${TX('Jugar contra')} ${esc(rival)}</button>`)}`, 'bg_vs');
    const rt = TEAM(rival);
    if (rt) rt.players.forEach(m => $('rfaces').appendChild(face({ file: m.file, row: m.row }, 40)));
    $('formSel').onchange = e => { r.formation = e.target.value; Run.save(r); renderMap(); };
    const sel = api.mapSel;
    const items = r.lineup.slice(0, 5).map(mi => { const pd = PLAYER(r.roster[mi].id); return { ref: Sprites.refOf(pd), name: pd.name, rarity: pd.rarity, halloween: pd.halloween }; });
    $('lineup').appendChild(pitch(F.roles, items, sel, i => {
      if (sel != null && sel !== i) { Run.swapLineup(r, sel, r.lineup[i]); api.mapSel = null; Run.save(r); }
      else api.mapSel = sel === i ? null : i;
      Sound.sfx('click'); renderMap();
    }));
    r.roster.forEach((m, mi) => {
      if (r.lineup.slice(0, 5).includes(mi)) return;
      const pd = PLAYER(m.id), c = document.createElement('button');
      c.className = 'ptile ' + pd.rarity + hwc(pd); c.appendChild(face(Sprites.refOf(pd), 56));
      c.insertAdjacentHTML('beforeend', `<span class="tn">${esc(pd.name)}</span><span class="tm"><i>${RAB(pd.role)}</i>${m.temp ? '<em class="tmp">' + TX('temporal') + '</em>' : ''}</span>`);
      c.onclick = () => {
        if (api.mapSel == null) return UI.toast(TX('Primero toca el puesto del campo'));
        Run.swapLineup(r, api.mapSel, mi); api.mapSel = null; Run.save(r); Sound.sfx('click'); renderMap();
      };
      $('bench').appendChild(c);
    });
    if (!$('bench').children.length) $('bench').innerHTML = '<p class="note">' + TX('Sin suplentes todavía: los fichajes temporales aparecen aquí.') + '</p>';
    r.lineup.slice(0, 5).forEach((mi, si) => $('tdet').appendChild(memberCard(mi, F.roles[si])));
    $('goMatch').onclick = () => { api.mode = 'run'; startMatch(Run.matchTeams(r), true, Run.field(r), Run.musicRole(r), Run.rivalName(r)); };
    $('toMenu').onclick = renderMenu;
    Sound.music('menu');
  }
  function renderResult(s) {
    const r = api.run, L = r.last;
    const gains = [`<li>🪙 +${L.coins} ${TX('monedas')}</li>`];
    if (L.tickets) gains.push(`<li>🎟️ +${L.tickets} ${TX('ticket')}${L.tickets > 1 ? 's' : ''}</li>`);
    if (L.rayo) gains.push('<li>' + TX('⚡ ¡5 victorias más: ganas un Rayo Raimon!') + '</li>');
    if (L.chainRayo) gains.push('<li>' + TX('⚡ Cadena completada: ¡Rayo Raimon!') + '</li>');
    if (L.chainTech != null) gains.push(`<li>${TX('📜 Primera vez: técnica legendaria')} <b>${esc(TECH(L.chainTech).name)}</b></li>`);
    if (L.perfect) gains.push('<li>' + TX('💎 ¡Cadena perfecta sin perder vidas! +5 🎟️') + '</li>');
    if (L.medal) gains.push(`<li>${L.medal === 'oro' ? '🥇' : '🥈'} ${TX('Medalla de')} ${L.medal}${TX(': +15 🎟️ y otro ⚡ Rayo')}</li>`);
    if (L.lifeLost) gains.push(`<li>${TX('♥ −1 vida')}${r.lives > 0 ? TX(' · repites contra el mismo rival') : ''}</li>`);
    screen(`<img class="finimg" src="ui/fin.png" alt="${TX('Fin del partido')}">${runHeader()}<h2>${L.result === 'win' ? TX('¡Victoria!') : TX('Derrota')}</h2>
      ${scoreLine(s)}
      <ul class="gains">${gains.join('')}</ul><div id="excl"></div>
      <button class="cta" id="next">${TX('Continuar')}</button>`, L.result === 'win' ? 'ill27' : 'ill15');
    if (L.exclusive) {
      const x = L.exclusive, pd = PLAYER(x.id), c = miniCard(x.id, `<div class="slot">${x.isNew ? TX('¡Se une a tu plantilla!') : x.star ? TX('Sube a ') + x.star + TX(' estrellas') : '+' + x.coins + ' 🪙'}</div>`);
      $('excl').insertAdjacentHTML('beforeend', '<h3>' + TX('Premio del equipo especial') + '</h3>'); $('excl').appendChild(c);
    }
    // Jefe del Infinito: elige 1 de 3 versiones (si no eliges ahora, queda guardado en 🎁 Código de regalo)
    const vi = L.versionPick != null ? (Profile.data.giftPicks || []).findIndex(g => g.uid === L.versionPick) : -1;
    if (vi >= 0) {
      $('excl').insertAdjacentHTML('beforeend', `<h3>∞ ${TX('Premio del jefe: elige una versión')}</h3><p class="note">${TX('Si no eliges ahora, la tienes en 🎁 Código de regalo.')}</p><div class="hwpick" id="vpick"></div>`);
      Profile.data.giftPicks[vi].opts.forEach(id => {
        const pd = PLAYER(id), b = document.createElement('button'); b.className = 'hwpk infpk';
        b.appendChild(face(Sprites.refOf(pd), 72));
        b.insertAdjacentHTML('beforeend', `<b>${esc(pd.full || pd.name)}</b><small>${rchip(pd.rarity)} ${RAB(pd.role)} ${chip(pd.elem)}</small>${Profile.data.coll[id] ? `<small>${TX('ya lo tienes (+1 ★)')}</small>` : ''}`);
        b.onclick = () => { const i = Profile.data.giftPicks.findIndex(g => g.uid === L.versionPick); const x = i >= 0 && Profile.takePick(i, id); if (!x) return; Sound.sfx('reveal'); renderReveal([x], openRun, TX('¡Nueva versión!')); };
        $('vpick').appendChild(b);
      });
    }
    $('next').onclick = openRun;
  }
  const scoreLine = s => `<div class="result">${Sprites.crest(1)}<span class="sc">${s.score.A}–${s.score.B}<small>${TX('Tu equipo ·')} ${esc(s.teams.B.name)}</small></span>${Sprites.crest(crestOf(s.teams.B.name))}</div>`;
  function renderReward() {
    const r = api.run;
    screen(`${runHeader()}<h2>${TX('Elige una recompensa')}</h2><div id="rw" class="cards"></div>`, 'bg_green');
    r.rewards.forEach(o => {
      const c = document.createElement('button'); c.className = 'rcard';
      const who = o.member != null ? PLAYER(r.roster[o.member].id) : o.id != null ? PLAYER(o.id) : null;
      if (who) c.appendChild(face(Sprites.refOf(who), 64));
      let html = '';
      if (o.kind === 'tech') html = `<div class="rk">${TX('Supertécnica')}${o.rare ? ' <em>' + TX('rara') + '</em>' : ''}</div><div class="pname">${esc(who.name)} ${TX('aprende')}</div>${techLine(TECH(o.tech))}${o.replace != null ? `<div class="pmeta">${TX('Sustituye a')} ${esc(TECH(o.replace).name)} ${TX('(máx.')} ${TECH_SLOTS} ${TX('técnicas)')}</div>` : ''}`;
      if (o.kind === 'evolve') html = `<div class="rk">${TX('Evolución')}</div><div class="pname">${esc(who.name)}</div>${techLine(TECH(o.from))}<span class="evo">↓</span>${techLine(TECH(o.to))}`;
      if (o.kind === 'recruit') html = `<div class="rk">${TX('Fichaje temporal')}</div><div class="pname">${esc(who.name)}</div><div class="pmeta">${ROLE_LABEL[who.role]} ${chip(who.elem)} ${TX('· Tiro')} ${who.ie.tiro} ${TX('· Rapidez')} ${who.ie.rapidez}</div>`;
      if (o.kind === 'passive') html = `<div class="rk">${TX('Habilidad')}</div><div class="pname">${esc(TX(o.name))} ${TX('para')} ${esc(who.name)}</div><div class="pmeta">${esc(PASSIVES[o.name].desc)}</div>`;
      if (o.kind === 'coins') html = `<div class="rk">${TX('Monedas')}</div><div class="pname">+${o.amount} 🪙</div>`;
      c.insertAdjacentHTML('beforeend', `<div>${html}</div>`);
      c.onclick = () => { Run.takeReward(r, o); Run.save(r); Sound.sfx('reveal'); renderMap(); };
      $('rw').appendChild(c);
    });
    $('rw').insertAdjacentHTML('afterend', `<button class="ghost" id="rwSkip">${TX('Saltar (no quiero ninguna)')}</button>`);
    $('rwSkip').onclick = () => { Run.takeReward(r, null); Run.save(r); Sound.sfx('click'); renderMap(); };
  }
  function renderOver() {
    const r = api.run, win = r.last && r.last.victory;
    const what = r.kind === 'infinite' ? `${TX('Has llegado a la oleada')} ${r.index + 1} ${TX('(récord:')} ${Profile.data.infBest}).`
      : `${TX('Victorias:')} ${r.wins}${r.kind !== 'special' ? TX(' de ') + r.schedule.length : ''}.`;
    screen(`${runHeader()}<h2>${win ? (r.kind === 'story' ? TX('¡Etapa completada!') : r.kind === 'chain' ? TX('¡Cadena completada!') : TX('¡Victoria!')) : TX('Fin de la partida')}</h2>
      <p class="note">${what} ${TX('Has ganado')} <b>${r.coinsEarned} ${TX('monedas')}</b> ${TX('y')} <b>${r.ticketsEarned} ${TX('tickets')}</b>${TX(', que se quedan en tu perfil.')}<br>
      ${TX('Las técnicas, habilidades y fichajes temporales se pierden.')}</p>
      ${win && r.kind === 'story' ? (r.stage === 's4' ? '<p class="note"><b>' + TX('Desbloqueado:') + '</b> ' + TX('la cadena «El lado oscuro».') + '</p>' : r.stage === 's3' ? '<p class="note"><b>' + TX('Desbloqueado:') + '</b> ' + TX('la Fase 2 de la Etapa 3: el Mundial.') + '</p>' : r.stage === 's2' ? '<p class="note"><b>' + TX('Desbloqueado:') + '</b> ' + TX('el equipo especial Caos y la Etapa 3.') + '</p>' : '<p class="note"><b>' + TX('Desbloqueado:') + '</b> ' + TX('la Etapa 2, Cadenas, Infinito y nuevos equipos especiales.') + '</p>') : ''}
      <button class="cta" id="toGacha">${TX('Ir al gacha')}</button><button class="ghost" id="toMenu">${TX('Menú')}</button>`, win ? (r.kind === 'story' ? 'ill25' : 'ill27') : 'ill14');
    const end = () => { Run.clear(r.kind); api.run = null; };
    $('toGacha').onclick = () => { end(); renderGacha(); };
    $('toMenu').onclick = () => { end(); renderMenu(); };
  }
  function renderQuickEnd(s, rayo) {
    const a = s.score.A, b = s.score.B;
    screen(`<img class="finimg" src="ui/fin.png" alt="${TX('Fin del partido')}"><h2>${a > b ? TX('¡Victoria!') : a < b ? TX('Derrota') : TX('Empate')}</h2>
      ${scoreLine(s)}
      <p class="note">${TX('El partido rápido no da monedas ni tickets, pero las victorias cuentan para el Rayo Raimon.')}${rayo ? '<br><b>' + TX('⚡ ¡Has ganado un Rayo Raimon!') + '</b>' : ''}</p>
      <button class="cta" id="again">${TX('Otro partido rápido')}</button><button class="ghost" id="toMenu">${TX('Menú')}</button>`, a > b ? 'ill27' : a < b ? 'ill15' : 'ill28');
    $('again').onclick = startQuick; $('toMenu').onclick = renderMenu;
  }

  /* =====================================================================
     MODO CARRERA (pantallas)
     ===================================================================== */
  const myCrestUrl = () => ClubCrest.url(Career.data.crest, Career.data.school);
  const cCrest = key => key === YOU ? `<img class="ccrest" src="${myCrestUrl()}" alt="">` : `<img class="ccrest" src="ui/crest${crestOf(key)}.png" alt="">`;
  const bar = (v, cls) => `<span class="cbar ${cls || ''}"><i style="width:${Math.max(0, Math.min(100, v))}%"></i></span>`;
  const money = n => '💰 ' + (Career.data && Career.data.devMoney && n >= 9999999 ? '∞' : n);
  const WEEK_LABEL = { C: TX('Semana de Copa'), P1: TX('Playoff de ascenso · semifinales'), P2: TX('Playoff de ascenso · final') };
  function renderCareer() {
    const c = Career.data;
    if (!c) return renderCareerNew();
    if (c.over) return renderCareerOver();
    if ((c.pendingYouth || []).length) return renderYouthChoice(renderCareer);
    if (c.wc) return renderWC();
    tutorial('career');
    const nm = Career.nextMatch(), d = Career.myDiv(), mgr = PLAYER(c.manager), wt = Career.weekType();
    const act = (k, A) => `<button class="ghost big act-${k}" data-act="${k}">${A.name}<small>${A.desc}</small></button>`;
    const kindTxt = !nm ? '' : nm.type === 'liga' ? `${TX('Jornada')} ${nm.j + 1}` : nm.type === 'copa' ? `${TX('Copa ·')} ${CUP_ROUND[nm.round]}` : nm.type === 'semi' ? TX('Playoff · semifinal') : TX('Playoff · ¡FINAL!');
    const cupTxt = !c.cup ? TX('La Copa empieza la temporada que viene') : c.cup.winner ? (c.cup.winner === YOU ? TX('¡Campeones de Copa!') : TX('Campeón de Copa: ') + Career.teamName(c.cup.winner)) : c.cup.out ? TX('Eliminados de la Copa: se juega sin ti') : TX('Siguiente ronda: ') + CUP_ROUND[c.cup.round];
    const sponsor = Math.round((8 + c.fame * 0.5) * DIV_SPONSOR[d] * Career.incomeMul());
    screen(`${top(TX('Modo Carrera'))}
      ${c.migrated ? '<p class="note cmsg">' + TX('Tu carrera se ha adaptado a las ligas de 10 equipos: la temporada actual empieza de nuevo (conservas plantilla, fama y dinero).') + '</p>' : ''}
      <div class="chead"><img class="ccrest big" src="${myCrestUrl()}" alt=""><span id="cMgr"></span><div><b>${esc(c.school)}</b><small>${TX('Mánager:')} ${esc(mgr.name)} ${TX('· Temporada')} ${c.season}${c.goal ? TX(' · ★ Campeón de Primera') : ''}</small></div></div>
      <div class="cstats">
        <div><label>${TX('Fama')}</label>${bar(c.fame, c.fame < 15 ? 'bad' : '')}<small>${c.fame}/100${c.fame < 15 ? TX(' · ¡ojo!') : ''}</small></div>
        <div><label>${TX('Forma')}</label>${bar(c.forma, c.forma < 50 ? 'warn' : 'ok')}<small>${c.forma} %</small></div>
        <div><label>${TX('Dinero')}</label><b class="cmoney">${money(c.money)}</b><small>+${sponsor}${TX('/semana')}</small></div>
      </div>
      <p class="cweek">${TX('Semana')} <b>${c.week}</b>/${WEEKS} · ${DIV_NAME[d]} ${TX('División ·')} ${ordTx(Career.myPos())} · 🏆 ${esc(cupTxt)}</p>
      ${nm ? `<div class="cnext">${cCrest(nm.rival)}<div><b>${kindTxt}: ${esc(Career.teamName(nm.rival))}</b><small>${nm.home ? TX('En casa') : TX('Fuera')} ${TX('· tu media')} ${Career.myRating()} ${TX('· rival')} ${Career.rating(nm.rival)}${nm.ko ? TX(' · si hay empate, penaltis') : ''}</small></div></div>`
        : `<div class="cnext free"><span class="cicon">${wt === 'C' ? '🏆' : '📣'}</span><div><b>${WEEK_LABEL[wt] || TX('Semana libre')}</b><small>${wt === 'C' ? esc(cupTxt) : d === 1 ? TX('En Primera no hay playoff: aprovecha para entrenar.') : TX('No juegas el playoff esta temporada: se juega sin ti.')}</small></div></div>`}
      <h3>${TX('Actividad de la semana')} <small>${nm ? TX('después juegas el partido') : TX('y pasa la semana')}</small></h3>
      <div class="grid2">${Object.entries(ACTIVITIES).map(([k, A]) => act(k, A)).join('')}</div>
      <div id="cTrain" hidden><p class="note">${TX('¿Qué entrenáis esta semana? (+')}${2 + c.fac.campo} ${TX('a todo el equipo)')}</p><div class="opts">${STAT_KEYS.map(k => `<button data-st="${k}">${STAT_LABEL[k]}</button>`).join('')}</div></div>
      <div class="grid2 cnav"><button class="ghost" id="cSquad">${TX('👥 Plantilla')}</button><button class="ghost" id="cMarket">${TX('💸 Fichajes')}${(c.scout || []).length ? ' (' + c.scout.length + TX(' ojeados)') : ''}</button>
        <button class="ghost" id="cClub">${TX('🏟️ Club')}</button><button class="ghost" id="cTable">${TX('📊 Clasificación')}</button>
        <button class="ghost" id="cCal">${TX('📅 Calendario')}</button><button class="ghost" id="cCup">${TX('🏆 Copa')}</button>
        <button class="ghost" id="cHall">${TX('🏛️ Salón de la fama')}</button><button class="ghost" id="cSave">${TX('💾 Guardar')}</button></div>
      <button class="ghost" id="cQuit">${TX('Abandonar carrera')}</button>`, 'bg_green');
    c.migrated = false;
    $('cMgr').appendChild(mgrFace(c.manager, 40));
    const after = msg => {
      if (Career.nextMatch()) return renderCareerPre(msg);
      const wt0 = Career.weekType(), wasPO = /^P/.test(wt0);
      Career.data.lastCup = null;
      const sum = Career.advance(); UI.toast(msg, 2600);
      if (sum) renderCareerSeason(sum); else if (wasPO && Career.data.po && Career.myDiv() > 1) renderCareerPOInfo(); else if (wt0 === 'C' && Career.data.lastCup) renderCareerCupRound(Career.data.lastCup); else renderCareer();
    };
    body.querySelectorAll('[data-act]').forEach(b => b.onclick = () => {
      const k = b.dataset.act; Sound.sfx('click');
      if (k === 'entrenar') { $('cTrain').hidden = false; $('cTrain').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return; }
      after(Career.doActivity(k));
    });
    body.querySelectorAll('[data-st]').forEach(b => b.onclick = () => { Sound.sfx('reveal'); after(Career.doActivity('entrenar', b.dataset.st)); });
    $('cSquad').onclick = () => renderCareerSquad(renderCareer);
    $('cMarket').onclick = () => renderCareerMarket(c.scout && c.scout.length ? 'ojeados' : 'libres');
    $('cClub').onclick = () => renderCareerClub();
    $('cTable').onclick = () => renderCareerTable(d, renderCareer);
    $('cCal').onclick = renderCareerCal;
    $('cSave').onclick = () => renderSaves(renderCareer);
    $('cCup').onclick = renderCareerCup;
    $('cHall').onclick = () => renderHall(renderCareer);
    $('cQuit').onclick = () => {
      if ($('cQuit').dataset.sure) { Career.clear(); renderMenu(); return; }
      $('cQuit').dataset.sure = 1; $('cQuit').textContent = TX('¿Seguro? Toca otra vez para borrarla');
    };
    $('back').onclick = renderMenu;
  }
  function renderCareerCup() {
    const c = Career.data, C = c.cup;
    const rounds = C ? C.rounds.map((res, i) => `<h3>${CUP_ROUND[i]}</h3><div class="cres">${res.map(poLine).join('')}</div>`).reverse().join('') : '';
    const next = C && !C.winner ? `<h3>${CUP_ROUND[C.round]} <small>${TX('semana')} ${CUP_WEEKS[C.round]}</small></h3><div class="cres">${C.ties.map(([a, b]) => `<p class="${a === YOU || b === YOU ? 'you' : ''}">${esc(Career.teamName(a))} – ${esc(Career.teamName(b))}</p>`).join('')}${C.round === 0 ? `<p><small>${TX('Esperan en octavos:')} ${C.byes.map(k => esc(Career.teamName(k))).join(', ')}</small></p>` : ''}</div>` : '';
    screen(`${top(TX('Copa Inazuma'))}
      <p class="note">${TX('Los 30 equipos de las 3 divisiones, a partido único (con penaltis si hay empate). Ganarla da dinero, fama y')} <b>${TX('10 tickets')}</b> ${TX('para el gacha.')}</p>
      ${!C ? '<p class="note">' + TX('La Copa empieza la temporada que viene.') + '</p>' : C.winner ? `<p class="note cmsg gold">${TX('🏆 Campeón:')} <b>${esc(Career.teamName(C.winner))}</b></p>` : C.out ? '<p class="note cmsg bad">' + TX('Tu club está eliminado.') + '</p>' : ''}
      ${next}${rounds}`, 'bg_green');
    $('back').onclick = renderCareer;
  }
  function renderCareerCupRound(res) {
    const c = Career.data, i = c.cup ? c.cup.rounds.length - 1 : 0;
    screen(`<h2>${TX('Copa Inazuma ·')} ${CUP_ROUND[i]}</h2>${c.cup && c.cup.winner ? `<p class="note cmsg gold">${TX('🏆 Campeón:')} <b>${esc(Career.teamName(c.cup.winner))}</b></p>` : ''}
      <div class="cres">${res.map(poLine).join('')}</div>${bottom('<button class="cta" id="cNext">' + TX('Continuar') + '</button>')}`, 'bg_green');
    $('cNext').onclick = renderCareer;
  }
  function renderHall(back) {
    const list = Career.hall(), c = Career.data;
    const row = (r, now) => `<div class="cpl fac"><img class="ccrest big" src="${ClubCrest.url(r.crest || { shape: 'escudo', c1: '#1f4fc0', c2: '#e8c21a', sym: 'rayo' }, r.school)}" alt=""><div class="cplb"><b>${esc(r.school)}</b>
      <small>${now ? TX('En curso') : new Date(r.date).toLocaleDateString('es-ES')} ${TX('· mánager')} ${esc((PLAYER(r.manager) || {}).name || '?')} · ${(CAREER_DIFF[r.diff] || CAREER_DIFF.normal).name}</small>
      <span class="cst">${r.seasons} ${TX('temporadas · mejor división:')} ${DIV_NAME[r.best]}${r.goal ? TX(' · ★ campeón de Primera') : ''}${r.closed ? TX(' · club cerrado') : ''}</span>
      <span class="cst">${TX('Títulos:')} ${r.titles.length ? r.titles.map(esc).join(', ') : 'ninguno'}${r.scorer ? TX(' · máximo goleador: ') + esc(PLAYER(r.scorer[0]).name) + ' (' + r.scorer[1] + ')' : ''}</span></div></div>`;
    const cur = c && c.history.length ? row({ school: c.school, manager: c.manager, crest: c.crest, seasons: c.history.length, titles: c.titles.map(t => t.name), best: Math.min(...c.history.map(h => h.div)), goal: c.goal, diff: c.diff,
      scorer: (m => m && m.goals ? [m.id, m.goals] : null)(c.squad.slice().sort((a, b) => b.goals - a.goals)[0]) }, true) : '';
    screen(`${top(TX('Salón de la fama'))}<p class="note">${TX('Tus carreras de mánager: las terminadas, las abandonadas y la que llevas ahora.')}</p>
      <div class="csquad">${cur}${list.map(r => row(r)).join('') || (cur ? '' : '<p class="note">' + TX('Aún no hay ninguna carrera terminada.') + '</p>')}</div>`, 'bg_team');
    $('back').onclick = back;
  }
  // Resultados de los playoffs en los que no jugabas
  function renderCareerPOInfo() {
    const c = Career.data;
    const rows = [2, 3].map(d => { const P = c.po[d]; const r = (P.finalRes ? [P.finalRes] : P.res) || [];
      return `<h3>${TX('Playoff ·')} ${DIV_NAME[d]}</h3><div class="cres">${r.map(poLine).join('')}</div>`; }).join('');
    screen(`<h2>${TX('Playoffs de ascenso')}</h2>${rows}${bottom('<button class="cta" id="cNext">' + TX('Continuar') + '</button>')}`, 'bg_green');
    $('cNext').onclick = renderCareer;
  }
  const poLine = ([a, b, ga, gb, pens, w]) => `<p class="${a === YOU || b === YOU ? 'you' : ''}">${esc(Career.teamName(a))} <b>${ga} - ${gb}</b> ${esc(Career.teamName(b))}${pens ? ` <small>${TX('(pen.')} ${pens[0]}-${pens[1]})</small>` : ''} → <b>${esc(Career.teamName(w))}</b></p>`;
  function renderCareerNew() {
    let pick = MANAGERS[0];
    screen(`${top(TX('Nueva carrera'))}
      <p class="note">${TX('Eres el')} <b>${TX('mánager')}</b> ${TX('de un club de instituto a punto de desaparecer. Empiezas en')} <b>${TX('Tercera División')}</b> ${TX('con 7 chavales normales.')}<br>
      ${TX('3 divisiones de 10 equipos. Los 2 primeros suben y del 3º al 6º juegan un')} <b>${TX('playoff')}</b> ${TX('por la tercera plaza; los 3 últimos bajan. Ficha jugadores, mejora el club y gana la')} <b>${TX('Primera')}</b>${TX('… pero si la fama llega a 0, cierran el club.')}</p>
      <h3>${TX('Elige a tu mánager')}</h3><div class="cmgrs" id="cMgrs"></div>
      <h3>${TX('Nombre del instituto')}</h3><div class="giftin"><input id="cSchool" type="text" maxlength="24" value="Instituto Inazuma" autocomplete="off" spellcheck="false" style="text-transform:none"></div>
      <h3>${TX('Dificultad')}</h3><div class="opts" id="cDiff">${Object.entries(CAREER_DIFF).map(([k, D]) => `<button data-diff="${k}" aria-pressed="${k === 'normal'}">${D.name}</button>`).join('')}</div>
      <p class="note">${TX('La equipación y el escudo se eligen después en «Club». Ganar ligas, la Copa o ascender da tickets para el gacha.')}</p>
      ${Career.hall().length ? '<button class="ghost" id="cHall">' + TX('🏛️ Salón de la fama') + '</button>' : ''}
      ${bottom('<button class="cta" id="cGo">' + TX('Empezar carrera') + '</button>')}`, 'bg_title');
    let diff = 'normal';
    body.querySelectorAll('[data-diff]').forEach(b => b.onclick = () => { diff = b.dataset.diff; body.querySelectorAll('[data-diff]').forEach(x => x.setAttribute('aria-pressed', x === b)); });
    if ($('cHall')) $('cHall').onclick = () => renderHall(renderCareerNew);
    const box = $('cMgrs');
    [...MANAGERS, ...(Halloween.rayUnlocked() ? [RAY_DARK] : [])].filter(id => PLAYER(id)).forEach(id => {
      const b = document.createElement('button'); b.className = 'cmgr' + (id === pick ? ' sel' : '') + (id === RAY_DARK ? ' ray' : '');
      b.appendChild(mgrFace(id, 64)); b.insertAdjacentHTML('beforeend', `<span>${esc(PLAYER(id).name)}</span>${id === RAY_DARK ? `<small>${TX('+10 % de ingresos')}</small>` : ''}`);
      b.onclick = () => { pick = id; box.querySelectorAll('.cmgr').forEach(x => x.classList.toggle('sel', x === b)); Sound.sfx('click'); };
      box.appendChild(b);
    });
    $('cSchool').addEventListener('keydown', e => e.stopPropagation());
    $('cGo').onclick = () => { Career.create(pick, $('cSchool').value.trim() || TX('Instituto Inazuma'), diff); Sound.sfx('reveal'); renderCareerClub(true); };
    $('back').onclick = renderMenu;
  }
  /* ---------- Mundial de Carrera ---------- */
  const wcCrest = k => k === 'JP' ? '<img class="ccrest" src="ui/crest3016.png" alt="">' : `<img class="ccrest" src="ui/crest${crestOf(k)}.png" alt="">`;
  const wcName = k => k === 'JP' ? TX('Inazuma Japón') : k;
  function renderWC(last) {
    const c = Career.data, w = c.wc; tutorial('wc');
    if (w.state === 'call') {
      const cands = Career.wcCandidates(), sel = new Set(w.pick || []);
      screen(`${top(TX('Mundial · Convocatoria'), 'cBack', TX('Club'))}
        <div class="chead"><img class="ccrest big" src="ui/crest3016.png" alt=""><div><b>${TX('Inazuma Japón')}</b><small>${TX('Mundial · temporada')} ${w.season} ${TX('· eres el seleccionador')}</small></div></div>
        <p class="note">${TX('Convoca a')} <b>${TX('10 jugadores')}</b> ${TX('(dos equipos de 5): los de tu club y los mejores de las ligas (los que juegan en Primera y en los equipos de arriba destacan más). Antes de cada partido eliges qué 5 juegan.')}</p>
        <div class="sortrow"><span id="wcN"></span><button class="ghost mini" id="wcAuto">${TX('⚡ Los 10 mejores')}</button></div>
        <div class="pgrid" id="wcL"></div>
        ${bottom('<button class="cta" id="wcGo" disabled>' + TX('🌍 Empezar el Mundial') + '</button>')}`, 'bg_team');
      const draw = () => {
        const L = $('wcL'); L.innerHTML = '';
        cands.forEach(x => {
          const pd = PLAYER(x.id), el = tile(x.id, `<span class="slot">${x.club === YOU ? TX('Tu club') : esc(Career.teamName(x.club))} ${TX('· media')} ${Career.wcScore(x.id)}</span>`);
          if (sel.has(x.id)) el.classList.add('sel');
          el.onclick = () => { if (sel.has(x.id)) sel.delete(x.id); else if (sel.size < 10) sel.add(x.id); else return UI.toast(TX('Ya tienes 10: quita uno antes')); Sound.sfx('click'); w.pick = [...sel]; draw(); };
          L.appendChild(el);
        });
        $('wcN').textContent = sel.size + TX(' de 10 convocados'); $('wcGo').disabled = sel.size !== 10;
      };
      $('wcAuto').onclick = () => {
        const roles = FORMATIONS[c.formation].roles, pool = cands.map(x => x.id);
        sel.clear(); const ranked = pool.slice().sort((a, b) => Career.wcScore(b) - Career.wcScore(a));
        Career.wcRoles(ranked).forEach(id => sel.add(id)); Career.wcRoles(ranked.filter(id => !sel.has(id))).forEach(id => sel.add(id));
        ranked.forEach(id => { if (sel.size < 10) sel.add(id); });
        w.pick = [...sel]; Sound.sfx('reveal'); draw();
      };
      $('wcGo').onclick = () => { Career.wcStart([...sel]); Sound.sfx('reveal'); renderWC(); };
      $('cBack').onclick = () => UI.toast(TX('Primero convoca a tu selección'));
      draw(); return;
    }
    const tableHtmlWC = () => w.group ? `<table class="ctable"><tr><th></th><th></th><th>${TX('Grupo')}</th><th>${TX('Pts')}</th><th>DG</th></tr>${Career.wcTable().map((r, i) =>
      `<tr class="${r.key === 'JP' ? 'you' : ''} ${i < 2 ? 'zup' : ''}"><td>${i + 1}</td><td>${wcCrest(r.key)}</td><td class="tn">${esc(wcName(r.key))}</td><td><b>${r.pts}</b></td><td>${r.gf - r.gc > 0 ? '+' : ''}${r.gf - r.gc}</td></tr>`).join('')}</table>` : '';
    const lastHtml = last ? `<div class="cvs"><div>${wcCrest('JP')}<b>${TX('Japón')}</b></div><span>${last.gA} - ${last.gB}</span><div>${wcCrest(last.opp)}<b>${esc(last.opp)}</b></div></div>
      ${last.pens ? `<p class="cweek">${TX('Penaltis:')} <b>${last.pens[0]} - ${last.pens[1]}</b></p>` : ''}${last.msg ? `<p class="note cmsg ${w.state === 'out' ? 'bad' : 'gold'}">${esc(last.msg)}</p>` : ''}` : '';
    if (w.state === 'out' || w.state === 'champion') {
      const R = w.reward || {};
      screen(`<h2>${w.state === 'champion' ? TX('🏆 ¡Campeones del mundo!') : TX('Fin del Mundial')}</h2>${lastHtml}
        <p class="cweek">${TX('Resultado:')} <b>${{ campeón: TX('Campeones'), final: TX('Subcampeones'), semi: TX('Semifinalistas'), grupo: TX('Fase de grupos') }[w.place]}</b></p>
        <p class="note cmsg gold">${TX('Fama')} ${R.fame >= 0 ? '+' : ''}${R.fame} · +${R.money} ${TX('💰 para tu club · +')}${R.tickets} ${TX('🎟️ para el gacha')}</p>
        <div class="cres">${w.log.map(l => `<p>${l.r}${TX(': Japón')} <b>${l.gA} - ${l.gB}</b> ${esc(l.opp)}${l.pens ? ` ${TX('(pen.')} ${l.pens[0]}-${l.pens[1]})` : ''}</p>`).join('')}</div>
        ${tableHtmlWC()}
        ${bottom('<button class="cta" id="wcEnd">' + TX('Volver al club') + '</button>')}`, w.state === 'champion' ? 'ill27' : 'bg_green');
      $('wcEnd').onclick = () => { Career.wcClose(); Sound.music('menu'); renderCareer(); };
      return;
    }
    const stage = w.state === 'group' ? `${TX('Fase de grupos · partido')} ${w.round + 1} ${TX('de 3')}` : w.state === 'semi' ? TX('Semifinal') : TX('¡FINAL!');
    screen(`${top(TX('Mundial · ') + (w.state === 'group' ? TX('Grupo') : w.state === 'semi' ? TX('Semifinal') : TX('Final')), 'cBack', TX('Club'))}
      ${lastHtml}
      <div class="cvs"><div>${wcCrest('JP')}<b>${TX('Inazuma Japón')}</b><small>${TX('media')} ${Career.wcRating('JP')}</small></div><span>VS</span><div>${wcCrest(w.opp)}<b>${esc(w.opp)}</b><small>${TX('media')} ${Career.wcRating(w.opp)}</small></div></div>
      <p class="cweek">${stage}${w.state !== 'group' ? TX(' · si hay empate, penaltis') : ''}</p>
      <div class="cres"><p>${TX('Juegan:')} ${w.squad.map(id => esc(PLAYER(id).name)).join(', ')}</p></div><button class="ghost" id="wcLine">${TX('👥 Alineación (10 convocados · 2 equipos)')}</button>
      ${tableHtmlWC()}
      ${bottom('<div class="grid2"><button class="cta" id="wcPlay">' + TX('⚽ Jugar') + '<small>' + TX('tú controlas') + '</small></button><button class="cta" id="wcSim">' + TX('📋 Simular') + '<small>' + TX('como seleccionador') + '</small></button></div>')}`, 'bg_vs');
    $('wcLine').onclick = () => renderWCLine();
    $('wcPlay').onclick = () => { api.mode = 'wc'; startMatch(Career.wcTeams(), w.state !== 'group', TEAM_FIELD[w.opp] || 'normal', w.state === 'final' ? 'match_final' : 'match_hard', w.opp); };
    $('wcSim').onclick = () => { const s = Career.wcSim(), r = Career.wcResult(s.gA, s.gB); Sound.sfx(r.gA > r.gB ? 'reveal' : 'click'); renderWC(r); };
    $('cBack').onclick = () => UI.toast(TX('Termina el Mundial para volver al club'));
  }
  function renderCareerPre(msg) {
    const c = Career.data, nm = Career.nextMatch(), d = Career.myDiv();
    const title = nm.type === 'liga' ? TX('Partido de liga') : nm.type === 'copa' ? TX('Copa · ') + CUP_ROUND[nm.round] : nm.type === 'semi' ? TX('Playoff · semifinal') : TX('Playoff · FINAL');
    screen(`${top(title, 'cBack', TX('Club'))}
      ${msg ? `<p class="note cmsg">${esc(msg)}</p>` : ''}
      <div class="cvs"><div>${cCrest(YOU)}<b>${esc(c.school)}</b><small>${TX('media')} ${Career.myRating()}</small></div><span>VS</span><div>${cCrest(nm.rival)}<b>${esc(Career.teamName(nm.rival))}</b><small>${TX('media')} ${Career.rating(nm.rival)}</small></div></div>
      <p class="cweek">${nm.type === 'liga' ? `${TX('Jornada')} ${nm.j + 1} ${TX('de 9')}` : nm.type === 'copa' ? `${TX('Copa Inazuma ·')} ${CUP_ROUND[nm.round]} ${TX('· a partido único, con penaltis')}` : TX('Eliminatoria: si hay empate, penaltis')} · ${DIV_NAME[d]} · ${nm.home ? TX('en casa') : 'fuera'} ${TX('· forma')} ${c.forma} %</p>
      <button class="ghost" id="cLine">${TX('👥 Alineación (')}${c.formation} · ${FORMATIONS[c.formation].name})</button>
      <h3>${TX('Táctica')} <small>${TX('cuenta sobre todo al simular')}</small></h3>
      <div class="opts">${Object.entries(TACTICS).map(([k, t]) => `<button data-tac="${k}" aria-pressed="${c.tactic === k}">${t.name}</button>`).join('')}</div>
      <p class="note" id="cTacD">${TACTICS[c.tactic].desc}</p>
      ${bottom('<div class="grid2"><button class="cta" id="cPlay">' + TX('⚽ Jugar') + '<small>' + TX('tú controlas') + '</small></button><button class="cta" id="cSim">' + TX('📋 Simular') + '<small>' + TX('como mánager') + '</small></button></div>')}`, 'bg_vs');
    body.querySelectorAll('[data-tac]').forEach(b => b.onclick = () => {
      c.tactic = b.dataset.tac; Career.save(); body.querySelectorAll('[data-tac]').forEach(x => x.setAttribute('aria-pressed', x === b)); $('cTacD').textContent = TACTICS[c.tactic].desc;
    });
    $('cLine').onclick = () => renderCareerSquad(() => renderCareerPre());
    $('cPlay').onclick = () => {
      if (!Career.lineupOk()) Career.autoLineup();
      api.mode = 'career';
      startMatch(Career.matchTeams(), !!nm.ko, TEAM_FIELD[nm.rival], nm.ko && (nm.type !== 'copa' || nm.round >= 3) ? 'match_final' : { 1: 'match_hard', 2: 'match_mid', 3: 'match_easy' }[d], nm.rival);
    };
    $('cSim').onclick = () => { if (!Career.lineupOk()) Career.autoLineup(); renderCareerSim(Career.simulateMine(c.tactic)); };
    $('cBack').onclick = () => UI.toast(TX('Primero juega o simula el partido de esta semana'));
  }
  function renderCareerSim(r) {
    const c = Career.data;
    screen(`<h2>${TX('Simulación')}</h2>
      <div class="cvs sim"><div>${cCrest(YOU)}<b>${esc(c.school)}</b></div><span id="cSc">0 - 0</span><div>${cCrest(r.rival)}<b>${esc(Career.teamName(r.rival))}</b></div></div>
      <p class="cweek" id="cMin">0'</p><div class="cfeed" id="cFeed"></div>
      ${bottom('<button class="ghost" id="cSkip">' + TX('Saltar al final ▶▶') + '</button><button class="cta" id="cDone" hidden>' + TX('Continuar') + '</button>')}`, 'bg_vs');
    let min = 0, i = 0, a = 0, b = 0, done = false;
    Sound.music('match_mid');
    const feed = $('cFeed');
    const show = e => {
      if (e.type === 'goal') { if (e.team === 'A') a++; else b++; $('cSc').textContent = a + ' - ' + b; Sound.sfx('goal'); }
      const line = e.type === 'pens' ? `🥅 <b>${TX('Penaltis:')} ${e.a} - ${e.b}</b> · ${e.a > e.b ? TX('¡pasáis!') : TX('eliminados…')}`
        : e.type === 'goal' ? `⚽ <b>${TX('¡Gol')}${e.team === 'A' ? '' : ' rival'}!</b> ${esc(e.name)}${e.tech ? ' ' + TX('con') + ' <b>' + esc(e.tech) + '</b>' : ''}` : `${TX('🧤 Parada de')} ${esc(e.name || TX('el portero'))}`;
      feed.insertAdjacentHTML('afterbegin', `<p class="${e.team === 'B' ? 'rival' : 'mine'}"><i>${e.min}'</i> ${line}</p>`);
    };
    const finish = () => {
      if (done) return; done = true; clearInterval(iv);
      while (i < r.events.length) show(r.events[i++]);
      $('cMin').textContent = TX('Final'); Sound.sfx('whistleEnd');
      $('cSkip').hidden = true; $('cDone').hidden = false;
    };
    const iv = setInterval(() => {
      min++; $('cMin').textContent = min + "'";
      while (i < r.events.length && r.events[i].min <= min) show(r.events[i++]);
      if (min >= 90) finish();
    }, 65);
    $('cSkip').onclick = finish;
    $('cDone').onclick = () => {
      const out = Career.finishMatch(r.gA, r.gB, r.pens, r.forma, r.events.filter(e => e.type === 'goal' && e.team === 'A').map(e => e.id));
      Sound.stop(0.3); jingleFor(out);
      renderCareerJornada(out);
    };
  }
  const careerWon = out => out.gA > out.gB || (out.gA === out.gB && out.pens && out.pens[0] > out.pens[1]);
  const jingleFor = out => Sound.jingle(careerWon(out) ? 'win' : out.gA === out.gB && !out.pens ? null : 'lose');
  function tableHtml(d, rows) {
    return `<table class="ctable"><tr><th></th><th></th><th>${TX('Equipo')}</th><th>PJ</th><th>G</th><th>E</th><th>P</th><th>DG</th><th>${TX('Pts')}</th></tr>${rows.map((r, i) =>
      `<tr class="${r.key === YOU ? 'you' : ''} ${d > 1 && i < 2 ? 'zup' : ''} ${d > 1 && i >= 2 && i < 6 ? 'zpo' : ''} ${d < 3 && i >= rows.length - 3 ? 'zdown' : ''}"><td>${i + 1}</td><td>${cCrest(r.key)}</td><td class="tn">${esc(Career.teamName(r.key))}</td><td>${r.pj}</td><td>${r.g}</td><td>${r.e}</td><td>${r.p}</td><td>${r.gf - r.gc > 0 ? '+' : ''}${r.gf - r.gc}</td><td><b>${r.pts}</b></td></tr>`).join('')}</table>
      <p class="note ckey">${d > 1 ? '<span class="zup">■</span> ' + TX('ascenso ·') + ' <span class="zpo">■</span> ' + TX('playoff ·') + ' ' : ''}${d < 3 ? '<span class="zdown">■</span> ' + TX('descenso') : TX('Tercera: los 3 últimos pierden fama')}</p>`;
  }
  function renderCareerJornada(out) {
    const c = Career.data, d = Career.myDiv(), win = careerWon(out), draw = out.gA === out.gB && !out.pens;
    const isPO = out.type !== 'L';
    screen(`<h2>${win ? TX('¡Victoria!') : draw ? TX('Empate') : TX('Derrota')}</h2>
      <div class="cvs"><div>${cCrest(YOU)}<b>${esc(c.school)}</b></div><span>${out.gA} - ${out.gB}</span><div>${cCrest(out.rival)}<b>${esc(Career.teamName(out.rival))}</b></div></div>
      ${out.pens ? `<p class="cweek">${TX('Penaltis:')} <b>${out.pens[0]} - ${out.pens[1]}</b></p>` : ''}
      <p class="cweek">${TX('Fama')} ${out.fame >= 0 ? '+' : ''}${out.fame} ${TX('· Taquilla +')}${out.money} ${TX('💰 · Forma')} ${c.forma} %</p>
      ${out.prog && out.prog.length ? `<p class="note cprog">${out.prog.map(x => `${x.d > 0 ? '📈' : '📉'} ${esc(PLAYER(x.id).name)} ${x.d > 0 ? '+1' : '−1'} ${STAT_LABEL[x.k]}`).join(' · ')}</p>` : ''}
      ${c.over ? '<p class="note cmsg bad">' + TX('La fama ha llegado a 0…') + '</p>' : ''}
      ${out.vencido ? `<div class="cnext vencido" id="cVen"><span id="cVenF"></span><div><b>${TX('¡')}${esc(PLAYER(out.vencido.id).name)} ${TX('quiere unirse a tu club!')}</b><small>${TX('Jugaba en')} ${esc(Career.teamName(out.vencido.key))} · ${PLAYER(out.vencido.id).role} · ${rchip(PLAYER(out.vencido.id).rarity)}</small>
        <button class="cta" id="cVenOk">${TX('Fichar por')} ${out.vencido.price} 💰</button></div></div>` : ''}
      ${out.cupWinner ? `<p class="note cmsg gold">🏆 ${out.cupWinner === YOU ? '<b>' + TX('¡Campeones de la Copa Inazuma!') + '</b> ' + TX('+10 🎟️ para el gacha') : TX('Campeón de Copa: ') + esc(Career.teamName(out.cupWinner))}</p>` : ''}
      ${out.type === 'C' ? `<h3>${TX('Copa Inazuma ·')} ${CUP_ROUND[out.cupRound]}</h3><div class="cres">${(out.results.cup || []).map(poLine).join('')}</div>`
        : isPO ? `<h3>${TX('Playoff de ascenso ·')} ${DIV_NAME[d]}</h3><div class="cres">${(out.results[d] || []).map(poLine).join('')}</div>`
        : `<h3>${TX('Resultados de la jornada ·')} ${DIV_NAME[d]}</h3>
      <div class="cres">${out.results[d].map(([a, b, ga, gb]) => `<p class="${a === YOU || b === YOU ? 'you' : ''}">${esc(Career.teamName(a))} <b>${ga} - ${gb}</b> ${esc(Career.teamName(b))}</p>`).join('')}</div>
      <h3>${TX('Clasificación')}</h3>${tableHtml(d, Career.standings(d))}`}
      ${bottom('<button class="cta" id="cNext">' + TX('Continuar') + '</button>')}`, win ? 'ill27' : draw ? 'bg_green' : 'ill14');
    if (out.vencido) {
      $('cVenF').appendChild(face(Sprites.refOf(PLAYER(out.vencido.id)), 48));
      $('cVenOk').onclick = () => { const r = Career.sign(out.vencido.id, out.vencido.price, out.vencido.key); UI.toast(r.msg, 2200); if (r.ok) { Sound.sfx('reveal'); $('cVen').remove(); } };
    }
    $('cNext').onclick = () => {
      if (c.over) return renderCareerOver();
      const sum = Career.advance();
      Sound.music('menu');
      if (sum) renderCareerSeason(sum); else renderCareer();
    };
  }
  function renderCareerSeason(sum) {
    const c = Career.data, d = sum.div;
    const msg = sum.goal ? '<p class="note cmsg gold">🏆 <b>' + TX('¡Campeones de Primera División!') + '</b> ' + TX('Has completado la carrera. Tu club entra en el salón de la fama… y puedes seguir jugando temporadas para siempre (los rivales mejoran cada año).') + '</p>'
      : sum.champion ? `<p class="note cmsg gold">${TX('🏆 ¡Campeones de')} ${DIV_NAME[d]}!</p>` : '';
    const move = sum.moves.includes('up') ? `<p class="note cmsg gold">${TX('⬆️ ¡Ascenso a')} ${DIV_NAME[d - 1]}!${sum.playoff ? TX(' (por el playoff)') : ''}</p>` : sum.moves.includes('down') ? `<p class="note cmsg bad">${TX('⬇️ Descenso a')} ${DIV_NAME[d + 1]}…</p>` : sum.warning ? '<p class="note cmsg bad">' + TX('El director no está contento: últimos de Tercera.') + '</p>' : '';
    const names = ids => ids.map(id => esc(PLAYER(id).name)).join(', ') || 'nadie';
    screen(`<h2>${TX('Fin de la temporada')} ${sum.season}</h2>
      <p class="cweek">${DIV_NAME[d]} ${TX('División · puesto')} <b>${ordTx(sum.pos)}</b> ${TX('· fama')} ${sum.fame >= 0 ? '+' : ''}${sum.fame} ${TX('· premio +')}${sum.money} 💰</p>
      ${msg}${move}
      ${sum.cupWinner ? `<p class="note">${TX('🏆 Copa Inazuma:')} ${sum.cupWinner === YOU ? '<b>' + TX('¡tu club!') + '</b>' : esc(Career.teamName(sum.cupWinner))}</p>` : ''}
      ${sum.wc ? '<p class="note cmsg gold">🌍 <b>' + TX('¡Llega el Mundial!') + '</b> ' + TX('Te han nombrado seleccionador de Inazuma Japón: convoca a los mejores de las ligas.') + '</p>' : ''}
      ${sum.tickets ? `<p class="note cmsg gold">🎟️ +${sum.tickets} ${TX('tickets para el gacha por tus logros de la temporada')}</p>` : ''}
      ${c.over ? '<p class="note cmsg bad">' + TX('La fama ha llegado a 0 y el director cierra el club.') + '</p>' : ''}
      <h3>${TX('Ascensos y descensos')}</h3>
      <p class="note">${TX('⬆️ A Primera:')} ${sum.promoted[1].map(k => esc(Career.teamName(k))).join(', ')}<br>${TX('⬆️ A Segunda:')} ${sum.promoted[2].map(k => esc(Career.teamName(k))).join(', ')}<br>
      ${TX('⬇️ A Segunda:')} ${sum.relegated[1].map(k => esc(Career.teamName(k))).join(', ')}<br>${TX('⬇️ A Tercera:')} ${sum.relegated[2].map(k => esc(Career.teamName(k))).join(', ')}</p>
      <h3>${TX('Tu plantilla')}</h3>
      <p class="note">${TX('🎓 Se gradúan ({0}):', yearTx(LAST_YEAR))} ${names(sum.grads)}<br>${TX('🌱 Llegan de la cantera:')} ${names(sum.youth)}<br>${TX('📈 El resto pasa de curso y gana experiencia:')} <b>+${sum.growth || 1} ${TX('en todas sus stats')}</b>.</p>
      ${(sum.pendingYouth || []).length ? `<p class="note cmsg gold">🌱 ${names(sum.pendingYouth)} ${sum.pendingYouth.length > 1 ? 'quieren' : 'quiere'} ${TX('entrar, pero la plantilla está llena: ahora eliges si haces hueco.')}</p>` : ''}
      ${sum.goal ? hallHtml() : ''}
      ${bottom(`<button class="cta" id="cNext">${c.over ? TX('Ver resumen') : sum.goal ? TX('Seguir jugando (infinito)') : TX('Empezar temporada ') + c.season}</button>`)}`, sum.champion || sum.moves.includes('up') ? 'ill25' : 'bg_team');
    if (sum.champion || sum.moves.includes('up')) Sound.jingle('win');
    $('cNext').onclick = () => { Sound.music('menu'); c.over ? renderCareerOver() : renderCareer(); };
  }
  // Juveniles que no caben: entra si dejas ir a alguien, o se va a otro instituto
  function renderYouthChoice(next) {
    const c = Career.data, kid = (c.pendingYouth || [])[0];
    if (!kid) return next();
    const pd = PLAYER(kid.id);
    screen(`<h2>${TX('🌱 Llega un juvenil')}</h2>
      <p class="note"><b>${esc(pd.name)}</b> (${ROLE_LABEL[pd.role]}${TX(', 1º curso) quiere entrar en el club, pero tu plantilla está llena (')}${SQUAD_MAX}/${SQUAD_MAX}${TX('). ¿Le haces hueco?')}</p>
      <div class="csquad" id="yKid"></div>
      <h3>${TX('Elige a quién dejas ir')}</h3>
      <p class="note">${TX('Ordenados de peor a mejor. Se va del club sin cobrar nada.')}</p>
      <div class="csquad" id="ySquad"></div>
      ${bottom(`<button class="ghost" id="yNo">${TX('No, que')} ${esc(pd.name)} ${TX('se vaya a otro instituto')}</button>`)}`, 'bg_team');
    $('yKid').appendChild(playerRow(kid.id, `<span class="cst">${TX('1º curso · de la cantera')}</span>`, kid));
    c.squad.slice().sort((a, b) => Career.ovr(a) - Career.ovr(b)).forEach(m => {
      const el = playerRow(m.id, `<span class="cst">${yearTx(m.year)}${c.lineup.includes(m.id) ? ' · <b>' + TX('titular') + '</b>' : ''}</span><button class="ghost mini">${TX('Dejar ir')}</button>`, m);
      el.querySelector('button').onclick = () => { const r = Career.resolveYouth(kid.id, m.id); if (r.ok) { UI.toast(r.msg, 2000); Sound.sfx('reveal'); renderYouthChoice(next); } };
      $('ySquad').appendChild(el);
    });
    $('yNo').onclick = () => { const r = Career.resolveYouth(kid.id, null); if (r.ok) UI.toast(r.msg, 1800); renderYouthChoice(next); };
  }
  function hallHtml() {
    const c = Career.data;
    return `<h3>${TX('Salón de la fama')}</h3><p class="note">${esc(c.school)} ${TX('· mánager')} ${esc(PLAYER(c.manager).name)}<br>
      ${TX('Temporadas:')} <b>${c.history.length}</b> ${TX('· Títulos:')} <b>${c.titles.length}</b>${c.titles.length ? ' (' + c.titles.map(t => esc(t.name) + ' ' + TX('T{0}', t.season)).join(', ') + ')' : ''}<br>
      ${TX('Recorrido:')} ${c.history.map(h => TX('T{0}', h.season) + ' ' + DIV_NAME[h.div][0] + ordTx(h.pos) + (h.up ? '⬆' : h.down ? '⬇' : '')).join(' · ') || '—'}</p>`;
  }
  function renderCareerOver() {
    screen(`<h2>${TX('Fin de la carrera')}</h2><p class="note cmsg bad">${TX('La fama del club ha llegado a 0 y el director ha cerrado el club de fútbol.')}</p>
      ${hallHtml()}
      ${bottom('<div class="grid2"><button class="cta" id="cNew">' + TX('Nueva carrera') + '</button><button class="ghost" id="cMenu">' + TX('Menú') + '</button></div>')}`, 'ill15');
    $('cNew').onclick = () => { Career.clear(); renderCareerNew(); };
    $('cMenu').onclick = renderMenu;
  }
  function renderCareerTable(d, back) {
    const c = Career.data;
    const po = c.po && c.po[d] ? `<h3>${TX('Playoff')}</h3><div class="cres">${[...(c.po[d].res || []), ...(c.po[d].finalRes ? [c.po[d].finalRes] : [])].map(poLine).join('') || '<p>' + TX('Semifinales:') + ' ' + c.po[d].semis.map(([a, b]) => esc(Career.teamName(a)) + ' – ' + esc(Career.teamName(b))).join(' · ') + '</p>'}</div>` : '';
    screen(`${top(TX('Clasificación'))}
      <div class="opts">${[1, 2, 3].map(k => `<button data-dv="${k}" aria-pressed="${k === d}">${DIV_NAME[k]}</button>`).join('')}</div>
      ${tableHtml(d, Career.standings(d))}${po}`, 'bg_green');
    body.querySelectorAll('[data-dv]').forEach(b => b.onclick = () => renderCareerTable(+b.dataset.dv, back));
    $('back').onclick = back;
  }
  function renderCareerCal() {
    const c = Career.data, d = Career.myDiv();
    const rows = Array.from({ length: WEEKS }, (_, i) => {
      const w = i + 1, t = SCHED[w], j = Career.jornadaOf(w);
      if (t === 'C') {
        const r = CUP_WEEKS.indexOf(w), C = c.cup, played = C && C.rounds[r], mine = played && played.find(x => x[0] === YOU || x[1] === YOU);
        const txt = mine ? `${esc(Career.teamName(mine[0] === YOU ? mine[1] : mine[0]))} <b>${mine[0] === YOU ? mine[2] + ' - ' + mine[3] : mine[3] + ' - ' + mine[2]}</b>${mine[5] === YOU ? ' ✓' : ' ✗'}`
          : C && C.round === r && Career.cupTie() ? 'vs ' + esc(Career.teamName(Career.cupTie().find(k => k !== YOU))) : C && (C.out || C.winner) && r >= C.round ? '<small>' + TX('(sin ti)') + '</small>' : '';
        return `<p class="${w === c.week ? 'now' : ''}"><i>${TX('S{0}', w)}</i> ${TX('🏆 Copa ·')} ${CUP_ROUND[r]} ${txt}</p>`;
      }
      if (t !== 'L') return `<p class="${w === c.week ? 'now' : ''}"><i>${TX('S{0}', w)}</i> ${t === 'P1' ? TX('Playoff · semifinales') : TX('Playoff · final')} <small>${TX('(3º a 6º de Segunda y Tercera)')}</small></p>`;
      const m = c.fix[d][j].find(p => p.includes(YOU)), rv = m[0] === YOU ? m[1] : m[0];
      const res = c.results[d][j].find(r => r[0] === YOU || r[1] === YOU);
      const sc = res ? (res[0] === YOU ? res[2] + ' - ' + res[3] : res[3] + ' - ' + res[2]) : '';
      return `<p class="${w === c.week ? 'now' : ''}"><i>${TX('S{0}', w)}</i> ${TX('J{0}', j + 1)} ${m[0] === YOU ? 'vs' : TX('en')} ${cCrest(rv)} ${esc(Career.teamName(rv))} ${sc ? '<b>' + sc + '</b>' : ''}</p>`;
    }).join('');
    screen(`${top(TX('Calendario'))}<p class="cweek">${TX('Temporada')} ${c.season} · ${DIV_NAME[d]} ${TX('División')}</p><div class="cres ccal">${rows}</div>`, 'bg_green');
    $('back').onclick = renderCareer;
  }
  const statsLine = m => STAT_KEYS.map(k => `${STAT_LABEL[k].slice(0, 3)} <b>${Career.stat(m, k)}</b>`).join(' · ');
  function playerRow(id, extra, m) {
    const pd = PLAYER(id), el = document.createElement('div'); el.className = 'cpl';
    el.appendChild(face(Sprites.refOf(pd), 48));
    m = m || Career.member(id);
    el.insertAdjacentHTML('beforeend', `<div class="cplb"><b>${esc(pd.name)}</b> <small>${RAB(pd.role)} · ${rchip(pd.rarity)} ${TX('· media')} ${Career.ovr(m)}</small>
      <span class="cst">${statsLine(m)}</span>${extra || ''}</div>`);
    return el;
  }
  function renderCareerSquad(back, sel = 0) {
    const c = Career.data;
    if (!Career.lineupOk()) Career.autoLineup();
    const roles = FORMATIONS[c.formation].roles;
    screen(`${top(TX('Plantilla'))}
      ${formSelect(c)}
      <div class="edbar"><button class="ghost" id="cAuto">${TX('⚡ Mejor equipo')}</button><span class="note">${TX('Media:')} <b>${Career.myRating()}</b> · ${c.squad.length}/${SQUAD_MAX} ${TX('jugadores')}</span></div>
      <div id="cPitch"></div>
      <h3>${TX('Puesto:')} ${ROLE_LABEL[roles[sel]]} <small>${TX('toca un jugador para ponerlo')}</small></h3>
      <div class="csquad" id="cList"></div>`, 'bg_green');
    $('cPitch').appendChild(pitch(roles, c.lineup.map((id, i) => { const m = Career.m(id), pd = PLAYER(id); return { ref: Sprites.refOf(pd), name: pd.name, rarity: pd.rarity, badge: Career.rate(m, roles[i]) }; }),
      sel, i => renderCareerSquad(back, i)));
    $('formSel').onchange = e => { c.formation = e.target.value; Career.autoLineup(); Career.save(); renderCareerSquad(back, 0); };
    $('cAuto').onclick = () => { Career.autoLineup(); Career.save(); Sound.sfx('reveal'); renderCareerSquad(back, sel); };
    const list = $('cList');
    c.squad.slice().sort((a, b) => Career.rate(b, roles[sel]) - Career.rate(a, roles[sel])).forEach(m => {
      const at = c.lineup.indexOf(m.id);
      const el = playerRow(m.id, `<span class="cst">${yearTx(m.year)}${m.year >= LAST_YEAR ? TX(' (se gradúa al acabar)') : ''}${at >= 0 ? TX(' · titular (') + RAB(roles[at]) + ')' : ''} ${TX('· nota aquí')} ${Career.rate(m, roles[sel])} · ${m.games} ${TX('PJ ·')} ${m.goals} ${TX('goles')}</span>
        <span class="cst">⚡ ${Career.equipped(m).map(t => esc(TECH(t).name)).join(' · ') || TX('sin técnicas')} <button class="ghost mini ctech">${TX('Técnicas')}</button></span>`, m);
      el.classList.add('btn'); if (at >= 0) el.classList.add('sel');
      el.querySelector('.ctech').onclick = e => { e.stopPropagation(); renderCareerTechs(m.id, () => renderCareerSquad(back, sel)); };
      el.onclick = () => {
        if (roles[sel] === 'POR' && !playsAs(PLAYER(m.id), 'POR')) return UI.toast(TX('A portería solo pueden ir porteros'));
        if (at >= 0 && roles[at] === 'POR' && !playsAs(PLAYER(c.lineup[sel]), 'POR')) return UI.toast(TX('Así la portería se quedaría sin portero'));
        if (at >= 0) c.lineup[at] = c.lineup[sel];
        c.lineup[sel] = m.id; Career.save(); Sound.sfx('click'); renderCareerSquad(back, sel);
      };
      list.appendChild(el);
    });
    $('back').onclick = back;
  }

  function renderCareerTechs(id, back) {
    const m = Career.m(id), pd = PLAYER(id), eq = Career.equipped(m), ls = Career.learnset(id);
    screen(`${top(TX('Técnicas · ') + esc(pd.name))}
      <p class="note">${TX('Elige hasta')} <b>${TECH_SLOTS}</b> ${TX('técnicas para los partidos. Solo puedes usar las que')} <b>${esc(pd.name)}</b> ${TX('aprende en el juego (')}${ls.length}).</p>
      <div class="csquad" id="ctL"></div>`, 'bg_green');
    const L = $('ctL');
    ls.forEach(t => {
      const T = TECH(t), on = eq.includes(t), el = document.createElement('button');
      el.className = 'cpl btn' + (on ? ' sel' : '');
      el.innerHTML = `<div class="cplb"><b>${TYPE_ICON[T.type] || '★'} ${esc(T.name)}</b> <small>${TYPE_LABEL[T.type]} ${TX('· potencia')} ${T.power} · ${chip(T.elem)}</small><span class="cst">${on ? TX('✅ Equipada') : m.known.includes(t) ? TX('Aprendida · toca para equipar') : TX('Toca para equipar')}</span></div>`;
      el.onclick = () => { Career.toggleEquip(id, t); Sound.sfx('click'); renderCareerTechs(id, back); };
      L.appendChild(el);
    });
    if (!ls.length) L.innerHTML = '<p class="note">' + TX('Este jugador no aprende técnicas.') + '</p>';
    $('back').onclick = back;
  }
  function renderWCLine(sel = 0) {
    const c = Career.data, w = c.wc, roles = FORMATIONS[c.formation].roles;
    screen(`${top(TX('Mundial · Alineación'))}
      <div class="edbar"><button class="ghost" id="wlBest">${TX('⚡ Mejores 5')}</button><button class="ghost" id="wl2">${TX('🔄 Equipo 2 (los otros 5)')}</button></div>
      <p class="note">${TX('Media:')} <b>${Career.wcRating('JP')}</b> ${TX('· formación')} ${c.formation} ${TX('· toca un puesto del campo y luego a un convocado.')}</p>
      <div id="wlPitch"></div><h3>${TX('Puesto:')} ${ROLE_LABEL[roles[sel]]}</h3><div class="pgrid" id="wlL"></div>`, 'bg_green');
    $('wlPitch').appendChild(pitch(roles, w.squad.map(id => ({ ref: Sprites.refOf(PLAYER(id)), name: PLAYER(id).name, rarity: PLAYER(id).rarity, halloween: PLAYER(id).halloween, badge: Career.wcScore(id) })), sel, i => renderWCLine(i)));
    (w.call || w.squad).forEach(id => {
      const at = w.squad.indexOf(id), el = tile(id, `<span class="slot">${at >= 0 ? TX('Juega · ') + RAB(roles[at]) : TX('Banquillo')} ${TX('· media')} ${Career.wcScore(id)}</span>`);
      if (at >= 0) el.classList.add('sel');
      el.onclick = () => { if (Career.wcSet(sel, id) === false) return UI.toast(TX('A portería solo pueden ir porteros')); Sound.sfx('click'); renderWCLine(Math.min(4, sel + 1)); };
      $('wlL').appendChild(el);
    });
    $('wlBest').onclick = () => { if (w.call) Career.wcBest(); Sound.sfx('reveal'); renderWCLine(sel); };
    $('wl2').onclick = () => { if (w.call) Career.wcTeam2(); Sound.sfx('reveal'); renderWCLine(sel); };
    $('back').onclick = () => renderWC();
  }

  /* ---------- Fichajes ---------- */
  let mkDiv = null, mkRole = '', mkAbroad = '';
  function renderCareerMarket(tab = 'libres') {
    const c = Career.data, err = Career.canSign();
    mkDiv = mkDiv || Career.myDiv();
    const tabs = [['ojeados', `${TX('Ojeados (')}${(c.scout || []).length})`], ['libres', TX('Libres')], ['clubes', TX('Otros clubes')], ['fuera', TX('🌍 Fuera')], ['vender', TX('Vender')]];
    const roleF = `<div class="opts small">${[['', TX('Todos')], ...ROLES4.map(r => [r, RAB(r)])].map(([v, t]) => `<button data-role="${v}" aria-pressed="${mkRole === v}">${t}</button>`).join('')}</div>`;
    screen(`${top(TX('Fichajes'))}
      <p class="cweek">${money(c.money)} ${TX('· plantilla')} ${c.squad.length}/${SQUAD_MAX}${err ? ' · <b>' + TX('llena') + '</b>' : ''}</p>
      <div class="opts">${tabs.map(([k, t]) => `<button data-tab="${k}" aria-pressed="${k === tab}">${t}</button>`).join('')}</div>
      <div id="mkHead"></div><div class="csquad" id="mkList"></div>`, 'bg_green');
    body.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => renderCareerMarket(b.dataset.tab));
    $('back').onclick = renderCareer;
    const list = $('mkList'), head = $('mkHead');
    const buyBtn = (id, price, from, label) => {
      const pd = PLAYER(id), el = playerRow(id, `<span class="cst">${from ? TX('En ') + esc(Career.teamName(from)) + ' · ' : ''}${label || ''}</span><button class="cta mini">${from ? TX('Negociar') : TX('Fichar · ') + price + ' 💰'}</button>`);
      el.querySelector('button').onclick = () => {
        if (from) return renderNegotiation(from, id, tab);
        const r = Career.sign(id, price); UI.toast(r.msg, 2200); if (r.ok) { Sound.sfx('reveal'); renderCareerMarket(tab); }
      };
      return el;
    };
    const roleOk = id => !mkRole || PLAYER(id).role === mkRole;
    if (tab === 'ojeados') {
      head.innerHTML = '<p class="note">' + TX('Joyas que han encontrado tus ojeadores: mucho más baratas que en el mercado, pero solo durante unas semanas. Usa la actividad «Ojear» para buscar más.') + '</p>';
      if (!(c.scout || []).length) list.innerHTML = '<p class="note">' + TX('Aún no hay nadie ojeado.') + '</p>';
      (c.scout || []).forEach(s => list.appendChild(buyBtn(s.id, s.price, null, `${TX('Disponible hasta la semana')} ${Math.min(WEEKS, s.until)}`)));
    } else if (tab === 'libres') {
      head.innerHTML = '<p class="note">' + TX('Agentes libres de esta semana (la lista cambia cada semana). Se fichan al momento, sin negociar.') + '</p>' + roleF;
      const mk = Career.marketList();
      mk.libres.filter(roleOk).forEach(id => { const el = buyBtn(id, Math.round(Career.value(id) * 0.8 / 5) * 5, null, id === mk.star ? TX('⭐ Oportunidad de la semana') : ''); if (id === mk.star) el.classList.add('sel'); list.appendChild(el); });
    } else if (tab === 'clubes') {
      head.innerHTML = `<p class="note">${TX('Haz una oferta a otro club. Sus estrellas cuestan más, y a los clubes de divisiones superiores no les gusta vender a uno de abajo. Si te pasas de tacaño, cortan la negociación hasta la semana siguiente.')}</p>
        <div class="opts">${[1, 2, 3].map(k => `<button data-mdv="${k}" aria-pressed="${k === mkDiv}">${DIV_NAME[k]}</button>`).join('')}</div>${roleF}`;
      Career.clubPlayers(mkDiv).filter(x => roleOk(x.id)).sort((a, b) => Career.value(b.id, b.key) - Career.value(a.id, a.key))
        .forEach(x => list.appendChild(buyBtn(x.id, 0, x.key, TX('valor aprox. ') + Career.value(x.id, x.key) + ' 💰' + (x.star ? TX(' · ⭐ su estrella: pedirán más') : ''))));
    } else if (tab === 'fuera') {
      const countries = [...new Set(GAME.players.filter(p => p.abroad).map(p => p.abroad))].sort();
      mkAbroad = countries.includes(mkAbroad) ? mkAbroad : '';
      head.innerHTML = `<p class="note">${TX('Jugadores')} <b>${TX('fuera del país')}</b>${TX(': las selecciones del mundo del Inazuma 3. Se fichan al momento, pero el traspaso internacional cuesta un 30 % más.')}</p>
        <div class="pfsel" style="grid-template-columns:1fr"><select id="mkCountry"><option value="">${TX('Todos los países')}</option>${countries.map(k => `<option value="${esc(k)}" ${k === mkAbroad ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></div>${roleF}`;
      $('mkCountry').onchange = e => { mkAbroad = e.target.value; renderCareerMarket(tab); };
      const ids = Career.abroadList(mkAbroad).filter(p => roleOk(p.id)).sort((a, b) => Career.value(b.id) - Career.value(a.id));
      if (!ids.length) list.innerHTML = '<p class="note">' + TX('No queda nadie disponible con ese filtro.') + '</p>';
      ids.slice(0, 60).forEach(p => list.appendChild(buyBtn(p.id, Career.abroadPrice(p.id), null, TX('🌍 Fuera del país · ') + esc(p.abroad))));
    } else {
      head.innerHTML = `<p class="note">${TX('Vender: un club paga el 70 % de su valor. Liberar: se va gratis (para hacer hueco). Mínimo')} ${SQUAD_MIN} ${TX('jugadores.')}</p>`;
      c.squad.forEach(m => {
        const el = playerRow(m.id, `<span class="cst">${yearTx(m.year)} ${TX('· valor')} ${Career.value(m.id)} 💰</span><span class="row2"><button class="ghost mini" data-sell>${TX('Vender ·')} ${Math.round(Career.value(m.id) * 0.7 / 5) * 5} 💰</button><button class="ghost mini" data-rel>${TX('Liberar')}</button></span>`, m);
        el.querySelector('[data-sell]').onclick = () => { const r = Career.sell(m.id); UI.toast(r.msg, 2200); if (r.ok) renderCareerMarket(tab); };
        el.querySelector('[data-rel]').onclick = e => {
          if (!e.target.dataset.sure) { e.target.dataset.sure = 1; e.target.textContent = TX('¿Seguro?'); return; }
          const r = Career.release(m.id); UI.toast(r.msg, 2000); if (r.ok) renderCareerMarket(tab);
        };
        list.appendChild(el);
      });
    }
    body.querySelectorAll('[data-mdv]').forEach(b => b.onclick = () => { mkDiv = +b.dataset.mdv; renderCareerMarket(tab); });
    body.querySelectorAll('[data-role]').forEach(b => b.onclick = () => { mkRole = b.dataset.role; renderCareerMarket(tab); });
  }
  function renderNegotiation(key, id, tab) {
    const c = Career.data, pd = PLAYER(id), val = Career.value(id, key);
    let amount = Math.round(val * 0.85 / 5) * 5, counter = null;
    screen(`${top(TX('Negociación'), 'nBack', TX('Fichajes'))}
      <div class="cvs"><div>${cCrest(YOU)}<b>${esc(c.school)}</b><small>${money(c.money)}</small></div><span>⇄</span><div>${cCrest(key)}<b>${esc(Career.teamName(key))}</b><small>${DIV_NAME[Career.divOf(key)]}</small></div></div>
      <div id="nPl"></div>
      <p class="cweek">${TX('Valor de mercado aproximado:')} <b>${val} 💰</b></p>
      <div class="negbox"><button class="ghost" data-d="-0.1">−10 %</button><b id="nAmt">${amount} 💰</b><button class="ghost" data-d="0.1">+10 %</button></div>
      <p class="note cmsg" id="nMsg">${TX('Haz tu oferta.')}</p>
      ${bottom('<div class="grid2"><button class="cta" id="nOffer">' + TX('Ofertar') + '</button><button class="cta" id="nCounter" hidden>' + TX('Aceptar') + '</button></div>')}`, 'bg_vs');
    $('nPl').appendChild(playerRow(id));
    const upd = () => { $('nAmt').textContent = amount + ' 💰'; };
    body.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { amount = Math.max(5, Math.round(amount * (1 + +b.dataset.d) / 5) * 5); upd(); });
    const done = price => {
      const r = Career.sign(id, price, key); UI.toast(r.msg, 2400);
      if (r.ok) { Sound.sfx('reveal'); renderCareerMarket(tab); } else $('nMsg').textContent = r.msg;
    };
    $('nOffer').onclick = () => {
      if (amount > c.money) { $('nMsg').textContent = TX('No tienes tanto dinero.'); return; }
      const r = Career.offer(key, id, amount);
      if (r.res === 'accept') return done(amount);
      $('nMsg').textContent = r.msg;
      if (r.res === 'counter') { counter = r.price; $('nCounter').hidden = false; $('nCounter').textContent = TX('Aceptar ') + counter + ' 💰'; }
      if (r.res === 'closed' || (r.res === 'reject' && /cierra/.test(r.msg))) { $('nOffer').disabled = true; $('nCounter').hidden = true; }
    };
    $('nCounter').onclick = () => { if (counter > c.money) { $('nMsg').textContent = TX('No tienes tanto dinero.'); return; } const r = Career.offer(key, id, counter); if (r.res === 'accept') done(counter); else $('nMsg').textContent = r.msg; };
    $('nBack').onclick = () => renderCareerMarket(tab);
  }

  /* ---------- Club: mejoras, equipación y escudo ---------- */
  function renderCareerClub(first) {
    const c = Career.data;
    const sw = (k, v) => `<div class="swatches">${KIT_COLORS.map(col => `<button class="sw" data-k="${k}" data-c="${col}" style="background:${col}" aria-pressed="${v === col}"></button>`).join('')}</div>`;
    screen(`${top(first ? TX('Tu club') : TX('Club'), 'back', first ? TX('Listo') : TX('Volver'))}
      <div class="clubpv"><img class="ccrest huge" id="crPv" src="${myCrestUrl()}" alt=""><span id="kitPv"></span><div><b>${esc(c.school)}</b><small>${money(c.money)}</small></div></div>
      <h3>${TX('Equipación')}</h3><p class="note">${TX('Camiseta')}</p>${sw('a', c.kit.a)}<p class="note">${TX('Mangas y pantalón')}</p>${sw('b', c.kit.b)}
      <p class="note">${TX('Diseño')}</p><div class="opts kitdz">${KIT_DESIGNS.map(([d, n]) => `<button data-dz="${d}" aria-pressed="${(c.kit.d || '') === d}">${n}</button>`).join('')}</div>
      <h3>${TX('Escudo')}</h3>
      <div class="opts">${CREST_SHAPES.map(s => `<button data-shape="${s}" aria-pressed="${c.crest.shape === s}">${s[0].toUpperCase() + s.slice(1)}</button>`).join('')}</div>
      <p class="note">${TX('Color de fondo')}</p>${sw('c1', c.crest.c1)}<p class="note">${TX('Color del borde y símbolo')}</p>${sw('c2', c.crest.c2)}
      <div class="opts syms">${[['iniciales', TX('Iniciales')], ...Object.entries(CREST_SYMBOLS)].map(([k, s]) => `<button data-sym="${k}" aria-pressed="${c.crest.sym === k}">${s}</button>`).join('')}</div>
      ${first ? '' : `<h3>${TX('Mejoras del club')}</h3><div class="csquad">${Object.entries(FACILITIES).map(([k, F]) => { const lv = c.fac[k], cost = F.cost[lv];
        return `<div class="cpl fac"><div class="cplb"><b>${F.name}</b> <small>${TX('nivel')} ${lv}/${F.cost.length}</small><span class="cst">${F.desc}</span></div>${cost != null ? `<button class="cta mini" data-up="${k}" ${c.money < cost ? 'disabled' : ''}>${TX('Mejorar ·')} ${cost} 💰</button>` : '<span class="cst">' + TX('Máximo') + '</span>'}</div>`; }).join('')}</div>`}
      ${first ? bottom('<button class="cta" id="cDone">' + TX('¡A jugar!') + '</button>') : ''}`, 'bg_green');
    const ref = Sprites.refOf(PLAYER(c.lineup && c.lineup[2] || c.squad[0].id));
    const drawPv = () => { const k = $('kitPv'); k.innerHTML = ''; k.appendChild(Sprites.kitPreview(ref, c.kit, 2)); $('crPv').src = myCrestUrl(); };
    drawPv();
    body.querySelectorAll('.sw').forEach(b => b.onclick = () => {
      const k = b.dataset.k; if (k === 'a' || k === 'b') c.kit[k] = b.dataset.c; else c.crest[k] = b.dataset.c;
      Career.save(); b.parentNode.querySelectorAll('.sw').forEach(x => x.setAttribute('aria-pressed', x === b)); drawPv();
    });
    body.querySelectorAll('[data-dz]').forEach(b => b.onclick = () => { c.kit.d = b.dataset.dz; Career.save(); body.querySelectorAll('[data-dz]').forEach(x => x.setAttribute('aria-pressed', x === b)); drawPv(); });
    body.querySelectorAll('[data-shape]').forEach(b => b.onclick = () => { c.crest.shape = b.dataset.shape; Career.save(); body.querySelectorAll('[data-shape]').forEach(x => x.setAttribute('aria-pressed', x === b)); drawPv(); });
    body.querySelectorAll('[data-sym]').forEach(b => b.onclick = () => { c.crest.sym = b.dataset.sym; Career.save(); body.querySelectorAll('[data-sym]').forEach(x => x.setAttribute('aria-pressed', x === b)); drawPv(); });
    body.querySelectorAll('[data-up]').forEach(b => b.onclick = () => { const r = Career.upgrade(b.dataset.up); UI.toast(r.msg, 2000); if (r.ok) { Sound.sfx('reveal'); renderCareerClub(); } });
    $('back').onclick = renderCareer;
    if ($('cDone')) $('cDone').onclick = renderCareer;
  }

  /* ---------- Guardar y cargar partidas ---------- */
  const snapshot = () => Cloud.snapshot();
  const restore = o => Cloud.restore(o);
  const slotKey = i => 'inazuma-slot-' + i;
  const reloadGame = (t = TX('Cargando tu partida…')) => { screen(`<div class="title"><img class="logo" src="ui/logo_rogue.png" alt="Inazuma Rogue"><span>${t}</span></div>`, 'bg_title'); setTimeout(() => location.reload(), 350); };
  async function packCode(obj) {
    const json = JSON.stringify(obj);
    try {
      const cs = new CompressionStream('gzip'), w = new Blob([json]).stream().pipeThrough(cs);
      const buf = new Uint8Array(await new Response(w).arrayBuffer());
      let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      return 'IRZ1:' + btoa(s);
    } catch (_) { return 'IRJ1:' + btoa(unescape(encodeURIComponent(json))); }
  }
  async function unpackCode(code) {
    code = code.trim().replace(/\s+/g, '');
    if (code.startsWith('IRJ1:')) return JSON.parse(decodeURIComponent(escape(atob(code.slice(5)))));
    if (!code.startsWith('IRZ1:')) throw new Error('formato');
    const bin = atob(code.slice(5)), buf = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    const ds = new DecompressionStream('gzip'), r = new Blob([buf]).stream().pipeThrough(ds);
    return JSON.parse(await new Response(r).text());
  }
  const describe = o => { const d = Cloud.describe(o || {}); return `${d.players} ${TX('jugadores ·')} ${d.tickets} 🎟️${d.career ? TX(' · Carrera: ') + esc(d.career) : ''}`; };
  const ago = t => { if (!t) return ''; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'ahora mismo' : m < 60 ? 'hace ' + m + ' min' : m < 1440 ? 'hace ' + Math.round(m / 60) + ' h' : new Date(t).toLocaleDateString('es-ES'); };
  // Línea de estado de la cuenta (menú y pantalla de cuenta)
  function cloudLine() {
    if (!Cloud.enabled()) return '';
    const S = Cloud.state;
    if (!Cloud.loggedIn()) return `<p class="cloudst warn">${TX('Invitado · tu partida solo está en este móvil.')} <b>${TX('Crea una cuenta')}</b> ${TX('para no perderla.')}</p>`;
    if (Cloud.expired() || S.status === 'expired') return `<p class="cloudst warn">👤 ${esc(Cloud.user())} ${TX('· sesión caducada:')} <b>${TX('vuelve a entrar')}</b> ${TX('para guardar en la nube.')}</p>`;
    if (S.status === 'conflict') return `<p class="cloudst warn">👤 ${esc(Cloud.user())} ${TX('· hay dos versiones de tu partida:')} <b>${TX('elige cuál conservar')}</b>.</p>`;
    if (S.status === 'offline') return `<p class="cloudst warn">👤 ${esc(Cloud.user())} ${TX('· sin conexión: se guardará en la nube al volver internet.')}</p>`;
    if (S.status === 'error') return `<p class="cloudst warn">👤 ${esc(Cloud.user())} · ${esc(S.msg)}</p>`;
    if (S.status === 'saving') return `<p class="cloudst">👤 ${esc(Cloud.user())} ${TX('· guardando en la nube…')}</p>`;
    return `<p class="cloudst ok">👤 ${esc(Cloud.user())}${Cloud.via() === 'google' ? TX(' (Google)') : ''} ${TX('· ☁️ guardado en la nube')}${S.lastOk ? ' ' + ago(S.lastOk) : ''}</p>`;
  }
  // Refresca la línea de estado si está en pantalla; avisa una vez si aparece un conflicto
  let lastCloudStatus = Cloud.state.status;
  Cloud.onChange(S => {
    document.querySelectorAll('[data-cloudline]').forEach(el => { el.innerHTML = cloudLine(); });
    if (S.status !== lastCloudStatus) {
      if (S.status === 'conflict') UI.toast(TX('Tu partida ha cambiado en otro dispositivo. Elige cuál conservar en 👤 Cuenta.'), 3500);
      else if (S.status === 'expired') UI.toast(TX('Sesión caducada: vuelve a entrar en 👤 Cuenta'), 3000);
    }
    lastCloudStatus = S.status;
  });

  /* ---------- Cuenta: entrar, crear cuenta y estado ---------- */
  function renderAccount(back = renderMenu, mode) {
    if (!Cloud.enabled()) {
      screen(`${top(TX('Cuenta'))}<p class="note">${TX('Las cuentas todavía no están activadas en esta versión del juego. Tu partida se guarda en este móvil.')}</p>
        <button class="ghost" id="aOld">${TX('📦 Traer partida de la versión antigua')}</button>
        <button class="ghost" id="aBackup">${TX('💾 Copias y código de partida')}</button>`, 'bg_green');
      $('aOld').onclick = () => renderTransfer(() => renderAccount(back));
      $('aBackup').onclick = () => renderSaves(() => renderAccount(back));
      $('back').onclick = back; return;
    }
    if (Cloud.state.conflict) return renderConflict(() => renderAccount(back));
    if (!Cloud.loggedIn() || Cloud.expired()) return renderLogin(back, mode || (Cloud.expired() ? 'in' : Profile.data.firstDone ? 'up' : 'in'));
    const S = Cloud.state;
    screen(`${top(TX('Cuenta'))}
      <div data-cloudline>${cloudLine()}</div>
      <p class="note">${TX('Tu partida (plantilla, gacha, Historia, Carrera y la partida en curso) se guarda')} <b>${TX('sola')}</b> ${TX('en la nube cada vez que cambia. En otro móvil u ordenador, entra con tu usuario y contraseña y la tendrás igual.')}</p>
      <div class="grid2"><button class="cta" id="aNow">${TX('☁️ Guardar ahora')}</button><button class="ghost" id="aOut">${TX('Cerrar sesión')}</button></div>
      <p class="note" id="aMsg"></p>
      <details class="adv"><summary>${TX('Opciones avanzadas')}</summary>
        <p class="note">${TX('Copias extra que se quedan solo en este navegador, por si quieres volver a un punto anterior.')}</p>
        <button class="ghost" id="aBackup">${TX('💾 Copias en este móvil')}</button>
      </details>
      <button class="ghost" id="aOld">${TX('📦 Traer partida de la versión antigua')}</button>`, 'bg_green');
    $('aOld').onclick = () => renderTransfer(() => renderAccount(back));
    const msg = t => { $('aMsg').textContent = t; };
    $('aNow').onclick = async () => {
      msg(TX('Guardando…')); if (Career.data) Career.save(); Profile.save(); saveSettings();
      const r = await Cloud.push(true);
      if (r === 'uploaded' || r === 'same') { msg(TX('Guardado en la nube ✓')); Sound.sfx('reveal'); }
      else if (r === 'conflict') renderConflict(() => renderAccount(back));
      else msg(Cloud.state.msg || TX('No se ha podido guardar ahora. Se reintentará solo.'));
    };
    $('aOut').onclick = async () => {
      const b = $('aOut');
      if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = TX('¿Seguro?'); msg(TX('Se guardará tu partida en la nube y este móvil quedará vacío para que pueda entrar otra cuenta. Toca otra vez para confirmar.')); return; }
      msg(TX('Guardando antes de salir…'));
      const r = await Cloud.signOut();
      if (!r.ok) {
        msg(r.msg + TX(' Si sales igualmente, perderás lo que no se haya subido.'));
        b.textContent = TX('Salir igualmente'); b.onclick = async () => { await Cloud.signOut({ force: true }); reloadGame(TX('Sesión cerrada')); };
        return;
      }
      reloadGame(TX('Sesión cerrada'));
    };
    $('aBackup').onclick = () => renderSaves(() => renderAccount(back));
    $('back').onclick = back;
  }
  function renderLogin(back = renderMenu, mode = 'in') {
    const up = mode === 'up', first = !Profile.data.firstDone, expired = Cloud.loggedIn() && Cloud.expired();
    screen(`${top(up ? TX('Crear cuenta') : TX('Iniciar sesión'))}
      <div class="grid2 tabs"><button class="ghost" id="tIn" aria-pressed="${!up}">${TX('Ya tengo cuenta')}</button><button class="ghost" id="tUp" aria-pressed="${up}">${TX('Crear cuenta')}</button></div>
      ${up ? `<p class="note">${TX('Con una cuenta tu partida se guarda en la nube y la recuperas en cualquier móvil u ordenador.')}${Profile.data.firstDone ? ' <b>' + TX('Tu progreso actual se pasará a la cuenta.') + '</b>' : ''}</p>`
        : `<p class="note">${expired ? TX('Tu sesión se ha cerrado. Entra otra vez para seguir guardando en la nube.') : TX('Entra con la misma forma que usaste al crear la cuenta.')}</p>`}
      <button class="gbtn" id="aGoogle" type="button"><svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.2C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z"/><path fill="#FBBC05" d="M10.6 28.5c-.5-1.4-.8-2.9-.8-4.5s.3-3.1.8-4.5l-7.9-6.2C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.2z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.2 1.5-5 2.3-8.2 2.3-6.2 0-11.5-4.1-13.4-9.8l-7.9 6.2C6.6 42.6 14.6 48 24 48z"/></svg>${TX('Continuar con Google')}</button>
      <p class="gsep"><span>${TX('o con usuario y contraseña')}</span></p>
      <form class="aform" id="aForm" autocomplete="on">
        <label>${TX('Usuario')}<input id="aUser" name="username" type="text" maxlength="16" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="${TX('ej.: fran_10')}" value="${expired ? esc(Cloud.user() || '') : ''}"></label>
        <label>${TX('Contraseña')}<input id="aPass" name="password" type="password" maxlength="72" autocomplete="${up ? 'new-password' : 'current-password'}" placeholder="${TX('mínimo 6 caracteres')}"></label>
        ${up ? '<label>' + TX('Repite la contraseña') + '<input id="aPass2" type="password" maxlength="72" autocomplete="new-password"></label>' : ''}
        <label class="showpw"><input type="checkbox" id="aShow"> ${TX('Mostrar contraseña')}</label>
        <button class="cta" id="aGo" type="submit">${up ? TX('Crear cuenta') : TX('Entrar')}</button>
      </form>
      <p class="giftmsg" id="aMsg"></p>
      ${up ? '<p class="note">' + TX('Con usuario y contraseña, apúntala: como no usamos correo,') + ' <b>' + TX('no se puede recuperar') + '</b> ' + TX('si la olvidas. Con Google no hay contraseña que recordar.') + '</p>' : ''}
      <button class="ghost" id="aOld">${TX('📦 ¿Jugabas en la versión antigua? Trae tu partida')}</button>
      ${first ? '<button class="ghost big" id="aGuest">' + TX('Jugar como invitado') + '<small>' + TX('Tu partida solo se guardará en este móvil') + '</small></button>' : ''}`, 'bg_green');
    const form = $('aForm'), m = $('aMsg'), go = $('aGo');
    form.querySelectorAll('input').forEach(i => i.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') back(); }));
    $('aShow').onchange = e => form.querySelectorAll('input[type=password],input[data-pw]').forEach(i => { i.dataset.pw = 1; i.type = e.target.checked ? 'text' : 'password'; });
    $('tIn').onclick = () => renderLogin(back, 'in'); $('tUp').onclick = () => renderLogin(back, 'up');
    const say = (t, ok) => { m.textContent = t; m.className = 'giftmsg ' + (ok ? 'ok' : 'bad'); };
    $('aUser').addEventListener('input', e => { if (up) { const u = Cloud.cleanUser(e.target.value), bad = u && Cloud.checkUser(u); say(bad && u.length >= 3 ? bad : ''); } });
    form.onsubmit = async e => {
      e.preventDefault(); if (go.disabled) return;
      const u = $('aUser').value, p = $('aPass').value;
      if (up && p !== $('aPass2').value) return say(TX('Las contraseñas no coinciden.'));
      go.disabled = true; say(up ? TX('Creando cuenta…') : TX('Entrando…'), true);
      if (Career.data) Career.save(); Profile.save(); saveSettings();
      const r = up ? await Cloud.signUp(u, p) : await Cloud.signIn(u, p);
      if (!r.ok) { go.disabled = false; Sound.sfx('click'); return say(r.msg); }
      say(TX('Comprobando tu partida…'), true);
      afterSync(await Cloud.sync(), back, up ? TX('¡Cuenta creada! Tu partida ya se guarda en la nube.') : TX('¡Hola, ') + Cloud.user() + '!');
    };
    $('aGoogle').onclick = async () => {
      const g = $('aGoogle'); if (g.disabled) return;
      g.disabled = true; say(TX('Abriendo Google…'), true);
      if (Career.data) Career.save(); Profile.save(); saveSettings();
      const r = await Cloud.signInGoogle();
      if (r.redirect) return;   // la página se va a Google y vuelve sola
      if (!r.ok) { g.disabled = false; return say(r.msg || ''); }
      say(TX('Comprobando tu partida…'), true);
      afterSync(await Cloud.sync(), back, TX('¡Hola, ') + Cloud.user() + '!');
    };
    if ($('aGuest')) $('aGuest').onclick = () => { Cloud.chooseGuest(); renderMenu(); };
    $('aOld').onclick = () => renderTransfer(() => renderLogin(back, mode));
    $('back').onclick = back;
    if (Controls.pc()) $('aUser').focus();
  }
  // Qué hacer tras sincronizar
  function afterSync(r, next, hello) {
    if (r === 'downloaded') return reloadGame(TX('Cargando tu partida de la nube…'));
    if (r === 'conflict') return renderConflict(next);
    if (hello) UI.toast(hello, 2500);
    if (r === 'offline') UI.toast(TX('Sin conexión: tu partida se subirá cuando vuelva internet'), 3000);
    if (r === 'error') UI.toast(Cloud.state.msg || TX('Error con la nube; se reintentará'), 3000);
    Sound.sfx('reveal'); next();
  }
  // Dos versiones distintas: el jugador elige; la otra se guarda como copia en este móvil por si acaso
  function renderConflict(next = renderMenu) {
    const C = Cloud.state.conflict; if (!C) return next();
    const card = (id, title, d, when, cls) => `<button class="cpl conf ${cls}" id="${id}"><span class="cplb"><b>${title}</b>
      <span class="cst">${when}</span>
      <span class="cst">👥 <b>${d.players}</b> ${TX('jugadores · 🎟️')} ${d.tickets} · 🪙 ${d.coins}</span>
      <span class="cst">${TX('Victorias:')} ${d.wins} ${TX('· Etapas completadas:')} ${d.etapas}</span>
      ${d.career ? `<span class="cst">${TX('Carrera:')} ${esc(d.career)}</span>` : ''}</span></button>`;
    screen(`<div class="top"><h2>${TX('¿Qué partida conservas?')}</h2></div>
      <p class="note">${TX('Tu cuenta')} <b>${esc(Cloud.user())}</b> ${TX('tiene una partida en la nube distinta de la de este móvil. Elige con cuál sigues. La otra se guarda como copia en este móvil (Cuenta → Opciones avanzadas), así que no se pierde.')}</p>
      ${card('cCloud', TX('☁️ La de la nube'), C.cloudInfo, C.cloudDate ? TX('Guardada el ') + new Date(C.cloudDate).toLocaleString('es-ES') : '', '')}
      ${card('cLocal', TX('📱 La de este móvil'), C.localInfo, TX('La que tienes ahora aquí'), '')}
      <p class="note" id="cMsg"></p>`, 'bg_green');
    const keepCopy = (data, label) => { try { localStorage.setItem(slotKey(3), JSON.stringify({ date: Date.now(), data, label })); } catch (_) {} };
    $('cCloud').onclick = async () => { keepCopy(C.local, TX('Copia del móvil')); await Cloud.resolve('cloud'); reloadGame(TX('Cargando tu partida de la nube…')); };
    $('cLocal').onclick = async () => {
      keepCopy(C.cloud.data, TX('Copia de la nube')); $('cMsg').textContent = TX('Subiendo la partida de este móvil…');
      const r = await Cloud.resolve('local');
      if (r === 'uploaded' || r === 'same') { UI.toast(TX('Guardada en la nube ✓'), 2000); next(); }
      else if (r === 'conflict') renderConflict(next);
      else { $('cMsg').textContent = (Cloud.state.msg || TX('No se ha podido subir')) + TX(' Se reintentará más tarde.'); setTimeout(next, 1800); }
    };
  }

  function renderSaves(back = renderMenu) {
    const slots = [1, 2, 3].map(i => { try { return JSON.parse(localStorage.getItem(slotKey(i)) || 'null'); } catch (_) { return null; } });
    screen(`${top(TX('Copias en este móvil'))}
      <p class="note">${TX('Copias que se quedan')} <b>${TX('solo en este navegador')}</b>${TX(', para volver a un punto anterior.')} ${Cloud.enabled() ? TX('Para llevar tu partida a otro dispositivo usa tu') + ' <b>' + TX('cuenta') + '</b>.' : ''}</p>
      <div class="csquad">${slots.map((s, i) => `<div class="cpl fac"><div class="cplb"><b>${TX('Ranura')} ${i + 1}${s && s.label ? ' · ' + esc(s.label) : ''}</b><span class="cst">${s ? new Date(s.date).toLocaleString('es-ES') + ' · ' + describe(s.data) : TX('Vacía')}</span></div>
        <span class="row2"><button class="cta mini" data-save="${i + 1}">${TX('Guardar')}</button>${s ? `<button class="ghost mini" data-load="${i + 1}">${TX('Cargar')}</button>` : ''}</span></div>`).join('')}</div>
      <details class="adv"><summary>${TX('Código de partida (sin cuenta)')}</summary>
      <button class="ghost" id="sExport">${TX('📤 Sacar código de mi partida')}</button>
      <textarea id="sCode" rows="4" placeholder="${TX('Pega aquí un código de partida para cargarlo')}" spellcheck="false"></textarea>
      <div class="grid2"><button class="ghost" id="sCopy">${TX('Copiar')}</button><button class="cta" id="sImport">${TX('📥 Cargar este código')}</button></div>
      <button class="ghost" id="sLink">${TX('🔗 Copiar enlace de transferencia')}<small>${TX('Ábrelo en el otro dispositivo y se carga solo')}</small></button></details>
      <p class="note" id="sMsg"></p>`, 'bg_green');
    const msg = t => { $('sMsg').textContent = t; };
    const ta = $('sCode'); ta.addEventListener('keydown', e => e.stopPropagation());
    body.querySelectorAll('[data-save]').forEach(b => b.onclick = () => {
      if (Career.data) Career.save(); Profile.save(); saveSettings();
      try { localStorage.setItem(slotKey(b.dataset.save), JSON.stringify({ date: Date.now(), data: snapshot() })); UI.toast(TX('Partida guardada en la ranura ') + b.dataset.save); Sound.sfx('reveal'); renderSaves(back); }
      catch (_) { msg(TX('No se ha podido guardar (el navegador no deja más espacio).')); }
    });
    // Cargar una copia: se escribe como cambio normal, así con cuenta también se sube a la nube
    const load = o => { SAVE_KEYS.forEach(k => { try { if (o[k] != null) localStorage.setItem(k, o[k]); else localStorage.removeItem(k); } catch (_) {} }); Cloud.push(true).finally(() => reloadGame()); };
    body.querySelectorAll('[data-load]').forEach(b => b.onclick = () => {
      if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = TX('¿Seguro?'); msg(TX('Cargar sustituye tu partida actual. Toca otra vez para confirmar.')); return; }
      msg(TX('Cargando…')); load(slots[+b.dataset.load - 1].data);
    });
    $('sExport').onclick = async () => { ta.value = await packCode(snapshot()); ta.select(); msg(TX('Código creado: cópialo y guárdalo (por ejemplo en tus notas). Para cargarlo, pégalo aquí en el otro dispositivo.')); };
    $('sCopy').onclick = async () => { ta.select(); try { await navigator.clipboard.writeText(ta.value); msg('Copiado.'); } catch (_) { try { document.execCommand('copy'); msg('Copiado.'); } catch (__) { msg(TX('Selecciónalo y cópialo a mano.')); } } };
    $('sLink').onclick = async () => {
      if (Career.data) Career.save(); Profile.save(); saveSettings();
      const link = location.origin + location.pathname + '#partida=' + encodeURIComponent(await packCode(snapshot()));
      ta.value = link;
      try { await navigator.clipboard.writeText(link); msg(TX('Enlace copiado. Mándatelo (WhatsApp, notas…) y ábrelo en el otro dispositivo.')); }
      catch (_) { ta.select(); msg(TX('Copia el enlace del recuadro y ábrelo en el otro dispositivo.')); }
    };
    $('sImport').onclick = async () => {
      if (!ta.value.trim()) return msg(TX('Pega primero un código.'));
      const rr = await readCode(ta.value); if (rr.error) return msg(rr.error.replace(/<[^>]+>/g, ''));
      const o = rr.data;
      msg(TX('¡Partida cargada! Reiniciando…')); load(o);
    };
    $('back').onclick = back;
  }

  /* ---------- Traer la partida de la versión antigua (u otro dispositivo sin cuenta) ---------- */
  const OLD_URL = 'https://claude.ai/artifact/J4Hbvgaj1rHQC3mtFDSL2C';
  // Busca el código dentro de lo que pegue el jugador (vale con texto de más, saltos de línea o un enlace #partida=)
  // Devuelve posibles códigos, del más largo al más corto (por si se pegó texto justo detrás)
  function findCodes(txt) {
    const raw = String(txt || '');
    let m = raw.replace(/\s+/g, '').match(/#partida=([^&]+)/);
    if (m) { try { return [decodeURIComponent(m[1])]; } catch (_) { return [m[1]]; } }
    m = raw.match(/IR[ZJ]1:[A-Za-z0-9+/=\s]+/); if (!m) return [];
    const parts = m[0].trim().split(/\s+/), out = [];
    for (let k = parts.length; k >= 1 && out.length < 6; k--) out.push(parts.slice(0, k).join(''));
    return out;
  }
  const findCode = txt => findCodes(txt)[0] || '';
  async function readCode(txt) {
    const cs = findCodes(txt);
    if (!cs.length) return { error: TX('No encuentro ningún código. Tiene que empezar por') + ' <b>' + 'IRZ1:' + '</b> ' + TX('y es un texto largo.') };
    let o = null;
    for (const c of cs) { try { o = await unpackCode(c); break; } catch (_) {} }
    if (!o) return { error: TX('El código está') + ' <b>' + TX('incompleto o roto') + '</b>' + TX('. Vuelve a la versión antigua, toca «Copiar» y pégalo entero.') };
    if (!o['inazuma-perfil'] && !o['inazuma-carrera']) return { error: TX('Ese código no tiene ninguna partida dentro.') };
    return { data: o };
  }
  function renderTransfer(back = renderMenu, preset = '') {
    const sync = Cloud.enabled();
    screen(`${top(TX('Traer mi partida'))}
      <p class="note">${TX('Si jugabas en la')} <b>${TX('versión antigua')}</b> ${TX('del juego (o en otro móvil sin cuenta), sigue estos pasos para traer tu partida aquí.')}</p>
      <ol class="steps">
        <li><b>${TX('Abre la versión antigua')}</b> ${TX('con este botón.')}<a class="ghost linkbtn" id="tOpen" href="${OLD_URL}" target="_blank" rel="noopener">${TX('🔗 Abrir la versión antigua')}</a></li>
        <li>${TX('Allí toca')} <b>${TX('💾 Guardar / cargar')}</b> → <b>${TX('📤 Sacar código de mi partida')}</b> → <b>${TX('Copiar')}</b>.</li>
        <li>${TX('Vuelve a esta pestaña y toca')} <b>${TX('📋 Pegar')}</b> ${TX('(o mantén el dedo en el recuadro y elige «Pegar»).')}</li>
        <li>${TX('Revisa que es tu partida y toca')} <b>${TX('Cargar')}</b>.${sync ? TX(' Después crea tu cuenta para no tener que hacer esto nunca más.') : ''}</li>
      </ol>
      <textarea id="tCode" rows="4" placeholder="${TX('Pega aquí el código (empieza por IRZ1:)')}" spellcheck="false" autocapitalize="off" autocorrect="off"></textarea>
      <div class="grid2"><button class="ghost" id="tPaste">${TX('📋 Pegar')}</button><button class="cta" id="tCheck">${TX('Comprobar')}</button></div>
      <div id="tOut"></div>
      ${Profile.data.firstDone ? '<p class="note">' + TX('⚠️ Cargar sustituye la partida que tienes ahora en este dispositivo.') + '</p>' : ''}`, 'bg_green');
    const ta = $('tCode'), out = $('tOut');
    ta.addEventListener('keydown', e => e.stopPropagation());
    if (preset) ta.value = preset;
    const check = async () => {
      if (!ta.value.trim()) { out.innerHTML = '<p class="giftmsg bad">' + TX('Primero pega el código.') + '</p>'; return; }
      out.innerHTML = '<p class="giftmsg ok">' + TX('Leyendo el código…') + '</p>';
      const r = await readCode(ta.value);
      if (r.error) { out.innerHTML = `<p class="giftmsg bad">${r.error}</p>`; Sound.sfx('click'); return; }
      const d = Cloud.describe(r.data);
      out.innerHTML = `<div class="cpl conf"><span class="cplb"><b>${TX('✅ Partida encontrada')}</b>
        <span class="cst">👥 <b>${d.players}</b> ${TX('jugadores · 🎟️')} ${d.tickets} · 🪙 ${d.coins}</span>
        <span class="cst">${TX('Victorias:')} ${d.wins} ${TX('· Etapas completadas:')} ${d.etapas}</span>
        ${d.career ? `<span class="cst">${TX('Carrera:')} ${esc(d.career)}</span>` : ''}</span></div>
        <button class="cta" id="tLoad">${TX('📥 Cargar esta partida')}</button>`;
      Sound.sfx('reveal');
      $('tLoad').onclick = async () => {
        $('tLoad').disabled = true;
        // Copia de seguridad de lo que había, por si acaso
        if (Profile.data.firstDone) { try { localStorage.setItem(slotKey(3), JSON.stringify({ date: Date.now(), data: snapshot(), label: TX('Antes de traer la partida') })); } catch (_) {} }
        SAVE_KEYS.forEach(k => { try { if (r.data[k] != null) localStorage.setItem(k, r.data[k]); else if (k !== 'inazuma-ajustes' && k !== 'inazuma-sonido') localStorage.removeItem(k); } catch (_) {} });
        try { localStorage.setItem('inazuma-traida', '1'); } catch (_) {}
        if (Cloud.loggedIn()) { await Cloud.push(true); }
        reloadGame(TX('¡Partida traída! Cargando…'));
      };
    };
    $('tPaste').onclick = async () => {
      try { const t = await navigator.clipboard.readText(); if (t) { ta.value = t; check(); return; } } catch (_) {}
      ta.focus(); out.innerHTML = '<p class="giftmsg bad">' + TX('Tu navegador no deja pegar con el botón: mantén el dedo en el recuadro y elige «Pegar».') + '</p>';
    };
    ta.addEventListener('paste', () => setTimeout(check, 50));
    $('tCheck').onclick = check;
    $('back').onclick = back;
    if (preset) check();
  }
  // Enlace de transferencia: …/juego/#partida=IRZ1:… abre esta pantalla con el código puesto
  function hashCode() {
    const h = location.hash || ''; if (!/^#partida=/.test(h)) return '';
    try { history.replaceState(null, '', location.pathname + location.search); } catch (_) {}
    return findCode(h);
  }

  /* ---------- Códigos de regalo ---------- */
  /* ---------- Teclas «A tu gusto» (Ajustes): cada acción con la tecla que quieras ---------- */
  const KEY_ACTIONS = [['up', TX('Arriba')], ['down', TX('Abajo')], ['left', TX('Izquierda')], ['right', TX('Derecha')], ['sprint', TX('Esprint')],
    ['pass', TX('Pase / entrada')], ['shoot', TX('Tiro / despeje')], ['switch', TX('Cambiar de jugador')], ['through', TX('Saque largo (portero)')],
    ['dribble', TX('Regate')], ['tech', TX('Supertécnica')], ['techNext', TX('Cambiar técnica')], ['pause', TX('Pausa')]];
  // Teclas repetidas (Tiro y Cambiar de jugador sí pueden ir juntas: con balón chuta y sin balón cambia)
  function keyDups(k) {
    const by = {}; KEY_ACTIONS.forEach(([a]) => (by[k[a]] = by[k[a]] || []).push(a));
    const dup = new Set();
    for (const l of Object.values(by)) if (l.length > 1 && !(l.length === 2 && l.includes('shoot') && l.includes('switch'))) l.forEach(a => dup.add(a));
    return dup;
  }
  function keyMapHtml() {
    const k = Input.customKeys(), dup = keyDups(k);
    return `<p class="note">${TX('Toca una acción y pulsa la tecla que quieras (Esc cancela).')}</p>
      <div class="kmap">${KEY_ACTIONS.map(([a, n]) => `<button class="kbtn${dup.has(a) ? ' dup' : ''}" data-kact="${a}"><span>${n}</span><b>${esc(Input.keyName(k[a]))}</b></button>`).join('')}</div>
      ${dup.size ? `<p class="note kdup">${TX('Hay teclas repetidas (en rojo): cámbialas para que cada una haga una sola cosa.')}</p>` : ''}
      <button class="ghost" id="kReset">${TX('Volver a las de serie')}</button>`;
  }
  function bindKeyMap() {
    if (!$('kReset')) return;
    const redo = () => { const y = $('screen').scrollTop; renderSettings(); $('screen').scrollTop = y; };
    body.querySelectorAll('[data-kact]').forEach(b => b.onclick = () => {
      body.querySelectorAll('.kbtn.wait').forEach(x => x.classList.remove('wait'));
      b.classList.add('wait'); b.querySelector('b').textContent = TX('Pulsa una tecla…'); Sound.sfx('click');
      Input.capture(e => {
        if (e.code !== 'Escape' && e.code) {
          settings.keyMap = Object.assign({}, settings.keyMap, { [b.dataset.kact]: e.code });
          if (e.key && e.key.length === 1 && e.key !== ' ') settings.keyLabels = Object.assign({}, settings.keyLabels, { [e.code]: e.key.toUpperCase() });
          saveSettings(); Sound.sfx('click');
        }
        redo();
      });
    });
    $('kReset').onclick = () => { settings.keyMap = null; settings.keyLabels = null; saveSettings(); Sound.sfx('click'); UI.toast(TX('Teclas como de serie')); redo(); };
  }

  /* ---------- Guía de controles (móvil, ordenador y mando) ---------- */
  let guideTab = null;
  function renderControlsGuide(back = renderMenu) {
    const pad = [...(navigator.getGamepads ? navigator.getGamepads() : [])].some(Boolean);
    const tab = guideTab || (pad ? 'mando' : Controls.pc() ? 'pc' : 'movil'), clas = settings.keys === 'clasicas';
    const row = (k, a, b) => `<tr><td><b>${k}</b></td><td>${a}</td><td>${b}</td></tr>`;
    const table = rows => `<table class="gtable"><tr><th></th><th>${TX('Con balón')}</th><th>${TX('Sin balón')}</th></tr>${rows}</table>`;
    const T = {
      movil: `<p class="note">${TX('El joystick aparece donde pongas el dedo en la mitad izquierda de la pantalla. Para esprintar, lleva el dedo más allá del aro (se pone naranja). Los botones de la derecha cambian según tu equipo tenga el balón o no.')}</p>
        ${table(row(TX('Joystick'), TX('mover y apuntar'), TX('mover')) + row(TX('Tiro'), TX('mantén para cargar, suelta para chutar (un toque = tiro rápido)'), '—') +
          row(TX('Pase'), TX('toque = pase · mantén = pase fuerte'), '—') + row(TX('Entrada'), '—', TX('robar el balón')) +
          row(TX('Regate'), TX('recorte rápido sin técnica'), '—') + row(TX('Cambiar'), '—', TX('al compañero que antes llega al balón (pulsa otra vez para el siguiente)')) +
          row(TX('Técnica'), TX('supertécnica de tiro o regate'), TX('supertécnica de bloqueo')) + row('⇄', TX('elegir otra supertécnica'), TX('elegir otra supertécnica')))}
        <p class="note">${TX('Con el portero: Despeje (suelta) manda el balón lejos, Pase y Saque largo.')}</p>`,
      pc: settings.keys === 'custom' ? (() => { const k = Input.customKeys(), n = c => esc(Input.keyName(c));
        return `<p class="note">${TX('Tienes tus teclas «A tu gusto» (puedes cambiarlas en Ajustes → Controles).')}</p>
        ${table(row([k.up, k.left, k.down, k.right].map(n).join(' '), TX('mover y apuntar'), TX('mover')) + row(n(k.sprint), TX('esprint'), TX('esprint')) +
          row(n(k.shoot), TX('tiro (mantén para cargar)'), k.switch === k.shoot ? TX('cambiar de jugador') : '—') + row(n(k.pass), TX('pase (mantén = fuerte)'), TX('entrada')) +
          row(n(k.dribble), TX('regate'), '—') + (k.switch !== k.shoot ? row(n(k.switch), '—', TX('cambiar de jugador')) : '') +
          row(n(k.tech), TX('supertécnica'), TX('supertécnica')) + row(n(k.techNext), TX('elegir otra supertécnica'), TX('elegir otra supertécnica')) + row(n(k.pause) + ' / Esc', TX('pausa'), TX('pausa')))}
        <p class="note">${TX('Portero con balón: {0} pase · {1} saque largo · {2} despeje.', n(k.pass), n(k.through), n(k.shoot))}</p>`; })() : `<p class="note">${clas ? TX('Tienes las teclas clásicas (puedes cambiarlas en Ajustes → Controles).') : TX('Tienes las teclas nuevas (puedes cambiarlas en Ajustes → Controles).')}</p>
        ${table(row('WASD / ' + TX('flechas'), TX('mover y apuntar'), TX('mover')) + row('Shift', TX('esprint'), TX('esprint')) +
          row(clas ? 'L / X' : 'K / X', TX('tiro (mantén para cargar)'), clas ? '—' : TX('cambiar de jugador')) + row('J / Z', TX('pase (mantén = fuerte)'), TX('entrada')) +
          row('I / V', TX('regate'), '—') + (clas ? row('Q', '—', TX('cambiar de jugador')) : '') +
          row(TX('Espacio'), TX('supertécnica'), TX('supertécnica')) + row(clas ? 'U' : 'E', TX('elegir otra supertécnica'), TX('elegir otra supertécnica')) + row('P / Esc', TX('pausa'), TX('pausa')))}
        <p class="note">${clas ? TX('Portero con balón: J pase · K saque largo · L despeje.') : TX('Portero con balón: J pase · L saque largo · K despeje.')}</p>`,
      mando: `<p class="note">${TX('Funciona con mandos de Xbox, PlayStation y la mayoría de genéricos: conéctalo (por cable o Bluetooth) y pulsa un botón.')}</p>
        ${table(row(TX('Stick / cruceta'), TX('mover y apuntar'), TX('mover')) + row('RT / R2', TX('esprint'), TX('esprint')) + row('X / ▢', TX('tiro (mantén para cargar)'), '—') +
          row('A / ✕', TX('pase (mantén = fuerte)'), TX('entrada')) + row('RB / R1', TX('regate'), '—') +
          row('LB / L1', '—', TX('cambiar de jugador')) + row('Y / △', TX('supertécnica'), TX('supertécnica')) + row('LT / L2', TX('elegir otra supertécnica'), TX('elegir otra supertécnica')) +
          row('Start', TX('pausa'), TX('pausa')))}`,
    };
    screen(`${top('🎮 ' + TX('Controles'))}
      <div class="opts" id="gTabs">${[['movil', TX('📱 Móvil')], ['pc', TX('⌨️ Ordenador')], ['mando', TX('🎮 Mando')]].map(([k, n]) => `<button data-gtab="${k}" aria-pressed="${k === tab}">${n}</button>`).join('')}</div>
      ${T[tab]}
      <h3>${TX('Trucos')}</h3>
      <ul class="gtips"><li>${TX('Pulsa Pase o Tiro un poco antes de que te llegue el balón: pasarás o chutarás al primer toque.')}</li>
        <li>${TX('Tiro cargado a tope (barra llena) = tiro mucho más fuerte.')}</li>
        <li>${TX('Las supertécnicas tienen recarga: el botón se va llenando hasta que vuelve a estar lista.')}</li>
        <li>${TX('En Ajustes puedes poner las supertécnicas automáticas y quitar el cambio automático de jugador.')}</li></ul>`, 'bg_green');
    body.querySelectorAll('[data-gtab]').forEach(b => b.onclick = () => { guideTab = b.dataset.gtab; renderControlsGuide(back); });
    $('back').onclick = back;
  }
  /* ---------- Novedades: notas de cada actualización (las más nuevas arriba) ---------- */
  const NEWS = [
    { v: '0.31.10', date: '23/10/2026', items: [
      TX('∞ Infinito: al ganar a cada jefe eliges 1 de 3 versiones especiales de jugadores que no salen en el gacha (del 2, del 3…). Cuanto más lejos llegues, más raras. Llevan su propio marco ∞.'),
      TX('Porteros: salen a por el que entra con el balón en el área, y ya no se puede entrar andando con el balón en la portería. Para marcar, hay que chutar.')] },
    { v: '0.31.9', date: '23/10/2026', items: [
      TX('👕 ¡Crea tu equipación! En Plantilla → Mi equipo eliges los colores y el diseño (rayas, mitades, banda, cuadros…). En la Carrera también hay diseños nuevos.'),
      TX('🎨 Muñecos del Inazuma 3 arreglados: todos llevan su muñeco de verdad, sacado del juego original (peinado, colores y tono de piel), y ahora cambian a los colores de su equipo.'),
      TX('Plantilla: en Jugadores ves la nota y el elemento de cada uno, y en Mi equipo el elemento de cada jugador en el campo.'),
      TX('Equipos especiales: cada equipo da un jugador distinto (ya no se repite el premio).'),
      TX('Arreglado: ya no se puede salir por la línea de fondo con el balón para rodear al portero. Si cruzas una línea con el balón, es fuera.')] },
    { v: '0.31.8', date: '22/10/2026', items: [
      TX('💬 ¡Ya tenemos Discord! Entra desde el botón del menú.'),
      TX('Móvil: joystick más grande y con zona muerta; ya no esprintas sin querer (para esprintar, lleva el dedo más allá del aro).'),
      TX('Móvil: botones más grandes y en arco alrededor de Tiro; nueva opción de tamaño en Ajustes.'),
      TX('Se quita el pase al hueco (móvil, teclado y mando): estorbaba. El portero sigue sacando en largo.'),
      TX('Al perder el balón, un toque en Pase ya no te cambia de jugador sin querer.'),
      TX('Cambiar de jugador te lleva al compañero que antes llega al balón; si vuelves a pulsar, al siguiente.')] },
    { v: '0.31.7', date: '22/10/2026', items: [
      TX('Las supertécnicas del Inazuma 3 ya salen en español (antes estaban en inglés) y se han añadido algunas que faltaban.')] },
    { v: '0.31.6', date: '22/10/2026', items: [
      TX('Ordenador: nuevas teclas «A tu gusto» en Ajustes → Controles. Elige la tecla de cada acción, también para moverte.'),
      TX('Nube: la partida se guarda comprimida (ocupa unas 8 veces menos) y se sube al acabar cada partido, al salir del juego y, mientras juegas, cada 5 minutos. Así el servidor aguanta a muchos más jugadores.')] },
    { v: '0.31.5', date: '22/10/2026', items: [
      TX('Controles: si pulsas Pase o Tiro justo antes de recibir el balón, ahora pasas o chutas al primer toque (antes hacías una entrada sin querer).'),
      TX('Pase ya no hace entradas a tus propios compañeros.'),
      TX('Supertécnicas más espectaculares: unas 70 técnicas tienen ahora su propia animación (tiros, paradas, regates y bloqueos).'),
      TX('Nueva guía de controles (móvil, ordenador y mando) en Pausa y en Ajustes.'),
      TX('Roguelite: el partido se acaba si un equipo gana por 5 goles de diferencia.'),
      TX('Las técnicas que ganas tras cada partido ahora encajan con la posición del jugador (un portero ya no recibe técnicas de tiro).'),
      TX('Muñecos del Inazuma 3 arreglados: muchos tenían el muñeco de otro jugador (p. ej. Partinus salía con el pelo marrón).'),
      TX('Nuevo apartado de Novedades (este).')] },
    { v: '0.31.4', date: '21/10/2026', items: [
      TX('Ordenador: en Ajustes puedes elegir las teclas nuevas (K tiro) o las clásicas (L tiro), como antes.')] },
    { v: '0.31.3', date: '21/10/2026', items: [
      TX('Guardado en la nube arreglado: ¡erais tantos que reventasteis el servidor! Ahora la partida se sube como mucho una vez por minuto y al salir del juego.'),
      TX('Si la nube está saturada, tu partida sigue a salvo en tu dispositivo y se sube más tarde sola.')] },
    { v: '0.31.2', date: '21/10/2026', items: [
      TX('Móvil: los botones ya no se «comen» los toques (antes a veces no chutaba ni pasaba).'),
      TX('Ordenador: teclas más cómodas (J/Z pase, K/X tiro, L/C profundidad, I/V regate, E cambiar técnica) y aviso de que se puede jugar con mando.')] },
    { v: '0.31.0', date: '', items: [TX('El juego, traducido al inglés (cámbialo en Ajustes).')] },
  ];
  function renderNews(back = renderMenu) {
    settings.seenNews = VERSION; settings.aviso = AVISO.key; saveSettings();   // las Novedades ya cuentan lo del aviso
    screen(`${top(TX('📰 Novedades'))}
      ${NEWS.map((n, i) => `<div class="newsv${i === 0 ? ' last' : ''}"><h3>v${n.v}${n.date ? ` <small>${n.date}</small>` : ''}${i === 0 ? ` <span class="newtag">${TX('¡NUEVO!')}</span>` : ''}</h3>
        <ul>${n.items.map(t => `<li>${t}</li>`).join('')}</ul></div>`).join('')}
      ${bottom(`<button class="cta" id="newsOk">${TX('¡A jugar!')}</button>`)}`, 'bg_title');
    $('back').onclick = back; $('newsOk').onclick = back;
  }
  function renderGift() {
    const P = Profile.data, used = Object.entries(P.codes || {}).sort((x, y) => y[1] - x[1]);
    screen(`${top(TX('Código de regalo'))}${wallet()}
      <p class="note">${TX('Escribe un código para recibir su premio. Cada código se puede canjear una vez.')}</p>
      <div class="giftin"><input id="gcode" type="text" maxlength="32" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="${TX('CÓDIGO')}"><button class="cta" id="gok">${TX('Canjear')}</button></div>
      <p class="giftmsg" id="gmsg"></p>
      ${(P.giftPicks || []).map((g, i) => `<h3>🎁 ${esc(g.code)} · ${TX('Elige a tu jugador')}</h3><p class="note">${esc(g.desc)}</p><div class="hwpick" data-gp="${i}"></div>`).join('')}
      ${used.length ? `<h3>${TX('Canjeados')}</h3><p class="note">${used.map(([k, t]) => `<b>${esc(k)}</b> · ${new Date(t).toLocaleDateString('es-ES')}`).join('<br>')}</p>` : ''}`, 'bg_green');
    document.querySelectorAll('[data-gp]').forEach(box => {
      const i = +box.dataset.gp;
      P.giftPicks[i].opts.forEach(id => {
        const pd = PLAYER(id); if (!pd) return;
        const b = document.createElement('button'); b.className = 'hwpk';
        b.appendChild(face(Sprites.refOf(pd), 72));
        b.insertAdjacentHTML('beforeend', `<b>${esc(pd.name)}</b><small>${rchip(pd.rarity)} ${RAB(pd.role)} ${chip(pd.elem)}</small>${P.coll[id] ? `<small>${TX('ya lo tienes (+1 ★)')}</small>` : ''}`);
        b.onclick = () => { const r = Profile.takePick(i, id); if (!r) return; Sound.sfx('reveal'); renderReveal([r], renderGift, TX('¡Código canjeado!')); };
        box.appendChild(b);
      });
    });
    const inp = $('gcode');
    const go = () => {
      const r = Profile.redeem(inp.value), m = $('gmsg');
      m.textContent = r.msg; m.className = 'giftmsg ' + (r.ok ? 'ok' : 'bad');
      if (r.ok) { Sound.sfx('reveal'); UI.toast(r.msg, 2200); setTimeout(renderGift, 1400); } else Sound.sfx('click');
    };
    $('gok').onclick = go;
    inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') go(); if (e.key === 'Escape') renderMenu(); });
    $('back').onclick = renderMenu;
    if (Controls.pc()) inp.focus();
  }

  /* ---------- Sonido ---------- */
  function renderSettings() {
    const c = Sound.cfg;
    const keys = Object.keys(TRACKS);
    const ROLE_NAMES = { menu: TX('Menús'), intro: TX('Intro'), match: TX('Partido rápido'), match_easy: TX('Etapa 1 · inicio'), match_mid: TX('Etapa 1 · mitad'), match_hard: TX('Etapa 1 · recta final'),
      match_final: TX('Etapa 1 · final y jefes'), s2_easy: TX('Etapa 2 · inicio'), s2_mid: TX('Etapa 2 · mitad'), s2_hard: TX('Etapa 2 · recta final'), s2_final: TX('Etapa 2 · final y jefes'),
      match_special: TX('Equipos especiales'), goal: TX('Gol'), win: TX('Victoria'), lose: TX('Derrota') };
    // Desplegable con las pistas agrupadas como en el juego
    const grouped = jingles => TRACK_GROUPS.filter(g => (g === 'Jingles') === jingles).map(g => `<optgroup label="${g}">${keys.filter(k => TRACKS[k].group === g)
      .map(k => `<option value="${k}">${TRACKS[k].name}</option>`).join('')}</optgroup>`).join('');
    const sel = (role, jingles, extra = []) => `<div class="group"><label>${ROLE_NAMES[role]}</label>
      <select data-role="${role}">${extra.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}${grouped(jingles)}</select></div>`;
    const rnd = [['random', TX('Aleatorio (temas de partido)')]], none = [['', TX('Ninguno')]];
    screen(`${top(TX('Ajustes'))}
      <div class="group"><label>${TX('🌐 Idioma · Language')}</label><div class="opts">${Object.entries(I18N.LANGS).map(([k, n]) => `<button data-lang="${k}" aria-pressed="${I18N.lang === k}">${n}</button>`).join('')}</div></div>
      <h3>${TX('Partido')}</h3>
      ${opts(TX('Duración del partido'), 'minutes', [[2, TX('2 min')], [3, TX('3 min')], [5, TX('5 min')]])}
      ${opts(TX('Supertécnicas'), 'techMode', [['boton', TX('Con botón')], ['auto', TX('Automáticas')]])}
      ${opts(TX('Cámara lenta en supertécnicas'), 'slowmo', [[1, TX('Sí')], [0, TX('No')]])}
      ${opts(TX('Cambio automático de jugador'), 'autoSwitch', [[1, TX('Sí')], [0, TX('No')]])}
      <h3>${TX('Controles')}</h3>
      ${opts(TX('Botones en pantalla'), 'controls', [['auto', TX('Auto')], ['tactil', TX('Siempre')], ['teclado', TX('Nunca (PC)')]])}
      ${opts(TX('Tamaño de los botones (móvil)'), 'padSize', [['pequeno', TX('Pequeños')], ['normal', TX('Normales')], ['grande', TX('Grandes')]], Object.assign({ padSize: 'normal' }, settings))}
      ${opts(TX('Teclas del ordenador'), 'keys', [['nuevas', TX('Nuevas (K tiro)')], ['clasicas', TX('Clásicas (L tiro)')], ['custom', TX('A tu gusto')]], Object.assign({ keys: 'nuevas' }, settings))}
      ${settings.keys === 'custom' ? keyMapHtml() : ''}
      <button class="ghost" id="sGuide">${TX('🎮 Guía de controles')}</button>
      <p class="keys"><b>${TX('Mando:')}</b> ${TX('stick o cruceta para moverte · RT esprint · A pase (mantén = fuerte) / entrada · X tiro (mantén) · B saque largo (portero) · Y supertécnica · LT cambiar técnica · RB regate · LB cambiar jugador · Start pausa.')}<br>
      <b>${TX('Móvil:')}</b> ${TX('joystick a la izquierda (más allá del aro = esprint). Mantén Pase para un pase fuerte y usa Regate para un recorte rápido sin técnica. Cambiar te pasa al compañero que antes llega al balón (también cambia solo al ir a por el balón).')}<br>
      <b>${TX('PC:')}</b> ${settings.keys === 'custom' ? TX('tus teclas están justo encima (Esc también pausa).') : settings.keys === 'clasicas' ? TX('WASD o flechas para moverte · Shift esprint · J o Z: pase (mantén = fuerte) / entrada · K o C: saque largo (portero) · L o X: tiro (mantén) / despeje · I o V: regate · Q: cambiar jugador · Espacio: supertécnica · U: cambiar técnica · P o Esc: pausa') : TX('WASD o flechas para moverte · Shift esprint · J o Z: pase (mantén = fuerte) / entrada · K o X: tiro (mantén) / cambiar jugador · L o C: saque largo (portero) · I o V: regate · Espacio: supertécnica · E: cambiar técnica · P o Esc: pausa')}</p>
      <h3>${TX('Sonido')}</h3>
      <div class="mixer"><label>${TX('🎵 Música')} <b id="mvT">${Math.round((c.music ? c.mv ?? 1 : 0) * 100)} %</b><input type="range" id="mvR" min="0" max="100" step="5" value="${Math.round((c.music ? c.mv ?? 1 : 0) * 100)}"></label>
        <label>${TX('🔊 Efectos')} <b id="svT">${Math.round((c.sfx ? c.sv ?? 1 : 0) * 100)} %</b><input type="range" id="svR" min="0" max="100" step="5" value="${Math.round((c.sfx ? c.sv ?? 1 : 0) * 100)}"></label></div>
      <p class="note">${TX('La música sale de tus archivos del Inazuma 1 y 2, reconstruida desde las partituras del juego. Los nombres son los de la colección de música del Inazuma 2.')}</p>
      ${opts(TX('Intro al abrir el juego'), 'intro', [[1, TX('Sí')], [0, TX('No')]])}
      <button class="ghost" id="seeIntro">${TX('▶ Ver la intro')}</button>
      <div class="group"><label>${TX('Rivales con tema propio')}</label><div class="opts"><button id="tt1" aria-pressed="${c.teamThemes !== false}">${TX('Su música')}</button><button id="tt0" aria-pressed="${c.teamThemes === false}">${TX('La de la etapa')}</button></div></div>
      <details class="roles"><summary>${TX('Elegir música de cada momento')}</summary>
      ${sel('menu', false)}${sel('intro', false)}${sel('match', false, rnd)}${['match_easy', 'match_mid', 'match_hard', 'match_final', 's2_easy', 's2_mid', 's2_hard', 's2_final', 'match_special'].map(r => sel(r, false, rnd)).join('')}
      ${sel('goal', true, none)}${sel('win', true, none)}${sel('lose', true, none)}
      <button class="ghost" id="resetRoles">${TX('Volver a la música de serie')}</button></details>
      <h3>${TX('Escuchar')} <small>${TX('toca para oír cada pista')}</small></h3>
      ${TRACK_GROUPS.map(g => `<details class="tgroup"><summary>${g} <small>${keys.filter(k => TRACKS[k].group === g).length}</small></summary><div class="tracks">${keys.filter(k => TRACKS[k].group === g).map(k => `<button class="ghost" data-play="${k}">▶ ${TRACKS[k].name}</button>`).join('')}</div></details>`).join('')}
      <button class="ghost" id="stopAll">${TX('Parar')}</button>
      ${settings.dev ? '<button class="ghost" id="toDev">' + TX('🛠 Modo desarrollador') + '</button>' : ''}
      <p class="note">${TX('Inazuma Rogue v')}${VERSION} ${TX('· fan game gratuito y no oficial. Inazuma Eleven es de Level-5.')}</p>`);
    bindOpts(settings, k => { saveSettings(); if (k === 'controls' || k === 'padSize') Controls.apply(); if (k === 'keys') { const y = $('screen').scrollTop; renderSettings(); $('screen').scrollTop = y; } });
    body.querySelectorAll('[data-lang]').forEach(b => b.onclick = () => {
      if (b.dataset.lang === I18N.lang) return;
      I18N.set(b.dataset.lang); Sound.sfx('click');
      screen(`<div class="title"><img class="logo" src="ui/logo_rogue.png" alt="Inazuma Rogue"><span>${b.dataset.lang === 'en' ? 'Changing language…' : 'Cambiando el idioma…'}</span></div>`, 'bg_title');
      setTimeout(() => location.reload(), 250);
    });
    if ($('toDev')) $('toDev').onclick = () => { Sound.stop(0.2); renderDev(); };
    $('mvR').oninput = e => { const v = +e.target.value / 100; Sound.setVol('music', v); $('mvT').textContent = e.target.value + ' %'; };
    $('svR').oninput = e => { const v = +e.target.value / 100; Sound.setVol('sfx', v); $('svT').textContent = e.target.value + ' %'; };
    $('svR').onchange = () => Sound.sfx('click');
    body.querySelectorAll('select[data-role]').forEach(s => { s.value = c.roles[s.dataset.role] ?? ''; s.onchange = () => Sound.setRole(s.dataset.role, s.value); });
    $('seeIntro').onclick = () => { Sound.stop(0.2); playIntro(renderSettings); };
    $('sGuide').onclick = () => renderControlsGuide(renderSettings);
    bindKeyMap();
    $('tt1').onclick = () => { Sound.setTeamThemes(true); renderSettings(); };
    $('tt0').onclick = () => { Sound.setTeamThemes(false); renderSettings(); };
    $('resetRoles').onclick = () => { Object.entries(Sound.DEF_ROLES).forEach(([r, k]) => Sound.setRole(r, k)); renderSettings(); UI.toast(TX('Música de serie')); };
    body.querySelectorAll('[data-play]').forEach(b => b.onclick = () => Sound.preview(b.dataset.play));
    $('stopAll').onclick = () => Sound.stop(0.2);
    $('back').onclick = () => { Sound.stop(0.2); renderMenu(); };
  }

  /* ---------- Modo desarrollador (20 toques en la versión) ---------- */
  function renderDevClub() {
    const c = Career.data;
    screen(`${top(TX('Elegir club'))}<p class="note">${TX('Ocupas el sitio del club que elijas: su división, su nombre y sus jugadores. Ellos se quedan con tu plantilla. La temporada empieza de nuevo.')}</p>
      ${[1, 2, 3].map(d => `<h3>${DIV_NAME[d]}</h3><div class="modes">${c.divs[d].filter(k => k !== YOU).map(k => `<button class="mode" data-club="${esc(k)}">${Sprites.crest(crestOf(k))}<span class="mt"><b>${esc(Career.teamName(k))}</b><small>${TX('media')} ${Career.rating(k)}</small></span></button>`).join('')}</div>`).join('')}`);
    body.querySelectorAll('[data-club]').forEach(b => b.onclick = () => { Career.devTakeClub(b.dataset.club); Sound.sfx('reveal'); UI.toast(TX('Ahora eres ') + Career.data.school, 1800); renderCareer(); });
    $('back').onclick = renderDev;
  }
  function renderDevSign() {
    screen(`${top(TX('Fichar gratis'))}<p class="note">${TX('Busca cualquier jugador del gacha y tócalo para meterlo en tu plantilla de Carrera (sin límite).')}</p>
      <div class="pfbar"><div class="pfq"><input id="dsQ" type="search" placeholder="${TX('Buscar por nombre o mote…')}" autocomplete="off"></div></div><div class="pgrid" id="dsL"></div>`);
    const draw = () => {
      const q = norm($('dsQ').value.trim()), L = $('dsL'); L.innerHTML = '';
      if (q.length < 2) { L.innerHTML = '<p class="note">' + TX('Escribe al menos 2 letras.') + '</p>'; return; }
      GAME.players.filter(p => p.cs && p.gacha !== false && (norm(p.name).includes(q) || norm(p.full).includes(q))).slice(0, 40).forEach(p => {
        const inSq = !!Career.m(p.id), el = tile(p.id, `<span class="slot">${inSq ? TX('Ya está en tu club') : TX('Fichar gratis')}</span>`);
        if (inSq) el.classList.add('sel');
        el.onclick = () => { if (Career.devSign(p.id)) { Sound.sfx('reveal'); UI.toast(p.name + TX(' se une a ') + Career.data.school, 1400); draw(); } };
        L.appendChild(el);
      });
    };
    $('dsQ').oninput = draw; draw();
    $('back').onclick = renderDev;
  }
  function renderDev() {
    if (!BETA) return renderMenu();
    const P = Profile.data;
    const b = (id, t, sub = '') => `<button class="ghost big" id="${id}">${t}<small>${sub}</small></button>`;
    screen(`${top(TX('Desarrollador'))}
      <p class="note">v${VERSION} · ${GAME.players.filter(p => p.gacha !== false).length} ${TX('jugadores en el gacha ·')} ${Object.keys(GAME.techniques).length} ${TX('técnicas (')}${LEG_TECHS.length} ${TX('legendarias) ·')} ${GAME.teams.length} ${TX('equipos rivales')}</p>
      ${wallet()}
      <h3>${TX('Recursos')}</h3>
      <div class="grid2">${b('dTick', TX('+1000 tickets'))}${b('dCoin', TX('+100.000 monedas'))}${b('dRayo', TX('+10 Rayos'))}${b('dPity', TX('Épica asegurada'), TX('la próxima tirada'))}</div>
      <h3>${TX('Colección')}</h3>
      <div class="grid2">${b('dAll', TX('Todos los jugadores'))}${b('dStars', TX('Todos a 5 ★'))}${b('dTechs', TX('Todas las técnicas'), 'legendarias')}${b('dTrain', TX('Entrenar al máximo'))}</div>
      <h3>${TX('Progreso')}</h3>
      <div class="grid2">${b('dStory', TX('Completar todas las etapas'), TX('1, 2 y 3 · abre todo'))}${b('dChains', TX('Completar las cadenas'), TX('×5 con medalla de oro'))}${b('dRun', TX('Borrar partida'), TX('en curso'))}${b('dReset', TX('Borrar perfil'), TX('empezar de cero'))}</div>
      <h3>${TX('Carrera')}</h3>
      ${Career.data ? `<p class="note">${esc(Career.data.school)} ${TX('· temporada')} ${Career.data.season} · ${DIV_NAME[Career.myDiv()]} · ${money(Career.data.money)}</p>
      <div class="grid2">${b('dMoney', Career.data.devMoney ? TX('💰 Dinero infinito: SÍ') : TX('💰 Dinero infinito: NO'), TX('toca para cambiar'))}${b('dClub', TX('Elegir club'), TX('ocupas su sitio y sus jugadores'))}
        ${b('dSign', TX('Fichar gratis'), TX('cualquier jugador'))}${b('dFame', TX('Fama y forma al 100'))}
        ${b('dWC', TX('🌍 Empezar el Mundial'), 'ahora mismo')}${b('dSeason', TX('Terminar temporada'), TX('simula lo que queda'))}
        ${b('dDiv1', TX('Subir a Primera'), TX('la temporada empieza de nuevo'))}${b('dDiv3', TX('Bajar a Tercera'), TX('la temporada empieza de nuevo'))}</div>`
        : `<p class="note">${TX('No hay ninguna carrera empezada.')}</p><div class="grid2">${b('dNewCar', TX('Crear carrera rápida'), TX('normal, con Nelly'))}</div>`}
      <h3>${TX('Halloween')}</h3>
      <div class="grid2">${b('dHwOn', settings.hwForce ? TX('🎃 Evento forzado: SÍ') : TX('🎃 Evento forzado: NO'), TX('verlo fuera de fechas'))}${b('dHwCandy', TX('+300 caramelos'))}
        ${b('dHwRetos', TX('Completar los retos'), TX('desbloquea a Ray Dark'))}${b('dHwReset', TX('Reiniciar el evento'), TX('caramelos, retos y regalo'))}</div>
      <h3>${TX('Modo')}</h3>
      <div class="grid2">${b('dOff', TX('Salir del modo'), 'desarrollador')}</div>
      <h3>${TX('Partido')}</h3>
      ${opts(TX('Velocidad del juego'), 'speed', [[0.5, '50 %'], [0.75, TX('75 % (normal)')], [1, '100 %']])}
      ${opts(TX('Datos en pantalla (FPS, recargas…)'), 'debug', [[1, TX('Sí')], [0, TX('No')]])}
      ${opts(TX('Botón «Ganar ahora» en la pausa'), 'devWin', [[1, TX('Sí')], [0, TX('No')]])}
      <h3>${TX('Gacha')}</h3>
      <div class="grid2">${b('dLeg', TX('Legendario asegurado'), (P.devLeg ? P.devLeg + TX(' pendientes · ') : '') + TX('las próximas 10 tiradas'))}</div>
      <button class="ghost" id="dSim">${TX('Simular 1000 tiradas en cada gacha')} <small>${TX('(no gasta nada)')}</small></button>
      <div id="simOut" class="note"></div>`);
    if (settings.speed == null) settings.speed = 0.75;
    bindOpts(settings, saveSettings);
    const done = msg => { Profile.save(); Sound.sfx('reveal'); UI.toast(msg, 1400); renderDev(); };
    $('dTick').onclick = () => { P.tickets += 1000; done(TX('+1000 tickets')); };
    $('dCoin').onclick = () => { P.coins += 100000; done(TX('+100.000 monedas')); };
    $('dRayo').onclick = () => { P.rayos += 10; done(TX('+10 Rayos Raimon')); };
    $('dPity').onclick = () => { P.pity = 9; done(TX('La próxima tirada será épica o mejor')); };
    $('dAll').onclick = () => { GAME.players.forEach(p => { if (p.gacha !== false && !P.coll[p.id]) P.coll[p.id] = { stars: 1, up: {} }; }); done(TX('Colección completa')); };
    $('dStars').onclick = () => { Object.values(P.coll).forEach(o => { o.stars = MAX_STARS; }); done(TX('Todos con 5 estrellas')); };
    $('dTechs').onclick = () => { LEG_TECHS.forEach(t => { P.techs[t] = 1; }); done(TX('Todas las técnicas legendarias')); };
    $('dTrain').onclick = () => { Object.values(P.coll).forEach(o => STAT_KEYS.forEach(k => { o.up[k] = 40; })); done(TX('Entrenamiento al máximo')); };
    $('dStory').onclick = () => { ['s1', 's2', 's3', 's4'].forEach(k => { P.story[k] = P.story[k] || {}; P.story[k].done = true; P.story[k].best = Math.max(P.story[k].best || 0, 9); }); done(TX('Etapas 1, 2 y 3 completadas')); };
    $('dChains').onclick = () => { CHAINS.forEach(ch => { P.chains[ch.key] = Math.max(P.chains[ch.key] || 0, 5); }); done(TX('Cadenas completadas con oro')); };
    $('dLeg').onclick = () => { P.devLeg = (P.devLeg || 0) + 10; done(TX('Las próximas 10 tiradas serán legendarias')); };
    const cdone = msg => { Career.save(); done(msg); };
    if (Career.data) {
      const C = Career.data;
      $('dMoney').onclick = () => { C.devMoney = !C.devMoney; if (!C.devMoney) C.money = Math.min(C.money, 5000); cdone(C.devMoney ? TX('Dinero infinito activado') : TX('Dinero infinito desactivado')); };
      $('dFame').onclick = () => { C.fame = 100; C.forma = 100; cdone(TX('Fama y forma al 100')); };
      $('dWC').onclick = () => { C.wc = Career.wcCreate(C.season); Career.save(); Sound.sfx('reveal'); renderCareer(); };
      $('dSeason').onclick = () => { const sum = Career.devEndSeason(); Sound.music('menu'); if (sum) renderCareerSeason(sum); else renderCareer(); };
      $('dDiv1').onclick = () => { Career.devToDiv(1); cdone(TX('Ahora estás en Primera')); };
      $('dDiv3').onclick = () => { Career.devToDiv(3); cdone(TX('Ahora estás en Tercera')); };
      $('dClub').onclick = () => renderDevClub();
      $('dSign').onclick = () => renderDevSign();
    } else $('dNewCar').onclick = () => { Career.create(13, TX('Instituto Inazuma')); done(TX('Carrera creada')); };
    $('dRun').onclick = () => { Run.clear(); api.run = null; done(TX('Partida en curso borrada')); };
    $('dHwOn').onclick = () => { settings.hwForce = !settings.hwForce; Halloween.forced = settings.hwForce; saveSettings(); done(settings.hwForce ? TX('Evento de Halloween forzado') : TX('Evento de Halloween según la fecha')); };
    $('dHwCandy').onclick = () => { Halloween.data().candy += 300; done(TX('+300 caramelos')); };
    $('dHwRetos').onclick = () => { const H = Halloween.data(); Halloween.RETOS.forEach(R => { H.retos[R.id] = Date.now(); }); H.ray = true; done(TX('Retos completados: Ray Dark desbloqueado')); };
    $('dHwReset').onclick = () => { delete P.hw; Halloween.data(); done(TX('Evento reiniciado')); };
    let resetArm = false;
    $('dReset').onclick = () => {
      if (!resetArm) { resetArm = true; $('dReset').firstChild.textContent = TX('¿Seguro? Toca otra vez'); return; }
      try { localStorage.removeItem('inazuma-perfil'); } catch (_) {}
      Run.clear(); api.run = null; api.myTeam = null; Profile.load(); UI.toast(TX('Perfil borrado'), 1400); renderMenu();
    };
    $('dOff').onclick = () => { settings.dev = false; settings.debug = 0; saveSettings(); renderMenu(); };
    $('dSim').onclick = () => {
      const rows = BANNERS.map(B => {
        const c = { comun: 0, rara: 0, epica: 0, legendaria: 0, tec: 0 }; let pity = 0;
        for (let i = 0; i < 1000; i++) {
          const t = Gacha.rollTier(pity >= 9); if (t === 'epica' || t === 'legendaria') pity = 0; else pity++;
          if (t === 'legendaria' && Math.random() < 0.5) c.tec++; else c[t]++;
        }
        return `<b>${esc(B.name)}</b>: ${c.comun} ${TX('comunes ·')} ${c.rara} ${TX('raras ·')} ${c.epica} ${TX('épicas ·')} ${c.legendaria} ${TX('legendarios ·')} ${c.tec} ${TX('técnicas')}`;
      });
      $('simOut').innerHTML = rows.join('<br>');
    };
    $('back').onclick = renderMenu;
  }

  $('pauseBtn').addEventListener('click', () => api.togglePause());
  /* ---------- Intro: imágenes del juego con la música del opening; se puede saltar ---------- */
  function playIntro(done) {
    const el = $('intro'), stage = el.querySelector('.in-stage'), cap = el.querySelector('.in-cap'), flash = el.querySelector('.in-flash');
    const timers = []; let finished = false, z = 1;
    const at = (ms, fn) => timers.push(setTimeout(fn, ms));
    // Rótulos de tráiler: titular grande + línea pequeña debajo
    const say = (t, sub = '') => {
      cap.classList.remove('on'); void cap.offsetWidth;
      cap.innerHTML = t ? `<b>${t}</b>${sub ? `<small>${sub}</small>` : ''}` : '';
      if (t) cap.classList.add('on');
    };
    const boom = () => { flash.classList.remove('on'); void flash.offsetWidth; flash.classList.add('on'); };
    const finish = () => {
      if (finished) return; finished = true; timers.forEach(clearTimeout);
      el.hidden = true; el.onclick = null; stage.innerHTML = ''; say('');
      Sound.stop(0.6); done();
    };
    const layer = (html, cls) => {
      const d = document.createElement('div'); d.className = cls; d.style.zIndex = ++z; d.innerHTML = html; stage.appendChild(d);
      const old = [...stage.children].slice(0, -2); old.forEach(o => o.remove());   // deja solo la anterior para el fundido
      return d;
    };
    // Imagen entera (ajustada al ancho) con un fondo difuminado de la misma imagen detrás
    const slide = (img, text, kb, sub) => {
      const d = layer('<div class="in-bg"></div><div class="in-fg ' + kb + '"></div>', 'in-slide');
      d.firstChild.style.backgroundImage = d.lastChild.style.backgroundImage = `url("ui/${img}.png")`; say(text, sub);
      return d;
    };
    el.hidden = false; stage.innerHTML = ''; say('');
    el.querySelector('.in-skip').onclick = e => { e.stopPropagation(); finish(); };
    layer(`<img class="in-logo" src="ui/logo_rogue.png" alt="Inazuma Rogue"><p class="in-tap">${Controls.pc() ? TX('Haz clic o pulsa una tecla') : TX('Toca para empezar')}</p>`, 'in-center');
    el.onclick = () => {
      el.onclick = null; Sound.unlock(); Sound.music('intro');
      const n = GAME.players.filter(p => p.gacha !== false).length;
      const stars = GAME.players.filter(p => p.gacha !== false && p.rarity === 'legendaria').sort(() => Math.random() - 0.5).slice(0, 12);
      // Final: logo; tocar durante las imágenes salta directamente aquí
      const end = () => {
        timers.forEach(clearTimeout); boom(); say('');
        layer(`<img class="in-logo slam" src="ui/logo_rogue.png" alt="Inazuma Rogue"><p class="in-sub">${TX('5 contra 5 · roguelite')}</p><p class="in-tap">${Controls.pc() ? TX('Haz clic o pulsa una tecla') : TX('Toca para continuar')}</p>`, 'in-center in-final');
        el.onclick = finish;
      };
      el.onclick = end;
      const miles = String(Math.floor(n / 100) * 100).replace(/\B(?=(\d{3})+$)/g, '.');
      const nTracks = Object.values(TRACKS).filter(t => !t.jingle).length;
      const crests = [1, 2, 10, 15, 33, 41, 48, 49, 31, 38, 599, 588];
      const T = 3000;   // cada plano del tráiler
      const ie3 = GAME.players.filter(p => p.id >= 30000 && p.cs && (p.rarity === 'legendaria' || p.rarity === 'epica')).sort(() => Math.random() - 0.5).slice(0, 12);
      const faces = (list, t, sub) => {
        const d = layer('<div class="in-faces"></div>', 'in-slide');
        list.forEach((p, i) => { const c = face(Sprites.refOf(p), 64); c.style.animationDelay = (i * 0.1) + 's'; d.firstChild.appendChild(c); });
        say(t, sub); return d;
      };
      const S = [
        [0, () => { layer('', 'in-slide'); boom(); slide('bg_title', TX('Un fan game de Inazuma Eleven'), 'kbZoom'); }],
        [T * 0.8, () => slide('ill05', TX('Fútbol 5 contra 5'), 'kbA', TX('En tiempo real · en el móvil y en el PC'))],
        [T * 1.8, () => slide('ill22', TX('Modo roguelite'), 'kbB', TX('Cada partida es distinta: vidas, mejoras y jefes'))],
        [T * 2.8, () => { boom(); slide('ill31', `${TX('Más de')} ${miles} ${TX('jugadores')}`, 'kbA', TX('Del Inazuma 1, 2 y 3, cada uno con su cara y sus técnicas')); }],
        [T * 3.8, () => { boom(); faces(ie3, TX('¡Llega el Inazuma 3!'), TX('Inazuma Japón y las selecciones del mundo: Unicorn, Orpheus, Little Gigant…')); }],
        [T * 4.8, () => {
          const d = layer('<div class="in-mach"></div>', 'in-slide');
          [1, 2, 3].forEach((id, i) => {
            const cv = document.createElement('canvas'); cv.width = 96; cv.height = 128; cv.style.animationDelay = (i * 0.15) + 's';
            const crest = new Image(); crest.src = `ui/crest${BANNERS[i].crest}.png`;
            const balls = Array.from({ length: 18 }, (_, k) => ({ x: 26 + (k * 37) % 44, y: 30 + (k * 23) % 30, c: Object.values(CAP_COLORS)[k % 4] }));
            const st = { colors: MACHINE_COLORS[id], crest, balls, crank: -Math.PI / 2 + i, shake: false, t: 0 };
            drawMachine(cv, st); crest.onload = () => drawMachine(cv, st);
            d.firstChild.appendChild(cv);
          });
          say(TX('Máquina de gachapón'), TX('Gira la manivela: Héroes, Rivales y Villanos'));
        }],
        [T * 5.8, () => { boom(); faces(stars, TX('Legendarios de verdad'), TX('Media de 90 o más desde el primer día')); }],
        [T * 6.8, () => slide('bg_team', TX('Supertécnicas legendarias'), 'kbA', TX('Elige cuál usar en cada momento: animación propia y cámara lenta'))],
        [T * 7.8, () => slide('ill23', TX('Modo Carrera'), 'kbB', TX('Eres el mánager: tus jugadores mejoran (o bajan) según cómo jueguen'))],
        [T * 8.8, () => {
          const d = slide('bg_vs', TX('🌍 El Mundial'), 'kbA', TX('Cada 3 temporadas: convoca a 10 y lleva a Inazuma Japón a lo más alto'));
          d.insertAdjacentHTML('beforeend', `<div class="in-faces in-crests">${[3016, 3053, 3054, 3055, 3057, 3050, 3021, 3058, 3059, 3060, 3061, 3052].map((c, i) => `<img src="ui/crest${c}.png" alt="" style="animation-delay:${i * 0.08}s">`).join('')}</div>`);
        }],
        [T * 9.8, () => slide('ill25', TX('La historia, en 3 etapas'), 'kbB', TX('Del Fútbol Frontier a la Academia Alius… y al Mundial'))],
        [T * 10.8, () => {
          const d = slide('bg_vs', TX('Cadenas, especiales e Infinito'), 'kbB', TX('Rivales cada vez más duros'));
          d.insertAdjacentHTML('beforeend', `<div class="in-faces in-crests">${crests.map((c, i) => `<img src="ui/crest${c}.png" alt="" style="animation-delay:${i * 0.08}s">`).join('')}</div>`);
        }],
        [T * 11.8, () => slide('ill15', TX('Banda sonora original'), 'kbA', `${nTracks} ${TX('temas del Inazuma 1 y 2')}`)],
        [T * 12.8, () => { boom(); slide('ill03', TX('¿Preparado?'), 'kbB', TX('Forma tu equipo y llega a la cima')); }],
        [T * 13.8, end],
      ];
      S.forEach(([ms, fn]) => at(ms, fn));
    };
  }

  // Teclado fuera del partido: en la intro cualquier tecla avanza (Esc la salta); en menús Esc = Volver
  api.menuKey = e => {
    const intro = $('intro');
    if (!intro.hidden) {
      if (e.code === 'Escape') intro.querySelector('.in-skip').click(); else intro.click();
      e.preventDefault(); return true;
    }
    if (api.running || $('screen').hidden) return false;
    if (e.code === 'Escape') { const b = $('back'); if (b) { b.click(); e.preventDefault(); return true; } }
    return false;
  };

  api.renderMenu = () => renderMenu();
  // Solo arranca en la web oficial (o en la beta y en las pruebas). Las direcciones van como números para que no se cambien con un simple «buscar y reemplazar».
  const OFFICIAL = String.fromCharCode(104,116,116,112,115,58,47,47,102,114,97,110,109,110,100,101,122,122,122,122,46,103,105,116,104,117,98,46,105,111,47,73,110,97,122,117,109,97,45,82,111,103,117,101,47,106,117,101,103,111) + '/';
  function hostOk() {
    const h = (location.hostname || '').toLowerCase();
    if (BETA) return true;
    const ok = [[102,114,97,110,109,110,100,101,122,122,122,122,46,103,105,116,104,117,98,46,105,111], [108,111,99,97,108,104,111,115,116], [49,50,55,46,48,46,48,46,49]].map(a => String.fromCharCode(...a));
    return ok.includes(h) || h.endsWith('.test');
  }
  function renderCopy() {
    screen(`<div class="title"><img class="logo" src="ui/logo_rogue.png" alt="Inazuma Rogue" onerror="this.remove()">
      <h2>${TX('Esta copia del juego no es oficial')}</h2>
      <p class="note">${TX('Inazuma Rogue es gratis y solo se juega en su web oficial, donde tienes tu partida guardada, las novedades y los eventos.')}</p>
      <a class="cta linkbtn" href="${OFFICIAL}">${TX('▶ Ir a la web oficial')}</a></div>`, 'bg_title');
  }
  api.boot = () => {
    if (!hostOk()) return renderCopy();
    Controls.apply();
    Career.load();
    const pend = hashCode();
    const first = pend ? () => renderTransfer(renderMenu, pend) : renderMenu;
    const start = () => { if (settings.intro !== 0 && !pend) playIntro(first); else first(); };
    if (!Cloud.enabled() || (!(Cloud.loggedIn() && !Cloud.expired()) && !Cloud.pendingRedirect())) return start();
    // Con cuenta: mira la nube antes de empezar (máximo unos segundos; si no hay internet, se juega igual)
    screen(`<div class="title"><img class="logo" src="ui/logo_rogue.png" alt="Inazuma Rogue"><span>${TX('Comprobando tu partida…')}</span></div>`, 'bg_title');
    let done = false;
    const fallback = setTimeout(() => { if (!done) { done = true; UI.toast(TX('La nube tarda en responder: juegas con la partida de este móvil'), 3000); start(); } }, 8000);
    Cloud.sync().then(r => {
      if (done) { if (r === 'downloaded') reloadGame(TX('Cargando tu partida de la nube…')); return; }
      done = true; clearTimeout(fallback);
      if (r === 'downloaded') return reloadGame(TX('Cargando tu partida de la nube…'));
      if (r === 'conflict') return renderConflict(start);
      if (r === 'offline') UI.toast(TX('Sin conexión: tu partida se subirá cuando vuelva internet'), 3000);
      start();
    });
  };
  return api;
})();
