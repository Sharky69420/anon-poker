// worker/bots.js - pure ESM bot policy. Faithful port of the page's botAct (zp.html).
// No I/O, no Date, no Math.random. All randomness comes from rng() -> [0,1), drawn in the SAME order
// and under the same short-circuit conditions as the page's Math.random() calls, so a shared stream
// gives identical decisions.
// Differences from the page (documented, intentional):
//  1. Output is the engine action shape {type,amount?}; amount = RAISE-TO total (page returned an
//     increment n over the call; converted below exactly as the page's act() applied it).
//  2. 'bet' -> type 'raise'. 'call' with nothing owed -> 'check'. Page's act() did the same conversions.
//  3. A final guard makes illegal output impossible (raise when !canRaise -> call/check, amount clamped).
//  4. Page `agg` personality is not read by the page botAct either; accepted and ignored.
const BB = 20;
const RKV = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13, A: 14 };
const rk = c => RKV[c.r];

const POS = {
  9: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO'],
  8: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'HJ', 'CO'],
  7: ['BTN', 'SB', 'BB', 'UTG', 'MP', 'HJ', 'CO'],
  6: ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'],
  5: ['BTN', 'SB', 'BB', 'UTG', 'CO'],
  4: ['BTN', 'SB', 'BB', 'UTG'],
  3: ['BTN', 'SB', 'BB'],
  2: ['BTN/SB', 'BB'],
};
export function positionName(numSeats, dealer, seat) {
  const tbl = POS[numSeats] || POS[2];
  return tbl[(seat - dealer + numSeats) % numSeats] || '—';
}
export function posQuality(pos) {
  const q = { BTN: 1, 'BTN/SB': .9, CO: .8, HJ: .65, SB: .5, BB: .4, UTG: .2 };
  return q[pos] || 0.5;
}

export function chenScore(hole) {
  if (hole.length < 2) return 0;
  const [a, b] = hole.map(rk).sort((x, y) => y - x);
  const suited = hole[0].s === hole[1].s;
  const paired = a === b;
  let score;
  if (paired) {
    score = Math.max(5, a / 2);
    if (a >= 10) score = a / 2 + 2;
  } else {
    score = a === 14 ? 10 : a === 13 ? 8 : a === 12 ? 7 : a === 11 ? 6 : a / 2;
  }
  if (suited) score += 2;
  const gap = a - b - 1;
  if (!paired) {
    if (gap === 0) score += 1;
    else if (gap === 1) score -= 1;
    else if (gap === 2) score -= 2;
    else if (gap >= 3) score -= 4;
    if (a <= 11 && gap < 3) score += 1;
  }
  return Math.round(score * 2) / 2;
}

export function handEquity(handRank, numCards, numOpponents) {
  const baseEq = [0.32, 0.52, 0.65, 0.73, 0.82, 0.86, 0.91, 0.96, 0.98, 0.99][Math.min(handRank, 9)];
  const adjEq = 1 - Math.pow(1 - baseEq, 1 / Math.max(1, numOpponents));
  const certainty = numCards >= 5 ? 1.0 : numCards >= 3 ? 0.75 : 0.55;
  return 0.5 + (adjEq - 0.5) * certainty;
}
export function potOdds(call, pot) { return call <= 0 ? 0 : call / (call + pot); }
export function spr(chips, pot) { return pot > 0 ? chips / pot : 99; }

export function betSize(style, pot, chips) {
  const sizes = { thin: 0.33, half: 0.50, two3: 0.67, pot: 1.00, over: 1.25 };
  const fraction = sizes[style] || 0.5;
  return Math.min(Math.round(pot * fraction / BB) * BB || BB, chips);
}

export function boardTexture(comm) {
  if (!comm || comm.length < 3) return { wet: 0, paired: false, monotone: false };
  const vals = comm.map(rk);
  const suited = new Set(comm.map(c => c.s));
  const sorted = [...vals].sort((a, b) => a - b);
  let connects = 0;
  for (let i = 0; i < sorted.length - 1; i++) if (sorted[i + 1] - sorted[i] <= 4) connects++;
  const wetness = connects / Math.max(1, sorted.length - 1) + (suited.size === 1 ? .4 : suited.size === 2 ? .15 : 0);
  return { wet: Math.min(1, wetness), paired: new Set(vals).size < vals.length, monotone: suited.size === 1 };
}

// Raw page-equivalent decision: {a:'fold'|'check'|'call'|'raise'|'bet', n}. n for raise/bet = increment over the call.
export function rawDecide(v, rng) {
  const r = () => rng();
  const comm = v.comm || [];
  const stage = v.stage || 'preflop';
  const call = v.callAmt;
  const pot = v.pot;
  const numOpp = Math.max(1, v.numOpp);
  const posQ = posQuality(v.position || positionName(v.numSeats, v.dealer, v.seat));
  const chipStack = v.chips;
  const board = boardTexture(comm);
  const myHV = v.handRank || 0;
  const seatSPR = spr(chipStack, pot || 1);
  const equity = handEquity(myHV, 2 + comm.length, numOpp);
  const odds = potOdds(call, pot);
  if (chipStack <= 0) return { a: 'check' };

  if (stage === 'preflop') {
    const hole = v.hole || [];
    const chen = chenScore(hole);
    const [hv1, hv2] = hole.map(rk).sort((a, b) => b - a);
    const suited = hole.length === 2 && hole[0].s === hole[1].s;
    const paired = hv1 === hv2;
    const openThreshold = 12 - posQ * 8;
    if (call === 0) {
      if (chen >= openThreshold + 4) {
        const sz = Math.min((3 + Math.floor(r() * 1.5)) * BB, chipStack);
        return { a: 'raise', n: sz };
      }
      if (chen >= openThreshold) {
        const sz = Math.min(Math.round(2.5 * BB / BB) * BB, chipStack);
        return { a: 'raise', n: sz };
      }
      if (chen >= openThreshold - 3 && posQ > 0.6) return { a: 'call', n: Math.min(BB, chipStack) };
      return { a: 'check' };
    }
    const raiserBet = call + (v.bet || 0);
    const threeBetValue = chen >= 15 || (paired && hv1 >= 10) || (hv1 === 14 && hv2 >= 12);
    const threeBetBluff = chen >= 10 && posQ > 0.7 && r() < 0.25;
    if (threeBetValue || threeBetBluff) {
      const sz = Math.min(raiserBet * 3 + Math.floor(r() * BB), chipStack);
      return { a: 'raise', n: Math.max(sz, call) };
    }
    if (chen >= openThreshold || (suited && hv1 >= 9 && hv2 >= 7) || (paired && hv1 >= 6)) {
      if (r() < 0.9) return { a: 'call', n: Math.min(call, chipStack) };
    }
    return { a: 'fold' };
  }

  if (call > 0 && equity < odds && equity < 0.18 && r() < 0.85) return { a: 'fold' };

  if (call === 0) {
    if (myHV >= 6) {
      const slowPlay = seatSPR > 4 && r() < 0.25;
      if (slowPlay) return { a: 'check' };
      return { a: 'bet', n: betSize(board.wet ? 'two3' : 'half', pot, chipStack) };
    }
    if (myHV >= 4) {
      const sz = betSize(board.wet ? 'pot' : 'two3', pot, chipStack);
      if (r() < 0.82) return { a: 'bet', n: sz };
      return { a: 'check' };
    }
    if (myHV >= 2) {
      const cBetFreq = board.wet ? 0.45 : 0.65;
      if (r() < cBetFreq) return { a: 'bet', n: betSize('half', pot, chipStack) };
      return { a: 'check' };
    }
    const bluffConditions = (posQ > 0.6 && r() < 0.35) || (board.paired && r() < 0.25);
    if (bluffConditions && chipStack > pot) return { a: 'bet', n: betSize('thin', pot, chipStack) };
    return { a: 'check' };
  }

  const haveOdds = equity > odds;
  const implied = seatSPR > 3;

  if (myHV >= 6) {
    const raiseNow = r() < 0.65;
    if (raiseNow) {
      const sz = Math.min(call * 3 + Math.floor(r() * pot * .5), chipStack);
      return { a: 'raise', n: Math.max(sz, call + BB) };
    }
    return { a: 'call', n: Math.min(call, chipStack) };
  }
  if (myHV >= 4) {
    if (equity > 0.72 && r() < 0.55) {
      const sz = Math.min(Math.round(call * (1.8 + r() * .7) / BB) * BB, chipStack);
      return { a: 'raise', n: Math.max(sz, call + BB) };
    }
    return { a: 'call', n: Math.min(call, chipStack) };
  }
  if (myHV >= 2) {
    if (haveOdds || (implied && equity > odds * .8)) {
      if (equity > 0.55 && r() < 0.22) return { a: 'raise', n: Math.min(call * 2 + BB, chipStack) };
      return { a: 'call', n: Math.min(call, chipStack) };
    }
    return { a: 'fold' };
  }
  if (haveOdds || (implied && equity > odds * .7)) {
    if (posQ > 0.65 && r() < 0.15 && chipStack > call * 3) {
      return { a: 'raise', n: Math.min(call * 2 + Math.floor(pot * .33), chipStack) };
    }
    return { a: 'call', n: Math.min(call, chipStack) };
  }
  const bluffRaise = (posQ > 0.75 && r() < 0.12 && seatSPR > 5 && stage !== 'river');
  if (bluffRaise) return { a: 'raise', n: Math.min(call * 2 + BB, chipStack) };
  return { a: 'fold' };
}

// Engine-facing decision. Never returns an illegal action.
export function decide(v, rng) {
  const d = rawDecide(v, rng);
  const owe = v.callAmt;
  const callOrCheck = () => (owe > 0 ? { type: 'call' } : { type: 'check' });
  if (d.a === 'fold') return owe > 0 ? { type: 'fold' } : { type: 'check' }; // folding for free is never legal-useful
  if (d.a === 'check') return callOrCheck();
  if (d.a === 'call') return callOrCheck();
  // raise / bet. Page act(): raiseSize=max(n||BB, minRaise); total=min(maxB+raiseSize, chips+bet).
  const maxB = (v.bet || 0) + owe;
  const minInc = Math.max(1, v.minRaiseTo - maxB);
  let to = maxB + Math.max(d.n || BB, minInc);
  if (to > v.maxRaiseTo) to = v.maxRaiseTo;
  if (!v.canRaise || !Number.isInteger(to) || to <= maxB) return callOrCheck();
  return { type: 'raise', amount: to };
}
