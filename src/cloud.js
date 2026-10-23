/* =====================================================================
   NUBE: cuentas (Google o usuario y contraseña) y guardado de la partida.
   Usa Firebase: Authentication para las cuentas y Firestore para guardar
   (un documento por jugador en «saves/{uid}»). La librería de Firebase
   solo se descarga si src/cloud-config.js está rellenado.
   La partida es la misma de siempre (las claves de localStorage de
   SAVE_KEYS); aquí solo se sube y se baja entera.

   Cómo decide qué partida manda (rev = número de versión en la nube):
   - Nube sin cambios desde la última vez y móvil con cambios → se sube.
   - Nube con cambios y móvil sin cambios → se baja.
   - Las dos con cambios (o partida de invitado contra una cuenta que
     ya tiene partida) → se pregunta al jugador. Nunca se borra nada
     sin preguntar.
   ===================================================================== */
const SAVE_KEYS = ['inazuma-perfil', 'inazuma-carrera', 'inazuma-ajustes', 'inazuma-run3', 'inazuma-sonido', 'inazuma-jugador'];
// Progreso de verdad (lo que se compara para decidir si hay dos partidas distintas); ajustes y sonido son de cada dispositivo
const PROGRESS_KEYS = ['inazuma-perfil', 'inazuma-carrera', 'inazuma-run3', 'inazuma-jugador'];
const DEVICE_KEYS = ['inazuma-ajustes', 'inazuma-sonido'];

const Cloud = (() => {
  const META_KEY = 'inazuma-cuenta';
  const EMAIL_DOMAIN = 'jugadores.inazumarogue.app';   // el usuario «fran» se guarda como fran@jugadores… (no se envía ningún correo)
  const FB_VERSION = '10.12.2';
  const CFG = (typeof CLOUD_CONFIG !== 'undefined' && CLOUD_CONFIG) || {};
  // Cada subida gasta cuota de Firebase (plan gratis: ~20.000 escrituras al día para todos los jugadores).
  // Antes se subía 3 s después de cada cambio; ahora como mucho una vez cada 5 minutos mientras juegas, al acabar cada partido y al salir de la app.
  const PUSH_DELAY = (typeof CLOUD_PUSH_DELAY !== 'undefined' && CLOUD_PUSH_DELAY) || 600000;   // como mucho una subida cada 10 min mientras juegas (y siempre al salir o cambiar de app)
  const TIMEOUT = 15000;
  const MAX_RAW = 20000;        // por encima (casi siempre), la partida se guarda comprimida: ocupa y descarga ~8 veces menos de la cuota de Firebase
  const RETRY = (typeof CLOUD_RETRY !== 'undefined' && CLOUD_RETRY) || [20000, 45000, 90000, 180000, 300000];   // reintentos tras un error (cada vez más espaciados)
  const RETRY_QUOTA = (typeof CLOUD_RETRY_QUOTA !== 'undefined' && CLOUD_RETRY_QUOTA) || [600000, 1800000, 3600000];   // cuota de Firebase agotada: esperar mucho más

  /* ---------- Datos de la cuenta en este dispositivo ---------- */
  const origSet = Storage.prototype.setItem, origRemove = Storage.prototype.removeItem;
  let meta = {};
  try { meta = JSON.parse(localStorage.getItem(META_KEY) || '{}') || {}; } catch (_) { meta = {}; }
  const saveMeta = () => { try { origSet.call(localStorage, META_KEY, JSON.stringify(meta)); } catch (_) {} };

  /* ---------- Partida local ---------- */
  let applying = false, frozen = false;   // frozen: se va a recargar con la partida bajada; no dejar que nada la pise
  function snapshot() { const o = {}; SAVE_KEYS.forEach(k => { try { const v = localStorage.getItem(k); if (v != null) o[k] = v; } catch (_) {} }); return o; }
  function restore(o, freeze) {
    if (freeze) frozen = true;
    applying = true;
    try { SAVE_KEYS.forEach(k => { try { if (o && o[k] != null) origSet.call(localStorage, k, o[k]); else origRemove.call(localStorage, k); } catch (_) {} }); }
    finally { applying = false; }
  }
  function hash(o, keys = SAVE_KEYS) {   // huella corta de la partida para saber si ha cambiado
    const s = keys.map(k => k + '=' + (o && o[k] != null ? o[k] : '')).join('\\u0001');
    let h1 = 0x811c9dc5, h2 = 0x1000193;
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ c, 2246822519); }
    return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36) + ':' + s.length;
  }
  const hashP = o => hash(o, PROGRESS_KEYS);   // solo el progreso
  // ¿Hay progreso de verdad? (ya hizo la tirada de bienvenida o tiene Carrera o Carrera Jugador)
  function hasProgress(o) {
    try { const p = JSON.parse((o || {})['inazuma-perfil'] || 'null'); if (p && (p.firstDone || Object.keys(p.coll || {}).length)) return true; } catch (_) {}
    return !!(o && (o['inazuma-carrera'] || o['inazuma-jugador']));
  }
  function describe(o) {
    try {
      const p = JSON.parse(o['inazuma-perfil'] || '{}'), cr = o['inazuma-carrera'] ? JSON.parse(o['inazuma-carrera']) : null;
      const pc = o['inazuma-jugador'] ? JSON.parse(o['inazuma-jugador']) : null;
      const st = p.story || {}, etapas = ['s1', 's2', 's3', 's4'].filter(k => st[k] && st[k].done).length;
      const pcName = pc && pc.me ? ((typeof PLAYER === 'function' && PLAYER(pc.me.id)) || pc.me.pd || {}).name : '';
      return { players: Object.keys(p.coll || {}).length, tickets: p.tickets || 0, coins: p.coins || 0, wins: p.wins || 0, etapas,
        career: cr ? (cr.school || TX('Carrera')) + TX(' · temporada ') + (cr.season || 1) : '',
        pcareer: pc && pc.me ? `${pcName || '?'} · ${pc.school || ''} · ${TX('Temporada')} ${pc.season || 1} · ${TX('Nivel')} ${pc.me.lv || 1}` : '' };
    } catch (_) { return { players: 0, tickets: 0, coins: 0, wins: 0, etapas: 0, career: '', pcareer: '' }; }
  }

  /* ---------- Avisos de cambios: cualquier guardado del juego programa una subida ---------- */
  Storage.prototype.setItem = function (k, v) {
    if (frozen && this === localStorage && SAVE_KEYS.includes(k)) return;   // a punto de recargar con la partida de la nube
    origSet.call(this, k, v); if (!applying && this === localStorage && SAVE_KEYS.includes(k)) touch();
  };
  Storage.prototype.removeItem = function (k) {
    if (frozen && this === localStorage && SAVE_KEYS.includes(k)) return;
    origRemove.call(this, k); if (!applying && this === localStorage && SAVE_KEYS.includes(k)) touch();
  };

  /* ---------- Estado visible para la interfaz ---------- */
  const state = { status: 'idle', msg: '', lastOk: meta.lastOk || 0, conflict: null };
  const listeners = new Set();
  function setStatus(status, msg) { state.status = status; state.msg = msg || ''; listeners.forEach(f => { try { f(state); } catch (_) {} }); }
  const EXPIRED_MSG = TX('Tu sesión se ha cerrado. Vuelve a entrar para seguir guardando en la nube.');

  /* ---------- Firebase (se carga solo si hace falta) ---------- */
  const enabled = () => !!(CFG.apiKey && CFG.projectId);
  const loggedIn = () => !!meta.uid;
  const user = () => meta.user || null;
  let app = null, auth = null, db = null, readyP = null, signingOut = false;
  function loadScript(src) {
    return new Promise((ok, ko) => { const s = document.createElement('script'); s.src = src; s.async = false; s.onload = ok; s.onerror = () => ko(new Error('no carga ' + src)); document.head.appendChild(s); });
  }
  function ready() {
    if (!enabled()) return Promise.resolve(false);
    if (!readyP) readyP = (async () => {
      if (typeof firebase === 'undefined') {
        const B = 'https://www.gstatic.com/firebasejs/' + FB_VERSION + '/';
        await loadScript(B + 'firebase-app-compat.js');
        await Promise.all([loadScript(B + 'firebase-auth-compat.js'), loadScript(B + 'firebase-firestore-compat.js')]);
      }
      app = firebase.apps && firebase.apps.length ? firebase.app() : firebase.initializeApp(CFG);
      auth = app.auth(); db = app.firestore();
      // Vuelta de un inicio con Google por redirección (cuando el navegador no deja abrir ventanas)
      if (meta.redirect) {
        try { const r = await auth.getRedirectResult(); if (r && r.user) startSession(r.user, nameOf(r.user), 'google'); } catch (_) {}
        meta.redirect = false; saveMeta();
      }
      await new Promise(res => { const off = auth.onAuthStateChanged(() => { off(); res(); }); });
      watchAuth();
      return true;
    })().catch(() => { readyP = null; return false; });
    return readyP;
  }
  // Si Firebase cierra la sesión por su cuenta (cuenta borrada, contraseña cambiada…), se avisa
  function watchAuth() {
    const check = u => {
      if (!meta.uid || signingOut) return;
      if (!u || u.uid !== meta.uid) { if (!meta.expired) { meta.expired = true; saveMeta(); setStatus('expired', EXPIRED_MSG); } }
      else if (meta.expired) { meta.expired = false; saveMeta(); }
    };
    auth.onAuthStateChanged(check); check(auth.currentUser);
  }
  const withTimeout = p => Promise.race([p, new Promise((_, ko) => setTimeout(() => ko({ code: 'timeout' }), TIMEOUT))]);
  const ref = () => db.collection('saves').doc(meta.uid);
  function errOf(e) {
    const c = String((e && e.code) || '');
    if (c === 'timeout' || c === 'unavailable' || c.includes('network') || c === 'deadline-exceeded') return { offline: true, code: c };
    if (c === 'resource-exhausted') return { quota: true, code: c };   // cuota del día de Firebase agotada (no es culpa del jugador)
    if (c === 'permission-denied' || c === 'unauthenticated') { if (!auth || !auth.currentUser) return { expired: true, code: c }; }
    return { code: c || 'desconocido' };
  }

  /* ---------- Cuentas ---------- */
  const cleanUser = u => String(u || '').trim().toLowerCase();
  function checkUser(u) {
    if (u.length < 3 || u.length > 16) return TX('El nombre de usuario debe tener entre 3 y 16 letras o números.');
    if (!/^[a-z0-9_]+$/.test(u)) return TX('Usa solo letras sin tildes, números y guion bajo (_). Sin espacios ni ñ.');
    return '';
  }
  const emailOf = u => u + '@' + EMAIL_DOMAIN;
  const nameOf = u => String(u.displayName || (u.email || '').split('@')[0] || 'jugador').slice(0, 24);
  function authError(e, signup) {
    const c = String((e && e.code) || '');
    if (c === 'auth/email-already-in-use') return TX('Ese nombre de usuario ya está cogido. Prueba con otro.');
    if (c === 'auth/invalid-credential' || c === 'auth/wrong-password' || c === 'auth/user-not-found' || c === 'auth/invalid-login-credentials') return TX('Usuario o contraseña incorrectos.');
    if (c === 'auth/weak-password') return TX('La contraseña es demasiado corta (mínimo 6 caracteres).');
    if (c === 'auth/too-many-requests') return TX('Demasiados intentos seguidos. Espera un poco y vuelve a probar.');
    if (c === 'auth/network-request-failed') return TX('No hay conexión. Prueba otra vez cuando tengas internet.');
    if (c === 'auth/user-disabled') return TX('Esta cuenta está desactivada.');
    if (c === 'auth/unauthorized-domain') return TX('Esta web no está autorizada en Firebase (Authentication → Configuración → Dominios autorizados).');
    if (c === 'auth/operation-not-allowed') return TX('Esta forma de entrar no está activada en Firebase (Authentication → Método de inicio de sesión).');
    if (c === 'auth/account-exists-with-different-credential') return TX('Ya hay una cuenta con ese correo de otra forma.');
    return (signup ? TX('No se ha podido crear la cuenta') : TX('No se ha podido entrar')) + (c ? ' (' + c.replace('auth/', '') + ').' : '.');
  }
  const offlineMsg = TX('No se puede conectar con el servidor de cuentas. Comprueba tu internet.');
  async function signUp(username, password) {
    if (!enabled()) return { ok: false, msg: TX('Las cuentas aún no están activadas en esta versión del juego.') };
    const u = cleanUser(username), bad = checkUser(u); if (bad) return { ok: false, msg: bad };
    if (String(password || '').length < 6) return { ok: false, msg: TX('La contraseña debe tener al menos 6 caracteres.') };
    if (!await ready()) return { ok: false, msg: offlineMsg };
    try {
      const c = await auth.createUserWithEmailAndPassword(emailOf(u), password);
      try { await c.user.updateProfile({ displayName: u }); } catch (_) {}
      return startSession(c.user, u, 'password');
    } catch (e) { return { ok: false, msg: authError(e, true) }; }
  }
  async function signIn(username, password) {
    if (!enabled()) return { ok: false, msg: TX('Las cuentas aún no están activadas en esta versión del juego.') };
    const u = cleanUser(username); if (!u || !password) return { ok: false, msg: TX('Escribe tu usuario y tu contraseña.') };
    if (!await ready()) return { ok: false, msg: offlineMsg };
    try { const c = await auth.signInWithEmailAndPassword(emailOf(u), password); return startSession(c.user, u, 'password'); }
    catch (e) { return { ok: false, msg: authError(e, false) }; }
  }
  async function signInGoogle() {
    if (!enabled()) return { ok: false, msg: TX('Las cuentas aún no están activadas en esta versión del juego.') };
    if (!await ready()) return { ok: false, msg: offlineMsg };
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try { const r = await auth.signInWithPopup(provider); return startSession(r.user, nameOf(r.user), 'google'); }
    catch (e) {
      const c = String((e && e.code) || '');
      if (c === 'auth/popup-closed-by-user' || c === 'auth/cancelled-popup-request' || c === 'auth/user-cancelled') return { ok: false, msg: '' };
      if (c === 'auth/popup-blocked' || c === 'auth/operation-not-supported-in-this-environment' || c === 'auth/web-storage-unsupported') {
        meta.redirect = true; saveMeta();
        try { await auth.signInWithRedirect(provider); return { ok: false, redirect: true, msg: TX('Abriendo Google…') }; }
        catch (e2) { meta.redirect = false; saveMeta(); return { ok: false, msg: authError(e2, false) }; }
      }
      return { ok: false, msg: authError(e, false) };
    }
  }
  function startSession(fbUser, name, via) {
    if (meta.uid !== fbUser.uid) { meta.owner = null; meta.rev = null; meta.hash = null; }   // otra cuenta: lo que haya en el móvil aún no es suyo
    meta.uid = fbUser.uid; meta.user = name; meta.via = via; meta.expired = false; saveMeta();
    return { ok: true };
  }
  // Cerrar sesión: sube lo último y deja el móvil limpio para que otro pueda entrar.
  async function signOut({ keepLocal = false, force = false } = {}) {
    if (loggedIn() && !meta.expired && !force) {
      const r = await push(true);
      if (r !== 'uploaded' && r !== 'same') return { ok: false, msg: r === 'conflict' ? TX('Hay otra versión de tu partida en la nube. Resuélvelo antes de salir.') : TX('No se ha podido subir tu última partida (¿sin conexión?).') };
    }
    signingOut = true;
    try { if (await ready()) await auth.signOut(); } catch (_) {}
    signingOut = false;
    const guest = meta.guest; meta = { guest }; saveMeta();
    if (!keepLocal) { applying = true; try { PROGRESS_KEYS.forEach(k => { try { origRemove.call(localStorage, k); } catch (_) {} }); } finally { applying = false; } }   // todo el progreso (también la Carrera Jugador)
    clearTimeout(timer); timer = 0; clearTimeout(retryT); retryT = 0; tries = 0;
    state.lastOk = 0; state.conflict = null; setStatus('idle');
    return { ok: true };
  }

  /* ---------- Empaquetar la partida para Firestore ---------- */
  async function gz(str) {
    const cs = new CompressionStream('gzip'), buf = new Uint8Array(await new Response(new Blob([str]).stream().pipeThrough(cs)).arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(s);
  }
  async function ungz(b64) {
    const bin = atob(b64), buf = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  }
  async function packData(data) {
    const json = JSON.stringify(data);
    if (json.length < MAX_RAW || typeof CompressionStream === 'undefined') return { data, z: null };
    return { data: null, z: await gz(json) };
  }
  async function rowOf(d) {
    const x = d.data() || {};
    let data = x.data || {};
    if (x.z) { try { data = JSON.parse(await ungz(x.z)); } catch (_) { data = {}; } }
    const t = x.updatedAt && x.updatedAt.toDate ? x.updatedAt.toDate() : null;
    return { rev: x.rev || 0, dev: x.dev || null, data, updated_at: t ? t.toISOString() : null };
  }

  /* ---------- Subir y bajar ---------- */
  async function fetchCloud() {
    if (!await ready()) return { error: { offline: true } };
    if (!auth.currentUser || auth.currentUser.uid !== meta.uid) return { error: { expired: true } };
    try { const d = await withTimeout(ref().get({ source: 'server' })); return { row: d.exists ? await rowOf(d) : null }; }
    catch (e) { return { error: errOf(e) }; }
  }
  function synced(rev, data) { meta.owner = meta.uid; meta.rev = rev; meta.hash = hash(data); meta.phash = hashP(data); meta.lastOk = state.lastOk = Date.now(); tries = 0; saveMeta(); }
  // Reintento automático tras un error o sin conexión (antes solo se reintentaba al volver a guardar algo)
  let retryT = 0, tries = 0;
  function retryLater(quota) {
    if (retryT || !loggedIn() || meta.expired) return;
    const L = quota ? RETRY_QUOTA : RETRY, d = L[Math.min(tries, L.length - 1)]; tries++;
    retryT = setTimeout(() => { retryT = 0; if (!state.conflict && !syncing) push(true); }, d);
  }
  function failStatus(r) {
    if (r && r.expired) { meta.expired = true; saveMeta(); setStatus('expired', EXPIRED_MSG); return; }
    if (r && r.offline) setStatus('offline', TX('Sin conexión: se guardará en la nube cuando vuelva internet.'));
    else if (r && r.quota) setStatus('error', TX('La nube está saturada ahora mismo. Tu partida está a salvo en este dispositivo y se subirá más tarde.'));
    else setStatus('error', TX('Error al guardar en la nube (') + ((r && r.code) || '?') + TX('). Se reintentará.'));
    retryLater(r && r.quota);
  }
  // Sube la partida del móvil. «overRev» = pisar a propósito esa versión de la nube (cuando el jugador elige la del móvil).
  let pushing = null, again = false, syncing = false;
  async function push(now, overRev) {
    if (!enabled() || !loggedIn() || meta.expired || frozen) return 'off';
    if (state.conflict && overRev == null) return 'conflict';
    if (syncing && overRev == null) { schedule(); return 'queued'; }   // primero se termina de comparar con la nube
    if (pushing) { again = true; await pushing; if (!now) return 'queued'; }
    const run = (async () => {
      const data = snapshot(), h = hash(data);
      if (meta.owner === meta.uid && h === meta.hash && overRev == null) { setStatus('ok'); return 'same'; }
      // Solo han cambiado ajustes o sonido (son de cada dispositivo): no se gasta una subida
      if (meta.owner === meta.uid && meta.phash && hashP(data) === meta.phash && overRev == null) { meta.hash = h; saveMeta(); setStatus('ok'); return 'same'; }
      if (!hasProgress(data) && meta.owner !== meta.uid && overRev == null) return 'same';   // no subir una partida vacía a una cuenta nueva
      if (!await ready()) { failStatus({ offline: true }); return 'error'; }
      if (!auth.currentUser || auth.currentUser.uid !== meta.uid) { failStatus({ expired: true }); return 'error'; }
      setStatus('saving');
      const base = overRev != null ? overRev : meta.owner === meta.uid ? (meta.rev || 0) : 0;
      const packed = await packData(data);
      // Una sola escritura, sin leer antes (antes era una transacción: lectura + escritura). Las reglas de Firebase solo aceptan
      // la versión siguiente (rev + 1); si la nube va por otra, la escritura se rechaza y entonces sí se lee para comparar.
      if (!meta.dev) { meta.dev = Math.random().toString(36).slice(2, 10); saveMeta(); }   // marca de este dispositivo (para reconocer sus propias subidas)
      const docOf = rev => ({ username: meta.user || '', rev, dev: meta.dev, data: packed.data, z: packed.z, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      let res;
      try {
        await withTimeout(ref().set(docOf(base + 1)));
        res = { rev: base + 1 };
      } catch (e) {
        const er = errOf(e);
        if (er.code === 'permission-denied' && auth.currentUser && auth.currentUser.uid === meta.uid) res = { conflict: true };
        else { failStatus(er); return 'error'; }
      }
      if (res.conflict) {
        const c = await fetchCloud();
        if (c.row) {
          if (hashP(c.row.data || {}) === hashP(data)) { synced(c.row.rev, data); setStatus('ok'); return 'same'; }   // la nube ya tenía esto mismo
          // La subida que «falló» sin conexión llegó más tarde (la última versión de la nube es de este mismo dispositivo): se sube encima
          if (c.row.dev && c.row.dev === meta.dev && c.row.rev === base + 1 && overRev == null) {
            try { await withTimeout(ref().set(docOf(c.row.rev + 1))); synced(c.row.rev + 1, data); setStatus('ok'); return 'uploaded'; }
            catch (e2) { failStatus(errOf(e2)); return 'error'; }
          }
          return conflict(c.row);
        }
        failStatus(c.error); return 'error';
      }
      synced(res.rev, data); setStatus('ok');
      return 'uploaded';
    })();
    pushing = run;
    let r; try { r = await run; } finally { pushing = null; }
    if (again) { again = false; if (r === 'uploaded' || r === 'same') schedule(); }
    return r;
  }
  let timer = 0;
  // Si ya hay una subida programada, no se retrasa (antes cada guardado la empujaba otra vez): así sube cada minuto aunque no pares de jugar
  function schedule() { if (timer) return; timer = setTimeout(() => { timer = 0; push(); }, PUSH_DELAY); }
  function touch() { if (enabled() && loggedIn() && !meta.expired) schedule(); }
  function conflict(row) {
    const local = snapshot();
    state.conflict = { cloud: row, local, cloudInfo: describe(row.data || {}), localInfo: describe(local), cloudDate: row.updated_at };
    setStatus('conflict', TX('Hay dos versiones distintas de tu partida.'));
    return 'conflict';
  }
  // Al arrancar o al iniciar sesión: decide si subir, bajar o preguntar.
  // Devuelve 'off' | 'offline' | 'expired' | 'error' | 'same' | 'uploaded' | 'downloaded' | 'conflict'
  async function sync() {
    syncing = true;
    try { return await syncNow(); } finally { syncing = false; }
  }
  async function syncNow() {
    if (!enabled()) return 'off';
    if (!await ready()) { if (loggedIn()) setStatus('offline', TX('Sin conexión: se guardará en la nube cuando vuelva internet.')); return loggedIn() ? 'offline' : 'off'; }
    if (!loggedIn()) return 'off';
    if (meta.expired) { setStatus('expired', EXPIRED_MSG); return 'expired'; }
    setStatus('saving');
    const c = await fetchCloud();
    if (c.error) { failStatus(c.error); return c.error.expired ? 'expired' : c.error.offline ? 'offline' : 'error'; }
    const local = snapshot(), mine = meta.owner === meta.uid;
    const localChanged = !mine || hash(local) !== meta.hash;
    // ¿Ha cambiado el progreso del móvil? (cambiar solo ajustes o sonido no cuenta como «otra partida»)
    const localProgChanged = !mine || (meta.phash ? hashP(local) !== meta.phash : localChanged);
    if (!c.row) {   // cuenta sin partida en la nube: se sube la del móvil (si hay algo)
      if (!hasProgress(local)) { meta.owner = meta.uid; meta.rev = 0; meta.hash = hash(local); meta.phash = hashP(local); saveMeta(); setStatus('ok'); return 'same'; }
      syncing = false; return push(true, 0);
    }
    const cloudChanged = !mine || c.row.rev !== meta.rev;
    if (!cloudChanged) { if (localChanged) { syncing = false; return push(true); } synced(c.row.rev, local); setStatus('ok'); return 'same'; }
    const cloudData = c.row.data || {};
    if (!localProgChanged || !hasProgress(local) || hashP(local) === hashP(cloudData)) {
      // Mientras se comparaba, ¿se ha jugado en este móvil? Entonces no se pisa nada: se pregunta
      if (hash(snapshot()) !== hash(local)) return conflict(c.row);
      useCloud(c.row, local); return 'downloaded';
    }
    return conflict(c.row);
  }
  // Baja la partida de la nube; ajustes y sonido de este dispositivo se conservan
  function useCloud(row, keepFrom) {
    const data = Object.assign({}, row.data || {});
    if (keepFrom) DEVICE_KEYS.forEach(k => { if (keepFrom[k] != null) data[k] = keepFrom[k]; });
    restore(data, true); synced(row.rev, row.data || {}); state.conflict = null; setStatus('ok');
  }
  // El jugador resuelve el conflicto: 'cloud' (baja la de la nube) o 'local' (sube la del móvil encima)
  async function resolve(choice) {
    const C = state.conflict; if (!C) return 'same';
    if (choice === 'cloud') { useCloud(C.cloud, snapshot()); return 'downloaded'; }
    state.conflict = null;
    return push(true, C.cloud.rev);
  }

  // Al salir del juego, cambiar de app o acabar un partido: subir ya lo pendiente
  const flush = () => { if (timer) { clearTimeout(timer); timer = 0; push(true); } };
  // Al acabar un partido: solo si la última subida fue hace más de 10 minutos (si no, ya subirá el temporizador o al salir)
  const flushOld = () => { if (timer && Date.now() - (state.lastOk || meta.lastOk || 0) > PUSH_DELAY) flush(); };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('pagehide', flush);
  if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('online', () => { if (loggedIn() && (state.status === 'offline' || state.status === 'error')) { clearTimeout(retryT); retryT = 0; push(true); } });

  // Partida de invitado: recuerda que ya eligió no crear cuenta (para no insistir)
  const guestChosen = () => !!meta.guest;
  function chooseGuest() { meta.guest = true; saveMeta(); }

  return { SAVE_KEYS, enabled, ready, loggedIn, user, via: () => meta.via || '', expired: () => !!meta.expired, pendingRedirect: () => !!meta.redirect,
    state, onChange: f => (listeners.add(f), () => listeners.delete(f)),
    signUp, signIn, signInGoogle, signOut, sync, push, flush, flushOld, resolve, snapshot, restore, describe, hasProgress, guestChosen, chooseGuest, checkUser, cleanUser, PROGRESS_KEYS,
    _meta: () => meta };
})();
