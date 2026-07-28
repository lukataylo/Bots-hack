'use client';

// RINGSIDE ARENA — big-screen console for the engine and arena zones.
// Type two fighters, run a thousand fights in physics, watch the representative
// one. Odds come from the Elo engine over ingested records; with no records it
// says so and posts nothing.
//
// ponytail: fighter stats are typed in here. The DATA zone replaces this form
// with the live scrape and drops FighterProfile straight into runCard().

import { useCallback, useEffect, useState } from 'react';
import type { BotRecord, FighterProfile, MatchupOdds, WeaponArchetype } from '@/lib/types';
import { computeOdds } from '@/core/elo';
import { monteCarlo, type BoutRecording } from '@/core/sim';
import { FightScene, CORNER_A, CORNER_B, type Tick } from '@/three/FightScene';

const WEAPONS: WeaponArchetype[] = [
  'horizontal_spinner', 'vertical_spinner', 'drum', 'flipper',
  'hammer', 'crusher', 'lifter', 'wedge', 'multibot', 'other',
];

const blank = (name: string, weapon_class: WeaponArchetype): FighterProfile => ({
  name, weapon_class, weight_kg: 113, wins: 0, losses: 0, ko_wins: 0,
  failure_pattern: null, source_urls: [],
});

interface Card { odds: MatchupOdds; winShareA: number; medianSec: number; modal: string; marquee: BoutRecording }

export default function Console() {
  const [a, setA] = useState(() => blank('Fighter A', 'horizontal_spinner'));
  const [b, setB] = useState(() => blank('Fighter B', 'flipper'));
  const [records, setRecords] = useState<BotRecord[] | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [busy, setBusy] = useState(false);
  const [runKey, setRunKey] = useState(0);
  const [hud, setHud] = useState<Tick>({ t: 0, hpA: 1, hpB: 1, hits: 0 });

  useEffect(() => {
    fetch('/api/records')
      .then((r) => r.json())
      .then((d) => setRecords(d.records ?? []))
      .catch(() => setRecords([]));
  }, []);

  function runCard() {
    setBusy(true);
    // one frame so the button paints its pending state before the sim blocks
    requestAnimationFrame(() => {
      const { result, marquee } = monteCarlo(a, b, 1000, 1);
      setCard({
        odds: computeOdds(a, b, records ?? []),
        winShareA: result.winShareA,
        medianSec: result.medianDurationSec,
        modal: result.modalOutcome,
        marquee,
      });
      setRunKey((k) => k + 1);
      setHud({ t: 0, hpA: 1, hpB: 1, hits: 0 });
      setBusy(false);
    });
  }

  const onTick = useCallback((t: Tick) => setHud(t), []);

  return (
    <div className="arena-wrap">
      <header className="arena-head">
        <div>
          <span className="marker">Ringside Arena</span>
          <h1 className="arena-title serif">A thousand fights before the fight</h1>
        </div>
        <div className="arena-evidence mono">
          {records === null ? 'loading records' : `${records.length} fight records ingested`}
        </div>
      </header>

      <div className="corners">
        <Corner side="A" color={CORNER_A} p={a} onChange={setA} />
        <button className="btn btn-run" onClick={runCard} disabled={busy}>
          {busy ? 'Simulating' : 'Run 1,000 fights'}
        </button>
        <Corner side="B" color={CORNER_B} p={b} onChange={setB} />
      </div>

      {card && (
        <>
          <Line card={card} a={a} />

          <div className="viewport">
            <FightScene recording={card.marquee} runKey={runKey} onTick={onTick} />
            <div className="hud">
              <Bar name={a.name} color={CORNER_A} frac={hud.hpA} align="left" />
              <div className="hud-mid mono">
                <span className="hud-clock">{hud.t.toFixed(1)}s</span>
                <span className="hud-sub">{hud.hits} exchanges</span>
              </div>
              <Bar name={b.name} color={CORNER_B} frac={hud.hpB} align="right" />
            </div>
            <button className="btn btn-replay" onClick={() => setRunKey((k) => k + 1)}>Replay</button>
          </div>

          <section className="trace">
            <span className="marker marker-ink">The arithmetic</span>
            <ol className="mono">
              {card.odds.arithmeticTrace.map((l) => <li key={l}>{l}</li>)}
              <li>
                monte carlo: 1,000 seeded bouts, {(card.winShareA * 100).toFixed(1)}% to {a.name},
                {' '}modal outcome {card.modal}, median {card.medianSec}s
              </li>
              <li>
                marquee bout: seed {card.marquee.seed}, {card.marquee.winner} by {card.marquee.method}
                {' '}in {card.marquee.durationSec}s
              </li>
            </ol>
            <p className="muted">{card.odds.weighting}</p>
          </section>
        </>
      )}
    </div>
  );
}

function Line({ card, a }: { card: Card; a: FighterProfile }) {
  if (card.odds.abstain) {
    return (
      <section className="line line-abstain">
        <span className="marker">No line posted</span>
        <p className="serif line-abstain-copy">{card.odds.abstainReason}</p>
        <p className="muted">
          The simulation still ran. It reports {(card.winShareA * 100).toFixed(1)}% for {a.name},
          but that is physics with no evidence behind it, so nothing is priced and no bets stand.
        </p>
      </section>
    );
  }
  const [lo, hi] = card.odds.confidenceInterval;
  return (
    <section className="line">
      <Price name={card.marquee.specA.name} p={card.odds.winProbA} n={card.odds.sampleCountA} color={CORNER_A} />
      <div className="line-mid">
        <span className="marker marker-ink">The line</span>
        <div className="mono line-ci">95% {(lo * 100).toFixed(0)} to {(hi * 100).toFixed(0)}</div>
        <div className="mono line-sim">
          sim {(card.winShareA * 100).toFixed(1)} / {((1 - card.winShareA) * 100).toFixed(1)}
        </div>
      </div>
      <Price name={card.marquee.specB.name} p={card.odds.winProbB} n={card.odds.sampleCountB} color={CORNER_B} />
    </section>
  );
}

function Price({ name, p, n, color }: { name: string; p: number; n: number; color: string }) {
  return (
    <div className="price">
      <div className="price-name" style={{ borderColor: color }}>{name}</div>
      <div className="price-n serif">{(p * 100).toFixed(0)}</div>
      <div className="mono dim">{(1 / Math.max(0.01, p)).toFixed(2)} dec, n={n}</div>
    </div>
  );
}

function Corner({ side, color, p, onChange }: {
  side: 'A' | 'B'; color: string; p: FighterProfile; onChange: (p: FighterProfile) => void;
}) {
  const set = <K extends keyof FighterProfile>(k: K, v: FighterProfile[K]) => onChange({ ...p, [k]: v });
  return (
    <div className="corner" style={{ borderTopColor: color }}>
      <label className="corner-side mono" style={{ color }}>Corner {side}</label>
      <input
        className="in in-name"
        value={p.name}
        aria-label={`Corner ${side} name`}
        onChange={(e) => set('name', e.target.value)}
      />
      <select
        className="in"
        value={p.weapon_class}
        aria-label={`Corner ${side} weapon`}
        onChange={(e) => set('weapon_class', e.target.value as WeaponArchetype)}
      >
        {WEAPONS.map((w) => <option key={w} value={w}>{w.replace(/_/g, ' ')}</option>)}
      </select>
      <div className="corner-nums">
        <Num label="kg" v={p.weight_kg ?? 113} on={(v) => set('weight_kg', v)} />
        <Num label="W" v={p.wins} on={(v) => set('wins', v)} />
        <Num label="L" v={p.losses} on={(v) => set('losses', v)} />
        {/* ko wins can never exceed wins, or the damage multiplier goes fictional */}
        <Num label="KO" v={p.ko_wins} on={(v) => set('ko_wins', Math.min(v, p.wins))} />
      </div>
    </div>
  );
}

function Num({ label, v, on }: { label: string; v: number; on: (v: number) => void }) {
  return (
    <label className="num">
      <span className="mono dim">{label}</span>
      <input
        className="in in-num mono"
        type="number"
        min={0}
        value={v}
        onChange={(e) => on(Math.max(0, Number(e.target.value) || 0))}
      />
    </label>
  );
}

function Bar({ name, color, frac, align }: { name: string; color: string; frac: number; align: 'left' | 'right' }) {
  return (
    <div className={`hpwrap hp-${align}`}>
      <div className="hpname mono">{name}</div>
      <div className="hptrack">
        <i style={{ width: `${Math.max(0, frac) * 100}%`, background: color }} />
      </div>
    </div>
  );
}
