(function () {
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  // --- Onglets ---
  var views = { tempo: document.getElementById('tempo'), gamme: document.getElementById('gamme') };
  var navBtns = document.querySelectorAll('#nav button');
  function show(name) {
    for (var k in views) views[k].hidden = k !== name;
    navBtns.forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.view === name ? 'true' : 'false'); });
    store('tempo.vue', name);
  }
  navBtns.forEach(function (b) { b.addEventListener('click', function () { show(b.dataset.view); }); });
  show(store('tempo.vue') === 'gamme' ? 'gamme' : 'tempo');

  // --- Son ---
  var ctx = null;
  // Crée et réveille le son dans un geste de l'utilisateur. Un tampon muet
  // amorce la sortie de l'iPhone, sinon la première note arrive en retard.
  function audio() {
    if (!ctx) {
      // Sans ça, le bouton silencieux de l'iPhone coupe Web Audio
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      var src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      src.connect(ctx.destination); src.start(0);
    }
    if (ctx.state !== 'running') ctx.resume();
    return ctx;
  }

  // Bus de sortie : un peu de réverbe pour que le piano respire
  var bus = null;
  function out() {
    if (bus) return bus;
    var c = audio(), len = Math.floor(c.sampleRate * 1.8);
    var ir = c.createBuffer(2, len, c.sampleRate);
    for (var ch = 0; ch < 2; ch++) {
      var d = ir.getChannelData(ch);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    var rev = c.createConvolver(), wet = c.createGain(), tone = c.createBiquadFilter();
    rev.buffer = ir; wet.gain.value = 0.22;
    tone.type = 'lowpass'; tone.frequency.value = 5200;
    bus = c.createGain();
    bus.connect(tone).connect(c.destination);
    bus.connect(rev).connect(wet).connect(c.destination);
    return bus;
  }

  // Petit piano de synthèse : trois partiels qui s'éteignent
  function note(midi, t, len, vel) {
    var c = audio(), f = 440 * Math.pow(2, (midi - 69) / 12);
    t = t || c.currentTime + 0.005; len = len || 1.8; vel = vel || 0.5;
    var env = c.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(vel, t + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, t + len);
    env.connect(out());
    [[1, 1], [2, 0.35], [3, 0.12]].forEach(function (p) {
      var o = c.createOscillator(), g = c.createGain();
      o.frequency.value = f * p[0]; g.gain.value = p[1];
      o.connect(g).connect(env); o.start(t); o.stop(t + len + 0.05);
    });
  }

  // --- Tempo ---
  var PAUSE = 2500;   // ms de silence : la frappe suivante démarre une nouvelle mesure
  var WINDOW = 32;    // frappes gardées pour le calcul

  var taps = [];
  var pad = document.getElementById('pad');
  var bpmEl = document.getElementById('bpm');
  var hint = document.getElementById('hint');
  var wave = document.getElementById('wave');
  var clear = document.getElementById('clear');
  var hap = document.getElementById('hap');
  var staleTimer = null;
  var stale = false;

  // Droite des moindres carrés sur les instants : la pente est la durée d'un temps.
  // Plus stable qu'une moyenne d'écarts quand une frappe dérape.
  function bpm() {
    var n = taps.length;
    if (n < 2) return null;
    var mx = (n - 1) / 2, my = 0, num = 0, den = 0, i;
    for (i = 0; i < n; i++) my += taps[i] - taps[0];
    my /= n;
    for (i = 0; i < n; i++) {
      num += (i - mx) * (taps[i] - taps[0] - my);
      den += (i - mx) * (i - mx);
    }
    var beat = num / den;
    return beat > 0 ? 60000 / beat : null;
  }

  function render() {
    var v = bpm();
    clear.classList.toggle('off', taps.length === 0);
    if (v === null) {
      bpmEl.className = 'bpm idle';
      bpmEl.textContent = taps.length ? '…' : 'Tape';
      hint.textContent = taps.length ? 'encore' : 'en rythme, n’importe où';
      return;
    }
    bpmEl.className = 'bpm' + (stale ? ' done' : '');
    bpmEl.textContent = Math.round(v);
    hint.textContent = stale ? 'BPM · tape pour refaire' : 'BPM · ' + taps.length + ' frappes';
  }

  function buzz() { try { hap.click(); } catch (e) {} }

  pad.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    var t = e.timeStamp || performance.now();
    if (taps.length && t - taps[taps.length - 1] > PAUSE) taps = [];
    taps.push(t);
    if (taps.length > WINDOW) taps.shift();

    stale = false;
    buzz();
    wave.classList.remove('go'); void wave.offsetWidth; wave.classList.add('go');
    render();

    clearTimeout(staleTimer);
    staleTimer = setTimeout(function () { stale = true; render(); }, PAUSE);
  });

  clear.addEventListener('click', function () {
    taps = []; stale = false; clearTimeout(staleTimer); render();
  });

  // --- Gamme ---
  // Noms anglais, avec l'orthographe d'usage pour chaque tonalité
  var MAJ = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
  var MIN = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B'];
  var NATURAL_MINOR = [0, 2, 3, 5, 7, 8, 10];
  var HARMONIC_MINOR = [0, 2, 3, 5, 7, 8, 11];
  var WHITE = [0, 2, 4, 5, 7, 9, 11];
  var BLACK = { 1: 1, 3: 2, 6: 4, 8: 5, 10: 6 };   // demi-ton → touche blanche qu'elle suit
  var BASE = 60;   // Do 4

  var kb = document.getElementById('kb');
  var gKey = document.getElementById('gKey');
  var gSub = document.getElementById('gSub');
  var gClear = document.getElementById('gClear');
  var soloBtn = document.getElementById('solo');
  var soloTxt = document.getElementById('soloTxt');
  var soloIcon = document.getElementById('soloIcon');
  var tonic = null;   // tonique de la gamme trouvée, pour finir les phrases
  var HOLD = 450;   // ms d'appui pour garder ou retirer une note
  var picked = {};
  var keys = [];

  function scale(tonic, steps) { return steps.map(function (s) { return (tonic + s) % 12; }); }
  function contains(set, notes) { return notes.every(function (n) { return set.indexOf(n) >= 0; }); }

  for (var pc = 0; pc < 12; pc++) {
    var k = document.createElement('div');
    var mk = document.createElement('span'); mk.className = 'mk'; k.appendChild(mk);
    if (pc in BLACK) {
      k.className = 'k b';
      k.style.left = 'calc(' + (BLACK[pc] * 100 / 7) + '% - 4.8%)';
    } else {
      k.className = 'k w';
      k.appendChild(document.createTextNode(MIN[pc]));
    }
    k.dataset.pc = pc;
    keys[pc] = k;
  }
  WHITE.forEach(function (pc) { kb.appendChild(keys[pc]); });
  Object.keys(BLACK).forEach(function (pc) { kb.appendChild(keys[pc]); });

  function renderGamme() {
    var notes = Object.keys(picked).map(Number);
    var hintSet = null;
    tonic = null;
    gClear.classList.toggle('off', notes.length === 0);
    gKey.className = 'g-key';
    keys.forEach(function (k, pc) { k.classList.toggle('on', !!picked[pc]); });

    if (!notes.length) {
      gKey.textContent = 'Gamme';
      gSub.textContent = 'Touche pour écouter. Reste appuyé pour garder la note.';
    } else {
      // Majeure et mineure relative ont les mêmes notes : on raisonne en mineures
      var fits = [];
      for (var t = 0; t < 12; t++) if (contains(scale(t, NATURAL_MINOR), notes)) fits.push(t);
      if (fits.length === 1) {
        var m = fits[0], M = (m + 3) % 12;
        gKey.textContent = MIN[m] + ' minor';
        gKey.className = 'g-key found';
        gSub.textContent = 'même gamme que ' + MAJ[M] + ' major · ' + MIN[m] + 'm = ' + MAJ[M];
        hintSet = scale(m, NATURAL_MINOR);
        tonic = m;
      } else if (fits.length > 1) {
        gKey.textContent = fits.length + ' gammes possibles';
        gKey.className = 'g-key soft';
        gSub.textContent = fits.length <= 4
          ? fits.map(function (t) { return MIN[t] + 'm / ' + MAJ[(t + 3) % 12]; }).join(' · ') + ' — ajoute une note.'
          : 'Ajoute des notes pour trancher.';
      } else {
        var harm = [];
        for (t = 0; t < 12; t++) if (contains(scale(t, HARMONIC_MINOR), notes)) harm.push(t);
        if (harm.length === 1) {
          gKey.textContent = MIN[harm[0]] + ' harmonic minor';
          gKey.className = 'g-key found';
          gSub.textContent = MIN[harm[0]] + 'm avec la 7e montée d’un demi-ton (' + MIN[(harm[0] + 11) % 12] + ').';
          hintSet = scale(harm[0], HARMONIC_MINOR);
          tonic = harm[0];
        } else if (harm.length > 1) {
          gKey.textContent = 'Harmonic minor';
          gKey.className = 'g-key soft';
          gSub.textContent = harm.map(function (t) { return MIN[t] + 'm'; }).join(' · ') + ' — ajoute une note.';
        } else {
          gKey.textContent = 'Aucune gamme';
          gKey.className = 'g-key soft';
          gSub.textContent = 'Ces notes ne tiennent dans aucune gamme. Retire celle qui sonne faux.';
        }
      }
    }
    soloBtn.classList.toggle('off', notes.length !== 7);
    bpmSet.classList.toggle('off', notes.length !== 7);
    if (notes.length !== 7) stopSolo();
    soloLabel();
    // Point sur les notes de la gamme trouvée qu'on n'a pas encore choisies
    keys.forEach(function (k, pc) { k.classList.toggle('hint', !!hintSet && hintSet.indexOf(pc) >= 0 && !picked[pc]); });
  }

  // Touche courte : on écoute. Appui long : on garde (ou retire) la note.
  var holdTimer = null, holdKey = null;
  function release() {
    clearTimeout(holdTimer); holdTimer = null;
    if (holdKey) holdKey.classList.remove('hold', 'down');
    holdKey = null;
  }

  kb.addEventListener('pointerdown', function (e) {
    var k = e.target.closest('.k');
    if (!k) return;
    e.preventDefault();
    release();
    var pc = Number(k.dataset.pc);
    note(BASE + pc);
    holdKey = k;
    k.classList.add('down', 'hold');
    holdTimer = setTimeout(function () {
      if (picked[pc]) delete picked[pc]; else picked[pc] = true;
      buzz();
      release();
      renderGamme();
    }, HOLD);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { kb.addEventListener(ev, release); });

  // --- Solo : un motif qu'on répète, déplace et varie, sur une grille d'accords implicite ---
  var bpmSet = document.getElementById('bpmSet');
  var bpmIn = document.getElementById('bpmIn');
  function clampBpm(v) { return Math.max(40, Math.min(220, Math.round(v) || 90)); }
  var soloBpm = clampBpm(Number(store('tempo.solo')));
  bpmIn.value = soloBpm;
  function setBpm(v) { soloBpm = clampBpm(v); bpmIn.value = soloBpm; store('tempo.solo', String(soloBpm)); }

  // − et + : un cran par appui, défilement si on reste appuyé
  [['bpmDown', -1], ['bpmUp', 1]].forEach(function (b) {
    var el = document.getElementById(b[0]), rep = null;
    function stop() { clearTimeout(rep); clearInterval(rep); rep = null; }
    el.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      setBpm(soloBpm + b[1]);
      rep = setTimeout(function () { rep = setInterval(function () { setBpm(soloBpm + b[1]); }, 70); }, 400);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { el.addEventListener(ev, stop); });
  });
  bpmIn.addEventListener('focus', function () { bpmIn.select(); });
  bpmIn.addEventListener('change', function () { setBpm(Number(bpmIn.value)); });
  bpmIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') bpmIn.blur(); });

  // Motifs de deux temps : [début, durée] en doubles croches
  var RHYTHMS = [
    [[0, 3], [3, 3], [6, 2]],
    [[0, 2], [2, 2], [4, 3], [7, 1]],
    [[0, 1], [1, 1], [2, 2], [4, 4]],
    [[0, 2], [2, 1], [3, 1], [4, 4]],
    [[2, 2], [4, 2], [6, 2]],
    [[0, 4], [4, 2], [6, 2]],
    [[0, 3], [3, 1], [4, 2], [6, 2]],
    [[1, 1], [2, 2], [4, 1], [5, 3]]
  ];
  // Fondamentales des accords, en degrés de la gamme (i–VI–III–VII, i–iv–v–i…)
  var PROGRESSIONS = [[0, 5, 2, 6], [0, 3, 4, 0], [0, 5, 3, 4], [0, 6, 5, 6], [0, 3, 6, 2]];
  var PHRASE = 64;   // quatre mesures en doubles croches

  var soloTimer = null, soloT = 0, phraseStep = 0, phraseNo = 0, events = [], cycle = null;
  var pool = [], degOf = {};

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function clampIdx(i) { return Math.max(0, Math.min(pool.length - 1, i)); }
  function chordTones(root) { return [root, (root + 2) % 7, (root + 4) % 7]; }

  // Note de la réserve la plus proche de idx dont le degré est dans degs
  function nearestWith(idx, degs) {
    idx = clampIdx(idx);
    for (var d = 0; d < pool.length; d++) {
      var up = idx + d, down = idx - d;
      if (up < pool.length && degs.indexOf(degOf[pool[up] % 12]) >= 0) return up;
      if (down >= 0 && degs.indexOf(degOf[pool[down] % 12]) >= 0) return down;
    }
    return idx;
  }

  function makeMotif() {
    var r = pick(RHYTHMS), steps = [0];
    for (var k = 1; k < r.length; k++) steps.push(pick([-1, -1, 1, 1, -2, 2, 0, 3, -3]));
    return { r: r, steps: steps };
  }

  // Pose le motif à partir de startIdx ; la dernière note retombe sur l'accord si on le demande
  function placeMotif(ev, m, at, startIdx, endDegs, invert) {
    var idx = startIdx;
    m.r.forEach(function (n, k) {
      if (k > 0) idx = clampIdx(idx + (invert ? -m.steps[k] : m.steps[k]));
      if (k === m.r.length - 1 && endDegs) idx = nearestWith(idx, endDegs);
      ev.push({ step: at + n[0], dur: n[1], idx: idx });
    });
    return idx;
  }

  function makePhrase(m, prog) {
    var ev = [], center = Math.floor(pool.length / 2), ch = prog.map(chordTones);
    // Mesure 1 : le motif, puis sa reprise un cran à côté
    var idx = nearestWith(center + pick([-2, 0, 2]), ch[0]);
    var end = placeMotif(ev, m, 0, idx, ch[0]);
    placeMotif(ev, m, 8, clampIdx(idx + pick([1, -1, 0])), ch[0]);
    // Mesure 2 : le motif transposé sur l'accord suivant, puis une note tenue
    idx = nearestWith(idx + pick([-1, 1, 2]), ch[1]);
    end = placeMotif(ev, m, 16, idx, ch[1]);
    ev.push({ step: 24, dur: 7, idx: nearestWith(end + pick([-1, 1]), ch[1]) });
    // Mesure 3 : le motif renversé, une course en doubles croches, appui sur l'accord
    end = placeMotif(ev, m, 32, nearestWith(end, ch[2]), null, true);
    var dir = end > center ? -1 : 1;
    for (var k = 0; k < 4; k++) { end = clampIdx(end + dir); ev.push({ step: 40 + k, dur: 1, idx: end }); }
    end = nearestWith(end + dir, ch[2]);
    ev.push({ step: 44, dur: 4, idx: end });
    // Mesure 4 : approche en 3-3-2 puis la tonique tenue, et on respire
    var target = nearestWith(end, [0]), side = Math.random() < 0.5 ? 1 : -1;
    ev.push({ step: 48, dur: 3, idx: nearestWith(end, ch[3]) });
    ev.push({ step: 51, dur: 3, idx: clampIdx(target + 2 * side) });
    ev.push({ step: 54, dur: 2, idx: clampIdx(target + side) });
    ev.push({ step: 56, dur: 6, idx: target });
    return ev;
  }

  function soloLabel() {
    var on = !!soloTimer;
    soloBtn.classList.toggle('on', on);
    soloIcon.setAttribute('d', on ? 'M3.5 3h9v10h-9z' : 'M4 2.5v11l9.5-5.5z');
    soloTxt.textContent = on ? 'Stop' : 'Solo';
  }

  function light(midi, t) {
    var k = keys[midi % 12];
    setTimeout(function () {
      if (!soloTimer) return;
      k.classList.add('lit');
      setTimeout(function () { k.classList.remove('lit'); }, 130);
    }, Math.max(0, (t - ctx.currentTime + (ctx.outputLatency || 0)) * 1000));
  }

  function soloTick() {
    var six = 60 / soloBpm / 4;
    while (soloT < ctx.currentTime + 0.15) {
      if (phraseStep === 0) {
        // Forme A A B A, puis un nouveau couple de motifs
        if (phraseNo % 4 === 0) cycle = { a: makeMotif(), b: makeMotif(), prog: pick(PROGRESSIONS) };
        events = makePhrase(phraseNo % 4 === 2 ? cycle.b : cycle.a, cycle.prog);
      }
      if (soloT >= ctx.currentTime) {
        events.forEach(function (e) {
          if (e.step !== phraseStep) return;
          var vel = (phraseStep % 16 === 0 ? 0.46 : phraseStep % 4 === 0 ? 0.38 : 0.3) + (Math.random() - 0.5) * 0.08;
          var midi = pool[e.idx];
          note(midi, soloT, Math.min(1.6, six * e.dur * 1.1 + 0.08), vel);
          light(midi, soloT);
        });
      }
      soloT += six;
      if (++phraseStep === PHRASE) { phraseStep = 0; phraseNo++; }
    }
  }

  function startSolo() {
    var notes = Object.keys(picked).map(Number);
    if (notes.length !== 7) return;
    audio(); out();
    var t = tonic !== null ? tonic : Math.min.apply(null, notes);
    notes.sort(function (a, b) { return (a - t + 12) % 12 - (b - t + 12) % 12; });
    degOf = {};
    notes.forEach(function (pc, d) { degOf[pc] = d; });
    pool = [];
    for (var m = 57; m <= 81; m++) if (m % 12 in degOf) pool.push(m);   // La 3 → La 5
    phraseStep = 0; phraseNo = 0;
    soloT = ctx.currentTime + 0.06;
    soloTimer = setInterval(soloTick, 25);
    soloTick();
    soloLabel();
  }

  function stopSolo() {
    if (!soloTimer) return;
    clearInterval(soloTimer); soloTimer = null;
    soloLabel();
  }

  soloBtn.addEventListener('click', function () { if (soloTimer) stopSolo(); else startSolo(); });

  gClear.addEventListener('click', function () { picked = {}; renderGamme(); });
  renderGamme();

  // Écran allumé pendant l'usage
  var lock = null;
  function wake() {
    if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    navigator.wakeLock.request('screen').then(function (l) { lock = l; }).catch(function () {});
  }
  document.addEventListener('visibilitychange', wake);
  document.addEventListener('pointerup', function () { if (!lock || lock.released) wake(); });

  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });

  if ('serviceWorker' in navigator && !/^(localhost|127\.)/.test(location.hostname)) {
    var hadController = !!navigator.serviceWorker.controller, reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (hadController && !reloaded) { reloaded = true; location.reload(); }
    });
    navigator.serviceWorker.register('sw.js').then(function (r) { r.update(); }).catch(function () {});
  }
})();
