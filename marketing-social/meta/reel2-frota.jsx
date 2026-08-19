// Reel 2 — Frota (pneus e combustível). 1080×1920, ~7.6s.
const { Stage, Sprite, useTime, useSprite, Easing, interpolate, clamp } = window;

const ORANGE = "#FF5A1F";
const INK = "#16181D";

function Bg() {
  const t = useTime();
  const pulse = 0.5 + 0.5 * Math.sin(t * 1.3);
  return (
    <div style={{ position: "absolute", inset: 0, background: INK, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0,
        background: `radial-gradient(60% 42% at 22% ${14 + pulse * 4}%, rgba(255,90,31,${0.2 + pulse * 0.07}), transparent 60%), radial-gradient(80% 55% at 110% 116%, rgba(30,58,95,0.55), transparent 60%)` }} />
      <div style={{ position: "absolute", inset: 0, opacity: 0.5,
        backgroundImage: "radial-gradient(rgba(255,255,255,0.05) 1.8px, transparent 1.8px)", backgroundSize: "52px 52px" }} />
    </div>
  );
}

function Wordmark() {
  const t = useTime();
  const op = clamp((t - 2.0) / 0.5, 0, 1);
  return (
    <div style={{ position: "absolute", top: 96, left: 0, right: 0, textAlign: "center", opacity: op,
      fontFamily: "'Baloo 2', sans-serif", fontSize: 52, letterSpacing: "-0.03em", lineHeight: 1 }}>
      <span style={{ color: "#FAFAF9", fontWeight: 600 }}>Hiper</span>
      <span style={{ color: "#FF6A33", fontWeight: 800 }}>TMS</span>
    </div>
  );
}

function Intro() {
  const { localTime, duration } = useSprite();
  const t = useTime();
  const exit = clamp((localTime - (duration - 0.55)) / 0.55, 0, 1);
  const float = Math.sin(t * 1.1) * 6;
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", opacity: 1 - exit, transform: `translateY(${-exit * 30}px)` }}>
      <div style={{ position: "absolute", width: 760, height: 760, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(255,90,31,0.28), transparent 62%)" }} />
      <div style={{ fontFamily: "'Baloo 2', sans-serif", textAlign: "center", lineHeight: 0.92, transform: `translateY(${float}px)` }}>
        <div style={{ color: "#FAFAF9", fontWeight: 600, fontSize: 150, letterSpacing: "-0.03em" }}>Hiper</div>
        <div style={{ color: ORANGE, fontWeight: 800, fontSize: 210, letterSpacing: "-0.02em" }}>TMS</div>
      </div>
      <div style={{ marginTop: 40, fontFamily: "Inter, sans-serif", fontWeight: 700, fontSize: 46, color: "#9aa0aa", transform: `translateY(${float}px)` }}>
        O TMS feito para vender frete
      </div>
    </div>
  );
}

function Beat({ children, y = 780, dy = 60 }) {
  const { duration, localTime } = useSprite();
  const entry = clamp(localTime / 0.65, 0, 1);
  const exit = clamp((localTime - (duration - 0.55)) / 0.55, 0, 1);
  const e = Easing.easeOutCubic(entry);
  return (
    <div style={{ position: "absolute", left: 90, right: 90, top: y, textAlign: "center",
      opacity: e * (1 - exit), transform: `translateY(${(1 - e) * dy - exit * 40}px)` }}>
      {children}
    </div>
  );
}

const ICONS = {
  fuel: "M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18 M4 9h10 M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0V9.83a2 2 0 0 0-.59-1.42L18 5 M3 22h12",
  gauge: "M12 14l4-4 M3.34 19a10 10 0 1 1 17.32 0",
  bell: "M10.27 21a2 2 0 0 0 3.46 0 M3.26 15.33A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.67C19.41 13.96 18 12.5 18 8A6 6 0 0 0 6 8c0 4.5-1.41 5.96-2.74 7.33",
};

function StatusRow({ icon, label, tag, tagColor, tagBg, delay, localTime }) {
  const p = clamp((localTime - delay) / 0.55, 0, 1);
  const e = Easing.easeOutBack(p);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 26, background: "#23262E",
      border: "1px solid rgba(255,255,255,0.07)", borderRadius: 26, padding: "30px 34px",
      opacity: clamp(p * 1.4, 0, 1), transform: `translateX(${(1 - e) * -80}px)` }}>
      <span style={{ width: 82, height: 82, borderRadius: 18, background: "rgba(255,90,31,0.16)", flex: "none",
        display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#FF7A47" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {icon.split(" M").map((d, i) => <path key={i} d={(i ? "M" : "") + d} />)}
        </svg>
      </span>
      <span style={{ flex: 1, textAlign: "left", fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 40, color: "#FAFAF9" }}>{label}</span>
      <span style={{ fontFamily: "Inter, sans-serif", fontWeight: 700, fontSize: 30, color: tagColor, background: tagBg, padding: "12px 24px", borderRadius: 999, whiteSpace: "nowrap" }}>{tag}</span>
    </div>
  );
}

function FrotaRows() {
  const { localTime, duration } = useSprite();
  const entry = clamp(localTime / 0.4, 0, 1);
  const exit = clamp((localTime - (duration - 0.4)) / 0.4, 0, 1);
  return (
    <div style={{ position: "absolute", left: 80, right: 80, top: 640, opacity: (1 - exit) }}>
      <div style={{ textAlign: "center", fontFamily: "Inter, sans-serif", fontWeight: 800, fontSize: 72, color: "#FAFAF9",
        letterSpacing: "-0.02em", marginBottom: 50, opacity: entry }}>
        No HiperTMS é <span style={{ color: ORANGE }}>automático</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <StatusRow icon={ICONS.fuel} label="Ordens de abastecimento" tag="Você lança" tagColor="#7dd3fc" tagBg="rgba(2,132,199,0.22)" delay={0.5} localTime={localTime} />
        <StatusRow icon={ICONS.gauge} label="Programação de pneus" tag="Automático" tagColor="#86efac" tagBg="rgba(22,163,74,0.22)" delay={1.05} localTime={localTime} />
        <StatusRow icon={ICONS.bell} label="Alertas de troca" tag="Troca em 45 dias" tagColor="#fdba74" tagBg="rgba(249,115,22,0.2)" delay={1.6} localTime={localTime} />
      </div>
    </div>
  );
}

function Reel2Frota() {
  return (
    <Stage width={1080} height={1920} duration={11.8} background={INK}>
      <Bg />
      <Wordmark />

      <Sprite start={0} end={1.9}>
        <Intro />
      </Sprite>

      <Sprite start={1.8} end={4.5}>
        <Beat y={740}>
          <div style={{ fontFamily: "Inter, sans-serif", fontWeight: 500, fontSize: 52, color: "#9aa0aa" }}>Pneu, óleo, abastecimento</div>
          <div style={{ fontFamily: "Inter, sans-serif", fontWeight: 800, fontSize: 100, color: "#FAFAF9", letterSpacing: "-0.03em", lineHeight: 1.02, marginTop: 14 }}>
            tudo no<br /><span style={{ color: ORANGE }}>caderno?</span>
          </div>
        </Beat>
      </Sprite>

      <Sprite start={4.4} end={8.0}>
        <FrotaRows />
      </Sprite>

      <Sprite start={7.9} end={10.0}>
        <Beat y={720}>
          <div style={{ fontFamily: "Inter, sans-serif", fontWeight: 800, fontSize: 96, color: "#FAFAF9", letterSpacing: "-0.03em", lineHeight: 1.03 }}>
            Você abastece.
          </div>
          <div style={{ fontFamily: "Inter, sans-serif", fontWeight: 800, fontSize: 96, color: ORANGE, letterSpacing: "-0.03em", lineHeight: 1.03, marginTop: 6 }}>
            O sistema<br />controla o resto.
          </div>
        </Beat>
      </Sprite>

      <Sprite start={9.9} end={11.8}>
        <Beat y={800}>
          <div style={{ fontFamily: "Inter, sans-serif", fontWeight: 800, fontSize: 74, color: "#FAFAF9", letterSpacing: "-0.03em", lineHeight: 1.05 }}>
            Sua frota<br /><span style={{ color: ORANGE }}>sob controle.</span>
          </div>
          <div style={{ display: "inline-block", marginTop: 46, background: ORANGE, color: INK, fontFamily: "Inter, sans-serif",
            fontWeight: 700, fontSize: 40, padding: "26px 52px", borderRadius: 999 }}>Fale com um especialista</div>
          <div style={{ marginTop: 34, fontFamily: "'JetBrains Mono', monospace", fontSize: 34, color: "#6c717a" }}>hipertms.com.br</div>
        </Beat>
      </Sprite>
    </Stage>
  );
}

window.Reel2Frota = Reel2Frota;
