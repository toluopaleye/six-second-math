(function () {
'use strict';
const MM = window.MM;
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const now = () => performance.now();

// Status glyphs: shape and colour together, never colour alone.
const G = {
  f: '<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="var(--fast)"/></svg>',
  s: '<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4" fill="none" stroke="var(--slow)" stroke-width="2"/></svg>',
  m: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="var(--miss)" stroke-width="2.2" stroke-linecap="round"/></svg>',
  e: '<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="2" fill="var(--rule)"/></svg>',
  retry: '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M10 6a4 4 0 1 1-1.2-2.85"/><path d="M9.2 1.2v2.4H6.8"/></svg>',
  eye: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1 6s1.8-3.5 5-3.5S11 6 11 6 9.2 9.5 6 9.5 1 6 1 6z" fill="none" stroke="var(--ink-2)" stroke-width="1.3"/><circle cx="6" cy="6" r="1.5" fill="var(--ink-2)"/></svg>',
};
const OPS = ['add', 'sub', 'mul', 'div'], TYPES = ['whole', 'dec', 'frac'];
const PRACTICE_LENGTHS = [0, 2, 5, 10, 15, 20];   // minutes; 0 = keep going until you press Stop
const OP_SYM = { add: '+', sub: '−', mul: '×', div: '÷', conv: '⇄' };
const TYPE_NAME = { whole: 'Whole numbers', dec: 'Decimals', frac: 'Fractions' };
const LEVEL_DESC = {
  1: 'Times tables, two-digit sums, tenths and friendly fractions. Good for building the habits.',
  2: 'The 80-in-8 mix: three-digit sums, two-digit products, decimals like 2.7 × 60, fractions like 3/4 ÷ 3/8.',
  3: 'Four-digit sums, two-digit × two-digit, thousandths and awkward denominators.',
};

// ---------------------------------------------------------------- study plan
// Whole numbers, then decimals, then fractions: each operation at Foundations then Test level, with a mixed
// round after every new operation, then conversions, then everything mixed. A stage is passed with PLAN_N answers
// in it, a median at or under the goal on the right ones, and at least 90% right. Only the last PLAN_N count.
const PLAN_N = 30;
const LEVEL_NAME = { 1: 'Foundations', 2: 'Test level', 3: 'Hard' };
const OP_WORD = { add: 'addition', sub: 'subtraction', mul: 'multiplication', div: 'division' };
const ALL_CELLS = OPS.flatMap(o => TYPES.map(t => o + '.' + t)).concat('conv.frac');
const PLAN = (() => {
  const out = [];
  const add = (id, group, title, cells, level, missing) => out.push({ id, group, title, cells, level, missing: !!missing });
  for (const [t, ops] of [['whole', OPS], ['dec', OPS], ['frac', ['mul', 'div', 'add', 'sub']]]) {
    const group = TYPE_NAME[t], sofar = [];
    for (const op of ops) {
      add(`${t}.${op}.1`, group, `${OP_SYM[op]} ${group}`, [op + '.' + t], 1);
      add(`${t}.${op}.2`, group, `${OP_SYM[op]} ${group}`, [op + '.' + t], 2);
      sofar.push(op);
      if (sofar.length > 1) add(`${t}.mix${sofar.length}`, group, `Mixed ${sofar.map(o => OP_SYM[o]).join(' ')} ${group.toLowerCase()}`, sofar.map(o => o + '.' + t), 2);
    }
  }
  add('conv.1', 'Fractions', 'Fraction ⇄ decimal', ['conv.frac'], 1);
  add('conv.2', 'Fractions', 'Fraction ⇄ decimal', ['conv.frac'], 2);
  add('all.2', 'Everything', 'Everything mixed', ALL_CELLS, 2);
  add('all.miss', 'Everything', 'Everything, with missing numbers', ALL_CELLS, 2, true);
  return out;
})();
const WEEKLY_TEST = { cells: ALL_CELLS, level: 2, missing: true, min: 8 };

// ---------------------------------------------------------------- state
const LS_KEY = 'six-second-math:v1';
function defaults() {
  return {
    v: 1, updatedAt: 0,
    settings: { ops: { add: true, sub: true, mul: true, div: true }, types: { whole: true, dec: true, frac: true }, conv: true, missing: false, level: 2, start: 10, goal: 6, hard: false, adaptive: true, testMin: 8, practiceMin: 0 },
    target: 10, win: [], cells: {}, tests: [], totals: { n: 0, f: 0 }, bestStreak: 0, hist: '',
    plan: { on: false, active: '', done: {}, rec: {} },
  };
}
function merge(base, src) {
  if (!src || typeof src !== 'object' || Array.isArray(src)) return base;
  for (const k of Object.keys(base)) {
    if (!(k in src)) continue;
    const b = base[k], v = src[k];
    if (Array.isArray(b)) { if (Array.isArray(v)) base[k] = v.slice(); }
    else if (b && typeof b === 'object') {
      if (Object.keys(b).length) base[k] = merge(b, v);
      else if (v && typeof v === 'object' && !Array.isArray(v)) base[k] = v;
    } else if (typeof v === typeof b) base[k] = v;
  }
  return base;
}
let S = defaults();
let storageOK = false;
function testStorage() { try { localStorage.setItem('__ssm', '1'); localStorage.removeItem('__ssm'); return true; } catch (e) { return false; } }
function sanitize() {
  const st = S.settings;
  if (![1, 2, 3].includes(st.level)) st.level = 2;
  if (![6, 8, 10, 12, 15].includes(st.start)) st.start = 10;
  if (![5, 6, 7].includes(st.goal)) st.goal = 6;
  if (![2, 5, 8].includes(st.testMin)) st.testMin = 8;
  if (!PRACTICE_LENGTHS.includes(st.practiceMin)) st.practiceMin = 0;
  if (!OPS.some(o => st.ops[o])) st.ops.add = true;
  if (!TYPES.some(t => st.types[t])) st.types.whole = true;
  if (typeof S.target !== 'number' || !isFinite(S.target)) S.target = st.start;
  S.target = Math.max(Math.min(st.goal, st.start), Math.min(15, Math.round(S.target)));
  S.win = (Array.isArray(S.win) ? S.win : []).filter(x => x === 'f' || x === 's' || x === 'm').slice(-10);
  if (S.tests.length > 60) S.tests = S.tests.slice(-60);
  if (typeof S.hist !== 'string') S.hist = '';
  const pl = S.plan;
  if (typeof pl.active !== 'string' || (pl.active && planIndex(pl.active) < 0)) pl.active = '';
  for (const k of Object.keys(pl.done)) if (planIndex(k) < 0 || !pl.done[k] || typeof pl.done[k] !== 'object') delete pl.done[k];
  for (const k of Object.keys(pl.rec)) {
    if (planIndex(k) < 0 || !Array.isArray(pl.rec[k])) delete pl.rec[k];
    else pl.rec[k] = pl.rec[k].filter(r => Array.isArray(r) && typeof r[0] === 'number' && (r[1] === 0 || r[1] === 1)).slice(-PLAN_N);
  }
}

// ---------------------------------------------------------------- saving progress
// Progress always lives in this browser. After signing in it also lives in your account (Firebase),
// so it follows you to any device. Each account keeps its own copy on this device as well.
const LAST_UID_KEY = 'six-second-math:last-uid';
const sync = { user: null, loaded: false, timer: 0, retry: 0, pushing: false, again: false, dirty: false, lastSync: 0, status: 'local' };
function cloud() { return window.Cloud && window.Cloud.available ? window.Cloud : null; }
function keyFor(uid) { return uid ? LS_KEY + ':' + uid : LS_KEY; }
function readLocal(key) {
  if (!storageOK) return null;
  try { const raw = localStorage.getItem(key); if (!raw) return null; const o = JSON.parse(raw); return o && o.v === 1 ? o : null; } catch (e) { return null; }
}
function writeLocal(key, val) {
  if (!storageOK) return;
  try { if (val == null) localStorage.removeItem(key); else localStorage.setItem(key, typeof val === 'string' ? val : JSON.stringify(val)); } catch (e) { /* storage full or blocked */ }
}
function saveLocal() { writeLocal(keyFor(sync.user && sync.user.uid), S); }
function schedulePush(ms) { if (!sync.user || !cloud()) return; clearTimeout(sync.timer); sync.timer = setTimeout(push, ms == null ? 10000 : ms); }
async function push() {
  const c = cloud();
  if (!c || !sync.user || !sync.loaded || !sync.dirty) return;
  if (sync.pushing) { sync.again = true; return; }
  sync.pushing = true; sync.dirty = false;
  const uid = sync.user.uid, json = JSON.stringify(S);
  setSyncStatus('saving');
  try {
    await c.save(uid, json);
    sync.lastSync = Date.now();
    if (sync.user && sync.user.uid === uid) setSyncStatus('saved');
  } catch (e) {
    console.warn('Saving progress failed', e);
    sync.dirty = true;
    if (sync.user && sync.user.uid === uid) { setSyncStatus('offline'); clearTimeout(sync.timer); sync.timer = setTimeout(push, 15000); }
  }
  sync.pushing = false;
  if (sync.again) { sync.again = false; schedulePush(1500); }
}
async function flushPush() {
  clearTimeout(sync.timer);
  if (sync.dirty) await push();
  while (sync.pushing) await new Promise(r => setTimeout(r, 40));
}
function touch(soon) { S.updatedAt = Date.now(); saveLocal(); if (sync.user) { sync.dirty = true; schedulePush(soon ? 800 : 10000); } }
function setSyncStatus(s) { sync.status = s; renderAccountBits(); }
function adoptState(obj, keepSession) {
  S = merge(defaults(), obj ? JSON.parse(JSON.stringify(obj)) : {});
  sanitize();
  if (!keepSession) { RT.tally = []; RT.streak = 0; RT.queue = []; if (RT.sess) RT.sess.startTarget = S.target; }
  onStateReplaced();
}
async function loadForUser(user, guest) {
  let remoteState;
  try { remoteState = await cloud().load(user.uid); }
  catch (e) {
    console.warn('Loading progress failed', e);
    if (!sync.user || sync.user.uid !== user.uid) return;
    setSyncStatus('offline');
    clearTimeout(sync.retry);
    sync.retry = setTimeout(() => { if (sync.user && sync.user.uid === user.uid && !sync.loaded) loadForUser(user, guest); }, 20000);
    return;
  }
  if (!sync.user || sync.user.uid !== user.uid) return;
  sync.loaded = true;
  const local = readLocal(keyFor(user.uid));
  const guestHasProgress = !!(guest && guest.totals && guest.totals.n > 0);
  let chosen, pushNeeded = false;
  if (remoteState && remoteState.v === 1) {
    if (local && (local.updatedAt || 0) > (remoteState.updatedAt || 0)) { chosen = local; pushNeeded = true; }
    else { chosen = remoteState; if (guestHasProgress) toast('Loaded the progress saved in your account'); }
  } else if (local) { chosen = local; pushNeeded = true; }
  else if (guestHasProgress) {
    chosen = guest; pushNeeded = true; writeLocal(LS_KEY, null);
    toast('Your progress on this device now saves to your account');
  } else { chosen = guest ? { settings: guest.settings, target: guest.target } : null; pushNeeded = true; }
  adoptState(chosen, chosen === guest);
  saveLocal();
  if (pushNeeded) { sync.dirty = true; schedulePush(400); } else setSyncStatus('saved');
}
async function onAuthChanged(user) {
  const prev = sync.user ? sync.user.uid : null, next = user ? user.uid : null;
  if (prev && prev !== next) await flushPush();
  if (!user) {
    sync.user = null; sync.loaded = false; sync.dirty = false;
    clearTimeout(sync.timer); clearTimeout(sync.retry);
    writeLocal(LAST_UID_KEY, null);
    if (prev) adoptState(readLocal(LS_KEY));
    setSyncStatus('local');
    return;
  }
  const guest = prev ? null : S;
  sync.user = user;
  writeLocal(LAST_UID_KEY, user.uid);
  if (prev !== next) {
    sync.loaded = false;
    const local = readLocal(keyFor(user.uid));
    if (local) adoptState(local);
  }
  if (!sync.loaded) { setSyncStatus('loading'); await loadForUser(user, guest); }
  else renderAccountBits();
}

// ---------------------------------------------------------------- runtime
const RT = {
  view: 'practice', mode: 'practice', state: 'ready', prob: null, input: '', qTarget: 10, qid: 0,
  t0: 0, pausedMs: 0, pauseAt: 0, queue: [], recent: [], tally: [], streak: 0, isRetry: false,
  drill: null, fbReadyAt: 0, test: null, testView: 'setup', raf: 0, storage: 'none', topicsDirty: false, hintWarn: false,
  sess: null, holdUser: false, holdSys: false, sessClockTxt: '', testCfg: null,
};

// ---------------------------------------------------------------- choosing questions
function cellName(id) { const [op, t] = id.split('.'); return op === 'conv' ? 'Conversions' : TYPE_NAME[t]; }
function cellShort(id) { const op = id.split('.')[0]; return op === 'conv' ? 'Fraction ⇄ decimal' : OP_SYM[op] + ' ' + cellName(id); }
// What questions come from: a weekly-check test, a drilled topic, the study plan's stage, or Settings.
function activeCells() {
  if (RT.mode === 'test' && RT.testCfg) return RT.testCfg.cells;
  if (RT.drill) return [RT.drill];
  const stg = planStage();
  if (stg) return stg.cells;
  const st = S.settings, out = [];
  for (const op of OPS) if (st.ops[op]) for (const t of TYPES) if (st.types[t]) out.push(op + '.' + t);
  if (st.types.frac && st.conv) out.push('conv.frac');
  return out.length ? out : ['add.whole'];
}
function topicLevel() {
  if (RT.mode === 'test') return RT.testCfg ? RT.testCfg.level : S.settings.level;
  const stg = planStage();
  return stg ? stg.level : S.settings.level;
}
function topicMissing() {
  if (RT.mode === 'test') return RT.testCfg ? RT.testCfg.missing : S.settings.missing;
  const stg = planStage();
  return stg ? stg.missing : S.settings.missing;
}
function weakness(id) {
  const c = S.cells[id];
  if (!c || !c.rec || c.rec.length < 5) return 0.5;
  const rec = c.rec.slice(-20);
  return rec.filter(r => r[1] > 0).length / rec.length;
}
function pickCell() {
  const pairs = activeCells().map(id => [(id === 'conv.frac' ? 0.5 : 1) * (1 + 1.5 * weakness(id)), id]);
  let tot = 0; pairs.forEach(p => { tot += p[0]; });
  let x = Math.random() * tot;
  for (const p of pairs) { x -= p[0]; if (x < 0) return p[1]; }
  return pairs[pairs.length - 1][1];
}
function remember(p) { RT.recent.push(p.key); if (RT.recent.length > 40) RT.recent.shift(); }
function freshProblem() {
  let last = null;
  for (let i = 0; i < 10; i++) {
    let p;
    try { p = MM.generate(pickCell(), topicLevel(), topicMissing() ? 0.3 : 0); } catch (e) { console.error(e); continue; }
    last = p;
    if (!RT.recent.includes(p.key)) break;
  }
  if (!last) last = MM.generate('add.whole', 2, 0);
  remember(last);
  return last;
}
function similarProblem(p) {
  let last = null;
  for (let i = 0; i < 6; i++) {
    try { last = MM.similar(p); } catch (e) { console.error(e); return null; }
    if (last.key !== p.key && !RT.recent.includes(last.key)) break;
  }
  if (last) remember(last);
  return last;
}

// ---------------------------------------------------------------- rendering numbers and steps
function numHTML(x) {
  if (x.k === 'frac' && x.d !== 1) return `<span class="fr"><span class="fn">${x.n}</span><span class="fd">${x.d}</span></span>`;
  return `<span class="n">${esc(MM.numText(x))}</span>`;
}
function exprHTML(e) {
  if (!e.op) return numHTML(e);
  const side = (c, right) => MM.needsParens(c, e.op, right) ? '<span class="p">(</span>' + exprHTML(c) + '<span class="p">)</span>' : exprHTML(c);
  return side(e.a, false) + `<span class="o">${e.op}</span>` + side(e.b, true);
}
function partsHTML(ps) { return MM.parts(ps).map(x => typeof x === 'string' ? esc(x) : exprHTML(x)).join(''); }
function methodHTML(p) {
  const steps = p.steps.map(s => {
    if (s.text) return `<li><div class="step-body"><div class="say">${partsHTML(s.text)}</div></div></li>`;
    const note = s.note ? `<div class="note">${partsHTML(s.note)}</div>` : '';
    const calc = s.chain.map((e, i) => (i ? '<span class="eqs">=</span>' : '') + `<span class="term">${exprHTML(e)}</span>`).join('');
    return `<li><div class="step-body">${note}<div class="calc">${calc}</div></div></li>`;
  }).join('');
  return `<h3 class="bd-method">${esc(p.name)}</h3><ol class="steps">${steps}</ol>
    <div class="rule"><span class="eyebrow">Rule</span><p>${partsHTML(p.tip)}</p></div>`;
}
function hasFracToken(p) { return p.q.some(t => t && typeof t === 'object' && t.k === 'frac'); }
function altHTML(p) {
  const a = p.ans;
  if (a.d === 1) return '';
  if (p.ansNum.k === 'frac' && MM.decPlaces(a) >= 0 && MM.decPlaces(a) <= 4 && p.form !== 'fracSimplest') return `<span class="alt">= ${esc(MM.decStr(a))}</span>`;
  if (p.ansNum.k === 'dec' && hasFracToken(p) && p.form !== 'dec') return `<span class="alt">= ${numHTML({ v: a, k: 'frac', n: a.n, d: a.d })}</span>`;
  return '';
}
function questionWithAnswerHTML(p) {
  return p.q.map(t => t === '?' ? `<b>${numHTML(p.ansNum)}</b>` : typeof t === 'string' ? `<span class="o">${t}</span>` : exprHTML(t)).join('');
}

// ---------------------------------------------------------------- the question stage
function slotInner() {
  if (RT.state !== 'ask') return '';
  return `<span class="typed">${esc(RT.input)}</span><span class="caret"></span>`;
}
function renderProblem(opts) {
  const p = RT.prob;
  let slot;
  if (opts && opts.answer) slot = `<span class="slot shown${opts.ok ? ' ok' : ''}">${numHTML(p.ansNum)}</span>`;
  else if (opts && opts.measure) slot = `<span class="slot" id="slot"><span class="typed" style="visibility:hidden">${esc(MM.numText(p.ansNum).replace(/,/g, ''))}</span><span class="caret"></span></span>`;
  else slot = `<span class="slot" id="slot">${slotInner()}</span>`;
  const html = p.q.map(t => t === '?' ? slot : typeof t === 'string' ? `<span class="op">${t}</span>` : exprHTML(t)).join('');
  const box = $('#problem');
  box.innerHTML = `<span class="pline">${html}</span>`;
  box.setAttribute('aria-label', MM.plainTokens(p.q));
}
function renderSlot() { const s = $('#slot'); if (s) s.innerHTML = slotInner(); fitProblem(false); }
function fitProblem(reset) {
  const box = $('#problem'), line = box.firstElementChild;
  if (!line) return;
  const max = window.innerWidth <= 380 ? 44 : 52;
  if (reset) box.style.fontSize = max + 'px';
  const avail = box.clientWidth - 6;
  const w = line.scrollWidth;
  if (w > avail && avail > 0) {
    const fs = parseFloat(box.style.fontSize) || max;
    box.style.fontSize = Math.max(20, Math.floor(fs * avail / w)) + 'px';
  }
}
function setHint(text, warn) { const h = $('#hint'); h.textContent = text || ''; h.classList.toggle('warn', !!warn); RT.hintWarn = !!warn; }
function defaultHint() {
  const p = RT.prob;
  if (!p) return '';
  if (p.form === 'dec') return 'Answer as a decimal';
  if (p.form === 'fracSimplest') return 'Answer as a fraction in lowest terms';
  if (RT.mode === 'practice' && S.totals.n < 3) return 'Right answers go through on their own. Use ↵ to submit anything else.';
  if (p.ansNum.k === 'frac' && S.totals.n < 40) return 'Type fractions with the / key, like 3/8';
  return '';
}
function shake() { const st = $('#stage'); st.classList.remove('shake'); void st.offsetWidth; st.classList.add('shake'); setTimeout(() => st.classList.remove('shake'), 320); }
function curTarget() { return RT.mode === 'test' ? S.settings.goal : S.target; }

// ---------------------------------------------------------------- timer
function elapsedSecs() { const pausedNow = RT.pauseAt ? now() - RT.pauseAt : 0; return Math.max(0, (now() - RT.t0 - RT.pausedMs - pausedNow) / 1000); }
function startLoop() { cancelAnimationFrame(RT.raf); RT.raf = requestAnimationFrame(loop); }
function stopLoop() { cancelAnimationFrame(RT.raf); RT.raf = 0; }
function testRunning() { return !!(RT.test && RT.test.running); }
// The loop runs while a question is open, a test is on, or a practice session's clock is going.
function needsLoop() { return RT.state === 'ask' || (RT.mode === 'test' && testRunning()) || sessTicking(); }
function settleLoop() { if (RT.pauseAt || !needsLoop()) stopLoop(); else if (!RT.raf) startLoop(); }
function loop() {
  RT.raf = 0;
  if (RT.pauseAt) return;
  if (RT.mode === 'test' && testRunning()) {
    updateClock();
    if (testRemaining() <= 0) { endTest(false); return; }
  }
  if (sessTicking()) {
    updateSessClock(false);
    if (RT.sess.dur && sessElapsed() >= RT.sess.dur) { sessionTimeUp(); return; }
  }
  if (RT.state === 'ask') {
    const secs = elapsedSecs();
    updateTimer(secs);
    if (RT.mode === 'practice' && S.settings.hard && secs >= RT.qTarget) { onTimeout(); return; }
  }
  if (needsLoop()) RT.raf = requestAnimationFrame(loop);
}
function updateTimer(secs) {
  const T = RT.qTarget, span = (RT.mode === 'practice' && S.settings.hard) ? T : T * 1.5;
  $('#timerFill').style.transform = `scaleX(${Math.min(1, secs / span)})`;
  $('#timer').classList.toggle('over', secs > T);
  $('#elapsed').textContent = secs.toFixed(1) + 's';
}
function setupTimer() {
  const hard = RT.mode === 'practice' && S.settings.hard;
  $('#timerTick').style.left = (hard ? 100 : 100 / 1.5) + '%';
  $('#tickLbl').textContent = (RT.mode === 'test' ? 'goal ' : '') + RT.qTarget + 's';
  updateTimer(0);
}
// Two things can stop the clocks: the page itself (hidden, or a sheet open) and the Pause button.
// They share one frozen moment, and time only flows again once neither is holding it.
function freeze() { if (!RT.pauseAt) { RT.pauseAt = now(); stopLoop(); } }
function thaw() {
  if (!RT.pauseAt || RT.holdSys || RT.holdUser) return;
  const d = now() - RT.pauseAt;
  RT.pausedMs += d;
  if (RT.test) RT.test.pausedMs += d;
  if (RT.sess) RT.sess.pausedMs += d;
  RT.pauseAt = 0;
  startLoop();
}
function pause() { if (RT.state === 'ask' || testRunning() || sessTicking()) { RT.holdSys = true; freeze(); } }
function resume() { RT.holdSys = false; thaw(); }
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { pause(); if (sync.dirty) { clearTimeout(sync.timer); push(); } }
  else if ($('#settings').hidden && $('#account').hidden) resume();
});
window.addEventListener('pagehide', () => { if (sync.dirty) push(); });

// ---------------------------------------------------------------- practice flow
function showReady() {
  dropSession();
  RT.state = 'ready'; stopLoop();
  $('#stageQ').hidden = true; $('#ready').hidden = false;
  $('#readyTarget').textContent = S.target + 's';
  $('#readyGoal').textContent = S.settings.goal + 's';
  renderLen();
  $('#breakdown').hidden = true; $('#dock').hidden = false;
  $('#keypad').classList.add('idle'); $('#dock').classList.add('is-ready');
}
function nextQuestion() {
  let p = null, retry = false;
  if (RT.mode === 'practice') {
    RT.queue.forEach(q => { q.due--; });
    const i = RT.queue.findIndex(q => q.due <= 0);
    if (i >= 0) { const item = RT.queue.splice(i, 1)[0]; p = similarProblem(item.p); retry = !!p; }
  }
  if (!p) p = freshProblem();
  RT.prob = p; RT.isRetry = retry; RT.input = ''; RT.state = 'ask'; RT.qid++;
  RT.qTarget = curTarget();
  RT.t0 = RT.pauseAt || now(); RT.pausedMs = 0;
  $('#ready').hidden = true; $('#paused').hidden = true; $('#summary').hidden = true; $('#stageQ').hidden = false; $('#keypad').classList.remove('idle'); $('#dock').classList.remove('is-ready');
  const op = p.cell.split('.')[0];
  $('#catLabel').textContent = (op === 'conv' ? 'Convert' : cellShort(p.cell)) + (p.missing ? ' · missing number' : '');
  const rt = $('#retryTag');
  rt.hidden = !retry;
  if (retry) rt.innerHTML = G.retry + '<span>Same method: ' + esc(p.name) + '</span>';
  $('#stage').classList.remove('flash-right', 'flash-wrong');
  renderProblem({ measure: true }); fitProblem(true); renderSlot();
  setHint(defaultHint());
  setupTimer();
  $('#breakdown').hidden = true; $('#dock').hidden = false;
  startLoop();
  if (RT.holdUser) paintStage();   // a new question while paused stays covered until Resume
}
function onKey(k) {
  if (RT.state === 'summary') return;
  if (RT.holdUser) { if (k === 'enter') userResume(); return; }
  if (RT.state === 'ready') { if (k !== 'back') startPractice(); return; }
  if (RT.state === 'fb') { if (k === 'enter') goNextFromFeedback(); return; }
  if (RT.state !== 'ask') return;
  if (RT.pauseAt) resume();
  if (k === 'enter') { submit(); return; }
  if (k === 'back') { RT.input = RT.input.slice(0, -1); renderSlot(); if (RT.hintWarn) setHint(defaultHint()); return; }
  const s = RT.input;
  if (s.length >= 12) return;
  if (k === '/') { if (!/\d$/.test(s) || s.includes('/')) return; }
  else if (k === '.') { if (/[./ ]/.test(s)) return; }
  else if (k === ' ') { if (!/^\d+$/.test(s)) return; }
  RT.input = s + k;
  renderSlot();
  const r = MM.checkInput(RT.prob, RT.input);
  if (r.status === 'right') onRight();
  else if (RT.hintWarn) setHint(defaultHint());
}
function submit() {
  const r = MM.checkInput(RT.prob, RT.input);
  if (r.status === 'incomplete') { shake(); return; }
  if (r.status === 'form') { setHint(r.msg, true); shake(); return; }
  if (r.status === 'right') { onRight(); return; }
  onWrong();
}
function afterFlash(kind, ms) {
  const q = RT.qid, wasTest = RT.mode === 'test';
  const st = $('#stage');
  st.classList.add(kind === 'right' ? 'flash-right' : 'flash-wrong');
  setTimeout(() => {
    st.classList.remove('flash-right', 'flash-wrong');
    if (RT.qid !== q || RT.state !== 'done') return;
    if (wasTest && !testRunning()) return;
    nextQuestion();
  }, ms);
}
function onRight() {
  const secs = elapsedSecs(), p = RT.prob;
  RT.state = 'done';
  if (RT.mode !== 'test') settleLoop();
  updateTimer(secs);
  const fast = secs <= RT.qTarget;
  if (RT.mode === 'test') {
    const T = RT.test; T.right++; T.score++; T.log.push({ p, secs, r: 'right' });
    record(p, fast ? 'f' : 's', secs); updateScore(); afterFlash('right', 130); return;
  }
  record(p, fast ? 'f' : 's', secs);
  if (fast) afterFlash('right', 230); else showFeedback('slow', null, secs);
}
function onWrong() {
  const secs = elapsedSecs(), p = RT.prob, typed = RT.input;
  RT.state = 'done';
  if (RT.mode === 'test') {
    const T = RT.test; T.wrong++; T.score--; T.log.push({ p, secs, r: 'wrong', typed });
    record(p, 'm', secs); updateScore(); afterFlash('wrong', 260); return;
  }
  settleLoop(); record(p, 'm', secs); showFeedback('wrong', typed, secs);
}
function reveal() { if (RT.state !== 'ask' || RT.mode !== 'practice' || RT.holdUser) return; const secs = elapsedSecs(); RT.state = 'done'; settleLoop(); record(RT.prob, 'm', secs); showFeedback('reveal', null, secs); }
function onTimeout() { const secs = elapsedSecs(); RT.state = 'done'; settleLoop(); record(RT.prob, 'm', secs); showFeedback('timeout', null, secs); }
function skip() {
  if (RT.state !== 'ask' || RT.mode !== 'test') return;
  const secs = elapsedSecs(), T = RT.test;
  RT.state = 'done'; T.skipped++; T.log.push({ p: RT.prob, secs, r: 'skip' });
  record(RT.prob, 'm', secs); updateScore(); nextQuestion();
}
function record(p, kind, secs) {
  let passed = false;
  const c = S.cells[p.cell] || (S.cells[p.cell] = { n: 0, f: 0, s: 0, m: 0, rec: [] });
  c.n++; c[kind]++;
  c.rec.push([Math.round(secs * 10) / 10, kind === 'f' ? 0 : kind === 's' ? 1 : 2]);
  if (c.rec.length > 40) c.rec.splice(0, c.rec.length - 40);
  S.totals.n++; if (kind === 'f') S.totals.f++;
  S.hist = (S.hist + kind).slice(-100);
  if (RT.mode === 'practice') {
    RT.tally.push(kind); if (RT.tally.length > 10) RT.tally.shift();
    RT.streak = kind === 'f' ? RT.streak + 1 : 0;
    S.bestStreak = Math.max(S.bestStreak || 0, RT.streak);
    adapt(kind);
    const ss = RT.sess;
    if (ss && ss.running) { ss.n++; ss[kind]++; if (kind !== 'm') ss.times.push(secs); }
    const stg = planStage();
    if (stg && stg.cells.includes(p.cell) && p.level === stg.level) {
      const r = S.plan.rec[stg.id] || (S.plan.rec[stg.id] = []);
      r.push([Math.round(secs * 10) / 10, kind === 'm' ? 0 : 1]);
      if (r.length > PLAN_N) r.splice(0, r.length - PLAN_N);
      if (!planDone(stg.id) && stageStats(stg).pass) { passStage(stg, false); passed = true; }
    }
  }
  renderStatus(); touch(passed);
}
function adapt(kind) {
  const st = S.settings;
  if (!st.adaptive) return;
  S.win.push(kind); if (S.win.length > 10) S.win.shift();
  if (S.win.length < 10) return;
  const f = S.win.filter(x => x === 'f').length;
  if (f >= 8 && S.target > st.goal) {
    S.target--; S.win = [];
    toast(S.target === st.goal ? `Target ${S.target}s. That's your goal pace.` : `8 of 10 fast. New target: ${S.target}s`);
  } else if (f <= 4 && S.target < 15) {
    S.target++; S.win = [];
    toast(`Easing the target to ${S.target}s for now`);
  }
}
function showFeedback(kind, typed, secs) {
  RT.state = 'fb'; settleLoop();
  const p = RT.prob, T = RT.qTarget;
  renderProblem({ answer: true, ok: kind === 'slow' });
  setHint('');
  let chip, detail;
  if (kind === 'wrong') { chip = `<span class="chip miss">${G.m}Missed</span>`; detail = typed ? `You typed <b>${esc(typed)}</b>` : ''; }
  else if (kind === 'slow') { chip = `<span class="chip slow">${G.s}Right, but slow</span>`; detail = `<b>${secs.toFixed(1)}s</b> against a ${T}s target. Here's a faster way.`; }
  else if (kind === 'timeout') { chip = `<span class="chip slow">${G.s}Time's up</span>`; detail = `The target was ${T}s`; }
  else { chip = `<span class="chip">${G.eye}Shown</span>`; detail = 'Counts as a miss'; }
  if (!RT.queue.some(q => q.p.tpl === p.tpl && q.p.missing === p.missing)) {
    RT.queue.push({ p, due: 3 });
    if (RT.queue.length > 4) RT.queue.shift();
  }
  const bd = $('#breakdown');
  bd.innerHTML = `<div class="bd-head">${chip}<span class="bd-detail">${detail}</span></div>
    <div class="bd-answer"><span class="eyebrow">Answer</span><span class="val">${numHTML(p.ansNum)}</span>${altHTML(p)}</div>
    ${methodHTML(p)}
    <div class="bd-foot"><button type="button" class="btn primary block" id="btnNext">Next question</button>
    <p class="muted">A similar one comes back in 3 questions.</p></div>`;
  $('#dock').hidden = true; bd.hidden = false;
  $('#btnNext').addEventListener('click', goNextFromFeedback);
  RT.fbReadyAt = now() + 350;
  requestAnimationFrame(() => {
    const r = bd.getBoundingClientRect();
    if (r.top < 0 || r.top > window.innerHeight * 0.75) bd.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    try { $('#btnNext').focus({ preventScroll: true }); } catch (e) { /* older browsers */ }
  });
}
function goNextFromFeedback() {
  if (RT.state !== 'fb' || now() < RT.fbReadyAt || RT.holdUser) return;
  if (RT.sess && RT.sess.timeUp) { endSession(false); return; }
  nextQuestion();
}
function startPractice() { RT.mode = 'practice'; if (!sessTicking()) beginSession(); nextQuestion(); }

// ---------------------------------------------------------------- practice sessions
// A session starts with Start practising and runs for the length chosen on the start card, or until Stop
// when "Until I stop" is chosen. Pause stops the question timer and the session clock together and covers
// the question so it can't be worked on while the clock is stopped.
const ICON = {
  pause: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="2.5" width="3.2" height="11" rx="1" fill="currentColor"/><rect x="9.3" y="2.5" width="3.2" height="11" rx="1" fill="currentColor"/></svg>',
  play: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.6 2.9v10.2a.7.7 0 0 0 1.07.6l8.06-5.1a.7.7 0 0 0 0-1.2L5.67 2.3a.7.7 0 0 0-1.07.6z" fill="currentColor"/></svg>',
};
function sessTicking() { const ss = RT.sess; return !!(ss && ss.running && !ss.timeUp && RT.mode === 'practice'); }
function sessElapsed() {
  const ss = RT.sess;
  if (!ss) return 0;
  const paused = ss.pausedMs + (RT.pauseAt ? now() - RT.pauseAt : 0);
  return Math.max(0, (now() - ss.start - paused) / 1000);
}
function sessShown() { const ss = RT.sess; return ss.dur ? Math.max(0, ss.dur - sessElapsed()) : sessElapsed(); }
function sessClockText() { const v = sessShown(); return clockText(RT.sess.dur ? Math.max(0, Math.ceil(v - 1e-6)) : Math.floor(v)); }
function renderLen() { setPressed('#lenSeg button', b => +b.dataset.len === S.settings.practiceMin); }
function beginSession() {
  RT.holdUser = false;
  if (!RT.holdSys) RT.pauseAt = 0;
  RT.sess = { dur: S.settings.practiceMin * 60, start: RT.pauseAt || now(), pausedMs: 0, running: true, timeUp: false, startTarget: S.target, n: 0, f: 0, s: 0, m: 0, times: [] };
  paintSession();
}
function dropSession() {
  RT.sess = null; RT.holdUser = false;
  if (!RT.holdSys) RT.pauseAt = 0;
  $('#paused').hidden = true; $('#summary').hidden = true;
  paintSession();
}
function updateSessClock(force) {
  if (!RT.sess) return;
  const t = sessClockText();
  if (!force && t === RT.sessClockTxt) return;
  RT.sessClockTxt = t;
  const c = $('#sessClock');
  c.textContent = t;
  c.classList.toggle('low', !!RT.sess.dur && sessShown() < 30);
  $('#pausedClock').textContent = t;
}
function paintSession() {
  const ss = RT.sess, on = !!(ss && ss.running && RT.mode === 'practice');
  $('#sessBar').hidden = !on;
  if (!on) return;
  $('#sessSub').hidden = !ss.dur;
  $('#pausedSub').textContent = ss.dur ? 'left in this session' : 'so far this session';
  const b = $('#btnPause');
  b.innerHTML = RT.holdUser ? ICON.play + '<span>Resume</span>' : ICON.pause + '<span>Pause</span>';
  b.title = (RT.holdUser ? 'Resume' : 'Pause') + ' (P)';
  b.disabled = !!ss.timeUp;
  updateSessClock(true);
}
// Shows the right part of the stage for the current state when a session is on.
function paintStage() {
  const st = RT.state;
  $('#paused').hidden = !RT.holdUser;
  $('#summary').hidden = RT.holdUser || st !== 'summary';
  if (RT.holdUser) {
    $('#ready').hidden = true; $('#stageQ').hidden = true; $('#breakdown').hidden = true;
    $('#dock').hidden = false; $('#keypad').classList.add('idle'); $('#dock').classList.add('is-ready');
  } else if (st === 'summary') {
    $('#ready').hidden = true; $('#stageQ').hidden = true; $('#breakdown').hidden = true; $('#dock').hidden = true;
  } else if (st === 'ask' || st === 'done' || st === 'fb') {
    $('#ready').hidden = true; $('#stageQ').hidden = false;
    $('#keypad').classList.remove('idle'); $('#dock').classList.remove('is-ready');
    $('#dock').hidden = st === 'fb'; $('#breakdown').hidden = st !== 'fb';
    if (st === 'ask') { renderProblem({ measure: true }); fitProblem(true); renderSlot(); }
    else fitProblem(true);
  }
}
function userPause(focus) {
  if (!sessTicking() || RT.holdUser) return;
  if (RT.state === 'done') nextQuestion();   // a right answer was about to move on; move on now, then pause
  RT.holdUser = true;
  freeze();
  paintSession(); paintStage();
  if (focus) { try { $('#btnResume').focus({ preventScroll: true }); } catch (e) { /* older browsers */ } }
}
function userResume() {
  if (!RT.holdUser) return;
  RT.holdUser = false;
  thaw();
  paintSession(); paintStage();
  if (RT.state === 'fb') { const nb = $('#btnNext'); if (nb) { try { nb.focus({ preventScroll: true }); } catch (e) { /* older browsers */ } } }
}
function togglePause(focus) {
  if (RT.view !== 'practice' || !sessTicking()) return false;
  if (RT.holdUser) userResume(); else userPause(focus);
  return true;
}
// Time runs out: a question in progress is dropped and the summary shows. If a breakdown is open,
// it stays up to finish reading, and its button leads to the summary instead of another question.
function sessionTimeUp() {
  const ss = RT.sess;
  if (RT.state !== 'fb') { endSession(false); return; }
  ss.timeUp = true;
  stopLoop();
  paintSession();
  const nb = $('#btnNext');
  if (nb) nb.textContent = 'See your summary';
  const note = $('#breakdown .bd-foot .muted');
  if (note) note.textContent = `Time's up on your ${ss.dur / 60}-minute session.`;
}
function endSession(stopped) {
  const ss = RT.sess;
  if (!ss || !ss.running) return;
  const used = ss.dur ? Math.min(ss.dur, sessElapsed()) : sessElapsed();
  ss.running = false;
  RT.holdUser = false;
  if (!RT.holdSys) RT.pauseAt = 0;
  stopLoop();
  if (stopped && !ss.n) { showReady(); toast('Session stopped'); return; }
  RT.state = 'summary';
  paintSession();
  renderSummary(ss, used, stopped);
  paintStage();
}
function renderSummary(ss, used, stopped) {
  const box = $('#summary'), goal = S.settings.goal, med = median(ss.times), n = ss.n;
  const early = ss.dur && stopped && used < ss.dur - 0.5;
  const len = !ss.dur ? clockText(Math.floor(used)) : early ? `${clockText(Math.floor(used))} of ${ss.dur / 60} min` : `${ss.dur / 60} min`;
  const a = ss.startTarget, b = S.target;
  const tgt = b < a ? `Target down from ${a}s to ${b}s.${b <= goal ? " That's your goal pace." : ''}`
    : b > a ? `Target eased from ${a}s to ${b}s.`
    : b <= goal ? `Target ${b}s. That's your goal pace.` : `Target still ${b}s.`;
  const k = (g, label, v, sub) => `<div class="kpi"><div class="eyebrow">${g}${esc(label)}</div><div class="v">${v}</div>${sub ? `<div class="s">${esc(sub)}</div>` : ''}</div>`;
  box.innerHTML = `<span class="eyebrow">Session · ${esc(len)}</span>
    <div class="result-hero"><span class="big">${n}</span><span class="unit">answered${n ? ' · ' + Math.round(100 * ss.f / n) + '% fast' : ''}</span></div>
    <p>${esc(tgt)}</p>
    ${ss.passed && ss.passed.length ? `<p class="sum-plan">${G.f}<span>Study plan: you passed ${ss.passed.map(esc).join(', ')}.</span></p>` : ''}
    <div class="kpis">${k(G.f, 'Fast', ss.f)}${k(G.s, 'Slow', ss.s)}${k(G.m, 'Missed', ss.m)}${k('', 'Median', med == null ? '–' : med.toFixed(1) + 's', 'on right answers')}</div>
    <div class="btn-row"><button type="button" class="btn primary" id="btnSessAgain">Go again</button><button type="button" class="btn" id="btnSessDone">Done</button></div>`;
  $('#btnSessAgain').addEventListener('click', () => startPractice());
  $('#btnSessDone').addEventListener('click', () => showReady());
  requestAnimationFrame(() => {
    const r = box.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}

// ---------------------------------------------------------------- study plan
function planIndex(id) { return PLAN.findIndex(s => s.id === id); }
function planDone(id) { return !!S.plan.done[id]; }
function planFirstOpen(from) {
  for (let i = from; i < PLAN.length; i++) if (!planDone(PLAN[i].id)) return PLAN[i];
  for (let i = 0; i < from; i++) if (!planDone(PLAN[i].id)) return PLAN[i];
  return null;
}
function planActive() { const i = planIndex(S.plan.active); return i >= 0 ? PLAN[i] : (planFirstOpen(0) || PLAN[PLAN.length - 1]); }
function planComplete() { return PLAN.every(s => planDone(s.id)); }
// The stage practice is drawing from right now (none while drilling a topic, in a test, or with the plan off).
function planStage() { return S.plan.on && RT.mode === 'practice' && !RT.drill ? planActive() : null; }
function stageLabel(stg) { return stg.title + ' · ' + LEVEL_NAME[stg.level]; }
function levelWords(L) { return L === 1 ? 'Foundations level' : 'Test level'; }
function stageDesc(stg) {
  if (stg.cells.length === ALL_CELLS.length) return `Every operation with whole numbers, decimals and fractions, plus conversions, at Test level${stg.missing ? ', with some missing-number questions like 66 × ? = 138.6' : ''}. This is the real test.`;
  if (stg.cells[0] === 'conv.frac') return `Turning fractions into decimals and back, like 3/8 = 0.375, at ${levelWords(stg.level)}.`;
  const type = stg.cells[0].split('.')[1], w = stg.cells.map(c => OP_WORD[c.split('.')[0]]);
  const list = w.length === 1 ? w[0] : w.slice(0, -1).join(', ') + ' and ' + w[w.length - 1];
  return `${list.charAt(0).toUpperCase() + list.slice(1)} with ${TYPE_NAME[type].toLowerCase()}${w.length > 1 ? ', mixed together' : ''}, at ${levelWords(stg.level)}.`;
}
function stageStats(stg) {
  const rec = (S.plan.rec[stg.id] || []).slice(-PLAN_N);
  const right = rec.filter(r => r[1]).map(r => r[0]);
  const n = rec.length, acc = n ? right.length / n : 0, med = median(right), goal = S.settings.goal;
  const medOK = med != null && med <= goal + 1e-9, accOK = n > 0 && acc >= 0.9 - 1e-9;
  return { n, acc, med, medOK, accOK, pass: n >= PLAN_N && medOK && accOK };
}
function passStage(stg, skipped) {
  S.plan.done[stg.id] = { t: Date.now(), skip: !!skipped };
  const next = planFirstOpen(planIndex(stg.id) + 1);
  if (!S.plan.active || S.plan.active === stg.id) S.plan.active = next ? next.id : '';
  const cur = planActive();
  RT.queue = RT.queue.filter(q => cur.cells.includes(q.p.cell));   // retries from an earlier topic don't follow you
  if (!skipped) {
    if (RT.sess && RT.sess.running) (RT.sess.passed || (RT.sess.passed = [])).push(stageLabel(stg));
    toast(next ? `Stage passed! Next: ${stageLabel(next)}` : 'You passed every stage of the plan!');
  }
}
// Practise a stage: turns the plan on. A session already under way carries on with the new stage.
function practiseStage(id) {
  S.plan.on = true; S.plan.active = id; RT.drill = null; touch(true);
  const stg = planActive();
  RT.queue = RT.queue.filter(q => stg.cells.includes(q.p.cell));
  if (sessTicking()) { showView('practice'); userResume(); nextQuestion(); return; }
  RT.state = 'ready';
  showView('practice');
}
function leavePlan() {
  S.plan.on = false; touch(true); renderStatus();
  if (RT.view === 'practice' && (RT.state === 'ask' || RT.state === 'fb') && !(RT.sess && RT.sess.timeUp)) { RT.queue = []; nextQuestion(); }
  if (RT.view === 'plan') renderPlan();
  toast('Left the plan. Practice uses your Settings again.');
}
function startWeeklyTest() { if (testRunning()) return; showView('test'); startTest(WEEKLY_TEST); }
const PLAN_ICON = {
  done: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="var(--fast)"/><path d="M4.7 8.3l2.2 2.2 4.4-4.7" fill="none" stroke="var(--sheet)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  skip: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="var(--ink-3)" stroke-width="1.6"/><path d="M5.4 8h5.2" stroke="var(--ink-3)" stroke-width="1.6" stroke-linecap="round"/></svg>',
  now: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="var(--pen)" stroke-width="2"/><circle cx="8" cy="8" r="2.7" fill="var(--pen)"/></svg>',
  todo: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="var(--rule)" stroke-width="1.6"/></svg>',
};
function renderPlan() {
  const box = $('#planBody'), goal = S.settings.goal, pl = S.plan;
  const doneN = PLAN.filter(s => planDone(s.id)).length, skipN = PLAN.filter(s => pl.done[s.id] && pl.done[s.id].skip).length, started = pl.on || doneN > 0 || Object.keys(pl.rec).length > 0;
  const stg = planActive(), st = stageStats(stg), idx = planIndex(stg.id), complete = planComplete();
  let top;
  if (!started) {
    top = `<div class="card">
      <span class="eyebrow">Study plan</span>
      <h2 style="margin-top:6px">A step-by-step path to ${goal} seconds</h2>
      <p>One thing at a time: whole numbers, then decimals, then fractions. Each operation starts at Foundations level, then moves to Test level. After every new operation there's a mixed round with the ones you've already passed, and the plan ends with everything mixed, the way the real test is.</p>
      <p>You pass a stage with ${PLAN_N} answers in it, a median of ${goal}s or less on the right ones and at least 90% right. Only your last ${PLAN_N} answers in a stage count, so slow early ones drop off. Pick any practice length; the plan just chooses the questions.</p>
      <div class="btn-row"><button type="button" class="btn primary block" id="btnPlanStart">Start the plan</button></div>
    </div>`;
  } else {
    const kMed = st.med == null ? '–' : st.med.toFixed(1) + 's';
    const kpiCheck = (label, v, sub, ok) => `<div class="kpi${ok ? ' ok' : ''}"><div class="eyebrow">${ok ? PLAN_ICON.done : ''}${esc(label)}</div><div class="v">${v}</div><div class="s">${esc(sub)}</div></div>`;
    top = `<div class="card plan-now">
      <span class="eyebrow">${complete ? 'Plan complete' : `Stage ${idx + 1} of ${PLAN.length} · ${esc(stg.group)}`}</span>
      <h2 style="margin-top:6px">${esc(stg.title)} <span class="lvl">${esc(LEVEL_NAME[stg.level])}</span></h2>
      <p>${complete ? `You've passed every stage. Keep practising the full mix and take the weekly check to stay at ${goal} seconds.` : esc(stageDesc(stg))}</p>
      <div class="plan-track" role="img" aria-label="${doneN} of ${PLAN.length} stages done"><span style="width:${(100 * doneN / PLAN.length).toFixed(1)}%"></span></div>
      <div class="plan-count">${doneN} of ${PLAN.length} stages done${skipN ? ` · ${skipN} skipped` : ''}</div>
      ${planDone(stg.id) ? '' : `<div class="kpis">${kpiCheck('Answers', `${Math.min(st.n, PLAN_N)}/${PLAN_N}`, `needs ${PLAN_N}`, st.n >= PLAN_N)}${kpiCheck('Median', kMed, `needs ≤ ${goal}.0s`, st.medOK)}${kpiCheck('Right', st.n ? Math.round(st.acc * 100) + '%' : '–', 'needs 90%+', st.accOK)}</div>`}
      <div class="btn-row"><button type="button" class="btn primary" id="btnPlanGo">${pl.on ? 'Practise this stage' : 'Continue the plan'}</button>${planDone(stg.id) ? '' : '<button type="button" class="btn ghost" id="btnPlanSkip">Skip this stage</button>'}</div>
    </div>`;
  }
  const full = S.tests.filter(t => t.full), last = full[full.length - 1];
  const days = last ? Math.floor((Date.now() - last.at) / 86400000) : null;
  const weekly = `<div class="card">
      <span class="eyebrow">Weekly check</span>
      <p style="margin-top:6px">Once a week, take the full ${WEEKLY_TEST.min}-minute test: every operation and number type at Test level, missing numbers included. It's the closest thing to the real screen, so it shows how far you've come.</p>
      <p class="plan-weekly">${last ? `Last one: ${esc(fmtDate(last.at))}${days === 0 ? ' (today)' : days === 1 ? ' (yesterday)' : ` (${days} days ago)`} · score ${signed(last.score)} · ${last.pace ? last.pace.toFixed(1) + 's per right answer' : 'no right answers'}${days >= 7 ? ' · <b>due now</b>' : ''}` : "You haven't taken one yet."}</p>
      <div class="btn-row"><button type="button" class="btn" id="btnWeekly">Take the weekly check</button></div>
    </div>`;
  let list = '', group = '';
  PLAN.forEach((s, i) => {
    if (s.group !== group) { if (group) list += '</div>'; group = s.group; list += `<span class="eyebrow plan-group">${esc(group)}</span><div class="plan-list">`; }
    const d = pl.done[s.id], isNow = started && !complete && s.id === stg.id;
    const icon = d ? (d.skip ? PLAN_ICON.skip : PLAN_ICON.done) : isNow ? PLAN_ICON.now : PLAN_ICON.todo;
    const ss = stageStats(s);
    const meta = d && d.skip ? 'skipped' : ss.n ? `${ss.med == null ? '–' : ss.med.toFixed(1) + 's'} · ${Math.round(ss.acc * 100)}%` : '';
    const state = d ? (d.skip ? 'Skipped' : 'Passed') : isNow ? 'Current stage' : 'Not passed yet';
    list += `<button type="button" class="stage-row${isNow ? ' now' : ''}${d ? ' done' : ''}" data-stage="${s.id}" aria-label="Stage ${i + 1}: ${esc(stageLabel(s))}. ${state}.${ss.n ? ` Median ${ss.med == null ? 'none' : ss.med.toFixed(1) + ' seconds'}, ${Math.round(ss.acc * 100)}% right.` : ''} Practise it.">
      <span class="st-icon">${icon}</span><span class="st-num">${i + 1}</span>
      <span class="st-main"><span class="st-title">${esc(s.title)}</span><span class="st-sub">${esc(LEVEL_NAME[s.level])}</span></span>
      <span class="st-meta">${meta}</span></button>`;
  });
  list += '</div>';
  box.innerHTML = `${top}${weekly}
    <div class="card"><span class="eyebrow">All stages</span><p style="margin-top:6px">Tap any stage to practise it. The plan moves you on by itself when you pass the one you're on.</p>${list}</div>
    ${started ? `<div class="store-line"><span>${pl.on ? 'The plan is choosing your practice questions.' : "The plan is off. Practice uses your Settings."}</span><span class="confirm" id="planResetBox">${pl.on ? '<button type="button" class="btn ghost" id="btnPlanLeave">Leave the plan</button>' : ''}<button type="button" class="btn ghost" id="btnPlanReset">Start over</button></span></div>` : ''}`;
  const on = (sel, fn) => { const el = $(sel, box); if (el) el.addEventListener('click', fn); };
  on('#btnPlanStart', () => practiseStage((planFirstOpen(0) || PLAN[0]).id));
  on('#btnPlanGo', () => practiseStage(stg.id));
  on('#btnPlanSkip', () => { passStage(stg, true); touch(true); renderPlan(); renderStatus(); toast(`Skipped. Next: ${stageLabel(planActive())}`); });
  on('#btnWeekly', startWeeklyTest);
  on('#btnPlanLeave', leavePlan);
  on('#btnPlanReset', () => {
    const rb = $('#planResetBox');
    rb.innerHTML = `<span>Clear your plan progress? Your times and tests stay.</span><button type="button" class="btn" id="btnPlanResetYes">Clear</button><button type="button" class="btn ghost" id="btnPlanResetNo">Keep</button>`;
    $('#btnPlanResetYes').addEventListener('click', () => { S.plan = { on: S.plan.on, active: '', done: {}, rec: {} }; touch(true); renderPlan(); renderStatus(); toast('Plan progress cleared'); });
    $('#btnPlanResetNo').addEventListener('click', renderPlan);
    $('#btnPlanResetNo').focus();
  });
  $$('.stage-row', box).forEach(b => b.addEventListener('click', () => practiseStage(b.dataset.stage)));
}

// ---------------------------------------------------------------- status strip
function renderStatus() {
  $('#tgtVal').textContent = S.target + 's';
  $('#goalVal').textContent = S.settings.goal + 's';
  $('#streakVal').textContent = RT.streak;
  const list = S.settings.adaptive ? S.win : RT.tally;
  let html = '';
  for (let i = 0; i < 10; i++) html += G[list[i] || 'e'];
  const tally = $('#tally');
  tally.innerHTML = html;
  const f = list.filter(x => x === 'f').length, s = list.filter(x => x === 's').length, m = list.filter(x => x === 'm').length;
  tally.setAttribute('aria-label', `Last ${list.length} answers: ${f} fast, ${s} slow, ${m} missed` + (S.settings.adaptive ? '. Eight fast out of ten lowers the target.' : ''));
  tally.title = S.settings.adaptive ? 'Get 8 of 10 fast to lower the target' : 'Your last 10 answers';
  $('#drillBar').hidden = !RT.drill;
  if (RT.drill) $('#drillName').textContent = cellShort(RT.drill);
  $('#drillExit').textContent = S.plan.on ? 'Back to the plan' : 'Back to the mix';
  const stg = planStage();
  $('#planBar').hidden = !stg;
  if (stg) {
    const st = stageStats(stg), med = st.med == null ? '–' : st.med.toFixed(1) + 's', acc = Math.round(st.acc * 100) + '% right';
    $('#planNum').textContent = `Plan · stage ${planIndex(stg.id) + 1} of ${PLAN.length}`;
    $('#planName').textContent = stageLabel(stg);
    $('#planProg').textContent = planDone(stg.id) ? 'Passed' + (st.n ? ` · median ${med} · ${acc}` : '')
      : st.n ? `${Math.min(st.n, PLAN_N)}/${PLAN_N} answers · median ${med} · ${acc}`
      : `Pass with ${PLAN_N} answers: median ${S.settings.goal}s or less, 90% right`;
  }
}
function onStateReplaced() {
  renderStatus();
  if (!$('#settings').hidden) renderSettings();
  if (RT.view === 'progress') renderProgress();
  if (RT.view === 'plan') renderPlan();
  if (RT.view === 'test' && RT.testView === 'setup') renderTestSetup();
  if (RT.state === 'ready') showReady();
}

// ---------------------------------------------------------------- views
function showView(v) {
  if (testRunning() && v !== 'test') return;
  if (RT.view === 'practice' && v !== 'practice') {
    if (sessTicking()) userPause(false);   // a session waits, paused, while you look at another tab
    else if (RT.state === 'ask' || RT.state === 'done') { stopLoop(); RT.state = 'ready'; }
  }
  RT.view = v;
  $$('.tabs [role=tab]').forEach(t => t.setAttribute('aria-selected', String(t.dataset.view === v)));
  ['practice', 'plan', 'test', 'progress'].forEach(n => { $('#view-' + n).hidden = n !== v; });
  if (v === 'practice') enterPractice();
  else if (v === 'plan') renderPlan();
  else if (v === 'test') { if (RT.testView !== 'result') renderTestSetup(); else { $('#testSetup').hidden = true; $('#testResult').hidden = false; } }
  else renderProgress();
}
function enterPractice() {
  RT.mode = 'practice';
  $('#practiceSlot').appendChild($('#playArea'));
  $('#btnShow').hidden = false; $('#btnSkip').hidden = true;
  $('#kbdHint').textContent = 'Right answers go through on their own · ↵ submits · Esc shows how';
  renderStatus();
  paintSession();
  if (RT.state === 'fb' || RT.state === 'summary' || (RT.sess && RT.sess.running)) { paintStage(); return; }
  if (RT.state !== 'ask') showReady();
}

// ---------------------------------------------------------------- test mode
function topicSummary() {
  const st = S.settings;
  const ops = OPS.filter(o => st.ops[o]).map(o => OP_SYM[o]).join(' ');
  const types = TYPES.filter(t => st.types[t]).map(t => TYPE_NAME[t].toLowerCase()).join(', ');
  const lv = { 1: 'Foundations', 2: 'Test level', 3: 'Hard' }[st.level];
  return `Uses your settings: ${ops} with ${types}${st.missing ? ', missing-number questions on' : ''}, ${lv}.`;
}
function renderTestSetup() {
  RT.testView = 'setup';
  $('#testSetup').hidden = false; $('#testRun').hidden = true; $('#testResult').hidden = true;
  const m = S.settings.testMin;
  $$('#durSeg button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.min === m)));
  $('#durWord').textContent = m + ' minutes';
  $('#testTopics').textContent = topicSummary();
  const withPace = S.tests.filter(t => t.pace && !t.early);
  if (withPace.length) {
    const best = withPace.reduce((a, b) => (b.pace < a.pace ? b : a));
    $('#testBest').textContent = `Your best pace so far: ${best.pace.toFixed(1)}s per right answer (score ${signed(best.score)} in ${best.dur / 60} min).`;
  } else $('#testBest').textContent = '';
}
function clockText(secs) { const m = Math.floor(secs / 60), s = Math.round(secs % 60); return m + ':' + String(s).padStart(2, '0'); }
function signed(n) { return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n); }
// cfg: the weekly check's fixed mix (WEEKLY_TEST); without it the test uses Settings.
function startTest(cfg) {
  cfg = cfg && cfg.cells ? cfg : null;
  dropSession();
  RT.mode = 'test'; RT.queue = []; RT.drill = null; RT.testCfg = cfg;
  RT.test = { running: true, dur: (cfg ? cfg.min : S.settings.testMin) * 60, start: now(), pausedMs: 0, score: 0, right: 0, wrong: 0, skipped: 0, log: [], full: !!cfg };
  RT.testView = 'run';
  $('#testSetup').hidden = true; $('#testResult').hidden = true; $('#testRun').hidden = false;
  $('#testSlot').appendChild($('#playArea'));
  $('#btnShow').hidden = true; $('#btnSkip').hidden = false;
  $('#kbdHint').textContent = 'Right answers go through on their own · ↵ submits · Esc skips';
  $$('.tabs [role=tab]').forEach(t => { if (t.dataset.view !== 'test') t.disabled = true; });
  $('#btnSettings').disabled = true; $('#btnAccount').disabled = true;
  updateScore(); updateClock();
  nextQuestion();
}
function testRemaining() {
  const T = RT.test;
  const paused = T.pausedMs + (RT.pauseAt ? now() - RT.pauseAt : 0);
  return T.dur - (now() - T.start - paused) / 1000;
}
function updateClock() {
  const r = Math.max(0, testRemaining()), m = Math.floor(r / 60), s = Math.floor(r % 60);
  const c = $('#clock');
  c.textContent = m + ':' + String(s).padStart(2, '0');
  c.classList.toggle('low', r < 30);
}
function updateScore() { const T = RT.test; $('#tScore').textContent = signed(T.score); $('#tRight').textContent = T.right; $('#tWrong').textContent = T.wrong; }
function endTest(early) {
  const T = RT.test;
  if (!T || !T.running) return;
  T.running = false; stopLoop(); RT.state = 'ready';
  const used = early ? Math.max(1, Math.min(T.dur, (now() - T.start - T.pausedMs) / 1000)) : T.dur;
  const pace = T.right ? used / T.right : null;
  const rec = { at: Date.now(), dur: T.dur, used: Math.round(used), score: T.score, right: T.right, wrong: T.wrong, skipped: T.skipped, pace: pace ? Math.round(pace * 10) / 10 : null, level: RT.testCfg ? RT.testCfg.level : S.settings.level, early: !!early };
  if (T.full) rec.full = true;
  if (T.right + T.wrong + T.skipped > 0) { S.tests.push(rec); if (S.tests.length > 60) S.tests.shift(); touch(true); }
  $$('.tabs [role=tab]').forEach(t => { t.disabled = false; });
  $('#btnSettings').disabled = false; $('#btnAccount').disabled = false;
  $('#practiceSlot').appendChild($('#playArea'));
  RT.mode = 'practice'; RT.testView = 'result';
  renderTestResult(rec, T.log);
}
function kpi(label, value, sub) { return `<div class="kpi"><div class="eyebrow">${esc(label)}</div><div class="v">${value}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>`; }
function reviewItem(x) {
  const meta = x.r === 'wrong' ? `you typed ${esc(x.typed)}` : x.r === 'skip' ? 'skipped' : `${x.secs.toFixed(1)}s`;
  return `<details><summary><span class="q">${questionWithAnswerHTML(x.p)}</span><span class="meta2">${meta}</span></summary><div class="inner">${methodHTML(x.p)}</div></details>`;
}
function renderTestResult(rec, log) {
  $('#testRun').hidden = true; $('#testSetup').hidden = true;
  const box = $('#testResult');
  box.hidden = false;
  const goal = S.settings.goal, pace = rec.pace;
  const missed = log.filter(x => x.r !== 'right');
  const slow = log.filter(x => x.r === 'right' && x.secs > goal).sort((a, b) => b.secs - a.secs).slice(0, 8);
  let verdict;
  if (!pace) verdict = 'No right answers this time. Try Foundations level in Settings, or practise first.';
  else if (pace <= goal) verdict = `That's at or under your ${goal}s goal. Typing answers is slower than picking from four options, so this is a tougher version of the real screen.`;
  else verdict = `About ${(pace - goal).toFixed(1)}s per answer still to find. The slow ones are below with faster ways to do them.`;
  const proj = rec.used !== 480 && rec.used > 30 ? `≈ ${signed(Math.round(rec.score * 480 / rec.used))} over 8 min` : '';
  box.innerHTML = `<div class="card">
      <span class="eyebrow">${rec.full ? 'Weekly check · ' : 'Result · '}${rec.early ? 'ended at ' + clockText(rec.used) + ' of ' : ''}${rec.dur / 60} min</span>
      <div class="result-hero"><span class="big">${pace ? pace.toFixed(1) + 's' : '–'}</span><span class="unit">per right answer · goal ${goal}.0s</span></div>
      <p>${esc(verdict)}</p>
      <div class="kpis">${kpi('Score', signed(rec.score), proj)}${kpi('Right', rec.right)}${kpi('Wrong', rec.wrong, rec.wrong ? '−1 each' : '')}${kpi('Skipped', rec.skipped)}</div>
      <div class="btn-row"><button type="button" class="btn primary" id="btnAgain">Run it again</button><button type="button" class="btn" id="btnFromTest">${missed.length ? 'Practise these' : 'Back to practice'}</button></div>
    </div>
    ${missed.length ? `<div><span class="eyebrow">Missed or skipped · ${missed.length}</span><div class="review">${missed.slice(0, 20).map(reviewItem).join('')}</div></div>` : ''}
    ${slow.length ? `<div><span class="eyebrow">Right, but over ${goal}s</span><div class="review">${slow.map(reviewItem).join('')}</div></div>` : ''}`;
  const again = RT.testCfg;
  $('#btnAgain').addEventListener('click', () => startTest(again));
  $('#btnFromTest').addEventListener('click', () => {
    RT.queue = missed.slice(0, 6).map((x, i) => ({ p: x.p, due: 1 + 2 * i }));
    RT.testView = 'setup';
    showView('practice');
  });
  box.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

// ---------------------------------------------------------------- progress
function median(a) { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function cellSummary(id) {
  const c = S.cells[id], rec = c.rec.slice(-30), ok = rec.filter(r => r[1] < 2);
  return { id, n: c.n, med: median(ok.map(r => r[0])), acc: ok.length / rec.length, fast: rec.filter(r => r[1] === 0).length / rec.length, recN: rec.length };
}
function renderProgress() {
  const st = S.settings, box = $('#progressBody');
  const hist = S.hist || '', fastPct = hist.length ? Math.round(100 * (hist.split('').filter(c => c === 'f').length) / hist.length) : null;
  const top = Math.max(st.start, S.target), ladder = [];
  for (let t = top; t >= Math.min(st.goal, S.target); t--) ladder.push(`<span class="${t === S.target ? 'now' : t > S.target ? 'done' : ''}${t === st.goal ? ' goal' : ''}" title="${t}s">${t}</span>`);
  const toGo = S.target - st.goal;
  const heroSub = !st.adaptive ? 'Fixed target. Turn on “Lower the target as you improve” in Settings to step it down.'
    : toGo > 0 ? `${toGo} step${toGo > 1 ? 's' : ''} to your ${st.goal}s goal. Each step needs 8 of 10 questions inside the target.` : `You're practising at your ${st.goal}s goal. Stay there, or set a tighter goal in Settings.`;
  const rows = Object.keys(S.cells).filter(id => S.cells[id].rec && S.cells[id].rec.length >= 3).map(cellSummary);
  rows.sort((a, b) => (b.med == null ? 99 : b.med) - (a.med == null ? 99 : a.med));
  const scaleMax = Math.max(12, Math.ceil(Math.max(0, ...rows.map(r => r.med || 0)) + 1));
  const pct = v => (100 * Math.min(v, scaleMax) / scaleMax).toFixed(2) + '%';
  const barRows = rows.map(r => {
    const state = r.med == null ? 'm' : r.med <= st.goal ? 'f' : r.med > S.target ? 's' : '';
    const val = r.med == null ? '–' : r.med.toFixed(1) + 's';
    const sub = `${Math.round(r.fast * 100)}% fast · ${Math.round(r.acc * 100)}% right`;
    return `<button type="button" class="bar-row" data-cell="${r.id}" aria-label="${esc(cellShort(r.id))}: median ${val}, ${sub}, ${r.n} answered. Drill it.">
      <span class="lbl"><span class="sym">${OP_SYM[r.id.split('.')[0]]}</span>${esc(cellName(r.id))}<span class="sub">${esc(sub)}</span></span>
      <span class="btrack"><span class="base"></span>${r.med != null ? `<span class="bfill" style="width:${pct(r.med)}"></span>` : ''}<span class="gtick" style="left:${pct(st.goal)}"></span>${S.target > st.goal ? `<span class="ttick" style="left:${pct(S.target)}"></span>` : ''}</span>
      <span class="val">${state ? G[state] : ''}${val}</span></button>`;
  }).join('');
  const tests = S.tests.filter(t => t.pace);
  box.innerHTML = `
    <div class="card">
      <span class="eyebrow">Your target</span>
      <div class="hero-row" style="margin-top:8px"><div class="hero-fig">${S.target}<small>s</small></div><div class="ladder" aria-label="Target steps">${ladder.join('')}</div></div>
      <p>${esc(heroSub)}</p>
      <div class="kpis">${kpi('Answered', S.totals.n.toLocaleString())}${kpi('Fast, last 100', fastPct == null ? '–' : fastPct + '%')}${kpi('Best streak', S.bestStreak || 0)}${kpi('Tests', S.tests.length)}</div>
    </div>
    <div class="card">
      <span class="eyebrow">Where the seconds go</span>
      <h2 style="margin-top:6px">Median time on right answers</h2>
      ${rows.length ? `<div class="bars">${barRows}</div>
        <div class="axis-note"><span><i style="background:var(--fast)"></i>goal ${st.goal}s${S.target > st.goal ? `&nbsp;&nbsp;<i style="background:var(--ink-3)"></i>target ${S.target}s` : ''}</span><span>Last 30 per topic · tap a row to drill it</span></div>`
        : `<div class="empty" style="margin-top:12px">Answer a few questions in Practice and your times by topic show up here, slowest first.</div>`}
    </div>
    <div class="card">
      <span class="eyebrow">Tests</span>
      <h2 style="margin-top:6px">Pace per right answer</h2>
      ${tests.length >= 2 ? `<div class="chart-wrap" id="chartWrap"></div>` : `<div class="empty" style="margin-top:12px">${tests.length ? 'One test so far. Run another to see your trend.' : 'Take a timed test to see your pace here.'}</div>`}
      ${S.tests.length ? `<div style="overflow-x:auto"><table class="hist"><thead><tr><th>Date</th><th class="num">Length</th><th class="num">Score</th><th class="num">Pace</th></tr></thead><tbody>${S.tests.slice(-10).reverse().map(t => `<tr><td>${esc(fmtDate(t.at))}</td><td class="num">${t.early ? clockText(t.used) + ' of ' : ''}${t.dur / 60}m</td><td class="num">${signed(t.score)}</td><td class="num">${t.pace ? t.pace.toFixed(1) + 's' : '–'}</td></tr>`).join('')}</tbody></table></div>` : ''}
    </div>
    <div class="store-line"><span id="storeLine"></span><span class="confirm" id="resetBox"><button type="button" class="btn ghost" id="btnReset">Reset progress</button></span></div>`;
  $$('.bar-row', box).forEach(b => b.addEventListener('click', () => {
    RT.drill = b.dataset.cell; RT.queue = [];
    if (sessTicking()) { showView('practice'); userResume(); nextQuestion(); return; }   // carry on the session, on this topic
    RT.state = 'ready'; showView('practice'); startPractice();
  }));
  $('#btnReset').addEventListener('click', askReset);
  refreshStoreLine();
  if (tests.length >= 2) drawChart(tests.slice(-20));
}
function storeLineHTML() {
  const u = sync.user && !sync.user.provisional ? sync.user : null;
  if (u) return `Signed in as <b>${esc(u.email || u.name)}</b>. ${esc(syncText())}`;
  if (cloud()) return `${esc(syncText())} <button type="button" class="linkish" id="btnStoreSignIn">Sign in</button> to keep it on every device.`;
  return esc(syncText());
}
function refreshStoreLine() {
  const el = $('#storeLine');
  if (!el) return;
  el.innerHTML = storeLineHTML();
  const b = $('#btnStoreSignIn');
  if (b) b.addEventListener('click', openAccount);
}
function fmtDate(ts) { try { return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch (e) { return ''; } }
function askReset() {
  const box = $('#resetBox');
  box.innerHTML = `<span>Clear your target, times, tests and study plan?</span><button type="button" class="btn" id="btnResetYes">Reset</button><button type="button" class="btn ghost" id="btnResetNo">Keep</button>`;
  $('#btnResetYes').addEventListener('click', () => {
    const keep = S.settings; S = defaults(); S.settings = keep; S.target = keep.start;
    RT.tally = []; RT.streak = 0; RT.queue = []; if (RT.sess) RT.sess.startTarget = S.target;
    touch(true); renderStatus(); renderProgress(); toast('Progress reset');
  });
  $('#btnResetNo').addEventListener('click', renderProgress);
  $('#btnResetNo').focus();
}
function drawChart(tests) {
  const wrap = $('#chartWrap');
  if (!wrap) return;
  const W = Math.max(260, Math.round(wrap.clientWidth || 300)), H = 190, L = 34, Rg = 46, Tp = 14, B = 24;
  const goal = S.settings.goal;
  const maxV = Math.max(goal + 2, ...tests.map(t => t.pace));
  const step = maxV <= 12 ? 2 : maxV <= 30 ? 5 : 10;
  const yMax = Math.ceil((maxV + 0.5) / step) * step;
  const x = i => L + (tests.length === 1 ? (W - L - Rg) / 2 : i * (W - L - Rg) / (tests.length - 1));
  const y = v => Tp + (1 - v / yMax) * (H - Tp - B);
  let g = '';
  for (let v = 0; v <= yMax; v += step) g += `<line x1="${L}" x2="${W - Rg}" y1="${y(v)}" y2="${y(v)}" stroke="var(--rule)" stroke-width="1"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}s</text>`;
  const pts = tests.map((t, i) => [x(i), y(t.pace)]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = line + ` L ${pts[pts.length - 1][0].toFixed(1)} ${y(0)} L ${pts[0][0].toFixed(1)} ${y(0)} Z`;
  const last = pts[pts.length - 1], lt = tests[tests.length - 1];
  const sameDay = fmtDate(tests[0].at) === fmtDate(lt.at);
  wrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" tabindex="0" role="img" aria-label="Pace per right answer across your last ${tests.length} tests. Latest ${lt.pace.toFixed(1)} seconds, goal ${goal} seconds. The table below lists every test.">
      ${g}
      <line x1="${L}" x2="${W - Rg}" y1="${y(goal)}" y2="${y(goal)}" stroke="var(--fast)" stroke-width="1.5"/>
      <text x="${W - Rg + 6}" y="${y(goal) + 4}">goal</text>
      <path d="${area}" fill="var(--series-wash)" stroke="none"/>
      <path d="${line}" fill="none" stroke="var(--series)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <line id="xh" x1="0" x2="0" y1="${Tp}" y2="${H - B}" stroke="var(--ink-3)" stroke-width="1" visibility="hidden"/>
      <circle id="hd" r="4" fill="var(--series)" stroke="var(--sheet)" stroke-width="2" visibility="hidden"/>
      <circle cx="${last[0]}" cy="${last[1]}" r="4.5" fill="var(--series)" stroke="var(--sheet)" stroke-width="2"/>
      <text x="${last[0] + 8}" y="${last[1] + 4}" style="font-weight:650;fill:var(--ink)">${lt.pace.toFixed(1)}s</text>
      <text x="${L}" y="${H - 6}">${esc(sameDay ? 'Test 1' : fmtDate(tests[0].at))}</text>
      <text x="${W - Rg}" y="${H - 6}" text-anchor="end">${esc(sameDay ? 'Test ' + tests.length : fmtDate(lt.at))}</text>
    </svg><div class="tip" id="tip" hidden></div>`;
  const svg = $('svg', wrap), tip = $('#tip'), xh = $('#xh', wrap), hd = $('#hd', wrap);
  let cur = tests.length - 1;
  function show(i) {
    cur = Math.max(0, Math.min(tests.length - 1, i));
    const t = tests[cur], [px, py] = pts[cur];
    const scale = svg.getBoundingClientRect().width / W;
    xh.setAttribute('x1', px); xh.setAttribute('x2', px); xh.setAttribute('visibility', 'visible');
    hd.setAttribute('cx', px); hd.setAttribute('cy', py); hd.setAttribute('visibility', 'visible');
    tip.hidden = false;
    tip.innerHTML = `<b>${t.pace.toFixed(1)}s</b><span class="key-line"></span>per right answer<br>${esc(fmtDate(t.at))} · ${t.dur / 60} min · score ${signed(t.score)}`;
    const left = Math.max(70, Math.min(px * scale, wrap.clientWidth - 70));
    tip.style.left = left + 'px'; tip.style.top = (py * scale - 10) + 'px';
  }
  function hide() { tip.hidden = true; xh.setAttribute('visibility', 'hidden'); hd.setAttribute('visibility', 'hidden'); }
  svg.addEventListener('pointermove', e => {
    const r = svg.getBoundingClientRect(), px = (e.clientX - r.left) * W / r.width;
    let best = 0, bd = Infinity;
    pts.forEach((p, i) => { const d = Math.abs(p[0] - px); if (d < bd) { bd = d; best = i; } });
    show(best);
  });
  svg.addEventListener('pointerleave', hide);
  svg.addEventListener('focus', () => show(cur));
  svg.addEventListener('blur', hide);
  svg.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') { show(cur - 1); e.preventDefault(); } else if (e.key === 'ArrowRight') { show(cur + 1); e.preventDefault(); } });
}

// ---------------------------------------------------------------- settings
function setPressed(sel, fn) { $$(sel).forEach(b => b.setAttribute('aria-pressed', String(!!fn(b)))); }
function renderSettings() {
  const st = S.settings;
  setPressed('#opChips .chip-btn', b => st.ops[b.dataset.op]);
  setPressed('#typeChips .chip-btn', b => st.types[b.dataset.type]);
  setPressed('#levelSeg button', b => +b.dataset.level === st.level);
  setPressed('#startSeg button', b => +b.dataset.s === st.start);
  setPressed('#goalSeg button', b => +b.dataset.g === st.goal);
  $('#swConv').setAttribute('aria-checked', String(!!st.conv));
  $('#swConv').disabled = !st.types.frac;
  $('#swMissing').setAttribute('aria-checked', String(!!st.missing));
  $('#swAdaptive').setAttribute('aria-checked', String(!!st.adaptive));
  $('#swHard').setAttribute('aria-checked', String(!!st.hard));
  $('#levelDesc').textContent = LEVEL_DESC[st.level];
  $('#planNote').hidden = !S.plan.on;
}
function openSettings() {
  if (testRunning()) return;
  pause();
  renderSettings();
  RT.topicsDirty = false;
  $('#settings').hidden = false;
  $('#btnCloseSettings').focus();
}
function closeSettings() {
  $('#settings').hidden = true;
  $('#btnSettings').focus();
  // New topics mid-session: the question on screen is swapped for one from the new mix and the session keeps going.
  const swap = RT.view === 'practice' && RT.topicsDirty && (RT.state === 'ask' || RT.state === 'fb');
  if (swap) RT.queue = [];
  resume();
  if (swap && RT.state === 'ask') nextQuestion();
  if (RT.state === 'ready') showReady();
  renderStatus();
  if (RT.view === 'progress') renderProgress();
  if (RT.view === 'plan') renderPlan();
  if (RT.view === 'test' && RT.testView === 'setup') renderTestSetup();
}
function changed(topics) { if (topics) RT.topicsDirty = true; sanitize(); touch(true); renderSettings(); renderStatus(); }
function bindSettings() {
  $('#opChips').addEventListener('click', e => {
    const b = e.target.closest('[data-op]'); if (!b) return;
    const st = S.settings, k = b.dataset.op;
    if (st.ops[k] && OPS.filter(o => st.ops[o]).length === 1) { toast('Keep at least one operation'); return; }
    st.ops[k] = !st.ops[k]; changed(true);
  });
  $('#typeChips').addEventListener('click', e => {
    const b = e.target.closest('[data-type]'); if (!b) return;
    const st = S.settings, k = b.dataset.type;
    if (st.types[k] && TYPES.filter(t => st.types[t]).length === 1) { toast('Keep at least one kind of number'); return; }
    st.types[k] = !st.types[k]; changed(true);
  });
  $('#swConv').addEventListener('click', () => { S.settings.conv = !S.settings.conv; changed(true); });
  $('#swMissing').addEventListener('click', () => { S.settings.missing = !S.settings.missing; changed(true); });
  $('#swAdaptive').addEventListener('click', () => { S.settings.adaptive = !S.settings.adaptive; S.win = []; changed(false); });
  $('#swHard').addEventListener('click', () => { S.settings.hard = !S.settings.hard; changed(false); });
  $('#levelSeg').addEventListener('click', e => { const b = e.target.closest('[data-level]'); if (!b) return; S.settings.level = +b.dataset.level; changed(true); });
  $('#startSeg').addEventListener('click', e => { const b = e.target.closest('[data-s]'); if (!b) return; S.settings.start = +b.dataset.s; S.target = S.settings.start; S.win = []; changed(false); toast(`Target set to ${S.target}s`); });
  $('#goalSeg').addEventListener('click', e => { const b = e.target.closest('[data-g]'); if (!b) return; S.settings.goal = +b.dataset.g; if (S.settings.adaptive && S.target < S.settings.goal) S.target = S.settings.goal; changed(false); });
  $('#btnCloseSettings').addEventListener('click', closeSettings);
  $('#settings').addEventListener('click', e => { if (e.target === $('#settings')) closeSettings(); });
  $('#settings').addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const f = $$('#settings button:not([disabled])');
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { f[f.length - 1].focus(); e.preventDefault(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { f[0].focus(); e.preventDefault(); }
  });
}

// ---------------------------------------------------------------- account
function initials(u) { const s = ((u && (u.name || u.email)) || '?').trim(); return (s.charAt(0) || '?').toUpperCase(); }
function ago(ts) { const s = Math.round((Date.now() - ts) / 1000); if (s < 10) return 'just now'; if (s < 60) return s + 's ago'; const m = Math.round(s / 60); return m < 60 ? m + ' min ago' : fmtDate(ts); }
function syncText() {
  switch (sync.status) {
    case 'loading': return 'Loading your progress…';
    case 'saving': return 'Saving to your account…';
    case 'saved': return 'Saved to your account' + (sync.lastSync ? ' · ' + ago(sync.lastSync) : '') + '.';
    case 'offline': return "Can't reach your account right now. Progress is kept on this device and saves when you're back online.";
    default: return storageOK ? 'Progress is saved in this browser only.' : "This browser can't save progress, so it resets when you close the page.";
  }
}
function renderAccountBits() {
  const b = $('#btnAccount');
  if (!b) return;
  const u = sync.user && !sync.user.provisional ? sync.user : null;
  if (sync.user) {
    b.innerHTML = `<span class="avatar" aria-hidden="true">${u ? esc(initials(u)) : '·'}</span>`;
    b.setAttribute('aria-label', u ? 'Account: ' + (u.email || u.name) : 'Account');
    b.classList.add('signed');
  } else {
    b.textContent = 'Sign in';
    b.setAttribute('aria-label', 'Sign in to save your progress');
    b.classList.remove('signed');
  }
  if (!$('#account').hidden) renderAccount();
  refreshStoreLine();
}
const AUTH_MSG = {
  'auth/invalid-credential': "That email and password don't match. Check them, or create an account.",
  'auth/invalid-login-credentials': "That email and password don't match. Check them, or create an account.",
  'auth/wrong-password': "That password isn't right.",
  'auth/user-not-found': 'No account uses that email yet. Tap Create account.',
  'auth/invalid-email': "That email address doesn't look right.",
  'auth/missing-email': 'Type your email address.',
  'auth/missing-password': 'Type a password.',
  'auth/weak-password': 'Use a password with at least 6 characters.',
  'auth/email-already-in-use': 'There is already an account with that email. Tap Sign in instead.',
  'auth/too-many-requests': 'Too many tries. Wait a minute, then try again.',
  'auth/network-request-failed': "Couldn't reach the sign-in service. Check your connection and try again.",
  'auth/popup-blocked': 'Your browser blocked the Google window. Allow pop-ups for this site, or use email.',
  'auth/unauthorized-domain': "This site's address isn't on the sign-in allow list yet. In Firebase, add it under Authentication, Settings, Authorized domains.",
  'auth/operation-not-allowed': "This sign-in method isn't switched on yet. In Firebase, turn it on under Authentication, Sign-in method.",
  'auth/user-disabled': 'This account has been turned off.',
};
function setAuthMsg(text, isErr) {
  const m = $('#authMsg');
  if (!m) { if (text) toast(text); return; }
  m.textContent = text || '';
  m.classList.toggle('err', !!isErr);
}
function showAuthError(e) {
  const code = e && e.code;
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') { setAuthMsg(''); return; }
  setAuthMsg(AUTH_MSG[code] || `Sign-in didn't work${code ? ' (' + String(code).replace('auth/', '') + ')' : ''}. Try again.`, true);
}
function setAuthBusy(on) { $$('#accountBody button, #accountBody input').forEach(el => { el.disabled = on; }); }
function renderAccount() {
  const body = $('#accountBody'), c = cloud();
  const u = sync.user && !sync.user.provisional ? sync.user : null;
  const mode = !c ? 'off' : u ? 'in' : 'out';
  if (body.dataset.mode === mode) { if (mode === 'in') $('#syncLine').textContent = syncText(); return; }
  body.dataset.mode = mode;
  $('#accountTitle').textContent = mode === 'in' ? 'Your account' : 'Sign in';
  if (mode === 'off') {
    body.innerHTML = `<p class="acct-lede">Sign-in isn't switched on for this site yet, so your progress is saved in this browser.</p>`;
    return;
  }
  if (mode === 'in') {
    body.innerHTML = `<div class="acct-who"><span class="avatar big" aria-hidden="true">${esc(initials(u))}</span>
        <div class="who-text"><div class="t">${esc(u.name || u.email)}</div>${u.name && u.email ? `<div class="d">${esc(u.email)}</div>` : ''}</div></div>
      <p class="sync-line" id="syncLine">${esc(syncText())}</p>
      <p class="fine">Your target, times and tests follow you to any device where you sign in with this account.</p>
      <button type="button" class="btn block" id="btnSignOut">Sign out</button>`;
    $('#btnSignOut').addEventListener('click', doSignOut);
    return;
  }
  body.innerHTML = `<p class="acct-lede">Sign in and your target, times and test history follow you to any device.</p>
    <button type="button" class="btn primary block" id="btnGoogle">Continue with Google</button>
    <div class="or"><span>or use email</span></div>
    <form id="emailForm" class="acct-form" novalidate>
      <label for="acctEmail">Email</label>
      <input id="acctEmail" name="email" type="email" autocomplete="email" inputmode="email" autocapitalize="off" spellcheck="false" required>
      <label for="acctPass">Password</label>
      <input id="acctPass" name="password" type="password" autocomplete="current-password" minlength="6" required>
      <div class="form-row"><button type="submit" class="btn primary" id="btnEmailIn">Sign in</button><button type="button" class="btn" id="btnEmailUp">Create account</button></div>
      <button type="button" class="linkish" id="btnForgot">Forgot your password?</button>
      <p class="form-msg" id="authMsg" role="alert"></p>
    </form>
    <p class="fine">You can practise without an account. Progress then stays in this browser only.</p>`;
  $('#btnGoogle').addEventListener('click', doGoogle);
  $('#emailForm').addEventListener('submit', e => { e.preventDefault(); doEmail('in'); });
  $('#btnEmailUp').addEventListener('click', () => doEmail('up'));
  $('#btnForgot').addEventListener('click', doReset);
}
async function doGoogle() {
  const c = cloud(); if (!c) return;
  setAuthMsg(''); setAuthBusy(true);
  try { await c.signInGoogle(); closeAccount(); toast('Signed in'); }
  catch (e) { showAuthError(e); }
  finally { setAuthBusy(false); }
}
async function doEmail(mode) {
  const c = cloud(); if (!c) return;
  const email = $('#acctEmail').value.trim(), pass = $('#acctPass').value;
  if (!email) { setAuthMsg('Type your email address.', true); $('#acctEmail').focus(); return; }
  if (!pass) { setAuthMsg('Type a password.', true); $('#acctPass').focus(); return; }
  if (mode === 'up' && pass.length < 6) { setAuthMsg('Use a password with at least 6 characters.', true); $('#acctPass').focus(); return; }
  setAuthMsg(mode === 'up' ? 'Creating your account…' : 'Signing in…'); setAuthBusy(true);
  try {
    if (mode === 'up') await c.signUpEmail(email, pass); else await c.signInEmail(email, pass);
    closeAccount();
    toast(mode === 'up' ? 'Account created. Your progress now saves to it.' : 'Signed in');
  } catch (e) { showAuthError(e); }
  finally { setAuthBusy(false); }
}
async function doReset() {
  const c = cloud(); if (!c) return;
  const email = $('#acctEmail').value.trim();
  if (!email) { setAuthMsg('Type your email above first, then tap this again.', true); $('#acctEmail').focus(); return; }
  setAuthBusy(true);
  try { await c.resetPassword(email); setAuthMsg('Check your email for a link to reset your password.'); }
  catch (e) { showAuthError(e); }
  finally { setAuthBusy(false); }
}
async function doSignOut() {
  const c = cloud(); if (!c) return;
  setAuthBusy(true);
  try { await flushPush(); await c.signOut(); closeAccount(); toast('Signed out. Your progress stays in your account.'); }
  catch (e) { toast("Couldn't sign out. Try again."); }
  finally { setAuthBusy(false); }
}
function openAccount() {
  if (testRunning()) return;
  pause();
  $('#accountBody').dataset.mode = '';
  renderAccount();
  $('#account').hidden = false;
  ($('#btnGoogle') || $('#btnSignOut') || $('#btnCloseAccount')).focus();
}
function closeAccount() {
  if ($('#account').hidden) return;
  $('#account').hidden = true;
  $('#btnAccount').focus();
  if ($('#settings').hidden) resume();
  if (RT.state === 'ready') showReady();
}
function bindAccount() {
  $('#btnAccount').addEventListener('click', openAccount);
  $('#btnCloseAccount').addEventListener('click', closeAccount);
  $('#account').addEventListener('click', e => { if (e.target === $('#account')) closeAccount(); });
  $('#account').addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const f = $$('#account button:not([disabled]), #account input:not([disabled])');
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { f[f.length - 1].focus(); e.preventDefault(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { f[0].focus(); e.preventDefault(); }
  });
}

// ---------------------------------------------------------------- toast
let toastTimer = 0;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600); }

// ---------------------------------------------------------------- input wiring
function pressVisual(k) {
  const b = $(`#keypad .key[data-k="${k === ' ' ? 'none' : k}"]`);
  if (!b) return;
  b.classList.add('down'); setTimeout(() => b.classList.remove('down'), 90);
}
function bindInput() {
  const kp = $('#keypad');
  kp.addEventListener('mousedown', e => e.preventDefault());
  kp.addEventListener('click', e => { const b = e.target.closest('.key'); if (b) onKey(b.dataset.k); });
  document.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!$('#settings').hidden) { if (e.key === 'Escape') { closeSettings(); e.preventDefault(); } return; }
    if (!$('#account').hidden) { if (e.key === 'Escape') { closeAccount(); e.preventDefault(); } return; }
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const playing = RT.view === 'practice' || (RT.view === 'test' && testRunning());
    if (!playing) return;
    if (e.key === 'p' || e.key === 'P') { if (togglePause(true)) e.preventDefault(); return; }
    let k = null;
    if (/^[0-9]$/.test(e.key)) k = e.key;
    else if (e.key === '.' || e.key === ',' || e.key === 'Decimal') k = '.';
    else if (e.key === '/' || e.key === 'Divide') k = '/';
    else if (e.key === ' ') k = RT.state === 'fb' || RT.state === 'ready' || RT.holdUser ? 'enter' : ' ';
    else if (e.key === 'Backspace') k = 'back';
    else if (e.key === 'Enter') k = 'enter';
    else if (e.key === 'Escape') k = 'esc';
    if (!k) return;
    if ((e.key === 'Enter' || e.key === ' ') && (tag === 'BUTTON' || tag === 'SUMMARY') && (RT.state !== 'ask' || RT.holdUser)) return;
    if (tag === 'svg' || tag === 'SVG') return;
    e.preventDefault();
    if (k === 'esc') { if (RT.state === 'ask' && !RT.holdUser) { if (RT.mode === 'test') skip(); else reveal(); } return; }
    if (!RT.holdUser) pressVisual(k);
    onKey(k);
  });
  $('#btnShow').addEventListener('click', reveal);
  $('#btnSkip').addEventListener('click', skip);
  $('#btnStart').addEventListener('click', startPractice);
  $('#lenSeg').addEventListener('click', e => {
    const b = e.target.closest('[data-len]'); if (!b) return;
    S.settings.practiceMin = +b.dataset.len; touch(false); renderLen();
  });
  $('#btnPause').addEventListener('click', () => togglePause(false));
  $('#btnStop').addEventListener('click', () => endSession(true));
  $('#btnResume').addEventListener('click', userResume);
  $('#btnSettings').addEventListener('click', openSettings);
  $$('.tabs [role=tab]').forEach(t => t.addEventListener('click', () => showView(t.dataset.view)));
  $('.tabs').addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const tabs = $$('.tabs [role=tab]:not([disabled])'), i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    n.focus(); showView(n.dataset.view); e.preventDefault();
  });
  $('#planExit').addEventListener('click', leavePlan);
  $('#drillExit').addEventListener('click', () => { RT.drill = null; RT.queue = []; renderStatus(); if ((RT.state === 'ask' || RT.state === 'fb') && !(RT.sess && RT.sess.timeUp)) nextQuestion(); });
  $('#durSeg').addEventListener('click', e => { const b = e.target.closest('[data-min]'); if (!b) return; S.settings.testMin = +b.dataset.min; touch(false); renderTestSetup(); });
  $('#btnStartTest').addEventListener('click', startTest);
  $('#btnEndTest').addEventListener('click', () => endTest(true));
  window.addEventListener('resize', () => {
    if (RT.prob && (RT.state === 'ask' || RT.state === 'fb')) fitProblem(true);
    if (RT.view === 'progress') { const t = S.tests.filter(x => x.pace); if (t.length >= 2) drawChart(t.slice(-20)); }
  });
}

// ---------------------------------------------------------------- start
function init() {
  document.addEventListener('touchstart', () => {}, { passive: true });
  storageOK = testStorage();
  const c = cloud();
  let lastUid = null;
  if (c && storageOK) { try { lastUid = localStorage.getItem(LAST_UID_KEY); } catch (e) { lastUid = null; } }
  if (lastUid) sync.user = { uid: lastUid, provisional: true };
  const saved = readLocal(keyFor(lastUid));
  if (saved) S = merge(defaults(), saved);
  sanitize();
  $('#practiceSlot').appendChild($('#playArea'));
  bindInput(); bindSettings(); bindAccount();
  showView('practice');
  renderAccountBits();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (RT.prob && RT.state === 'ask') fitProblem(true); });
  if (c) c.onAuth(u => { onAuthChanged(u).catch(err => console.error(err)); });
}
init();
})();
