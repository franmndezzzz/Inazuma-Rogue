/* =====================================================================
   DATOS, COLECCIÓN (gacha) Y RECORRIDO (roguelite)
   GAME viene de tus archivos del juego de DS (jugadores, técnicas, equipos).
   ===================================================================== */
const TECH = id => GAME.techniques[String(id)];
// Se muestra el mote oficial del juego (Gazelle, Torch, Sharp…); el nombre completo queda en p.full para el perfil
const PBY = {}; GAME.players.forEach(p => { PBY[p.id] = p; p.full = p.name; if (p.nick) p.name = p.nick + ((p.full.match(/ \((IE2|IE3|Oscuro)\)$/) || [''])[0]); });
const PLAYER = id => PBY[id];
const playsAs = (pd, r) => !!pd && (pd.role === r || !!pd.anyRole);   // anyRole: jugadores especiales que valen para cualquier puesto
const TEAM = key => GAME.teams.find(t => t.key === key);
const EVO = id => GAME.evo[String(id)];
const RIVAL_ORDER = GAME.teams.filter(t => t.kind === 'story').map(t => t.key);   // Etapa 1, en orden de la historia
const STAGE_ORDER = { s1: RIVAL_ORDER, s2: GAME.teams.filter(t => t.kind === 'story2').map(t => t.key),   // Etapa 2: Inazuma Eleven 2
  s3: GAME.teams.filter(t => t.kind === 'story3').map(t => t.key), s4: GAME.teams.filter(t => t.kind === 'story4').map(t => t.key) };   // Etapa 3: fase 1 y fase 2
const STAGE_NAME = { s1: TX('Etapa 1'), s2: TX('Etapa 2'), s3: TX('Etapa 3 · Fase 1'), s4: TX('Etapa 3 · Fase 2') };
const NATIONS = GAME.teams.filter(t => t.kind === 'story3' || t.kind === 'story4').map(t => t.key);

/* ---------- Formaciones de 5 ---------- */
const FORMATIONS = {
  '1-2-1-1': { name: TX('Defensiva'),    roles: ['POR', 'DEF', 'DEF', 'MED', 'DEL'] },
  '1-1-2-1': { name: TX('Equilibrada'),  roles: ['POR', 'DEF', 'MED', 'MED', 'DEL'] },
  '1-1-1-2': { name: TX('Ofensiva'),     roles: ['POR', 'DEF', 'MED', 'DEL', 'DEL'] },
  '1-2-0-2': { name: TX('Directa'),      roles: ['POR', 'DEF', 'DEF', 'DEL', 'DEL'] },
  '1-0-2-2': { name: TX('Ataque total'), roles: ['POR', 'MED', 'MED', 'DEL', 'DEL'] },
  '1-2-2-0': { name: TX('Muralla'),      roles: ['POR', 'DEF', 'DEF', 'MED', 'MED'] },
  '1-3-0-1': { name: TX('Cerrojo'),      roles: ['POR', 'DEF', 'DEF', 'DEF', 'DEL'] },
};
const SPREAD = { 1: [0], 2: [-7, 7], 3: [-10, 0, 10] };
const DEPTH = { POR: 1.2, DEF: 11, MED: 21, DEL: 31 };
const KODEPTH = { POR: 1.2, DEF: 9, MED: 16, DEL: 22 };
// Posición base (x, distancia a tu portería) de cada puesto según cuántos hay de cada tipo
function layout(roles) {
  const cnt = {}, idx = {};
  roles.forEach(r => { cnt[r] = (cnt[r] || 0) + 1; });
  return roles.map(r => {
    const i = idx[r] = (idx[r] || 0); idx[r]++;
    const x = r === 'POR' ? 0 : (SPREAD[cnt[r]] || [0])[i] + (cnt[r] === 1 ? (r === 'MED' ? 3 : r === 'DEL' ? -2 : 0) : 0);
    return { role: r, home: [x, DEPTH[r]], ko: [x * 0.8, KODEPTH[r]] };
  });
}

/* ---------- Campos por equipo ---------- */
const TEAM_FIELD = { Occult: 'noche', Wild: 'jungla', Brain: 'normal', Otaku: 'atardecer', Shuriken: 'nieve', Farm: 'atardecer',
  Kirkwood: 'normal', 'Royal Academy': 'acero', Zeus: 'cielo', 'Inazuma Kids FC': 'normal', Sallys: 'atardecer', Umbrella: 'noche',
  Veteranos: 'acero', 'Tanques Centella': 'volcan', 'Ultra Zeus': 'volcan', Airosos: 'cielo', Guardabosques: 'jungla',
  Ardientes: 'volcan', 'Montañeros': 'nieve', 'Pistolas Centella': 'noche', 'Bombas Centella': 'noche', 'Cohetes Centella': 'noche', 'Jets Centella': 'noche',
  'Tormenta de Géminis': 'noche', Alpino: 'nieve', 'Épsilon': 'acero', 'Claustro Sagrado': 'atardecer', Fauxshore: 'normal', 'Royal Academy Redux': 'acero',
  'Épsilon Plus': 'noche', 'Emperadores Oscuros': 'volcan', 'Génesis': 'cielo', Prominence: 'volcan', 'Polvo de Diamantes': 'nieve', Caos: 'volcan' };

/* ---------- Modos ---------- */
const SPECIALS = [   // equipos especiales: se abren al avanzar en la Etapa 1
  { key: 'Inazuma Kids FC', unlock: 0, boost: 0.92 },
  { key: 'Sallys', unlock: 2, boost: 0.95 },
  { key: 'Umbrella', unlock: 4, boost: 1.0 },
  { key: 'Veteranos', unlock: 'done', boost: 1.05 },
  { key: 'Tanques Centella', unlock: 'done', boost: 1.08 },
  { key: 'Ultra Zeus', unlock: 'done', boost: 1.15 },
  { key: 'Prominence', unlock: 'done', boost: 1.12 },
  { key: 'Polvo de Diamantes', unlock: 'done', boost: 1.12 },
  { key: 'Caos', unlock: 'done2', boost: 1.2 },
];
const CHAINS = [   // cadenas: desafíos cortos, sin recuperar vidas
  { key: 'elemental', name: TX('Desafío elemental'), desc: TX('Un equipo de cada elemento: viento, bosque, fuego y montaña.'), teams: ['Airosos', 'Guardabosques', 'Ardientes', 'Montañeros'], lives: 2, factor: 1.0 },
  { key: 'centella', name: TX('Liga Centella'), desc: TX('Cuatro selecciones de estrellas, cada una más dura.'), teams: ['Jets Centella', 'Cohetes Centella', 'Pistolas Centella', 'Bombas Centella'], lives: 2, factor: 1.02 },
  { key: 'final', name: TX('Camino a Zeus'), desc: TX('Kirkwood, Royal Academy y Zeus, uno detrás de otro y al máximo.'), teams: ['Kirkwood', 'Royal Academy', 'Zeus'], lives: 1, factor: 1.08 },
  { key: 'gira', name: TX('Gira de la Caravana'), desc: TX('Las paradas de la Caravana Inazuma por Japón.'), teams: ['Alpino', 'Claustro Sagrado', 'Fauxshore', 'Royal Academy Redux'], lives: 2, factor: 1.03 },
  { key: 'alius', name: TX('Invasión Alius'), desc: TX('Los equipos de la Academia Alius, de Géminis a Génesis.'), teams: ['Tormenta de Géminis', 'Épsilon', 'Épsilon Plus', 'Génesis'], lives: 2, factor: 1.06 },
  { key: 'royal', name: TX('El regreso del Royal'), desc: TX('Royal Academy, su versión Redux y los Emperadores Oscuros.'), teams: ['Royal Academy', 'Royal Academy Redux', 'Emperadores Oscuros'], lives: 1, factor: 1.08 },
  { key: 'fuego', name: TX('Fuego y hielo'), desc: TX('Prominence, Polvo de Diamantes y su fusión, Caos.'), teams: ['Prominence', 'Polvo de Diamantes', 'Caos'], lives: 1, factor: 1.12, needs: 's2' },
  { key: 'oscuro', name: TX('El lado oscuro'), desc: TX('Team D, Dark Angel, Demons Z y el Ogro: los villanos del 3.'), teams: ['Team D', 'Dark Angel', 'Demons Z', 'The Ogre'], lives: 1, factor: 1.12, needs: 's4' },
  { key: 'dioses', name: TX('Dioses y alienígenas'), desc: TX('Zeus, Ultra Zeus y Génesis: lo más duro del 1 y del 2.'), teams: ['Zeus', 'Ultra Zeus', 'Génesis'], lives: 1, factor: 1.15, needs: 's2' },
];
const STAGES = [
  { key: 's1', name: TX('Etapa 1 · Inazuma Eleven'), available: true },
  { key: 's2', name: TX('Etapa 2 · Inazuma Eleven 2'), available: true, needs: 's1', note: TX('Completa la Etapa 1') },
  { key: 's3', name: TX('Etapa 3 · Fase 1'), available: true, needs: 's2', note: TX('Completa la Etapa 2') },
  { key: 's4', name: TX('Etapa 3 · Fase 2 · el Mundial'), available: true, needs: 's3', note: TX('Completa la Fase 1 de la Etapa 3') },
];
const ROLE_TYPE = { POR: 'parada', DEF: 'bloqueo', MED: 'regate', DEL: 'tiro' };
const STAT_KEYS = ['tiro', 'control', 'defensa', 'rapidez', 'fisico'];
const STAT_LABEL = { tiro: TX('Tiro'), control: TX('Control'), defensa: TX('Defensa'), rapidez: TX('Rapidez'), fisico: TX('Físico') };
const RARITY = {
  comun:      { label: TX('Común'),      rate: 60, dupCoins: 10 },
  rara:       { label: TX('Rara'),       rate: 28, dupCoins: 25 },
  epica:      { label: TX('Épica'),      rate: 10, dupCoins: 60 },
  legendaria: { label: TX('Legendaria'), rate: 2,  dupCoins: 150 },
};
const MAX_STARS = 5;
const TECH_SLOTS = 2;   // técnicas equipadas por jugador

/* ---------- Gachas por equipos y técnicas legendarias ---------- */
const BANNERS = [
  { id: 1, name: TX('Héroes'), crest: 1, desc: TX('Raimon en todas sus versiones, Inazuma Japón, los Veteranos y los amigos de Ciudad Inazuma') },
  { id: 2, name: TX('Rivales'), crest: 2, desc: TX('Los equipos del Fútbol Frontier, la gira por Japón y las selecciones del mundo') },
  { id: 3, name: TX('Villanos'), crest: 41, desc: TX('Zeus, la Academia Alius, los Emperadores Oscuros, el Ogro, Team D y los demonios') },
];
// Las técnicas más chetadas (potencia 100 o más), una por nombre
const LEG_TECHS = (() => {
  const seen = new Set(), out = [];
  Object.values(GAME.techniques).filter(t => t.power >= 100 && t.name && !/^[^A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(t.name))
    .sort((a, b) => b.power - a.power).forEach(t => { if (!seen.has(t.name)) { seen.add(t.name); out.push(t.id); } });
  return out;
})();

// Habilidades pasivas: nombres del juego, efectos nuestros (provisionales)
// Nombres de las habilidades, para traducirlos al mostrarlos: TX('Tiro+') TX('Rapidez+') TX('Defensa+') TX('Portero+') TX('Ataque+')
// TX('Recobro') TX('Fuerza veloz') TX('Fuerza de tiro') TX('Fuerza defensiva') TX('Ultratécnica')
const PASSIVES = {
  'Tiro+':            { desc: TX('+6 de tiro'), apply: m => { m.kick += 6; } },
  'Rapidez+':         { desc: TX('+6 % de velocidad'), apply: m => { m.speed *= 1.06; } },
  'Defensa+':         { desc: TX('+6 de defensa'), apply: m => { m.defense += 6; } },
  'Portero+':         { desc: TX('+6 de portero'), apply: m => { m.gk += 6; } },
  'Ataque+':          { desc: TX('+4 de tiro y control'), apply: m => { m.kick += 4; m.control += 4; } },
  'Recobro':          { desc: TX('Recupera aguante un 60 % más rápido'), apply: m => { m.bonus.recobro = 1.6; } },
  'Fuerza veloz':     { desc: TX('+10 a las técnicas de regate'), apply: m => { m.bonus.regate = 10; } },
  'Fuerza de tiro':   { desc: TX('+10 a las técnicas de tiro'), apply: m => { m.bonus.tiro = 10; } },
  'Fuerza defensiva': { desc: TX('+10 a las técnicas de bloqueo'), apply: m => { m.bonus.bloqueo = 10; } },
  'Ultratécnica':     { desc: TX('Las técnicas recargan un 20 % antes'), apply: m => { m.bonus.cdMul = 0.8; } },
};

/* ---------- Estadísticas ---------- */
// Valor de una estadística de un jugador de tu colección (permanente)
// Los legendarios empiezan ya al máximo (media de 90 o más); el resto empieza al 82 % y se entrena
const startMul = pd => pd.rarity === 'legendaria' ? 1 : 0.82;
function statOf(id, owned, k) {
  const pd = PLAYER(id), ie = pd.ie[k], stars = owned ? owned.stars : 1, up = owned ? (owned.up[k] || 0) : 0;
  return Math.min(ie + 2 * (stars - 1), Math.round(ie * startMul(pd)) + up * 3 + (stars - 1) * 2);
}
function statCap(id, owned, k) { return PLAYER(id).ie[k] + 2 * ((owned ? owned.stars : 1) - 1); }

// Técnica de "historia" (nivel 100) o la primera que aprende
function signatureTech(pd) {
  const ms = pd.moves.filter(([id]) => TECH(id));
  const story = ms.filter(([, l]) => l === 100);
  const pref = (story.length ? story : ms.slice().sort((a, b) => a[1] - b[1]));
  const natural = pref.find(([id]) => TECH(id).type === ROLE_TYPE[pd.role]);
  return (natural || pref[0] || [null])[0];
}
// Técnicas con las que empieza un recorrido: la suya + una de defensa o regate si la tiene
function startingTechs(pd) {
  const sig = signatureTech(pd), out = sig != null ? [sig] : [];
  const want = pd.role === 'DEF' ? ['bloqueo', 'regate'] : pd.role === 'POR' ? ['bloqueo'] : ['regate', 'bloqueo'];
  for (const type of want) {
    const m = pd.moves.find(([id]) => TECH(id) && TECH(id).type === type && !out.includes(id));
    if (m) { out.push(m[0]); break; }
  }
  const gkt = keeperTech(pd, out); if (gkt != null) out.unshift(gkt);
  return out.slice(0, TECH_SLOTS);
}
// Un portero sin técnica de parada recibe la más floja de su elemento (para que pueda usarla)
function keeperTech(pd, have) {
  if (pd.role !== 'POR' || have.some(id => TECH(id).type === 'parada')) return null;
  const own = pd.moves.find(([id]) => TECH(id) && TECH(id).type === 'parada');
  if (own) return own[0];
  const pool = Object.values(GAME.techniques).filter(t => t.type === 'parada' && Object.values(GAME.evo).indexOf(t.id) < 0)
    .sort((a, b) => (a.elem === pd.elem ? 0 : 1) - (b.elem === pd.elem ? 0 : 1) || a.power - b.power);
  return pool.length ? pool[0].id : null;
}

// Jugador de partido a partir de estadísticas
function buildMatchPlayer(id, role, stat, techs, passives, row, pos) {
  const pd = PLAYER(id), s = pd.ie;
  const m = { key: id, name: pd.name, role, row, elem: pd.elem, home: pos && pos.home, ko: pos && pos.ko,
    speed: +(5.6 + (stat('rapidez') - 50) * 0.05).toFixed(2),
    kick: stat('tiro'), control: stat('control'), defense: stat('defensa'), body: stat('fisico'),
    gk: Math.round((stat('defensa') + stat('fisico')) / 2) + (role === 'POR' ? 0 : -25),
    stamDrain: +(1.3 - s.aguante / 200).toFixed(2), bonus: {}, techs: [] };
  (passives || []).forEach(n => PASSIVES[n] && PASSIVES[n].apply(m));
  const cdMul = m.bonus.cdMul || 1;
  // Cada técnica recarga por separado (unos 13–32 s): con dos técnicas tienes más opciones, no el doble de disparos
  m.techs = (techs || []).map(TECH).filter(Boolean).map(t => Object.assign({}, t, { cd: +((9 + (t.cd - 6) * 0.5) * 1.4 * cdMul).toFixed(1) }));
  return m;
}

// Equipo rival: factor = fuerza (1 = sus estadísticas máximas del juego; también puede ser una función por jugador); progress decide cuántas técnicas trae
function rivalTeam(teamKey, factor, progress) {
  const t = TEAM(teamKey);
  const nTech = 1 + Math.floor(Math.min(1, progress) * 2.99);
  const order = { POR: 0, DEF: 1, MED: 2, DEL: 3 };
  const mem = t.players.slice().sort((a, b) => order[a.role] - order[b.role]);
  const pos = layout(mem.map(m => m.role));
  return { name: t.name, key: t.key, players: mem.map((m, i) => {
    const pd = PLAYER(m.id);
    let techs = pd.moves.slice().sort((a, b) => a[1] - b[1]).map(x => x[0]).filter(id => TECH(id)).slice(0, nTech);
    const sig = signatureTech(pd); if (sig != null && !techs.includes(sig)) techs[0] = sig;
    const gkt = keeperTech(pd, techs); if (gkt != null) techs.unshift(gkt);
    return Object.assign(buildMatchPlayer(m.id, m.role, k => Math.round(pd.ie[k] * (typeof factor === 'function' ? factor(pd) : factor)), techs, [], 5 + i, pos[i]),
      { sprite: Object.assign({ file: m.file, row: m.row }, t.kit && m.role !== 'POR' ? { kit: t.kit } : {}) });
  }) };
}
// Equipación de tu equipo (Plantilla → Mi equipo), como el creador del Modo Carrera: Profile.data.kit = { a: camiseta, b: mangas y pantalón, d: diseño } o null (la del Raimon)
const KIT_DESIGNS = [['', TX('Lisa')], ['rayas', TX('Rayas')], ['mitades', TX('Mitades')], ['banda', TX('Banda')], ['cuadros', TX('Cuadros')], ['diagonal', TX('Diagonal')]];
function myKit() { const k = Profile.data.kit; return k && typeof k === 'object' && k.a ? k : null; }
// Muñeco de un jugador de tu equipo con tu equipación (el portero va con la suya)
function mySprite(pd, role) {
  let k = role !== 'POR' && myKit();
  // Un portero que juega de campo deja su equipación de portero y lleva la del equipo (la del Raimon si no has elegido otra)
  if (role !== 'POR' && pd.role === 'POR') k = Object.assign({}, k || { a: '#d5b410', b: '#4a83ac' }, { gk: true });
  return Object.assign({ file: Sprites.collFile(pd), row: pd.cs[1] }, k ? { kit: k } : {});
}
const DIFF_MUL = { facil: 1.08, medio: 1.13, dificil: 1.2 };   // fácil = el antiguo difícil

/* ---------- Perfil permanente: colección, monedas, tickets ---------- */
/* ---------- Códigos de regalo ----------
   Para añadir uno nuevo, copia una línea y cambia el código y el premio.
   Premios posibles: tickets, coins (monedas), rayos. "hasta" es opcional (último día que funciona, AAAA-MM-DD). "uses": veces que se puede canjear (1 si no se pone). */
/* Premios: tickets, coins (monedas), rayos, leg (próximas tiradas legendarias aseguradas), epica (próximas tiradas épicas o mejor),
   player (nombre completo de un jugador: se une a tu plantilla o sube una estrella). "desde" y "hasta" son opcionales (AAAA-MM-DD). */
const GIFT_CODES = {
  APERTURA2026:      { tickets: 20, coins: 500, desc: TX('Código de apertura') },
  RAYOINAZUMA:       { rayos: 3, coins: 300, desc: TX('Tres Rayos Raimon') },
  TORNADOFUEGO:      { tickets: 15, desc: TX('Tickets ardientes') },
  PINGUINOEMPERADOR: { coins: 1500, rayos: 1, desc: TX('Monedas del pingüino') },
  RAIMON11:          { tickets: 11, coins: 1100, desc: TX('Once de Raimon') },
  MANODIOS:          { player: 'Mark Evans', tickets: 5, desc: TX('El portero legendario') },
  ALIUS:             { player: 'Xene', coins: 500, desc: TX('Llega de la Academia Alius') },
  CARAVANA:          { epica: 3, tickets: 10, desc: TX('Tres tiradas épicas o mejores') },
  FFI2026:           { tickets: 30, desc: TX('Torneo internacional') },
  MUNDIAL:           { tickets: 20, rayos: 2, coins: 1000, desc: TX('Premio del Mundial') },
  LEYENDA:           { leg: 1, tickets: 10, desc: TX('Una tirada legendaria asegurada') },
  KAPPARAYO:         { tickets: 100, coins: 1000, rayos: 3, player: 'Karl Kappa (Papi Gavi)', also: 'PESCADINHA', desc: TX('Kappa legendario, vale para cualquier puesto') },
  // Elige 1 de 3 ("pick"): rarity = rareza mínima, role = puesto, elem = elemento, min = media mínima
  FICHAJEESTRELLA:   { pick: { rarity: 'epica' }, tickets: 5, desc: TX('Elige 1 de 3 jugadores épicos o legendarios') },
  ELECCIONLEGENDARIA:{ pick: { rarity: 'legendaria' }, desc: TX('Elige 1 de 3 jugadores legendarios') },
  GUANTESDEORO:      { pick: { rarity: 'epica', role: 'POR' }, coins: 500, desc: TX('Elige 1 de 3 porteros épicos o mejores') },
  MURALLA:           { pick: { rarity: 'epica', role: 'DEF' }, coins: 500, desc: TX('Elige 1 de 3 defensas épicos o mejores') },
  CEREBRO:           { pick: { rarity: 'epica', role: 'MED' }, coins: 500, desc: TX('Elige 1 de 3 medios épicos o mejores') },
  GOLEADOR:          { pick: { rarity: 'epica', role: 'DEL' }, coins: 500, desc: TX('Elige 1 de 3 delanteros épicos o mejores') },
  KANEINFINITO:      { player: 31223, desc: TX('Hurley Kane (versión del Infinito)') },
  LEANINFINITO:      { player: 1457, desc: TX('Lean (versión del Infinito)') },
  TORCHINFINITO:     { player: 31774, desc: TX('Torch (versión del Infinito)') },
  MERCURYINFINITO:   { player: 1415, desc: TX('Mercury (versión del Infinito)') },
  AGENTEMINFINITO:   { player: 21487, desc: TX('Agente M (versión del Infinito)') },
  NAKATAINFINITO:    { player: 31278, desc: TX('Hidetoshi Nakata (versión del Infinito)') },
  INFINITO10:        { pick: { inf: true, n: 10 }, uses: 2, desc: TX('Elige 1 de 10 versiones del Infinito (con las probabilidades del gacha)') },
  FUEGOSAGRADO:      { pick: { rarity: 'epica', elem: 'fuego' }, tickets: 5, desc: TX('Elige 1 de 3 jugadores de fuego épicos o mejores') },
  DISCORDINAZUMA:    { tickets: 15, rayos: 2, desc: TX('Regalo de la comunidad') },
  TICKETAZO:         { tickets: 50, desc: TX('Lluvia de tickets') },
  DOBLELEYENDA:      { leg: 2, desc: TX('Dos tiradas legendarias aseguradas') },
};
const PICK_TIERS = { comun: 0, rara: 1, epica: 2, legendaria: 3 };
// Las 3 opciones de un "elige 1 de 3": jugadores del gacha (sin versiones de evento ni originales)
function giftPickOptions(f, n = 3) {
  if (f.inf) return infPickOptions(f.n || n);
  const avg = pd => ['tiro', 'control', 'defensa', 'rapidez', 'fisico'].reduce((t, k) => t + pd.ie[k], 0) / 5;
  const pool = GAME.players.filter(p => p.cs && p.gacha !== false && !p.halloween && !p.original && !p.special
    && PICK_TIERS[p.rarity] >= PICK_TIERS[f.rarity || 'comun'] && (!f.role || p.role === f.role) && (!f.elem || p.elem === f.elem) && (!f.min || avg(p) >= f.min)).map(p => p.id);
  const out = []; while (out.length < n && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}
// «Elige 1 de N» de versiones del Infinito: cada opción sale con las probabilidades del gacha (común 60 %, rara 28 %, épica 10 %, legendaria 2 %); sin repetir
function infPickOptions(n) {
  const all = GAME.players.filter(p => p.inf), out = [];
  for (let k = 0; k < n * 20 && out.length < n; k++) {
    let r = Math.random() * 100, tier = 'comun';
    for (const t of ['legendaria', 'epica', 'rara', 'comun']) { if (r < RARITY[t].rate) { tier = t; break; } r -= RARITY[t].rate; }
    const pool = all.filter(p => p.rarity === tier && !out.includes(p.id)); if (!pool.length) continue;
    out.push(pool[Math.floor(Math.random() * pool.length)].id);
  }
  return out;
}
// Versiones del Infinito: las otras versiones de jugadores (del 2, del 3, nombres alienígenas…) que no salen en el gacha.
// Se ganan al vencer a cada jefe del Infinito (elige 1 de 3) y llevan un marco propio con el símbolo ∞.
(function markVersions() {
  if (typeof GAME === 'undefined') return;
  for (const p of GAME.players) if (p.cs && p.gacha === false && !p.halloween && !p.special && !p.original && p.id !== 39001) p.inf = true;
})();
const INF_TIERS = w => w >= 30 ? ['comun', 'rara', 'epica', 'legendaria'] : w >= 15 ? ['comun', 'rara', 'epica'] : ['comun', 'rara'];
function versionPickOptions(wave, n = 3) {
  const ok = INF_TIERS(wave), all = GAME.players.filter(p => p.inf && ok.includes(p.rarity));
  const fresh = all.filter(p => !Profile.data.coll[p.id]), pool = (fresh.length >= n ? fresh : all).map(p => p.id);
  const out = []; while (out.length < n && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}
const normCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const Profile = {
  data: null,
  load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem('inazuma-perfil') || 'null'); } catch (_) {}
    this.data = Object.assign({ coll: {}, coins: 0, tickets: 0, pity: 0, firstDone: false, pulls: 0,
      rayos: 0, wins: 0, story: { s1: { best: 0, done: false } }, specials: {}, chains: {}, infBest: 0, techs: {}, banner: 1 }, d || {});
    this.data.techs = this.data.techs || {};
    this.data.codes = this.data.codes || {};
    this.data.story.s2 = this.data.story.s2 || { best: 0, done: false };
    for (const k of ['s3', 's4']) this.data.story[k] = this.data.story[k] || { best: 0, done: false };
    // Cambios de id entre versiones (p. ej. Raimon del 1 en su versión base): se conserva lo que tenías
    for (const [o, n] of Object.entries(GAME.idmap || {})) {
      // Las versiones del Infinito usan esos ids «viejos»: son jugadores de verdad y NO se convierten (antes desaparecían al recargar)
      if (PLAYER(o) && PLAYER(o).inf) continue;
      const c = this.data.coll;
      if (c[o]) { if (!c[n]) c[n] = c[o]; else c[n].stars = Math.max(c[n].stars, c[o].stars); delete c[o]; }
    }
    return this.data;
  },
  save() { try { localStorage.setItem('inazuma-perfil', JSON.stringify(this.data)); } catch (_) {} },
  // Canjea un código de regalo: cada código sirve una vez por partida guardada
  redeem(raw) {
    const k = normCode(raw), G = GIFT_CODES[k];
    if (!k) return { ok: false, msg: TX('Escribe un código') };
    if (!G) return { ok: false, msg: TX('Ese código no existe') };
    // uses: cuántas veces se puede canjear cada código (1 si no se dice). P.codeUses cuenta las veces; los canjeados antes cuentan como 1
    const used = (this.data.codeUses || {})[k] || (this.data.codes[k] ? 1 : 0);
    if (used >= (G.uses || 1) || (G.also && this.data.codes[G.also])) return { ok: false, msg: TX('Ya canjeaste este código') };
    const today = new Date().toISOString().slice(0, 10);
    if (G.hasta && today > G.hasta) return { ok: false, msg: TX('Este código ha caducado') };
    if (G.desde && today < G.desde) return { ok: false, msg: TX('Este código todavía no está activo') };
    const P = this.data;
    P.tickets += G.tickets || 0; P.coins += G.coins || 0; P.rayos += G.rayos || 0;
    if (G.leg) P.giftLeg = (P.giftLeg || 0) + G.leg;
    if (G.epica) P.giftEpic = (P.giftEpic || 0) + G.epica;
    let who = null;
    if (G.player) {
      const pd = typeof G.player === 'number' ? PLAYER(G.player) : GAME.players.find(p => (p.gacha !== false || p.special) && p.cs && (p.full === G.player || p.name === G.player));   // número = id exacto (p. ej. una versión del Infinito)
      if (pd) { const o = P.coll[pd.id]; if (!o) P.coll[pd.id] = { stars: 1, up: {} }; else if (o.stars < MAX_STARS) o.stars++; else P.coins += 200; who = pd; }
    }
    if (G.pick) { const opts = giftPickOptions(G.pick, G.pick.n || 3); if (opts.length) (P.giftPicks = P.giftPicks || []).push({ code: k, opts, desc: G.desc }); }
    P.codes[k] = Date.now(); P.codeUses = P.codeUses || {}; P.codeUses[k] = used + 1; this.save();
    const parts = [who && '⭐ ' + who.name, G.leg && TXn(G.leg, '{0} tirada legendaria', '{0} tiradas legendarias'), G.epica && G.epica + TX(' tiradas épicas o mejores'),
      G.pick && TX('elige 1 de {0} jugadores', G.pick.n || 3), G.tickets && G.tickets + TX(' 🎟️ tickets'), G.coins && G.coins + TX(' 🪙 monedas'), G.rayos && G.rayos + TX(' ⚡ Rayos')].filter(Boolean);
    return { ok: true, msg: TX('¡Código canjeado! ') + parts.join(TX(' y ')), code: k, gift: G };
  },
  // Resuelve un "elige 1 de 3" pendiente: nuevo, una estrella más o monedas si ya está al máximo
  takePick(i, id) {
    const P = this.data, g = (P.giftPicks || [])[i]; if (!g || !g.opts.includes(id)) return null;
    const pd = PLAYER(id), o = P.coll[id], r = { id, tier: pd.rarity };
    if (!o) { P.coll[id] = { stars: 1, up: {} }; r.isNew = true; }
    else if (o.stars < MAX_STARS) { o.stars++; r.star = o.stars; }
    else { const c = (RARITY[pd.rarity] || RARITY.comun).dupCoins; P.coins += c; r.coins = c; }
    P.giftPicks.splice(i, 1); this.save();
    return r;
  },
  owned(id) { return this.data.coll[id] || null; },
  ids() { return Object.keys(this.data.coll).map(Number); },
  // Cada victoria suma; cada 5 victorias, un Rayo Raimon
  addWin() {
    const P = this.data; P.wins++;
    const got = P.wins % 5 === 0; if (got) P.rayos++;
    this.save(); return got;
  },
  useRayo(id) {
    const o = this.owned(id), P = this.data;
    if (!o || P.rayos < 1 || o.stars >= MAX_STARS) return false;
    P.rayos--; o.stars++; this.save(); return true;
  },
  unlocked(what) {
    const S = this.data.story.s1;
    if (what === 'chains' || what === 'infinite') return S.done;
    if (what && what.chain) return S.done && (!what.chain.needs || this.data.story[what.chain.needs].done);
    if (what && what.special) { const u = what.special.unlock; return u === 'done' ? S.done : u === 'done2' ? this.data.story.s2.done : S.done || S.best >= u; }
    if (what && what.stage) return !what.stage.needs || this.data.story[what.stage.needs].done;
    return true;
  },
  // Técnicas que puede equipar: las suyas + las del gacha de su elemento (o que aprende en el juego original)
  learnable(id) {
    const pd = PLAYER(id), own = pd.moves.map(m => m[0]).filter(t => TECH(t));
    const gacha = Object.keys(this.data.techs).map(Number).filter(t => TECH(t) && !own.includes(t) && (TECH(t).elem === pd.elem || TECH(t).elem === 'neutro'));
    return { own, gacha };
  },
  equipOf(id) {
    const o = this.owned(id), L = this.learnable(id), ok = new Set([...L.own, ...L.gacha]);
    const eq = o && Array.isArray(o.equip) ? o.equip.filter(t => ok.has(t)).slice(0, TECH_SLOTS) : null;
    return eq && eq.length ? eq : startingTechs(PLAYER(id));
  },
  setEquip(id, slot, techId) {
    const o = this.owned(id); if (!o) return;
    const eq = this.equipOf(id).slice();
    const k = eq.indexOf(techId); if (k >= 0) eq[k] = eq[slot];
    eq[slot] = techId;
    o.equip = eq.filter(t => t != null).slice(0, TECH_SLOTS); this.save();
  },
  upgradeCost(id, k) { const o = this.owned(id); return 15 + (o.up[k] || 0) * 10; },
  canUpgrade(id, k) { const o = this.owned(id); return statOf(id, Object.assign({}, o, { up: Object.assign({}, o.up, { [k]: (o.up[k] || 0) + 1 }) }), k) > statOf(id, o, k); },
  upgrade(id, k) {
    const o = this.owned(id), c = this.upgradeCost(id, k);
    if (!o || this.data.coins < c || !this.canUpgrade(id, k)) return false;
    this.data.coins -= c; o.up[k] = (o.up[k] || 0) + 1; this.save(); return true;
  },
};

/* ---------- Gacha ---------- */
const Gacha = {
  pools: {},
  byTier(banner) {
    const k = banner || 0;
    if (!this.pools[k]) { const P = this.pools[k] = {}; for (const t in RARITY) P[t] = GAME.players.filter(p => p.rarity === t && p.gacha !== false && (!banner || p.banner === banner)); }
    return this.pools[k];
  },
  rollTier(forceHigh) {
    if (forceHigh) return Math.random() < RARITY.legendaria.rate / (RARITY.legendaria.rate + RARITY.epica.rate) ? 'legendaria' : 'epica';
    let r = Math.random() * 100;
    for (const t of ['legendaria', 'epica', 'rara', 'comun']) { if (r < RARITY[t].rate) return t; r -= RARITY[t].rate; }
    return 'comun';
  },
  // n tiradas; cada 10 sin épica o mejor, la siguiente la garantiza
  pull(n, opts = {}) {
    const P = Profile.data, pools = this.byTier(opts.banner), res = [];
    for (let i = 0; i < n; i++) {
      let tier = P.devLeg > 0 ? (P.devLeg--, 'legendaria') : P.giftLeg > 0 ? (P.giftLeg--, 'legendaria') : this.rollTier(P.pity >= 9);   // (códigos y desarrollador: legendarios asegurados)
      if (P.giftEpic > 0 && (tier === 'comun' || tier === 'rara')) { P.giftEpic--; tier = 'epica'; }
      if (tier === 'epica' || tier === 'legendaria') P.pity = 0; else P.pity++;
      // En el tramo legendario, la mitad de las veces sale una técnica legendaria
      if (tier === 'legendaria' && opts.banner && Math.random() < 0.5) { res.push({ tech: LEG_TECHS[Math.floor(Math.random() * LEG_TECHS.length)], tier }); continue; }
      if (!pools[tier].length && tier === 'legendaria') { res.push({ tech: LEG_TECHS[Math.floor(Math.random() * LEG_TECHS.length)], tier }); continue; }
      const list = pools[tier].length ? pools[tier] : pools.epica;
      res.push({ id: list[Math.floor(Math.random() * list.length)].id, tier });
    }
    if (opts.keeper && !res.some(r => r.id != null && PLAYER(r.id).role === 'POR')) {
      const gks = GAME.players.filter(p => p.gacha !== false && p.role === 'POR' && (p.rarity === 'rara' || p.rarity === 'comun'));
      const k = res.findIndex(r => r.tier === 'comun'); const g = gks[Math.floor(Math.random() * gks.length)];
      res[k >= 0 ? k : res.length - 1] = { id: g.id, tier: g.rarity };
    }
    for (const r of res) {
      if (r.tech != null) {
        if (!P.techs[r.tech]) { P.techs[r.tech] = 1; r.isNew = true; } else { P.coins += 150; r.coins = 150; }
        continue;
      }
      const o = P.coll[r.id];
      if (!o) { P.coll[r.id] = { stars: 1, up: {} }; r.isNew = true; }
      else if (o.stars < MAX_STARS) { o.stars++; r.star = o.stars; }
      else { const c = RARITY[r.tier].dupCoins; P.coins += c; r.coins = c; }
    }
    P.pulls += n;
    Profile.save();
    return res;
  },
};

/* ---------- Recorrido ---------- */
const RUN_RULES = {
  facil:   { matches: 5, lives: 3 },
  medio:   { matches: 6, lives: 2 },
  dificil: { matches: 7, lives: 1 },
};

function runMember(id, temp) {
  const pd = PLAYER(id);
  let techs = temp || !Profile.owned(id) ? startingTechs(pd) : Profile.equipOf(id).slice();
  if (pd.role === 'POR' && !techs.some(t => TECH(t).type === 'parada')) { const k = keeperTech(pd, techs); if (k != null) techs = [k, ...techs].slice(0, TECH_SLOTS); }
  return { id, temp: !!temp, techs, passives: [] };
}

// La estrella de un equipo: su mejor jugador de campo. En los equipos especiales no se repite el premio:
// si la estrella ya es el premio de un equipo especial anterior (p. ej. Byron en Tanques Centella y Ultra Zeus), se da la siguiente.
function teamStar(teamKey, special) {
  const sum = p => Object.values(p.ie).reduce((x, y) => x + y, 0);
  // si la ficha del rival no está en el gacha, se usa su versión del gacha (mismo nombre o «(IE2)»/«(IE3)»)
  const baseN = n => n.replace(/ \((IE2|IE3)\)$/, '');
  const inPool = p => p.cs && p.gacha !== false ? p : (GAME.idmap && GAME.idmap[p.id] && PLAYER(GAME.idmap[p.id])) || GAME.players.find(q => q.cs && q.gacha !== false && (baseN(q.full) === baseN(p.full) || (q.also || []).includes(p.full)));
  const list = TEAM(teamKey).players.filter(m => m.role !== 'POR').map(m => inPool(PLAYER(m.id))).filter(Boolean).sort((a, b) => sum(b) - sum(a));
  if (!special || typeof SPECIALS === 'undefined') return list[0] || null;
  const i = SPECIALS.findIndex(x => x.key === teamKey); if (i < 0) return list[0] || null;
  const taken = new Set(SPECIALS.slice(0, i).map(x => teamStar(x.key, true)).filter(Boolean).map(p => p.id));
  return list.find(p => !taken.has(p.id)) || list[0] || null;
}
// Jugador exclusivo: la estrella del equipo vencido (nuevo, una estrella más o monedas)
function teamStarReward(P, teamKey, special) {
  const best = teamStar(teamKey, special);
  if (!best) return null;
  const o = P.coll[best.id];
  if (!o) { P.coll[best.id] = { stars: 1, up: {} }; return { id: best.id, isNew: true }; }
  if (o.stars < MAX_STARS) { o.stars++; return { id: best.id, star: o.stars }; }
  P.coins += 100; return { id: best.id, coins: 100 };
}
// Qué tipo de técnica le sirve a cada posición (probabilidades de las recompensas tras cada partido)
const ROLE_FIT = { POR: { parada: 1 }, DEF: { bloqueo: 0.75, regate: 0.15, tiro: 0.1 }, MED: { regate: 0.45, tiro: 0.3, bloqueo: 0.25 }, DEL: { tiro: 0.7, regate: 0.3 } };
function rollFitType(role) {
  const F = ROLE_FIT[role] || ROLE_FIT.MED; let r = Math.random();
  for (const [t, w] of Object.entries(F)) { if ((r -= w) < 0) return t; }
  return Object.keys(F)[0];
}
const Run = {
  // kind: story | special | chain | infinite
  create(kind, lineupIds, opts = {}) {
    let schedule = [], lives = 1, diff = opts.diff || 'medio', name = '';
    if (kind === 'story') {
      const O = STAGE_ORDER[opts.stage || 's1'], R = RUN_RULES[diff], order = O.slice(0, -1);
      for (let i = 0; i < R.matches - 1; i++) schedule.push(order[Math.round(i * (order.length - 1) / Math.max(1, R.matches - 2))]);
      schedule.push(O[O.length - 1]);
      lives = R.lives; name = STAGE_NAME[opts.stage || 's1'];
    } else if (kind === 'special') { schedule = [opts.team]; lives = 1; name = opts.team; }
    else if (kind === 'chain') { const C = CHAINS.find(c => c.key === opts.chain); schedule = C.teams.slice(); lives = C.lives; name = C.name; }
    else if (kind === 'infinite') { schedule = [Run.infiniteTeam(0)]; lives = 2; name = TX('Infinito'); }
    const roster = lineupIds.map(id => runMember(id));
    return { kind, diff, name, stage: opts.stage || 's1', chain: opts.chain || null, schedule, index: 0, lives, maxLives: lives, wins: 0, coinsEarned: 0, ticketsEarned: 0,
      roster, lineup: roster.map((_, i) => i), formation: opts.formation || '1-2-1-1', state: 'map', rewards: null, last: null };
  },
  infiniteTeam(n) {
    const all = GAME.teams.filter(t => t.key !== 'Ultra Zeus');
    if ((n + 1) % 5 === 0) {   // oleada especial: los más duros
      const hard = all.slice().sort((a, b) => b.avg - a.avg).slice(0, 6);
      return (n + 1) % 10 === 0 ? 'Ultra Zeus' : hard[Math.floor(Math.random() * hard.length)].key;
    }
    return all[Math.floor(Math.random() * all.length)].key;
  },
  isBoss(run) { return run.kind === 'infinite' && (run.index + 1) % 5 === 0; },
  progress(run) {
    if (run.kind === 'infinite') return Math.min(1, run.index / 10);
    return run.schedule.length > 1 ? run.index / (run.schedule.length - 1) : 1;
  },
  rivalName(run) { return run.schedule[run.index]; },
  // Fuerza del rival según el modo
  rivalFactor(run) {
    const dm = DIFF_MUL[run.diff] || 1;
    if (run.kind === 'story') return (0.78 + 0.24 * Run.progress(run)) * dm;
    if (run.kind === 'special') return (SPECIALS.find(x => x.key === run.schedule[0]) || { boost: 1 }).boost;
    if (run.kind === 'chain') return CHAINS.find(c => c.key === run.chain).factor * (0.96 + 0.04 * Run.progress(run));
    return Math.min(1.35, 0.82 + 0.035 * run.index) * (Run.isBoss(run) ? 1.08 : 1);
  },
  // Música: alegre al principio, oscura y épica al final
  musicRole(run) {
    if (run.kind === 'special') return 'match_special';
    const last = run.kind !== 'infinite' && run.index >= run.schedule.length - 1, s2 = run.kind === 'story' && run.stage !== 's1';
    if (last || Run.isBoss(run)) return s2 ? 's2_final' : 'match_final';
    const p = Run.progress(run);
    return (s2 ? 's2_' : 'match_') + (p < 0.34 ? 'easy' : p < 0.67 ? 'mid' : 'hard');
  },
  field(run) { return TEAM_FIELD[Run.rivalName(run)] || 'normal'; },
  memberStat(m) {
    const o = m.temp ? null : Profile.owned(m.id);
    return k => m.temp ? Math.round(PLAYER(m.id).ie[k] * startMul(PLAYER(m.id))) : statOf(m.id, o, k);
  },
  matchTeams(run) {
    const F = FORMATIONS[run.formation] || FORMATIONS['1-2-1-1'];
    const pos = layout(F.roles);
    const A = { name: TX('Tu equipo'), players: run.lineup.slice(0, 5).map((ri, i) => {
      const m = run.roster[ri], pd = PLAYER(m.id);
      return Object.assign(buildMatchPlayer(m.id, F.roles[i], Run.memberStat(m), m.techs, m.passives, i, pos[i]),
        { sprite: mySprite(pd, F.roles[i]) });
    }) };
    const B = rivalTeam(Run.rivalName(run), Run.rivalFactor(run), Run.progress(run));
    return { A, B };
  },
  applyResult(run, result, goals) {
    const P = Profile.data;
    const out = { result, coins: 0, tickets: 0, lifeLost: false, done: false, victory: false, rayo: false, exclusive: null };
    const rival = Run.rivalName(run);
    if (result === 'win') {
      run.wins++; out.rayo = Profile.addWin();
      const finalMatch = run.kind !== 'infinite' && run.index >= run.schedule.length - 1;
      if (run.kind === 'story') {
        out.coins = 25 + goals * 5; out.tickets = 1;
        const SS = P.story[run.stage || 's1'];
        SS.best = Math.max(SS.best, run.index + 1);
        if (finalMatch) { out.tickets += 3; SS.done = true; }
      } else if (run.kind === 'special') {
        out.coins = 60 + goals * 5; out.tickets = 2;
        out.exclusive = teamStarReward(P, rival, true);
        P.specials[rival] = (P.specials[rival] || 0) + 1;
      } else if (run.kind === 'chain') {
        out.coins = 30 + run.index * 10 + goals * 5;
        if (finalMatch) {
          // Premios de cadena: Rayo, tickets, monedas, la estrella del último rival, técnica legendaria la 1.ª vez, extra por perfecta y medallas
          const n = (P.chains[run.chain] || 0) + 1; P.chains[run.chain] = n;
          P.rayos++; out.chainRayo = true; out.tickets = 5; out.coins += 150;
          out.exclusive = teamStarReward(P, rival);
          if (n === 1) {
            const free = LEG_TECHS.filter(t => !P.techs[t]), t = free.length ? free[Math.floor(Math.random() * free.length)] : null;
            out.tickets += 10; if (t != null) { P.techs[t] = 1; out.chainTech = t; }
          }
          if (run.lives === run.maxLives) { out.tickets += 5; out.perfect = true; P.chainPerfect = P.chainPerfect || {}; P.chainPerfect[run.chain] = 1; }
          if (n === 3 || n === 5) { out.tickets += 15; P.rayos++; out.medal = n === 3 ? 'plata' : 'oro'; }
        }
      } else if (run.kind === 'infinite') {
        out.coins = 20 + run.index * 3 + goals * 5;
        if (Run.isBoss(run)) {
          out.tickets = 2;
          const opts = versionPickOptions(run.index + 1);
          if (opts.length) { const uid = Date.now(); (P.giftPicks = P.giftPicks || []).push({ code: '∞', uid, opts, desc: TX('Jefe de la oleada {0} del Infinito: elige una versión', run.index + 1) }); out.versionPick = uid; }
        }
        P.infBest = Math.max(P.infBest, run.index + 1);
      }
      if (finalMatch) { out.done = true; out.victory = true; run.state = 'over'; }
      else { run.rewards = Run.makeRewards(run); run.state = 'reward'; }
    } else {
      out.coins = 10 + goals * 5; run.lives--; out.lifeLost = true;
      if (run.lives <= 0) { out.done = true; run.state = 'over'; }
      else run.state = 'map';
    }
    P.coins += out.coins; P.tickets += out.tickets; Profile.save();
    run.coinsEarned += out.coins; run.ticketsEarned += out.tickets;
    run.last = out;
    return out;
  },
  makeRewards(run) {
    const rnd = a => a[Math.floor(Math.random() * a.length)];
    const opts = [], members = run.roster.map((_, i) => i);
    // Evolución (si alguna técnica puede evolucionar)
    const evos = [];
    run.roster.forEach((m, mi) => m.techs.forEach(t => { if (EVO(t) != null && !m.techs.includes(EVO(t))) evos.push({ kind: 'evolve', member: mi, from: t, to: EVO(t) }); }));
    if (evos.length) opts.push(rnd(evos));
    // Técnicas nuevas según la posición (un portero solo paradas; un delantero sobre todo tiros…), de las suyas si puede
    for (let tries = 0; tries < 20 && opts.length < 3; tries++) {
      const mi = rnd(members), m = run.roster[mi], pd = PLAYER(m.id);
      if (opts.some(o => o.member === mi && o.kind === 'tech')) continue;
      const type = rollFitType(pd.role);
      const ok = t => t && t.type === type && !m.techs.includes(t.id) && Object.values(GAME.evo).indexOf(t.id) < 0;
      const own = pd.moves.map(x => TECH(x[0])).filter(ok).map(t => t.id);
      let id = null, rare = false;
      if (own.length && Math.random() > 0.25) id = rnd(own);
      else {
        const all = Object.values(GAME.techniques).filter(ok), mine = all.filter(t => t.elem === pd.elem);
        const pool = mine.length ? mine : all;
        if (pool.length) { id = rnd(pool).id; rare = true; }
      }
      if (id == null) continue;
      opts.push({ kind: 'tech', member: mi, tech: id, rare, replace: Run.replaceFor(m, id) });
      if (opts.length >= 2 && Math.random() < 0.5) break;
    }
    // Fichaje temporal o habilidad
    const beaten = TEAM(run.schedule[run.index]);
    const have = new Set(run.roster.map(m => m.id));
    const cands = beaten.players.map(m => m.id).filter(id => !have.has(id) && PLAYER(id).cs);
    if (opts.length < 3 && cands.length && run.roster.length < 7 && Math.random() < 0.6) opts.push({ kind: 'recruit', id: rnd(cands) });
    const names = Object.keys(PASSIVES);
    for (let tries = 0; tries < 10 && opts.length < 3; tries++) {
      const mi = rnd(members), m = run.roster[mi], n = rnd(names);
      if (m.passives.length >= 2 || m.passives.includes(n)) continue;
      opts.push({ kind: 'passive', member: mi, name: n });
    }
    while (opts.length < 3) opts.push({ kind: 'coins', amount: 30 });
    return opts.slice(0, 3);
  },
  // opt = null: saltas la recompensa (no te quedas con ninguna)
  takeReward(run, opt) {
    if (!opt) opt = { kind: 'skip' };
    if (opt.kind === 'tech') {
      const t = run.roster[opt.member].techs;
      if (opt.replace != null && t.includes(opt.replace)) t[t.indexOf(opt.replace)] = opt.tech; else if (t.length < TECH_SLOTS) t.push(opt.tech); else t[t.length - 1] = opt.tech;
    }
    if (opt.kind === 'evolve') { const t = run.roster[opt.member].techs; t[t.indexOf(opt.from)] = opt.to; }
    if (opt.kind === 'recruit') run.roster.push(runMember(opt.id, true));
    if (opt.kind === 'passive') run.roster[opt.member].passives.push(opt.name);
    if (opt.kind === 'coins') { Profile.data.coins += opt.amount; Profile.save(); run.coinsEarned += opt.amount; }
    run.rewards = null; run.index++; run.state = 'map';
    if (run.kind === 'infinite' && run.index >= run.schedule.length) run.schedule.push(Run.infiniteTeam(run.index));
  },
  // Con los huecos llenos, la técnica nueva sustituye a la más floja de su mismo tipo (o a la más floja)
  replaceFor(m, newId) {
    if (m.techs.length < TECH_SLOTS) return null;
    const nt = TECH(newId), keeper = PLAYER(m.id).role === 'POR';
    const cands = m.techs.filter(t => !(keeper && TECH(t).type === 'parada' && nt.type !== 'parada' && m.techs.filter(x => TECH(x).type === 'parada').length === 1));
    const same = cands.filter(t => TECH(t).type === nt.type);
    const pool = same.length ? same : cands;
    return pool.sort((a, b) => TECH(a).power - TECH(b).power)[0] ?? m.techs[m.techs.length - 1];
  },
  swapLineup(run, slot, rosterIdx) {
    const cur = run.lineup.indexOf(rosterIdx);
    if (cur >= 0) run.lineup[cur] = run.lineup[slot];
    run.lineup[slot] = rosterIdx;
  },
  // Una partida en curso por modo (Historia, especial, cadena, Infinito), todas a la vez: { kind: run }.
  // (Antes solo se guardaba una; si la clave tiene una partida suelta, se convierte.)
  all() {
    let o = null; try { o = JSON.parse(localStorage.getItem('inazuma-run3') || 'null'); } catch (_) {}
    if (!o || typeof o !== 'object') return {};
    if (o.kind) return o.roster ? { [o.kind]: o } : {};
    for (const k in o) if (!o[k] || !o[k].roster || !o[k].kind || o[k].state === 'over') delete o[k];
    return o;
  },
  write(all) { try { if (Object.keys(all).length) localStorage.setItem('inazuma-run3', JSON.stringify(all)); else localStorage.removeItem('inazuma-run3'); } catch (_) {} },
  save(run) { const all = Run.all(); all[run.kind] = run; Run.write(all); },
  load(kind) { return Run.all()[kind] || null; },
  clear(kind) { if (kind == null) return Run.write({}); const all = Run.all(); delete all[kind]; Run.write(all); },
};
