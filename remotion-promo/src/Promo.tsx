import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import './fonts';
import { DISPLAY, BODY } from './fonts';
import { C, FPS } from './theme';
import { SCENES } from './timings';
import { Bg, Words, Eyebrow, Chip, Device, GlowButton } from './ui';

// one solid highlight color per statement; rotates by scene for rhythm
const HL = { hook: C.blue, continuity: C.lime, verify: C.amber, ease: C.blue, outcome: C.lime, cta: C.blue };

const marksOf = (k: string): Record<string, number> => {
  const sc = SCENES.find((s) => s.k === k);
  return (sc ? { ...sc.marks } : {}) as Record<string, number>;
};

// portrait (1080x1920) rendering: scenes stack vertically and type scales down
const VertCtx = React.createContext(false);
const useVert = () => React.useContext(VertCtx);

const Center: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '0 8%', ...style }}>{children}</AbsoluteFill>
);

const H1 = 100, H2 = 76;

// ── Scene: Hook ───────────────────────────────────────────────────────────────
const Hook: React.FC = () => {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  const V = useVert();
  const M = marksOf('hook');
  const subS = spring({ frame: frame - M.sub, fps, config: { damping: 200 } });
  const revealS = spring({ frame: frame - M.reveal, fps, config: { damping: 200, stiffness: 140 } });
  return (
    <Center>
      <div>
        <Eyebrow text="Vendor-Sync" delay={0} />
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: V ? 74 : H1, lineHeight: 1.1, letterSpacing: -2, marginTop: 24 }}>
          <Words text="Every new vendor is a" delay={6} />
          <br />
          <Words text="stranger you're about to pay." delay={22} />
        </div>
        <div style={{ fontFamily: BODY, fontWeight: 600, fontSize: V ? 28 : 36, color: C.dim, marginTop: 36, opacity: subS, transform: `translateY(${interpolate(subS, [0, 1], [24, 0])}px)` }}>
          A PAN, a bank line, nobody checked.
        </div>
        <div style={{ marginTop: V ? 40 : 30, opacity: revealS, transform: `scale(${interpolate(revealS, [0, 1], [1.25, 1])})` }}>
          <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: V ? 46 : 58, color: HL.hook, textShadow: `0 0 50px ${HL.hook}55` }}>
            Fraud shows up after the purchase order's signed.
          </span>
        </div>
      </div>
    </Center>
  );
};

// ── Scene: Power beat (statement + device still + chip) ──────────────────────
const Power: React.FC<{ k: string; n: string; title: string; chip: React.ReactNode; src: string; side: 'L' | 'R'; accentColor: string }>
  = ({ k, n, title, chip, src, side, accentColor }) => {
    const V = useVert();
    const M = marksOf(k);
    if (V) {
      return (
        <AbsoluteFill style={{ flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '0 5%' }}>
          <Eyebrow text={n} color={accentColor} delay={0} />
          <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 60, letterSpacing: -1, marginTop: 18 }}><Words text={title} delay={8} /></div>
          <div style={{ marginTop: 50 }}><Device src={src} side={side} width={940} delay={6} /></div>
          <div style={{ marginTop: 60 }}><Chip delay={M.chip ?? 22}>{chip}</Chip></div>
        </AbsoluteFill>
      );
    }
    const text = (
      <div style={{ flex: 1, padding: side === 'R' ? '0 4% 0 6%' : '0 6% 0 4%' }}>
        <Eyebrow text={n} color={accentColor} delay={0} />
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: H2, letterSpacing: -1, marginTop: 20 }}><Words text={title} delay={8} /></div>
        <div style={{ marginTop: 36 }}><Chip delay={M.chip ?? 22}>{chip}</Chip></div>
      </div>
    );
    const dev = <div style={{ flex: 1.15, display: 'flex', justifyContent: 'center' }}><Device src={src} side={side} width={980} delay={6} /></div>;
    return (
      <AbsoluteFill style={{ flexDirection: 'row', alignItems: 'center', padding: '0 6%' }}>
        {side === 'R' ? <>{dev}{text}</> : <>{text}{dev}</>}
      </AbsoluteFill>
    );
  };

// ── Scene: CTA ────────────────────────────────────────────────────────────────
const Wordmark: React.FC<{ delay: number }> = ({ delay }) => {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 14, stiffness: 120 } });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, opacity: s, transform: `scale(${interpolate(s, [0, 1], [0.7, 1])})` }}>
      <div style={{
        width: 76, height: 76, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg,#0090f0,#7cbb44)', boxShadow: '0 16px 40px rgba(0,144,240,.4)',
      }}>
        <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 36, color: '#fff' }}>V</span>
      </div>
      <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 52, color: '#fff', letterSpacing: -1 }}>Vendor-Sync</span>
    </div>
  );
};

const Cta: React.FC = () => {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  const V = useVert();
  const M = marksOf('cta');
  const subS = spring({ frame: frame - M.url, fps, config: { damping: 200 } });
  return (
    <Center>
      <div>
        <Wordmark delay={0} />
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: V ? 50 : H2, letterSpacing: -1, marginTop: 40 }}>
          <Words text="Know your vendor" delay={12} /><br /><Words text="before you commit." delay={30} accentColor={HL.cta} />
        </div>
        <div style={{ marginTop: 46 }}><GlowButton delay={M.btn}>Start free &rarr;</GlowButton></div>
        <div style={{ fontFamily: BODY, fontSize: V ? 24 : 28, color: C.dim, marginTop: 28, opacity: subS }}>
          Your first three verifications are on us
        </div>
      </div>
    </Center>
  );
};

// ── assembly with crossfades + slow per-scene push ────────────────────────────
const OVERLAP = 9;
const Fade: React.FC<{ dur: number; first?: boolean; last?: boolean; children: React.ReactNode }> = ({ dur, first, last, children }) => {
  const frame = useCurrentFrame();
  const op = interpolate(frame, [0, OVERLAP, dur, dur + OVERLAP], [first ? 1 : 0, 1, 1, last ? 1 : 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const push = 1 + Math.min(frame / (dur + OVERLAP), 1) * 0.014;
  return <AbsoluteFill style={{ opacity: op, transform: `scale(${push})` }}>{children}</AbsoluteFill>;
};

export const Promo: React.FC<{ vertical?: boolean }> = ({ vertical }) => {
  const comp: Record<string, React.ReactNode> = {
    hook: <Hook />, cta: <Cta />,
    continuity: <Power k="continuity" n="One" title="One identity, the whole way through" chip={<>Onboarding &middot; invoices &middot; advances &middot; settlement</>} src="continuity" side="R" accentColor={C.lime} />,
    verify: <Power k="verify" n="And it catches fraud too" title="Verified against government sources" chip="Duplicates & tampered documents flagged" src="verify" side="L" accentColor={C.amber} />,
    ease: <Power k="ease" n="Three" title="Vendors file it themselves" chip="The AI reads every document" src="ease" side="R" accentColor={C.blue} />,
    outcome: <Power k="outcome" n="The result" title="Audit-ready, always" chip={<>Timestamped &middot; visible to both sides</>} src="outcome" side="L" accentColor={C.lime} />,
  };
  let acc = 0;
  const seqs = SCENES.map((sc, i) => {
    const dur = Math.round(sc.s * FPS);
    const from = acc;
    acc += dur;
    const last = i === SCENES.length - 1;
    return (
      <Sequence key={sc.k} from={from} durationInFrames={last ? undefined : dur + OVERLAP}>
        <Fade dur={dur} first={i === 0} last={last}>{comp[sc.k]}</Fade>
      </Sequence>
    );
  });
  return (
    <VertCtx.Provider value={!!vertical}>
      <AbsoluteFill style={{ background: C.bg1 }}>
        <Bg />
        {seqs}
      </AbsoluteFill>
    </VertCtx.Provider>
  );
};
