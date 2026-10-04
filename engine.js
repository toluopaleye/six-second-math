/* Six Second Math — problem engine.
   Exact rational arithmetic throughout. Every breakdown step is either a chain of
   expressions that must all be equal, or a text line with machine-checkable claims,
   so the whole method can be verified automatically. */
(function (root) {
'use strict';

// ---------------------------------------------------------------- random
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rnd = Math.random;
function seed(s) { rnd = mulberry32(s >>> 0); }
const RETRY = { retry: true };
function need(c) { if (!c) throw RETRY; }
function ri(a, b) { a = Math.ceil(a); b = Math.floor(b); if (b < a) throw RETRY; return a + Math.floor(rnd() * (b - a + 1)); }
function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
function chance(p) { return rnd() < p; }
function wpick(pairs) {
  let tot = 0; for (const p of pairs) tot += p[0];
  let x = rnd() * tot;
  for (const p of pairs) { x -= p[0]; if (x < 0) return p[1]; }
  return pairs[pairs.length - 1][1];
}

// ---------------------------------------------------------------- exact rationals
function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { const t = a % b; a = b; b = t; } return a; }
function lcm(a, b) { return a / gcd(a, b) * b; }
function safe(x) { if (!Number.isSafeInteger(x)) throw new Error('unsafe integer: ' + x); return x; }
function R(n, d) {
  if (d === undefined) d = 1;
  safe(n); safe(d);
  if (d === 0) throw new Error('zero denominator');
  if (d < 0) { n = -n; d = -d; }
  const g = gcd(n, d) || 1;
  return { n: n / g, d: d / g };
}
const Q = {
  add: (x, y) => R(safe(x.n * y.d + y.n * x.d), safe(x.d * y.d)),
  sub: (x, y) => R(safe(x.n * y.d - y.n * x.d), safe(x.d * y.d)),
  mul: (x, y) => R(safe(x.n * y.n), safe(x.d * y.d)),
  div: (x, y) => { if (y.n === 0) throw new Error('division by zero'); return R(safe(x.n * y.d), safe(x.d * y.n)); },
  eq: (x, y) => x.n === y.n && x.d === y.d,
  gt: (x, y) => x.n * y.d > y.n * x.d,
};
function decPlaces(r) {
  let d = r.d, t = 0, f = 0;
  while (d % 2 === 0) { d /= 2; t++; }
  while (d % 5 === 0) { d /= 5; f++; }
  return d === 1 ? Math.max(t, f) : -1;
}
function decStr(r) {
  const k = decPlaces(r);
  if (k < 0) throw new Error('non-terminating decimal');
  if (k === 0) return String(r.n);
  const N = safe(r.n * (10 ** k / r.d));
  const neg = N < 0;
  let s = String(Math.abs(N));
  while (s.length <= k) s = '0' + s;
  let out = s.slice(0, s.length - k) + '.' + s.slice(s.length - k);
  out = out.replace(/0+$/, '').replace(/\.$/, '');
  return (neg ? '-' : '') + out;
}
function parseDecimal(s) {
  const m = /^(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m || (m[1] === '' && !m[2])) return null;
  const ip = m[1] || '0', fp = m[2] || '';
  if (ip.length + fp.length > 15) return null;
  return R(parseInt(ip + fp, 10), 10 ** fp.length);
}
function dv(i, p) { return R(i, 10 ** p); }

// ---------------------------------------------------------------- display numbers + expressions
// A "Num" carries an exact value plus how to show it: int, dec (canonical decimal), or frac (n/d as written).
function I(n) { if (!Number.isInteger(n)) throw new Error('I() needs an integer, got ' + n); return { v: R(n), k: 'int' }; }
function Dv(r) {
  if (typeof r === 'string') r = parseDecimal(r);
  if (!r || decPlaces(r) < 0) throw new Error('Dv: not a terminating decimal');
  return { v: r, k: r.d === 1 ? 'int' : 'dec' };
}
function F(n, d) { safe(n); safe(d); if (d <= 0) throw new Error('F: bad denominator'); return { v: R(n, d), k: 'frac', n, d }; }
function Fr(r) { return r.d === 1 ? { v: r, k: 'int' } : { v: r, k: 'frac', n: r.n, d: r.d }; }
function Auto(r, pref) {
  if (r.d === 1) return { v: r, k: 'int' };
  if (pref !== 'frac' && decPlaces(r) >= 0) return Dv(r);
  return Fr(r);
}
function isExpr(x) { return !!(x && typeof x === 'object' && x.op); }
function isNum(x) { return !!(x && typeof x === 'object' && x.k && x.v); }
function W(x) {
  if (typeof x === 'number') return I(x);
  if (typeof x === 'string') return Dv(x);
  if (isExpr(x) || isNum(x)) return x;
  if (x && typeof x.n === 'number' && typeof x.d === 'number') return Auto(x);
  throw new Error('W: cannot wrap ' + JSON.stringify(x));
}
const OPS = ['+', '−', '×', '÷'];
function E(a, op, b) { if (OPS.indexOf(op) < 0) throw new Error('E: bad op ' + op); return { op, a: W(a), b: W(b) }; }
function ev(x) {
  x = W(x);
  if (x.op) {
    const a = ev(x.a), b = ev(x.b);
    if (x.op === '+') return Q.add(a, b);
    if (x.op === '−') return Q.sub(a, b);
    if (x.op === '×') return Q.mul(a, b);
    return Q.div(a, b);
  }
  return x.v;
}
// Tagged template: text parts stay strings, numbers become Nums (so they render and verify consistently).
function T(strings, ...vals) {
  const out = [];
  for (let i = 0; i < strings.length; i++) {
    if (strings[i]) out.push(strings[i]);
    if (i < vals.length) { const v = vals[i]; out.push(typeof v === 'string' ? v : W(v)); }
  }
  return out;
}
function parts(x) { return Array.isArray(x) ? x : (x ? [x] : []); }
function joinParts(nums, sep) { const out = []; nums.forEach((n, i) => { if (i) out.push(sep); out.push(W(n)); }); return out; }
function sumExpr(xs) { let e = W(xs[0]); for (let i = 1; i < xs.length; i++) e = E(e, '+', xs[i]); return e; }
function placePieces(n) {
  const s = String(n), out = [];
  for (let i = 0; i < s.length; i++) { const g = +s[i]; if (g) out.push(g * 10 ** (s.length - 1 - i)); }
  return out;
}
function tz(n) { let z = 0; while (n > 0 && n % 10 === 0) { n /= 10; z++; } return z; }
function stripZ(n) { while (n > 0 && n % 10 === 0) n /= 10; return n; }
function zerosWord(z) { return z === 1 ? 'one zero' : z === 2 ? 'two zeros' : z === 3 ? 'three zeros' : z + ' zeros'; }
function placesWord(k) { return k === 1 ? 'one decimal place' : k === 2 ? 'two decimal places' : k === 3 ? 'three decimal places' : k + ' decimal places'; }
function lastDigit(r) { const s = decStr(r); return +s[s.length - 1]; }
function properNum(d) { let n, guard = 0; do { n = ri(1, d - 1); guard++; } while (gcd(n, d) !== 1 && guard < 50); need(gcd(n, d) === 1); return n; }
const DEN_NAME = { 2: 'half', 3: 'third', 4: 'quarter', 5: 'fifth', 6: 'sixth', 8: 'eighth', 10: 'tenth', 16: 'sixteenth', 20: 'twentieth', 25: 'twenty-fifth', 40: 'fortieth' };

// ---------------------------------------------------------------- problem builder + registry
function mk(o) {
  const p = Object.assign({}, o);
  if (!o.q) {
    p.x = W(o.x); p.y = W(o.y);
    p.q = o.swap ? [p.y, o.op, p.x, '=', '?'] : [p.x, o.op, p.y, '=', '?'];
  } else if (o.x !== undefined) p.x = W(o.x);
  p.ansNum = o.ansNum || Auto(o.ans, o.pref);
  p.form = o.form || 'any';
  delete p.swap; delete p.pref;
  return p;
}
const TPL = {};
function tpl(id, cell, name, w, gen, extra) { TPL[id] = Object.assign({ id, cell, name, w, gen }, extra || {}); }
function genTpl(t, L) {
  for (let i = 0; i < 500; i++) {
    let p;
    try { p = t.gen(L); } catch (e) { if (e === RETRY) continue; throw e; }
    p.tpl = t.id; p.level = L; p.name = p.name || t.name; p.baseCell = t.cell;
    p.steps = p.steps.map(s => Object.assign({}, s, {
      chain: s.chain ? s.chain.map(W) : undefined,
      checks: s.checks ? s.checks.map(c => [W(c[0]), W(c[1])]) : undefined,
    }));
    return p;
  }
  throw new Error('Generator gave up: ' + t.id + ' at level ' + L);
}

// ---------------------------------------------------------------- reusable whole-number methods
function roundUpTarget(b) {
  if (b >= 100 && b % 100 >= 95) return (Math.floor(b / 100) + 1) * 100;
  if (b % 10 >= 7) return (Math.floor(b / 10) + 1) * 10;
  return null;
}
function mulRoundTarget(a) {
  if (a >= 100 && a % 100 >= 96) return (Math.floor(a / 100) + 1) * 100;
  if (a % 10 >= 8) return (Math.floor(a / 10) + 1) * 10;
  return null;
}
function splitMulSteps(a, m) {
  const pcs = placePieces(a), prods = pcs.map(x => x * m), steps = [];
  pcs.forEach((x, i) => {
    const st = { chain: [E(x, '×', m), prods[i]] };
    if (i === 0) { st.note = [...T`Split ${a} into `, ...joinParts(pcs, ' + ')]; st.checks = [[sumExpr(pcs), a]]; }
    steps.push(st);
  });
  steps.push({ chain: [sumExpr(prods), a * m], note: 'Add the parts' });
  return steps;
}
function roundMulSteps(a, m) {
  const Rr = mulRoundTarget(a);
  if (!Rr) throw new Error('roundMulSteps: no round target for ' + a);
  const k = Rr - a, p1 = Rr * m;
  const steps = [{ chain: [E(Rr, '×', m), p1], note: T`${a} is ${k} short of ${Rr}`, checks: [[E(a, '+', k), Rr]] }];
  if (k === 1) steps.push({ chain: [E(p1, '−', m), a * m], note: T`Take away one ${m}` });
  else {
    steps.push({ chain: [E(k, '×', m), k * m], note: 'That is the extra' });
    steps.push({ chain: [E(p1, '−', k * m), a * m], note: 'Take it away' });
  }
  return steps;
}
function teenSplitSteps(a, b) {
  const u = b - 10;
  return [
    { chain: [E(a, '×', 10), 10 * a], note: T`Split ${b} into 10 + ${u}`, checks: [[E(10, '+', u), b]] },
    { chain: [E(a, '×', u), a * u] },
    { chain: [E(10 * a, '+', a * u), a * b], note: 'Add the parts' },
  ];
}
function teenTeenSteps(a, b) {
  const au = a - 10, bu = b - 10, s = a + bu;
  return [
    { chain: [E(E(a, '+', bu), '×', 10), E(s, '×', 10), s * 10], note: T`Add the ones digit of ${b} to ${a}, then ×10` },
    { chain: [E(au, '×', bu), au * bu], note: 'Multiply the ones digits' },
    { chain: [E(s * 10, '+', au * bu), a * b], note: 'Add them' },
  ];
}
function split2x2Steps(a, b) {
  const T0 = Math.floor(b / 10) * 10, U = b % 10;
  return [
    { chain: [E(a, '×', T0), a * T0], note: T`Split ${b} into ${T0} + ${U}`, checks: [[E(T0, '+', U), b]] },
    { chain: [E(a, '×', U), a * U] },
    { chain: [E(a * T0, '+', a * U), a * b], note: 'Add the parts' },
  ];
}
function mulSteps(a, b) {
  if (a < b) { const t = a; a = b; b = t; }
  const p = a * b;
  if (b === 1 || (stripZ(a) <= 12 && stripZ(b) <= 12) || stripZ(a) * stripZ(b) <= 100) return [{ chain: [E(a, '×', b), p] }];
  for (const [f, g, big] of [[25, 4, 100], [125, 8, 1000]]) {
    if (a === f && b % g === 0) return [{ chain: [E(a, '×', b), E(big, '×', b / g), p], note: T`${f} × ${g} = ${big}`, checks: [[E(f, '×', g), big]] }];
    if (b === f && a % g === 0) return [{ chain: [E(a, '×', b), E(a / g, '×', big), p], note: T`${f} × ${g} = ${big}`, checks: [[E(f, '×', g), big]] }];
  }
  if (b <= 9) return mulRoundTarget(a) ? roundMulSteps(a, b) : splitMulSteps(a, b);
  if (a <= 19 && b >= 11) return teenTeenSteps(a, b);
  if (b >= 11 && b <= 19) return teenSplitSteps(a, b);
  return split2x2Steps(a, b);
}
function chunkDivSteps(n, d) {
  const q = n / d;
  if (!Number.isInteger(q)) throw new Error('chunkDivSteps: not exact');
  const qs = placePieces(q), cs = qs.map(x => x * d);
  if (qs.length === 1) return [{ chain: [E(n, '÷', d), q], note: T`Since ${d} × ${q} = ${n}`, checks: [[E(d, '×', q), n]] }];
  return [
    { text: [...T`Split ${n} into `, ...joinParts(cs, ' + '), ...T`, which each divide neatly by ${d}`], checks: [[sumExpr(cs), n]] },
    { chain: [sumExpr(cs.map(c => E(c, '÷', d))), sumExpr(qs), q], note: 'Divide each chunk, then add' },
  ];
}
function divSteps(n, d) {
  const q = n / d;
  if (!Number.isInteger(q)) throw new Error('divSteps: not exact ' + n + '/' + d);
  if (d === 1) return [{ chain: [E(n, '÷', d), q] }];
  const z = Math.min(tz(n), tz(d));
  if (z > 0) {
    const n2 = n / 10 ** z, d2 = d / 10 ** z, rest = divSteps(n2, d2);
    const note = T`Cross off ${zerosWord(z)} from both`;
    if (rest.length === 1 && rest[0].chain) {
      const extra = parts(rest[0].note);
      return [{ chain: [E(n, '÷', d), ...rest[0].chain], note: extra.length ? [...note, '. ', ...extra] : note, checks: rest[0].checks }];
    }
    return [{ chain: [E(n, '÷', d), E(n2, '÷', d2)], note }, ...rest];
  }
  if (d <= 12 && stripZ(q) <= 12) return [{ chain: [E(n, '÷', d), q], note: T`Since ${d} × ${q} = ${n}`, checks: [[E(d, '×', q), n]] }];
  return chunkDivSteps(n, d);
}
// Merge "a ÷ b = A ÷ B" with a following single-line division so it is not shown twice.
function mergeLead(lead, rest) {
  if (rest.length === 1 && rest[0].chain) {
    const extra = parts(rest[0].note);
    return [{ chain: [...lead.chain, ...rest[0].chain.slice(1)], note: extra.length ? [...parts(lead.note), '. ', ...extra] : lead.note, checks: [...(lead.checks || []), ...(rest[0].checks || [])] }];
  }
  return [lead, ...rest];
}

// ================================================================ WHOLE NUMBERS
// ---------- addition
tpl('add.roundUp', 'add.whole', 'Round up, then take back', [3, 3, 3], L => {
  let a, b;
  if (L === 1) { a = ri(21, 89); b = ri(1, 8) * 10 + pick([7, 8, 9]); }
  else if (L === 2) {
    a = ri(120, 899);
    b = wpick([[5, () => ri(1, 9) * 10 + pick([7, 8, 9])], [3, () => ri(2, 6) * 100 - ri(1, 4)], [2, () => ri(10, 59) * 10 + pick([8, 9])]])();
  } else {
    a = ri(1200, 8999);
    b = wpick([[5, () => ri(2, 9) * 100 - ri(1, 4)], [3, () => ri(10, 89) * 10 + pick([8, 9])], [2, () => ri(1, 9) * 10 + pick([7, 8, 9])]])();
  }
  const B = roundUpTarget(b); need(B);
  const k = B - b, s = a + B;
  return mk({ x: a, op: '+', y: b, swap: chance(0.3), ans: R(a + b),
    steps: [
      { text: T`${b} is ${k} short of ${B}, so add ${B} and take back ${k}`, checks: [[E(b, '+', k), B]] },
      { chain: [E(a, '+', B), s] },
      { chain: [E(s, '−', k), a + b], note: T`Take back the ${k}` },
    ],
    tip: 'Adding a number that ends in 7, 8 or 9? Round it up, add, then take back the extra.' });
});

tpl('add.leftRight', 'add.whole', 'Add in place-value pieces', [4, 4, 4], L => {
  let a, b;
  if (L === 1) { b = ri(1, 7) * 10 + ri(1, 6); a = ri(b + 1, 89); }
  else if (L === 2) { a = ri(120, 899); b = chance(0.4) ? ri(1, 9) * 10 + ri(1, 6) : ri(1, 5) * 100 + ri(1, 8) * 10 + ri(1, 6); }
  else { a = ri(1200, 8999); b = ri(1, 9) * 100 + ri(1, 8) * 10 + ri(1, 6); }
  need(a > b);
  const pcs = placePieces(b); need(pcs.length >= 2);
  const steps = [{ text: [...T`Add ${b} in pieces: `, ...joinParts(pcs, ', then ')], checks: [[sumExpr(pcs), b]] }];
  let s = a;
  for (const pc of pcs) { steps.push({ chain: [E(s, '+', pc), s + pc] }); s += pc; }
  return mk({ x: a, op: '+', y: b, swap: chance(0.3), ans: R(a + b), steps,
    tip: 'Start from the bigger number and add the other in pieces: hundreds, then tens, then ones.' });
});

tpl('add.bridge', 'add.whole', 'Fill up to a round number', [3, 3, 3], L => {
  let a, g, b;
  if (L === 1) { const au = pick([7, 8, 9]); a = ri(1, 8) * 10 + au; g = 10 - au; b = ri(1, 8) * 10 + ri(3, 6); }
  else if (L === 2) { const r = ri(76, 98); a = ri(1, 8) * 100 + r; g = 100 - r; b = chance(0.5) ? ri(3, 9) * 10 + ri(1, 6) : ri(1, 4) * 100 + ri(0, 8) * 10 + ri(1, 6); }
  else { const r = ri(80, 98); a = ri(12, 89) * 100 + r; g = 100 - r; b = ri(1, 9) * 100 + ri(0, 8) * 10 + ri(1, 6); }
  need(b > g + 2);
  const Rr = a + g, rest = b - g;
  return mk({ x: a, op: '+', y: b, swap: chance(0.3), ans: R(a + b),
    steps: [
      { text: T`${a} needs ${g} to reach ${Rr}, so split ${b} into ${g} + ${rest}`, checks: [[E(a, '+', g), Rr], [E(g, '+', rest), b]] },
      { chain: [E(Rr, '+', rest), a + b] },
    ],
    tip: 'Top the first number up to the next round number, then add what is left.' });
});

// ---------- subtraction
tpl('sub.roundUp', 'sub.whole', 'Round up, then add back', [3, 3, 3], L => {
  let a, b;
  if (L === 1) { b = ri(1, 7) * 10 + pick([7, 8, 9]); a = ri(b + 6, 99); }
  else if (L === 2) {
    b = wpick([[5, () => ri(1, 9) * 10 + pick([7, 8, 9])], [3, () => ri(2, 6) * 100 - ri(1, 4)], [2, () => ri(10, 59) * 10 + pick([8, 9])]])();
    a = ri(Math.max(b + 30, 150), 999);
  } else {
    b = wpick([[5, () => ri(2, 9) * 100 - ri(1, 4)], [3, () => ri(10, 89) * 10 + pick([8, 9])], [2, () => ri(1, 9) * 10 + pick([7, 8, 9])]])();
    a = ri(1200, 9999);
  }
  const B = roundUpTarget(b); need(B && a - B >= 1);
  const k = B - b, d = a - B;
  return mk({ x: a, op: '−', y: b, ans: R(a - b),
    steps: [
      { text: T`${b} is ${k} short of ${B}, so take away ${B} and add ${k} back`, checks: [[E(b, '+', k), B]] },
      { chain: [E(a, '−', B), d] },
      { chain: [E(d, '+', k), a - b], note: T`Add back the ${k}` },
    ],
    tip: 'Taking away a number that ends in 7, 8 or 9? Take away the round number, then add back the extra.' });
});

tpl('sub.countUp', 'sub.whole', 'Count up from the smaller number', [3, 3, 3], L => {
  let Rr, y, x;
  if (L === 1) { Rr = ri(3, 9) * 10; y = ri(1, 8); x = ri(1, Math.min(19, 99 - Rr)); }
  else if (L === 2) { Rr = ri(2, 9) * 100; y = ri(2, 45); x = ri(1, 60); }
  else if (chance(0.5)) { Rr = ri(2, 9) * 1000; y = ri(2, 60); x = ri(1, 300); }
  else { Rr = ri(12, 89) * 100; y = ri(2, 60); x = ri(1, 90); }
  need(x + y >= 5);
  const b = Rr - y, a = Rr + x;
  return mk({ x: a, op: '−', y: b, ans: R(a - b),
    steps: [
      { chain: [E(b, '+', y), Rr], note: T`Count up from ${b} to ${Rr}` },
      { chain: [E(Rr, '+', x), a], note: T`then on up to ${a}` },
      { chain: [E(y, '+', x), a - b], note: 'Add the two jumps' },
    ],
    tip: 'When the two numbers sit either side of a round number, count up from the smaller one.' });
});

tpl('sub.leftRight', 'sub.whole', 'Take away in place-value pieces', [4, 4, 4], L => {
  let a, b;
  if (L === 1) { a = ri(40, 99); b = ri(1, Math.floor(a / 10) - 1) * 10 + ri(1, 6); }
  else if (L === 2) { a = ri(300, 999); b = chance(0.35) ? ri(1, 9) * 10 + ri(1, 6) : ri(1, Math.floor(a / 100) - 1) * 100 + ri(0, 8) * 10 + ri(1, 6); }
  else { a = ri(2000, 9999); b = ri(1, 9) * 100 + ri(0, 8) * 10 + ri(1, 6); }
  need(a - b >= 5);
  const pcs = placePieces(b); need(pcs.length >= 2);
  const steps = [{ text: [...T`Take away ${b} in pieces: `, ...joinParts(pcs, ', then ')], checks: [[sumExpr(pcs), b]] }];
  let s = a;
  for (const pc of pcs) { steps.push({ chain: [E(s, '−', pc), s - pc] }); s -= pc; }
  return mk({ x: a, op: '−', y: b, ans: R(a - b), steps,
    tip: 'Take away in pieces from the left: hundreds, then tens, then ones.' });
});

// ---------- multiplication
const TABLE_ORDER = [11, 9, 5, 4, 3, 6, 12, 8, 7];
function tableSteps(a, b) {
  for (const f of TABLE_ORDER) {
    if (a !== f && b !== f) continue;
    const x = a === f ? b : a;
    switch (f) {
      case 11: return [{ chain: [E(x, '×', 10), 10 * x] }, { chain: [E(10 * x, '+', x), 11 * x], note: T`×11 is ×10 plus one more ${x}` }];
      case 9: return [{ chain: [E(x, '×', 10), 10 * x] }, { chain: [E(10 * x, '−', x), 9 * x], note: T`×9 is ×10 minus one ${x}` }];
      case 5: return [{ chain: [E(x, '×', 10), 10 * x] }, { chain: [E(10 * x, '÷', 2), 5 * x], note: '×5 is half of ×10' }];
      case 4: return [{ chain: [E(x, '×', 2), 2 * x], note: 'Double' }, { chain: [E(2 * x, '×', 2), 4 * x], note: 'Double again' }];
      case 3: return [{ chain: [E(x, '×', 2), 2 * x], note: 'Double' }, { chain: [E(2 * x, '+', x), 3 * x], note: T`plus one more ${x}` }];
      case 6: return [{ chain: [E(x, '×', 5), 5 * x] }, { chain: [E(5 * x, '+', x), 6 * x], note: T`plus one more ${x}` }];
      case 12: return [{ chain: [E(x, '×', 10), 10 * x] }, { chain: [E(x, '×', 2), 2 * x] }, { chain: [E(10 * x, '+', 2 * x), 12 * x], note: 'Add them' }];
      case 8: return [{ chain: [E(x, '×', 2), 2 * x], note: 'Double' }, { chain: [E(2 * x, '×', 2), 4 * x], note: 'Double' }, { chain: [E(4 * x, '×', 2), 8 * x], note: 'Double once more' }];
      case 7: return [{ chain: [E(x, '×', 5), 5 * x] }, { chain: [E(x, '×', 2), 2 * x] }, { chain: [E(5 * x, '+', 2 * x), 7 * x], note: 'Add them' }];
    }
  }
  throw new Error('tableSteps: no rule for ' + a + '×' + b);
}
const TBL = [3, 4, 5, 6, 7, 8, 9, 11, 12];
tpl('mul.table', 'mul.whole', 'Times-table fact', [5, 0, 0], L => {
  const a = pick(TBL), b = pick(TBL);
  return mk({ x: a, op: '×', y: b, ans: R(a * b), steps: tableSteps(a, b),
    tip: T`Learn ${a} × ${b} = ${a * b} by heart. Rebuilding it costs seconds.` });
});

tpl('mul.split', 'mul.whole', 'Split and multiply', [3, 4, 5], L => {
  const v = L === 1 ? '2x1' : L === 2 ? wpick([[7, '2x1'], [1.5, '3x1e'], [1.5, '2xteen']]) : wpick([[4, '2x2'], [3, '3x1'], [3, '2xteen']]);
  const tip = 'Split one number into place-value parts, multiply each part, then add.';
  if (v === '2x1') {
    const a = ri(L === 1 ? 1 : 2, 9) * 10 + ri(1, 7), m = pick([3, 4, 6, 7, 8, 9]);
    return mk({ x: a, op: '×', y: m, swap: chance(0.4), ans: R(a * m), steps: splitMulSteps(a, m), tip });
  }
  if (v === '3x1e' || v === '3x1') {
    const a = v === '3x1e' ? ri(1, 4) * 100 + (chance(0.6) ? ri(1, 9) * 10 : ri(1, 9)) : ri(1, 9) * 100 + ri(1, 9) * 10 + ri(1, 7);
    const m = pick([3, 4, 6, 7, 8, 9]);
    need(!mulRoundTarget(a));
    return mk({ x: a, op: '×', y: m, swap: chance(0.4), ans: R(a * m), steps: splitMulSteps(a, m), tip });
  }
  if (v === '2xteen') {
    const a = L === 2 ? ri(21, 49) : ri(21, 98), b = ri(12, 19);
    need(a % 10 !== 0 && !mulRoundTarget(a));
    return mk({ x: a, op: '×', y: b, swap: chance(0.5), ans: R(a * b), steps: teenSplitSteps(a, b), tip });
  }
  const a = ri(21, 98), b = ri(21, 98);
  need(a % 10 !== 0 && b % 10 >= 2 && b % 10 <= 7 && !mulRoundTarget(a) && a !== b);
  return mk({ x: a, op: '×', y: b, ans: R(a * b), steps: split2x2Steps(a, b), tip });
});

tpl('mul.round', 'mul.whole', 'Round up, then subtract', [2, 3, 3], L => {
  const v = L === 1 ? '2x1' : L === 2 ? wpick([[5, '2x1'], [2.5, '3x1'], [2.5, '2x9s']]) : wpick([[4, '2x2'], [3, '3x1'], [3, '2x9s']]);
  const tip = 'Round the awkward number up to a round one, multiply, then take away the extra.';
  if (v === '2x1') {
    const a = ri(1, 9) * 10 + pick([8, 9]), m = pick([3, 4, 6, 7, 8, 9]);
    return mk({ x: a, op: '×', y: m, swap: chance(0.4), ans: R(a * m), steps: roundMulSteps(a, m), tip });
  }
  if (v === '3x1') {
    const a = ri(2, 9) * 100 - ri(1, 3), m = pick([3, 4, 6, 7, 8, 9]);
    return mk({ x: a, op: '×', y: m, swap: chance(0.4), ans: R(a * m), steps: roundMulSteps(a, m), tip });
  }
  if (v === '2x9s') {
    const b = ri(1, 9) * 10 + 9, a = L === 2 ? ri(12, 35) : ri(12, 60);
    need(a % 10 !== 0 && a !== b && !mulRoundTarget(a));
    return mk({ x: a, op: '×', y: b, swap: chance(0.5), ans: R(a * b), steps: roundMulSteps(b, a), tip });
  }
  const b = ri(1, 9) * 10 + pick([8, 9]), a = ri(12, 60);
  need(a % 10 !== 0 && a !== b && !mulRoundTarget(a));
  return mk({ x: a, op: '×', y: b, swap: chance(0.5), ans: R(a * b), steps: roundMulSteps(b, a), tip });
});

tpl('mul.nine', 'mul.whole', 'Times 9: ×10, then minus once', [1.5, 1.5, 1], L => {
  let a, f;
  if (L === 1) { a = ri(12, 49); f = 9; }
  else if (L === 2) { if (chance(0.6)) { a = ri(12, 99); f = 9; } else { a = ri(12, 60); f = 99; } }
  else if (chance(0.5)) { a = ri(112, 999); f = 9; }
  else { a = ri(12, 99); f = 99; }
  need(a % 10 !== 0);
  const big = f + 1;
  return mk({ x: a, op: '×', y: f, swap: chance(0.4), ans: R(a * f),
    name: f === 9 ? 'Times 9: ×10, then minus once' : 'Times 99: ×100, then minus once',
    steps: [
      { chain: [E(a, '×', big), a * big], note: T`${f} is one short of ${big}`, checks: [[E(f, '+', 1), big]] },
      { chain: [E(a * big, '−', a), a * f], note: T`Take away one ${a}` },
    ],
    tip: f === 9 ? '×9 is ×10 minus the number once.' : '×99 is ×100 minus the number once.' });
});

tpl('mul.five', 'mul.whole', 'Times 5', [1, 1.5, 1.5], L => {
  const f = L === 1 ? 5 : L === 2 ? wpick([[3, 5], [3, 25], [2, 50], [2, 15]]) : wpick([[3, 25], [2, 125], [3, 15], [2, 50]]);
  let a;
  if (f === 5) a = L === 1 ? ri(12, 98) : ri(112, 998);
  else if (f === 25) a = L === 2 ? (chance(0.6) ? 4 * ri(4, 24) : ri(12, 48)) : 4 * ri(26, 249);
  else if (f === 50) a = L === 2 ? ri(12, 98) : ri(112, 998);
  else if (f === 15) a = L === 2 ? 2 * ri(6, 24) : ri(12, 98);
  else a = 8 * ri(2, 12);
  need(a % 10 !== 0);
  let steps, name, tip;
  if (f === 5 || f === 50) {
    const z = f === 5 ? 10 : 100;
    name = f === 5 ? 'Times 5: halve and ×10' : 'Times 50: halve and ×100';
    tip = f === 5 ? '×5 is ×10, then halve. Halve first when the number is even.' : '×50 is ×100, then halve. Halve first when the number is even.';
    steps = a % 2 === 0
      ? [{ chain: [E(a, '÷', 2), a / 2], note: 'Halve it' }, { chain: [E(a / 2, '×', z), a * f], note: T`then ×${z}` }]
      : [{ chain: [E(a, '×', z), a * z] }, { chain: [E(a * z, '÷', 2), a * f], note: 'then halve' }];
  } else if (f === 25) {
    name = 'Times 25: quarter and ×100'; tip = '×25 is ×100, then quarter it. Quarter first when the number divides by 4.';
    steps = a % 4 === 0
      ? [{ chain: [E(a, '÷', 4), a / 4], note: 'Quarter it (halve twice)' }, { chain: [E(a / 4, '×', 100), a * f], note: 'then ×100' }]
      : [{ chain: [E(a, '×', 100), a * 100] }, { chain: [E(a * 100, '÷', 4), a * f], note: 'then quarter it (halve twice)' }];
  } else if (f === 15) {
    name = 'Times 15: ×10 plus half'; tip = '×15 is ×10 plus half of that again.';
    steps = [{ chain: [E(a, '×', 10), a * 10] }, { chain: [E(a * 10, '÷', 2), a * 5], note: 'Half of that' }, { chain: [E(a * 10, '+', a * 5), a * 15], note: 'Add them' }];
  } else {
    name = 'Times 125: ÷8 and ×1000'; tip = '×125 is ×1000, then ÷8. Divide first when the number divides by 8.';
    steps = [{ chain: [E(a, '÷', 8), a / 8], note: 'Divide by 8' }, { chain: [E(a / 8, '×', 1000), a * f], note: 'then ×1000' }];
  }
  return mk({ x: a, op: '×', y: f, swap: chance(0.4), ans: R(a * f), name, steps, tip });
});

tpl('mul.eleven', 'mul.whole', 'Times 11: ×10 plus once', [1, 1, 1], L => {
  const a = L === 3 ? ri(112, 999) : ri(12, 99);
  need(a % 10 !== 0 && a !== 11);
  return mk({ x: a, op: '×', y: 11, swap: chance(0.4), ans: R(11 * a),
    steps: [{ chain: [E(a, '×', 10), 10 * a] }, { chain: [E(10 * a, '+', a), 11 * a], note: T`plus one more ${a}` }],
    tip: '×11 is ×10 plus the number once more.' });
});

tpl('mul.halveDouble', 'mul.whole', 'Double one, halve the other', [0, 2, 2], L => {
  const a = L === 2 ? pick([15, 25, 35, 45]) : pick([55, 65, 75, 85, 95, 125, 175]);
  const b = L === 2 ? 2 * ri(2, 12) : 2 * ri(6, 18);
  let x = a, y = b;
  const chain = [E(a, '×', b)];
  while (y % 2 === 0 && y > 2 && tz(2 * x) > tz(x)) { x *= 2; y /= 2; chain.push(E(x, '×', y)); }
  need(chain.length >= 2);
  chain.push(a * b);
  const rounds = chain.length - 2;
  return mk({ x: a, op: '×', y: b, swap: chance(0.5), ans: R(a * b),
    steps: [{ chain, note: rounds > 1 ? T`Double ${a} and halve ${b}, then do it again` : T`Double ${a} and halve ${b}` }],
    tip: 'A number ending in 5 times an even number: double the 5-ender and halve the even one.' });
});

tpl('mul.nearSquare', 'mul.whole', 'Middle squared minus gap squared', [0, 1.5, 2], L => {
  let c, d;
  if (L === 2) { c = ri(2, 9) * 10; d = ri(1, 4); }
  else if (chance(0.5)) { c = ri(2, 9) * 10; d = ri(3, 8); }
  else if (chance(0.5)) { c = pick([25, 35, 45, 55, 65, 75, 85, 95]); d = ri(1, 3); }
  else { c = 100; d = ri(2, 9); }
  const a = c + d, b = c - d;
  need(b >= 11);
  return mk({ x: a, op: '×', y: b, swap: chance(0.5), ans: R(a * b),
    steps: [
      { text: T`${a} and ${b} are both ${d} away from ${c}`, checks: [[E(c, '+', d), a], [E(c, '−', d), b]] },
      { chain: [E(E(c, '×', c), '−', E(d, '×', d)), E(c * c, '−', d * d), a * b], note: 'Square the middle, take away the gap squared' },
    ],
    tip: 'Two numbers the same distance from a round number: square the middle, then take away the gap squared.' });
});

tpl('mul.teens', 'mul.whole', 'Teen times teen', [1, 1.5, 0], L => {
  const a = ri(11, 19), b = ri(11, 19);
  need(!(a === 11 && b === 11));
  return mk({ x: a, op: '×', y: b, ans: R(a * b), steps: teenTeenSteps(a, b),
    tip: 'Teen times teen: add one number to the ones digit of the other, ×10, then add the ones digits multiplied.' });
});

tpl('mul.squareFive', 'mul.whole', 'Squaring a number ending in 5', [0, 1, 1], L => {
  const t = L === 2 ? ri(1, 9) : ri(4, 12), a = 10 * t + 5, pr = t * (t + 1);
  return mk({ x: a, op: '×', y: a, ans: R(a * a),
    steps: [
      { chain: [E(t, '×', t + 1), pr], note: T`Take ${t} and the next number up, ${t + 1}` },
      { chain: [E(E(pr, '×', 100), '+', 25), a * a], note: 'then put 25 on the end' },
    ],
    tip: 'Squaring a number that ends in 5: multiply the tens part by the next number up, then put 25 on the end.' });
});

// ---------- division
tpl('div.table', 'div.whole', 'Times table backwards', [5, 0, 0], L => {
  const d = pick(TBL), q = pick(TBL), n = d * q;
  return mk({ x: n, op: '÷', y: d, ans: R(q),
    steps: [{ chain: [E(n, '÷', d), q], note: T`Think: ${d} × ${q} = ${n}`, checks: [[E(d, '×', q), n]] }],
    tip: T`Division facts are times-table facts in reverse: ${d} × ${q} = ${n}.` });
});

tpl('div.chunk', 'div.whole', 'Split into easy chunks', [2.5, 4, 4], L => {
  let d, q;
  if (L === 1) { d = ri(2, 6); q = ri(12, Math.floor(99 / d)); }
  else if (L === 2) { if (chance(0.7)) { d = ri(3, 9); q = ri(12, 99); } else { d = ri(11, 19); q = ri(12, 29); } }
  else if (chance(0.5)) { d = ri(3, 9); q = ri(112, Math.min(999, Math.floor(9999 / d))); }
  else { d = ri(12, 29); q = ri(12, 49); }
  need(q % 10 !== 0 && d !== 10);
  const n = d * q;
  need(L === 1 ? n <= 99 : L === 2 ? (n >= 100 && n <= 999) : n >= 100);
  return mk({ x: n, op: '÷', y: d, ans: R(q), steps: chunkDivSteps(n, d),
    tip: 'Split the number into chunks the divisor goes into cleanly, divide each chunk, then add.' });
});

tpl('div.overshoot', 'div.whole', 'Go past, then step back', [1, 2, 2], L => {
  let d, Rq, k;
  if (L === 1) { d = ri(2, 4); Rq = pick([20, 30]); k = ri(1, 2); }
  else if (L === 2) { d = ri(3, 9); Rq = ri(2, 10) * 10; k = ri(1, 3); }
  else if (chance(0.5)) { d = ri(3, 9); Rq = ri(2, 10) * 100; k = ri(1, 3); }
  else { d = ri(12, 25); Rq = ri(2, 5) * 10; k = ri(1, 3); }
  const q = Rq - k, n = d * q, dR = d * Rq, dk = d * k;
  need(L === 1 ? n <= 99 : n >= 100);
  return mk({ x: n, op: '÷', y: d, ans: R(q),
    steps: [
      { chain: [E(dR, '÷', d), Rq], note: T`${n} is just under ${dR}`, checks: [[E(n, '+', dk), dR]] },
      { chain: [E(dk, '÷', d), k], note: T`It falls short by ${dk}` },
      { chain: [E(Rq, '−', k), q], note: 'Step back' },
    ],
    tip: 'Just under a round multiple of the divisor? Divide the round number, then step back.' });
});

tpl('div.halve', 'div.whole', 'Halve, then halve again', [1, 2, 2], L => {
  let d, q;
  if (L === 1) { d = 4; q = ri(11, 24); }
  else if (L === 2) { d = pick([4, 8]); q = d === 4 ? ri(26, 249) : ri(13, 124); }
  else { d = pick([8, 16]); q = d === 8 ? ri(126, 1249) : ri(13, 99); }
  need(q % 10 !== 0);
  const n = d * q, times = d === 4 ? 2 : d === 8 ? 3 : 4;
  const word = times === 2 ? 'twice' : times === 3 ? 'three times' : 'four times';
  const steps = [];
  let cur = n;
  for (let i = 0; i < times; i++) {
    steps.push({ chain: [E(cur, '÷', 2), cur / 2], note: i === 0 ? T`Dividing by ${d} is halving ${word}` : 'Halve again' });
    cur /= 2;
  }
  return mk({ x: n, op: '÷', y: d, ans: R(q), steps, tip: '÷4 is halving twice, ÷8 is halving three times, ÷16 is halving four times.' });
});

tpl('div.five', 'div.whole', 'Divide by 5', [1, 1.5, 1.5], L => {
  let f, q;
  if (L === 1) { f = 5; q = ri(11, 19); }
  else if (L === 2) { f = wpick([[4, 5], [3, 25], [3, 50]]); q = f === 5 ? ri(21, 199) : f === 25 ? ri(5, 39) : ri(3, 19); }
  else { f = wpick([[4, 25], [3, 125], [3, 50]]); q = f === 25 ? ri(41, 399) : f === 125 ? ri(3, 40) : ri(21, 199); }
  const n = f * q, m = f === 125 ? 8 : f === 25 ? 4 : 2, z = f === 5 ? 10 : f === 125 ? 1000 : 100;
  need(q % 10 !== 0);
  const names = { 5: 'Divide by 5: double, then ÷10', 25: 'Divide by 25: ×4, then ÷100', 50: 'Divide by 50: double, then ÷100', 125: 'Divide by 125: ×8, then ÷1000' };
  const tips = { 5: '÷5 is double, then ÷10.', 25: '÷25 is ×4, then ÷100.', 50: '÷50 is double, then ÷100.', 125: '÷125 is ×8, then ÷1000.' };
  return mk({ x: n, op: '÷', y: f, ans: R(q), name: names[f],
    steps: [
      { chain: [E(n, '×', m), n * m], note: m === 2 ? 'Double it' : T`Multiply by ${m}` },
      { chain: [E(n * m, '÷', z), q], note: T`then ÷${z}` },
    ],
    tip: tips[f] });
});

tpl('div.zeros', 'div.whole', 'Cross off the zeros', [1, 1, 1.5], L => {
  let d1, q, z;
  if (L === 1) { d1 = ri(2, 9); q = ri(2, 9); z = 1; }
  else if (L === 2) { d1 = ri(2, 9); z = pick([1, 1, 2]); q = chance(0.5) ? ri(2, 12) : ri(2, 9) * 10; }
  else { d1 = pick([2, 3, 4, 5, 6, 7, 8, 9, 11, 12]); z = pick([1, 2, 2, 3]); q = chance(0.5) ? ri(2, 12) * 10 : ri(2, 12); }
  const d = d1 * 10 ** z, n = d * q;
  return mk({ x: n, op: '÷', y: d, ans: R(q), steps: divSteps(n, d), tip: 'Cross off the same number of zeros from both numbers first.' });
});

// ================================================================ DECIMALS
tpl('decadd.parts', 'add.dec', 'Whole parts, then decimal parts', [3, 3, 3], L => {
  let A, B, al, be;
  if (L === 1) { A = ri(1, 19); B = ri(1, 19); al = dv(ri(1, 9), 1); be = dv(ri(1, 7), 1); }
  else if (L === 2) { A = ri(1, 29); B = ri(1, 19); al = dv(ri(11, 99), 2); be = chance(0.5) ? dv(ri(1, 7), 1) : dv(ri(11, 97), 2); }
  else { A = ri(10, 99); B = ri(10, 99); al = dv(ri(11, 99), 2); be = chance(0.5) ? dv(ri(101, 997), 3) : dv(ri(11, 97), 2); }
  need(al.d !== 1 && be.d !== 1 && lastDigit(be) < 8);
  const a = Q.add(R(A), al), b = Q.add(R(B), be), Fp = Q.add(al, be), ans = Q.add(a, b);
  return mk({ x: Dv(a), op: '+', y: Dv(b), swap: chance(0.3), ans,
    steps: [
      { chain: [E(A, '+', B), A + B], note: 'Whole parts' },
      { chain: [E(Dv(al), '+', Dv(be)), Dv(Fp)], note: 'Decimal parts' },
      { chain: [E(A + B, '+', Dv(Fp)), Dv(ans)], note: 'Combine' },
    ],
    tip: 'Add the whole parts and the decimal parts separately, then combine.' });
});

tpl('decadd.round', 'add.dec', 'Round up, then take back', [2, 2, 2], L => {
  let a, Bn, k;
  if (L === 1) { Bn = ri(2, 10); k = dv(pick([1, 2]), 1); a = Q.add(R(ri(1, 19)), dv(ri(1, 9), 1)); }
  else if (L === 2) { Bn = ri(2, 20); k = pick([dv(1, 1), dv(2, 1), dv(5, 2), dv(2, 2), dv(1, 2), dv(15, 2)]); a = Q.add(R(ri(1, 29)), chance(0.5) ? dv(ri(1, 9), 1) : dv(ri(11, 99), 2)); }
  else { Bn = ri(5, 60); k = pick([dv(1, 1), dv(2, 1), dv(5, 2), dv(2, 2), dv(1, 2), dv(5, 3), dv(25, 3)]); a = Q.add(R(ri(10, 99)), dv(ri(11, 99), 2)); }
  const b = Q.sub(R(Bn), k), s = Q.add(a, R(Bn)), ans = Q.add(a, b);
  need(a.d !== 1);
  return mk({ x: Dv(a), op: '+', y: Dv(b), swap: chance(0.3), ans,
    steps: [
      { chain: [E(Dv(a), '+', Bn), Dv(s)], note: T`${Dv(b)} is ${Dv(k)} short of ${Bn}, so add ${Bn}`, checks: [[E(Dv(b), '+', Dv(k)), Bn]] },
      { chain: [E(Dv(s), '−', Dv(k)), Dv(ans)], note: T`then take back the ${Dv(k)}` },
    ],
    tip: 'A decimal just under a whole number? Round it up, add, then take back the difference.' });
});

tpl('decsub.round', 'sub.dec', 'Round up, then add back', [2, 2, 2], L => {
  let a, Bn, k;
  if (L === 1) { Bn = ri(2, 9); k = dv(pick([1, 2]), 1); a = Q.add(R(Bn + ri(1, 9)), dv(ri(1, 9), 1)); }
  else if (L === 2) { Bn = ri(2, 15); k = pick([dv(1, 1), dv(2, 1), dv(5, 2), dv(2, 2), dv(15, 2)]); a = Q.add(R(Bn + ri(1, 20)), chance(0.5) ? dv(ri(1, 9), 1) : dv(ri(11, 99), 2)); }
  else { Bn = ri(5, 40); k = pick([dv(1, 1), dv(5, 2), dv(2, 2), dv(15, 2), dv(25, 3), dv(5, 3)]); a = Q.add(R(Bn + ri(5, 60)), dv(ri(11, 99), 2)); }
  const b = Q.sub(R(Bn), k), d = Q.sub(a, R(Bn)), ans = Q.sub(a, b);
  need(a.d !== 1);
  return mk({ x: Dv(a), op: '−', y: Dv(b), ans,
    steps: [
      { chain: [E(Dv(a), '−', Bn), Dv(d)], note: T`${Dv(b)} is ${Dv(k)} short of ${Bn}, so take away ${Bn}`, checks: [[E(Dv(b), '+', Dv(k)), Bn]] },
      { chain: [E(Dv(d), '+', Dv(k)), Dv(ans)], note: T`then add back the ${Dv(k)}` },
    ],
    tip: 'Taking away a decimal just under a whole number? Take away the whole number, then add back the difference.' });
});

tpl('decsub.countUp', 'sub.dec', 'Count up to the next whole number', [2, 2, 2], L => {
  let B, be, a;
  if (L === 1) {
    B = ri(1, 8); be = dv(ri(1, 9), 1);
    a = chance(0.4) ? R(B + 1 + ri(1, 9)) : Q.add(R(B + 1 + ri(0, 8)), dv(ri(1, 9), 1));
  } else if (L === 2) {
    B = ri(1, 15); be = dv(ri(11, 99), 2);
    a = chance(0.35) ? R(pick([10, 20, 25, 50]) + (chance(0.5) ? 0 : ri(1, 9))) : Q.add(R(B + 1 + ri(0, 12)), chance(0.5) ? dv(ri(1, 9), 1) : dv(ri(11, 99), 2));
  } else {
    B = ri(10, 60); be = dv(ri(11, 99), 2);
    a = chance(0.35) ? R(pick([100, 75, 80, 90]) + ri(0, 9)) : Q.add(R(B + 1 + ri(1, 40)), dv(ri(11, 99), 2));
  }
  need(be.d !== 1);
  const b = Q.add(R(B), be), Wn = B + 1, g1 = Q.sub(R(Wn), b), g2 = Q.sub(a, R(Wn));
  need(Q.gt(g2, R(0)));
  const ans = Q.sub(a, b);
  return mk({ x: Dv(a), op: '−', y: Dv(b), ans,
    steps: [
      { chain: [E(Dv(b), '+', Dv(g1)), Wn], note: T`Count up from ${Dv(b)} to ${Wn}` },
      { chain: [E(Wn, '+', Dv(g2)), Dv(a)], note: T`then on up to ${Dv(a)}` },
      { chain: [E(Dv(g1), '+', Dv(g2)), Dv(ans)], note: 'Add the two jumps' },
    ],
    tip: 'Count up from the smaller number to the next whole number, then on to the bigger one.' });
});

tpl('decsub.parts', 'sub.dec', 'Whole parts, then decimal parts', [2, 2, 2], L => {
  let A, B, al, be;
  if (L === 1) { A = ri(5, 19); B = ri(1, A - 1); const x = ri(2, 9); al = dv(x, 1); be = dv(ri(1, x - 1), 1); }
  else if (L === 2) {
    A = ri(5, 30); B = ri(1, A - 1);
    if (chance(0.5)) { const x = ri(12, 99); al = dv(x, 2); be = dv(ri(11, x - 1), 2); } else { const x = ri(2, 9); al = dv(ri(x * 10 + 1, x * 10 + 9), 2); be = dv(ri(1, x - 1), 1); }
  } else { A = ri(20, 99); B = ri(10, A - 1); const x = ri(120, 999); al = dv(x, 3); be = dv(ri(101, x - 1), 3); }
  need(al.d !== 1 && be.d !== 1 && Q.gt(al, be));
  const a = Q.add(R(A), al), b = Q.add(R(B), be), Fd = Q.sub(al, be), ans = Q.sub(a, b);
  return mk({ x: Dv(a), op: '−', y: Dv(b), ans,
    steps: [
      { chain: [E(A, '−', B), A - B], note: 'Whole parts' },
      { chain: [E(Dv(al), '−', Dv(be)), Dv(Fd)], note: 'Decimal parts' },
      { chain: [E(A - B, '+', Dv(Fd)), Dv(ans)], note: 'Combine' },
    ],
    tip: 'Take away the whole parts and the decimal parts separately, then combine.' });
});

tpl('decmul.shift', 'mul.dec', 'Drop the decimal points, then put them back', [3, 3, 3], L => {
  let A, B, p, q;
  if (L === 1) { A = ri(2, 9); B = ri(2, 9); [p, q] = pick([[1, 0], [0, 1], [1, 1]]); }
  else if (L === 2) {
    [A, B] = wpick([[4, () => [ri(2, 12), ri(2, 9)]], [2, () => [25, 4 * ri(1, 6)]], [1, () => [125, 8 * ri(1, 3)]], [2, () => [ri(11, 19), ri(2, 5)]]])();
    [p, q] = pick([[1, 1], [2, 0], [0, 2], [1, 0], [2, 1], [1, 2]]);
  } else {
    [A, B] = wpick([[3, () => [ri(12, 25), ri(3, 9)]], [2, () => [25, 4 * ri(2, 9)]], [2, () => [125, 8 * ri(1, 5)]], [3, () => [ri(11, 19), ri(11, 19)]]])();
    [p, q] = pick([[1, 1], [2, 1], [1, 2], [2, 2], [3, 0], [0, 3]]);
  }
  need(A % 10 !== 0 && B % 10 !== 0 && A > 1 && B > 1);
  const a = R(A, 10 ** p), b = R(B, 10 ** q), P = A * B, ans = Q.mul(a, b);
  need(decPlaces(ans) <= 4 && (p + q) > 0);
  const k = p + q, sw = chance(0.3);
  return mk({ x: Dv(a), op: '×', y: Dv(b), swap: sw, ans,
    steps: [
      { text: sw ? T`Ignore the decimal points: ${B} × ${A}` : T`Ignore the decimal points: ${A} × ${B}`, checks: [[E(Dv(a), '×', 10 ** p), A], [E(Dv(b), '×', 10 ** q), B]] },
      ...mulSteps(A, B),
      { chain: [E(P, '÷', 10 ** k), Dv(ans)], note: T`The two numbers had ${placesWord(k)} between them, so move the point back` },
    ],
    tip: 'Multiply as whole numbers, then put back as many decimal places as the two numbers had between them.' });
});

tpl('decmul.whole', 'mul.dec', 'Move the point across', [2, 3, 3], L => {
  let A, m, p;
  if (L === 1) { A = ri(2, 9); p = 1; m = ri(2, 9); }
  else if (L === 2) { A = ri(11, 49); p = chance(0.7) ? 1 : 2; m = ri(2, 9); }
  else { A = ri(11, 99); p = pick([1, 2]); m = ri(2, 9); }
  need(A % 10 !== 0);
  const a = R(A, 10 ** p), b = m * 10 ** p;
  return mk({ x: Dv(a), op: '×', y: b, swap: chance(0.4), ans: R(A * m),
    steps: mergeLead(
      { chain: [E(Dv(a), '×', b), E(A, '×', m)], note: T`Move the point: ${Dv(a)} becomes ${A} and ${b} becomes ${m}`, checks: [[E(Dv(a), '×', 10 ** p), A], [E(b, '÷', 10 ** p), m]] },
      mulSteps(A, m)),
    tip: 'Move the decimal point from one number to the other so both become whole numbers.' });
});

const FRIENDLY = { '0.5': [1, 2], '0.25': [1, 4], '0.75': [3, 4], '0.2': [1, 5], '0.4': [2, 5], '0.6': [3, 5], '0.8': [4, 5],
  '0.125': [1, 8], '0.375': [3, 8], '0.625': [5, 8], '0.875': [7, 8], '1.5': [3, 2], '1.25': [5, 4], '2.5': [5, 2],
  '0.05': [1, 20], '0.15': [3, 20], '0.35': [7, 20], '0.0625': [1, 16] };
const FR_LV = { 1: ['0.5', '0.25', '0.75', '0.2'], 2: ['0.25', '0.75', '0.2', '0.4', '0.6', '0.8', '0.125', '0.375', '1.5', '1.25', '0.05'], 3: ['0.375', '0.625', '0.875', '0.125', '1.25', '2.5', '0.15', '0.35', '0.0625', '0.6', '0.8'] };
tpl('decmul.friendly', 'mul.dec', 'Use the fraction it stands for', [2, 3, 3], L => {
  const fs = pick(FR_LV[L]), [pn, qd] = FRIENDLY[fs], fv = parseDecimal(fs);
  const u = L === 1 ? ri(3, 12) : L === 2 ? ri(3, 25) : ri(3, 40), w = qd * u;
  need(w >= 8 && w <= 999);
  const steps = [
    { chain: [Dv(fv), F(pn, qd)], note: 'Swap the decimal for its fraction' },
    { chain: [E(w, '÷', qd), u], note: T`Divide by ${qd}` },
  ];
  if (pn > 1) steps.push({ chain: [E(u, '×', pn), pn * u], note: T`then ×${pn}` });
  return mk({ x: Dv(fv), op: '×', y: w, swap: chance(0.5), ans: R(pn * u), steps,
    tip: T`Know the pair ${Dv(fv)} = ${F(pn, qd)}, then divide instead of multiplying by a decimal.` });
});

tpl('decdiv.scale', 'div.dec', 'Make the divisor whole', [3, 3, 3], L => {
  let B, k, q;
  if (L === 1) { B = ri(2, 9); k = 1; q = ri(2, 12); }
  else if (L === 2) {
    if (chance(0.6)) { B = ri(2, 9); k = 1; q = wpick([[3, () => ri(2, 12)], [2, () => ri(13, 40)], [1, () => ri(2, 9) * 10]])(); }
    else { B = ri(2, 12); k = 2; q = ri(2, 12); }
  } else { B = ri(11, 25); k = 2; q = wpick([[2, () => ri(2, 12)], [1, () => ri(2, 9) * 10], [1, () => ri(13, 30)]])(); }
  need(B % 10 !== 0 && q !== 10);
  const b = R(B, 10 ** k), a = Q.mul(b, R(q)), A = B * q;
  need(decPlaces(a) <= 3 && !Q.eq(a, R(1)));
  return mk({ x: Dv(a), op: '÷', y: Dv(b), ans: R(q),
    steps: mergeLead(
      { chain: [E(Dv(a), '÷', Dv(b)), E(A, '÷', B)], note: T`Multiply both by ${10 ** k} so you divide by a whole number` },
      divSteps(A, B)),
    tip: 'Move both decimal points the same number of places until the number you divide by is whole.' });
});

tpl('decdiv.whole', 'div.dec', 'Divide as whole numbers, then place the point', [3, 3, 3], L => {
  let d, Qv, k;
  if (L === 1) { d = ri(2, 9); Qv = ri(2, 9); k = 1; }
  else if (L === 2) { d = ri(2, 12); k = pick([1, 1, 2]); Qv = chance(0.6) ? ri(2, 12) : ri(13, 30); }
  else if (chance(0.5)) { d = ri(11, 29); Qv = ri(11, 49); k = pick([1, 2]); }
  else { d = ri(3, 9); Qv = ri(13, 99); k = pick([1, 2]); }
  need(Qv % 10 !== 0 && d !== 10);
  const A = d * Qv, a = R(A, 10 ** k), ans = R(Qv, 10 ** k);
  need(a.d !== 1);
  const unit = k === 1 ? 'tenths' : 'hundredths';
  return mk({ x: Dv(a), op: '÷', y: d, ans,
    steps: [
      { text: T`${Dv(a)} is ${A} ${unit}`, checks: [[E(Dv(a), '×', 10 ** k), A]] },
      ...divSteps(A, d),
      { chain: [E(Qv, '÷', 10 ** k), Dv(ans)], note: T`${Qv} ${unit}, so put the point back` },
    ],
    tip: 'Divide as if there were no decimal point, then put the point back.' });
});

const DIVF = { '0.5': 2, '0.25': 4, '0.2': 5, '0.125': 8, '0.05': 20, '0.04': 25 };
const DIVF_LV = { 1: ['0.5', '0.25', '0.2'], 2: ['0.5', '0.25', '0.2', '0.125', '0.05'], 3: ['0.25', '0.125', '0.05', '0.04', '0.2'] };
function decTimesIntSteps(a, m) {
  const Wh = Math.floor(a.n / a.d), al = Q.sub(a, R(Wh));
  const p2 = Q.mul(al, R(m)), tot = Q.mul(a, R(m));
  if (Wh === 0) return [{ chain: [E(Dv(a), '×', m), Dv(tot)] }];
  if (m === 2) return [{ chain: [E(Dv(a), '×', 2), Dv(tot)], note: 'Double it' }];
  return [
    { chain: [E(Wh, '×', m), Wh * m], note: T`Split ${Dv(a)} into ${Wh} + ${Dv(al)}`, checks: [[E(Wh, '+', Dv(al)), Dv(a)]] },
    { chain: [E(Dv(al), '×', m), Dv(p2)] },
    { chain: [E(Wh * m, '+', Dv(p2)), Dv(tot)], note: 'Add the parts' },
  ];
}
tpl('decdiv.friendly', 'div.dec', 'Dividing by a decimal is multiplying', [2, 2, 2], L => {
  const fs = pick(DIVF_LV[L]), m = DIVF[fs], f = parseDecimal(fs);
  let a;
  if (L === 1) a = R(ri(3, 25));
  else if (L === 2) a = chance(0.5) ? R(ri(3, 30)) : R(ri(11, 99), 10);
  else if (m >= 20) a = chance(0.5) ? R(ri(3, 20)) : R(ri(11, 59), 10);
  else a = chance(0.4) ? R(ri(12, 60)) : R(ri(11, 199), 10);
  const ans = Q.mul(a, R(m));
  const lead = { chain: [E(Dv(a), '÷', Dv(f)), E(Dv(a), '×', m)], note: T`Dividing by ${Dv(f)} is the same as multiplying by ${m}` };
  const rest = a.d === 1 ? mulSteps(a.n, m) : decTimesIntSteps(a, m);
  return mk({ x: Dv(a), op: '÷', y: Dv(f), ans, steps: mergeLead(lead, rest),
    tip: T`÷${Dv(f)} is ×${m}. The set to know: ÷0.5 is ×2, ÷0.25 is ×4, ÷0.2 is ×5, ÷0.125 is ×8.` });
});

// ================================================================ FRACTIONS
const FPAIRS = {
  1: [[2, 4], [2, 8], [4, 8], [3, 6], [2, 6], [5, 10], [2, 10], [3, 9], [4, 12], [3, 12], [6, 12]],
  2: [[2, 3], [3, 4], [2, 5], [4, 5], [3, 5], [4, 6], [6, 8], [3, 8], [5, 6], [4, 10], [6, 9], [2, 9]],
  3: [[5, 6], [4, 7], [3, 7], [6, 10], [8, 12], [9, 12], [6, 15], [4, 9], [5, 8], [7, 8], [10, 12], [5, 12]],
};
function commonDenSteps(n1, d1, n2, d2, op) {
  const Lc = lcm(d1, d2), N1 = n1 * Lc / d1, N2 = n2 * Lc / d2, S = op === '+' ? N1 + N2 : N1 - N2;
  const steps = [];
  if (d1 !== Lc) steps.push({ chain: [F(n1, d1), F(N1, Lc)], note: T`Rewrite over ${Lc}` });
  if (d2 !== Lc) steps.push({ chain: [F(n2, d2), F(N2, Lc)], note: d1 !== Lc ? undefined : T`Rewrite over ${Lc}` });
  steps.push({ chain: [E(F(N1, Lc), op, F(N2, Lc)), F(S, Lc)], note: op === '+' ? 'Add the tops' : 'Take away the tops' });
  const g = gcd(S, Lc);
  if (g > 1) steps.push({ chain: [F(S, Lc), Fr(R(S, Lc))], note: T`Simplify (÷${g})` });
  return steps;
}
tpl('fracadd.common', 'add.frac', 'Common denominator', [4, 3, 3], L => {
  let [d1, d2] = pick(FPAIRS[L]);
  if (chance(0.5)) [d1, d2] = [d2, d1];
  const n1 = properNum(d1), n2 = properNum(d2);
  return mk({ x: F(n1, d1), op: '+', y: F(n2, d2), ans: Q.add(R(n1, d1), R(n2, d2)), pref: 'frac', steps: commonDenSteps(n1, d1, n2, d2, '+'),
    tip: 'Rewrite both fractions over a common denominator, then add the tops.' });
});

tpl('fracadd.unit', 'add.frac', 'Unit fractions: sum over product', [0, 1.5, 1], L => {
  const a = ri(2, L === 2 ? 9 : 12), b = ri(2, L === 2 ? 9 : 12);
  need(a < b);
  const S = a + b, P = a * b, ans = R(S, P);
  const steps = [{ chain: [E(F(1, a), '+', F(1, b)), F(S, P)], note: T`(${a} + ${b}) over (${a} × ${b})`, checks: [[E(a, '+', b), S], [E(a, '×', b), P]] }];
  const g = gcd(S, P);
  if (g > 1) steps.push({ chain: [F(S, P), Fr(ans)], note: T`Simplify (÷${g})` });
  return mk({ x: F(1, a), op: '+', y: F(1, b), swap: chance(0.5), ans, pref: 'frac', steps,
    tip: 'One over a plus one over b is (a + b) over (a × b). Then simplify.' });
});

tpl('fracsub.common', 'sub.frac', 'Common denominator', [4, 3, 3], L => {
  let [d1, d2] = pick(FPAIRS[L]);
  if (chance(0.5)) [d1, d2] = [d2, d1];
  let n1 = properNum(d1), n2 = properNum(d2);
  if (n1 * d2 < n2 * d1) { [n1, n2] = [n2, n1]; [d1, d2] = [d2, d1]; }
  need(n1 * d2 !== n2 * d1);
  return mk({ x: F(n1, d1), op: '−', y: F(n2, d2), ans: Q.sub(R(n1, d1), R(n2, d2)), pref: 'frac', steps: commonDenSteps(n1, d1, n2, d2, '−'),
    tip: 'Rewrite both fractions over a common denominator, then take away the tops.' });
});

tpl('fracsub.fromOne', 'sub.frac', 'Write the whole number as a fraction', [2, 1.5, 1], L => {
  const d = pick(L === 1 ? [2, 3, 4, 5, 6, 8, 10] : [3, 4, 5, 6, 7, 8, 9, 12]), n = properNum(d), w = L === 1 ? 1 : ri(1, 3);
  const ans = R(w * d - n, d);
  return mk({ x: w, op: '−', y: F(n, d), ans, pref: 'frac',
    steps: [{ chain: [E(w, '−', F(n, d)), E(F(w * d, d), '−', F(n, d)), F(w * d - n, d)], note: T`Write ${w} as ${F(w * d, d)}` }],
    tip: 'Write the whole number as a fraction with the same bottom, then take away the tops.' });
});

const TERM_FR = [[1, 2], [1, 4], [3, 4], [1, 5], [2, 5], [3, 5], [4, 5], [1, 8], [3, 8], [5, 8], [7, 8], [1, 20], [3, 20]];
tpl('fracmix.add', 'add.frac', 'Turn the fraction into a decimal', [0, 1.5, 1.5], L => {
  const [n, d] = pick(TERM_FR), fv = R(n, d);
  const x = L === 2 ? (chance(0.5) ? dv(ri(1, 9), 1) : dv(ri(11, 99), 2)) : Q.add(R(ri(1, 9)), dv(ri(11, 99), 2));
  need(x.d !== 1);
  const ans = Q.add(fv, x);
  return mk({ x: F(n, d), op: '+', y: Dv(x), swap: chance(0.5), ans,
    steps: [{ chain: [F(n, d), Dv(fv)], note: 'Turn the fraction into a decimal' }, { chain: [E(Dv(fv), '+', Dv(x)), Dv(ans)] }],
    tip: 'Mixed fractions and decimals: convert to one form first. Eighths, quarters and fifths turn into tidy decimals.' });
});

tpl('fracmix.sub', 'sub.frac', 'Turn the fraction into a decimal', [0, 1.5, 1.5], L => {
  const [n, d] = pick(TERM_FR), fv = R(n, d);
  const x = L === 2 ? (chance(0.5) ? dv(ri(1, 9), 1) : dv(ri(11, 99), 2)) : Q.add(R(ri(1, 9)), dv(ri(11, 99), 2));
  need(x.d !== 1 && !Q.eq(fv, x));
  const fracFirst = Q.gt(fv, x);
  const ans = fracFirst ? Q.sub(fv, x) : Q.sub(x, fv);
  return mk({ x: fracFirst ? F(n, d) : Dv(x), op: '−', y: fracFirst ? Dv(x) : F(n, d), ans,
    steps: [{ chain: [F(n, d), Dv(fv)], note: 'Turn the fraction into a decimal' },
      { chain: [fracFirst ? E(Dv(fv), '−', Dv(x)) : E(Dv(x), '−', Dv(fv)), Dv(ans)] }],
    tip: 'Mixed fractions and decimals: convert to one form first. Eighths, quarters and fifths turn into tidy decimals.' });
});

function cancelMulSteps(a, b, c, d) {
  const g1 = gcd(a, d), g2 = gcd(c, b);
  const a1 = a / g1, d1 = d / g1, c1 = c / g2, b1 = b / g2;
  const txt = ['Cancel diagonally: '], checks = [];
  if (g1 > 1) { txt.push(...T`${a} and ${d} both divide by ${g1}`); checks.push([E(a, '÷', g1), a1], [E(d, '÷', g1), d1]); }
  if (g1 > 1 && g2 > 1) txt.push('; ');
  if (g2 > 1) { txt.push(...T`${c} and ${b} both divide by ${g2}`); checks.push([E(c, '÷', g2), c1], [E(b, '÷', g2), b1]); }
  const ans = R(a * c, b * d);
  return [
    { text: txt, checks },
    { chain: [E(F(a, b), '×', F(c, d)), E(F(a1, b1), '×', F(c1, d1)), Fr(ans)], note: 'Then multiply across' },
  ];
}
const MDENS = { 1: [2, 3, 4, 5, 6, 8, 9, 10], 2: [2, 3, 4, 5, 6, 7, 8, 9, 10, 12], 3: [3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 15, 16, 18] };
tpl('fracmul.cancel', 'mul.frac', 'Cancel first, then multiply', [3, 3, 3], L => {
  const b = pick(MDENS[L]), d = pick(MDENS[L]), a = properNum(b), c = properNum(d);
  need(gcd(a, d) > 1 || gcd(c, b) > 1);
  return mk({ x: F(a, b), op: '×', y: F(c, d), ans: R(a * c, b * d), pref: 'frac', steps: cancelMulSteps(a, b, c, d),
    tip: 'Cancel diagonally before you multiply, so the numbers stay small.' });
});

tpl('fracmul.straight', 'mul.frac', 'Tops times tops, bottoms times bottoms', [2, 1.5, 1], L => {
  const b = pick(MDENS[L]), d = pick(MDENS[L]), a = properNum(b), c = properNum(d);
  need(gcd(a, d) === 1 && gcd(c, b) === 1);
  return mk({ x: F(a, b), op: '×', y: F(c, d), ans: R(a * c, b * d), pref: 'frac',
    steps: [{ chain: [E(F(a, b), '×', F(c, d)), F(a * c, b * d)], note: 'Multiply the tops, then the bottoms' }],
    tip: 'Multiply the tops together and the bottoms together. Nothing cancels here, so you are done.' });
});

tpl('fracmul.ofWhole', 'mul.frac', 'Divide by the bottom, times the top', [3, 3, 3], L => {
  const d = L === 1 ? ri(2, 5) : L === 2 ? ri(3, 12) : ri(6, 16), n = properNum(d);
  const u = L === 1 ? ri(2, 10) : L === 2 ? ri(2, 12) : ri(3, 15), w = d * u;
  need(u !== 10 || L === 1);
  const steps = [{ chain: [E(w, '÷', d), u], note: T`Divide by the bottom number, ${d}` }];
  if (n > 1) steps.push({ chain: [E(u, '×', n), n * u], note: T`then multiply by the top, ${n}` });
  return mk({ x: F(n, d), op: '×', y: w, swap: chance(0.4), ans: R(n * u), steps,
    tip: 'Fraction of a number: divide by the bottom, multiply by the top.' });
});

tpl('fracmix.mul', 'mul.frac', 'Turn the decimal into a fraction', [0, 0, 1.5], L => {
  const [n, d] = pick([[1, 2], [1, 4], [3, 4], [1, 5], [2, 5], [3, 5], [4, 5]]), xv = R(n, d);
  const dd = pick([3, 4, 5, 6, 8, 9]), c = properNum(dd);
  const ans = Q.mul(xv, R(c, dd));
  need(decPlaces(ans) >= 0 && decPlaces(ans) <= 4);
  const cancel = gcd(n, dd) > 1 || gcd(c, d) > 1;
  const mul = cancel ? cancelMulSteps(n, d, c, dd) : [{ chain: [E(F(n, d), '×', F(c, dd)), Fr(ans)], note: 'Multiply the tops, then the bottoms' }];
  const steps = [{ chain: [Dv(xv), F(n, d)], note: 'Turn the decimal into a fraction' }, ...mul];
  if (ans.d !== 1) steps.push({ chain: [Fr(ans), Dv(ans)], note: 'As a decimal' });
  return mk({ x: Dv(xv), op: '×', y: F(c, dd), swap: chance(0.5), ans, steps,
    tip: 'Decimal times fraction: turn the decimal into a fraction (0.4 = 2/5, 0.75 = 3/4) and cancel.' });
});

tpl('fracdiv.flip', 'div.frac', 'Flip and multiply', [3, 3, 3], L => {
  const b = pick(MDENS[L]), d = pick(MDENS[L]), a = properNum(b), c = properNum(d);
  need(!(a === c && b === d));
  const ans = R(a * d, b * c);
  const lead = { chain: [E(F(a, b), '÷', F(c, d)), E(F(a, b), '×', F(d, c))], note: 'Flip the second fraction and multiply' };
  const cancel = gcd(a, c) > 1 || gcd(d, b) > 1;
  const rest = cancel ? cancelMulSteps(a, b, d, c) : [{ chain: [E(F(a, b), '×', F(d, c)), Fr(ans)], note: 'Multiply the tops, then the bottoms' }];
  return mk({ x: F(a, b), op: '÷', y: F(c, d), ans, pref: 'frac', steps: [lead, ...rest],
    tip: 'Dividing by a fraction is multiplying by it flipped.' });
});

tpl('fracdiv.sameDen', 'div.frac', 'Same bottoms: divide the tops', [2, 2, 1.5], L => {
  const b = pick([2, 3, 4, 5, 6]), k = pick([1, 2, 2, 3, 4]), d = b * k;
  need(d <= (L === 1 ? 12 : 24));
  const a = properNum(b), c = properNum(d), ak = a * k;
  need(ak !== c);
  const ans = R(ak, c), steps = [];
  if (k > 1) steps.push({ chain: [F(a, b), F(ak, d)], note: T`Rewrite over ${d}` });
  steps.push({ chain: [E(F(ak, d), '÷', F(c, d)), E(ak, '÷', c), Fr(ans)], note: 'Same bottoms, so just divide the tops' });
  return mk({ x: F(a, b), op: '÷', y: F(c, d), ans, pref: 'frac', steps,
    tip: 'Same denominators? Divide the tops and ignore the bottoms.' });
});

tpl('fracdiv.whole', 'div.frac', 'Fraction divided by a whole number', [2, 1.5, 1], L => {
  const w = ri(2, L === 1 ? 4 : 6), d = pick([3, 4, 5, 6, 7, 8, 9, 11]);
  let n;
  if (chance(0.5)) { n = w * ri(1, Math.floor((d - 1) / w)); } else n = properNum(d);
  need(n < d && gcd(n, d) === 1);
  const ans = R(n, d * w);
  let steps;
  if (n % w === 0) steps = [{ chain: [E(F(n, d), '÷', w), F(n / w, d)], note: 'Divide the top' }];
  else {
    steps = [{ chain: [E(F(n, d), '÷', w), F(n, d * w)], note: 'Multiply the bottom' }];
    const g = gcd(n, d * w);
    if (g > 1) steps.push({ chain: [F(n, d * w), Fr(ans)], note: T`Simplify (÷${g})` });
  }
  return mk({ x: F(n, d), op: '÷', y: w, ans, pref: 'frac', steps,
    tip: 'Fraction divided by a whole number: divide the top if it goes, otherwise multiply the bottom.' });
});

tpl('fracdiv.wholeByFrac', 'div.frac', 'Whole number divided by a fraction', [1, 1.5, 1.5], L => {
  const d = pick([2, 3, 4, 5, 6, 8, 10]), n = properNum(d), k = ri(2, L === 1 ? 5 : 9), w = n * k;
  need(w >= 2);
  const ans = R(k * d);
  const steps = n === 1
    ? [{ chain: [E(w, '÷', F(1, d)), E(w, '×', d), k * d], note: T`Dividing by ${F(1, d)} is multiplying by ${d}` }]
    : [{ chain: [E(w, '÷', F(n, d)), E(w, '×', F(d, n))], note: 'Flip the fraction and multiply' },
       { chain: [E(w, '÷', n), k], note: T`Divide by the top, ${n}` },
       { chain: [E(k, '×', d), k * d], note: T`then multiply by the bottom, ${d}` }];
  return mk({ x: w, op: '÷', y: F(n, d), ans, steps,
    tip: 'Whole number divided by a fraction: divide by the top, multiply by the bottom.' });
});

// ---------- conversions (shown under fractions; not used for missing-number questions)
const UNIT = { 8: '0.125', 16: '0.0625', 40: '0.025' };
const CONV_LV = { 1: [2, 4, 5, 10], 2: [4, 5, 8, 20, 25], 3: [8, 16, 20, 25, 40] };
function scaleTo10(d) { let k = 1; while ((10 ** k) % d !== 0) k++; return 10 ** k; }
tpl('frac.toDec', 'conv.frac', 'Fraction to decimal', [3, 3, 3], L => {
  const d = pick(CONV_LV[L]);
  let n = properNum(d);
  if (L >= 2 && chance(0.25)) n += d * ri(1, 2);
  const v = R(n, d), steps = [];
  if (UNIT[d]) {
    const u = Dv(UNIT[d]), w = Math.floor(n / d), r = n - w * d, rv = R(r, d);
    if (w === 0 && n === d - 1) {
      steps.push({ chain: [F(n, d), E(1, '−', F(1, d)), E(1, '−', u), Dv(v)], note: T`One ${DEN_NAME[d]} short of 1, and ${F(1, d)} = ${u}`, checks: [[F(1, d), u]] });
    } else {
      steps.push({ chain: [F(1, d), u], note: 'Start from the anchor' });
      if (w === 0) steps.push({ chain: [E(n, '×', u), Dv(v)], note: T`${n} of them` });
      else {
        steps.push({ chain: [E(r, '×', u), Dv(rv)], note: T`${F(r, d)} is ${r} of them` });
        steps.push({ chain: [F(n, d), E(w, '+', F(r, d)), E(w, '+', Dv(rv)), Dv(v)], note: T`${w} whole, plus ${F(r, d)}` });
      }
    }
  } else {
    const t = scaleTo10(d);
    steps.push({ chain: [F(n, d), F(n * (t / d), t), Dv(v)], note: T`Scale the bottom up to ${t}` });
  }
  return mk({ q: [F(n, d), '=', '?'], x: F(n, d), ans: v, ansNum: Dv(v), form: 'dec', steps,
    tip: T`Anchors worth knowing cold: ${F(1, 8)} = ${Dv('0.125')}, ${F(1, 16)} = ${Dv('0.0625')}, ${F(1, 20)} = ${Dv('0.05')}, ${F(1, 25)} = ${Dv('0.04')}.` });
}, { nonStandard: true });

tpl('frac.toFrac', 'conv.frac', 'Decimal to fraction', [2, 2, 2], L => {
  const d = pick(CONV_LV[L]), n = properNum(d), v = R(n, d), x = Dv(v);
  let steps;
  if (UNIT[d]) {
    const u = Dv(UNIT[d]);
    steps = [{ chain: [x, E(n, '×', u), E(n, '×', F(1, d)), F(n, d)], note: T`It is ${n} lots of ${u}, and ${u} = ${F(1, d)}`, checks: [[u, F(1, d)]] }];
  } else {
    const k = decPlaces(v), t = 10 ** k, N = v.n * (t / v.d);
    steps = [{ chain: [x, F(N, t)], note: T`Write it over ${t}` }];
    const g = gcd(N, t);
    if (g > 1) steps.push({ chain: [F(N, t), F(n, d)], note: T`Simplify (÷${g})` });
  }
  return mk({ q: [x, '=', '?'], x, ans: v, ansNum: Fr(v), form: 'fracSimplest', steps,
    tip: 'Multiples of 0.125 are eighths, of 0.05 are twentieths, and of 0.04 are twenty-fifths.' });
}, { nonStandard: true });

// ================================================================ missing-number questions
// presented op → wrapper kinds; each wrapper reuses an "inner" problem whose answer is the missing number.
const WRAPS = { add: ['add?', '?add'], sub: ['sub?', '?sub'], mul: ['mul?', '?mul'], div: ['div?', '?div'] };
const WRAP_INNER = { 'add?': 'sub', '?add': 'sub', 'sub?': 'sub', '?sub': 'add', 'mul?': 'div', '?mul': 'div', 'div?': 'div', '?div': 'mul' };
function wrapMissing(inner, kind) {
  const x = inner.x, y = inner.y, c = inner.ansNum;
  let q, text, check;
  switch (kind) {
    case 'add?': q = [y, '+', '?', '=', x]; text = T`Turn it around: ? = ${x} − ${y}`; check = [E(y, '+', c), x]; break;
    case '?add': q = ['?', '+', y, '=', x]; text = T`Turn it around: ? = ${x} − ${y}`; check = [E(c, '+', y), x]; break;
    case 'sub?': q = [x, '−', '?', '=', y]; text = T`Turn it around: ? = ${x} − ${y}`; check = [E(x, '−', c), y]; break;
    case '?sub': q = ['?', '−', y, '=', x]; text = T`Turn it around: ? = ${x} + ${y}`; check = [E(c, '−', y), x]; break;
    case 'mul?': q = [y, '×', '?', '=', x]; text = T`Turn it around: ? = ${x} ÷ ${y}`; check = [E(y, '×', c), x]; break;
    case '?mul': q = ['?', '×', y, '=', x]; text = T`Turn it around: ? = ${x} ÷ ${y}`; check = [E(c, '×', y), x]; break;
    case 'div?': q = [x, '÷', '?', '=', y]; text = T`Turn it around: ? = ${x} ÷ ${y}`; check = [E(x, '÷', c), y]; break;
    case '?div': q = ['?', '÷', y, '=', x]; text = T`Turn it around: ? = ${x} × ${y}`; check = [E(c, '÷', y), x]; break;
    default: throw new Error('bad wrap kind ' + kind);
  }
  return Object.assign({}, inner, { q, missing: kind, innerTpl: inner.tpl, steps: [{ text, checks: [check] }].concat(inner.steps) });
}

// ================================================================ public API
const CELL_LABEL = { add: '+', sub: '−', mul: '×', div: '÷', conv: '⇄' };
const TYPE_LABEL = { whole: 'Whole numbers', dec: 'Decimals', frac: 'Fractions' };
function templatesFor(cellId, L, standardOnly) {
  return Object.values(TPL).filter(t => t.cell === cellId && t.w[L - 1] > 0 && (!standardOnly || !t.nonStandard));
}
function fromCell(cellId, L, standardOnly) {
  const ts = templatesFor(cellId, L, standardOnly);
  if (!ts.length) throw new Error('No templates for ' + cellId + ' at level ' + L);
  return genTpl(wpick(ts.map(t => [t.w[L - 1], t])), L);
}
let serial = 0;
function finalize(p, cellId) { p.cell = cellId; p.key = plainTokens(p.q); p.id = ++serial; return p; }
function generate(cellId, L, missingRate) {
  const op = cellId.split('.')[0], type = cellId.split('.')[1];
  if (missingRate && WRAPS[op] && chance(missingRate)) {
    const kind = pick(WRAPS[op]);
    const inner = fromCell(WRAP_INNER[kind] + '.' + type, L, true);
    return finalize(wrapMissing(inner, kind), cellId);
  }
  return finalize(fromCell(cellId, L, false), cellId);
}
function similar(p) {
  if (p.missing) return finalize(wrapMissing(genTpl(TPL[p.innerTpl], p.level), p.missing), p.cell);
  return finalize(genTpl(TPL[p.tpl], p.level), p.cell);
}

// ---------- answer input
function parseInput(raw) {
  const s = String(raw).trim().replace(/,/g, '').replace(/\s+/g, ' ');
  let m;
  if ((m = /^(\d{1,7}) (\d{1,7})\/(\d{1,7})$/.exec(s))) {
    const w = +m[1], n = +m[2], d = +m[3];
    if (!d) return null;
    return { v: R(w * d + n, d), kind: 'frac', simplest: gcd(n, d) === 1 && n < d };
  }
  if ((m = /^(\d{1,9})\/(\d{1,9})$/.exec(s))) {
    const n = +m[1], d = +m[2];
    if (!d) return null;
    return { v: R(n, d), kind: 'frac', simplest: gcd(n, d) === 1 };
  }
  if (/^\d*\.?\d*$/.test(s)) {
    const v = parseDecimal(s);
    if (!v) return null;
    return { v, kind: s.indexOf('.') >= 0 && !/\.$/.test(s) ? 'dec' : 'int' };
  }
  return null;
}
// status: right | wrong | form (right value, wrong format) | incomplete
function checkInput(p, raw) {
  const v = parseInput(raw);
  if (!v) return { status: 'incomplete' };
  const same = Q.eq(v.v, p.ans);
  if (p.form === 'dec' && v.kind === 'frac') return { status: same ? 'form' : 'wrong', msg: 'Type it as a decimal' };
  if (p.form === 'fracSimplest') {
    if (p.ans.d === 1) return { status: same ? 'right' : 'wrong' };
    if (v.kind !== 'frac') return { status: same ? 'form' : 'wrong', msg: 'Type it as a fraction, like 3/8' };
    if (!v.simplest) return { status: same ? 'form' : 'wrong', msg: 'Use lowest terms' };
  }
  return { status: same ? 'right' : 'wrong' };
}

// ---------- plain-text rendering (verification, labels)
const PREC = { '+': 1, '−': 1, '×': 2, '÷': 2 };
function withCommas(s) { const neg = s[0] === '-'; if (neg) s = s.slice(1); const [ip, fp] = s.split('.'); const g = ip.length > 3 ? ip.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ip; return (neg ? '-' : '') + g + (fp !== undefined ? '.' + fp : ''); }
function numText(x) {
  if (x.k === 'int') return withCommas(String(x.v.n));
  if (x.k === 'dec') return withCommas(decStr(x.v));
  return x.d === 1 ? String(x.n) : x.n + '/' + x.d;
}
function needsParens(child, parentOp, isRight) {
  if (!child.op) return false;
  if (PREC[child.op] < PREC[parentOp]) return true;
  return isRight && PREC[child.op] === PREC[parentOp] && (parentOp === '−' || parentOp === '÷');
}
function exprText(e) {
  if (!e.op) return numText(e);
  const l = needsParens(e.a, e.op, false) ? '(' + exprText(e.a) + ')' : exprText(e.a);
  const r = needsParens(e.b, e.op, true) ? '(' + exprText(e.b) + ')' : exprText(e.b);
  return l + ' ' + e.op + ' ' + r;
}
function partsText(ps) { return parts(ps).map(x => typeof x === 'string' ? x : exprText(x)).join(''); }
function plainTokens(q) { return q.map(t => typeof t === 'string' ? t : exprText(t)).join(' '); }
function plainProblem(p) {
  const lines = [p.name + ':'];
  p.steps.forEach((s, i) => {
    if (s.text) lines.push((i + 1) + '. ' + partsText(s.text));
    else lines.push((i + 1) + '. ' + (s.note ? partsText(s.note) + ' :: ' : '') + s.chain.map(exprText).join(' = '));
  });
  lines.push('Rule: ' + partsText(p.tip));
  return plainTokens(p.q) + '   [answer ' + numText(p.ansNum) + ']\n  ' + lines.join('\n  ');
}

const API = { seed, R, Q, ev, decStr, decPlaces, parseDecimal, TPL, CELL_LABEL, TYPE_LABEL, WRAPS, WRAP_INNER,
  templatesFor, generate, similar, genTpl, wrapMissing, fromCell, parseInput, checkInput,
  numText, exprText, partsText, plainTokens, plainProblem, parts, withCommas, PREC, needsParens };
if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.MM = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
