// Reel 1 — Cotação (+5.500 municípios). 1080×1920, ~7.5s.
const { Stage, Sprite, useTime, useSprite, Easing, interpolate, clamp } = window;

const ORANGE = "#FF5A1F";
const INK = "#16181D";
const CREME = "#FFF3ED";

function Bg() {
  const t = useTime();
  const pulse = 0.5 + 0.5 * Math.sin(t * 1.4);
  return (
    <div style={{ position: "absolute", inset: 0, background: INK, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0,
        background: `radial-gradient(60% 40% at 50% ${18 + pulse * 4}%, rgba(255,90,31,${0.22 + pulse * 0.08}), transparent 60%), radial-gradient(70% 50% at 50% 118%, rgba(30,58,95,0.5), transparent 60%)` }} />
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

// Cover — big centered logo, fully visible at frame 0 (no entry fade)
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

// Generic centered fade/slide-up block driven by the parent Sprite
function Beat({ children, y = 860, dy = 60 }) {
  const { progress, duration, localTime } = useSprite();
  const entry = clamp(localTime / 0.65, 0, 1);
  const exitStart = duration - 0.55;
  const exit = clamp((localTime - exitStart) / 0.55, 0, 1);
  const e = Easing.easeOutCubic(entry);
  const op = e * (1 - exit);
  const offset = (1 - e) * dy - exit * 40;
  return (
    <div style={{ position: "absolute", left: 90, right: 90, top: y, textAlign: "center",
      opacity: op, transform: `translateY(${offset}px)` }}>
      {children}
    </div>
  );
}

function Reel1Cotacao() {
  return (
    <Stage width={1080} height={1920} duration={11.6} background={INK}>
      <Bg />
      <Wordmark />

      {/* Cover */}
      <Sprite start={0} end={1.9}>
        <Intro />
      </Sprite>

      {/* Beat 1 — hook */}
      <Sprite start={1.8} end={4.5}>
        <Beat y={780}>
          <div style={{ fontFamily: "Inter, sans-serif", fontWeight: 500, fontSize: 52, color: "#9aa0aa" }}>Montar tabela de frete</div>
          <div style={{ fontFamily: "Inter, sans-serif", fontWeight: 800, fontSize: 104, color: "#FAFAF9", letterSpacing: "-0.03em", lineHeight: 1.02, marginTop: 12 }}>
            cidade por cidade?
          </div>
          <div style={{ fontFamily: "Inter, sans-serif", fontWeight: 700, fontSize: 46, color: ORANGE, marginTop: 30 }}>Esquece isso.</div>
        </Beat>
      </Sprite>

      {/* Beat 2 — big number */}
      <Sprite start={4.4} end={7.4}>
        <Counter />
      </Sprite>

      {/* Beat 3 — quote card */}
      <Sprite start={7.3} end={9.9}>
        <QuoteCard />
      </Sprite>

      {/* Beat 4 — CTA */}
      <Sprite start={9.8} end={11.6}>
        <Beat y={820}>
          <div style={{ fontFamily: "Inter, sans-serif", fontWeight: 800, fontSize: 78, color: "#FAFAF9", letterSpacing: "-0.03em", lineHeight: 1.05 }}>
            Cadastrou,<br /><span style={{ color: ORANGE }}>cotou.</span>
          </div>
          <div style={{ display: "inline-block", marginTop: 46, background: ORANGE, color: INK, fontFamily: "Inter, sans-serif",
            fontWeight: 700, fontSize: 40, padding: "26px 52px", borderRadius: 999 }}>Fale com um especialista</div>
          <div style={{ marginTop: 34, fontFamily: "'JetBrains Mono', monospace", fontSize: 34, color: "#6c717a" }}>hipertms.com.br</div>
        </Beat>
      </Sprite>
    </Stage>
  );
}

function Counter() {
  const { localTime, duration } = useSprite();
  const entry = clamp(localTime / 0.6, 0, 1);
  const exit = clamp((localTime - (duration - 0.4)) / 0.4, 0, 1);
  const e = Easing.easeOutBack(entry);
  const n = Math.round(interpolate([0, 1.4], [0, 5500], Easing.easeOutExpo)(localTime));
  const val = "+" + n.toLocaleString("pt-BR");
  return (
    <div style={{ position: "absolute", left: 60, right: 60, top: 640, textAlign: "center",
      opacity: (1 - exit), transform: `scale(${0.6 + 0.4 * e})` }}>
      <div style={{ fontFamily: "Inter, sans-serif", fontWeight: 700, fontSize: 48, color: "#9aa0aa" }}>No HiperTMS</div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 250, color: ORANGE, letterSpacing: "-0.04em", lineHeight: 0.92, marginTop: 8 }}>{val}</div>
      <div style={{ fontFamily: "Inter, sans-serif", fontWeight: 800, fontSize: 74, color: "#FAFAF9", letterSpacing: "-0.02em", marginTop: 8 }}>municípios prontos</div>
      <div style={{ fontFamily: "Inter, sans-serif", fontWeight: 500, fontSize: 42, color: "#9aa0aa", marginTop: 22 }}>Qualquer cidade para qualquer cidade.</div>
    </div>
  );
}

function QuoteCard() {
  const { localTime, duration } = useSprite();
  const entry = clamp(localTime / 0.55, 0, 1);
  const exit = clamp((localTime - (duration - 0.4)) / 0.4, 0, 1);
  const e = Easing.easeOutCubic(entry);
  const y = (1 - e) * 120 - exit * 50;
  const priceN = Math.round(interpolate([0.4, 1.7], [0, 4863.64], Easing.easeOutExpo)(localTime) * 100) / 100;
  const price = "R$ " + priceN.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <div style={{ position: "absolute", left: 90, right: 90, top: 560, opacity: e * (1 - exit), transform: `translateY(${y}px)` }}>
      <div style={{ textAlign: "center", fontFamily: "Inter, sans-serif", fontWeight: 800, fontSize: 66, color: "#FAFAF9", letterSpacing: "-0.02em", marginBottom: 44 }}>
        Cotou em <span style={{ color: ORANGE }}>segundos</span>
      </div>
      <div style={{ background: "#fff", borderRadius: 34, padding: "48px 52px", boxShadow: "0 40px 90px -30px rgba(0,0,0,0.6)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ width: 20, height: 20, borderRadius: "50%", background: "#16A34A", boxShadow: "0 0 0 7px rgba(22,163,74,0.15)" }} />
            <span style={{ fontFamily: "Inter, sans-serif", fontWeight: 700, fontSize: 40, color: INK }}>Nova cotação</span>
          </div>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 30, color: "#8A8F98" }}>COT-2025-0481</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 40, fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 38, color: INK }}>
          <span>São Paulo, SP</span>
          <span style={{ flex: 1, height: 2, background: "repeating-linear-gradient(90deg,#C9CCD1 0 8px,transparent 8px 16px)" }} />
          <span>Belo Horizonte, MG</span>
        </div>
        <div style={{ height: 2, background: "rgba(22,24,29,0.1)", margin: "40px 0" }} />
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: 32, color: "#8A8F98" }}>Total do frete</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 76, color: ORANGE, letterSpacing: "-0.02em" }}>{price}</div>
          </div>
          <span style={{ background: "#DCFCE7", color: "#166534", fontFamily: "Inter, sans-serif", fontWeight: 700, fontSize: 34, padding: "16px 28px", borderRadius: 999 }}>Margem 22%</span>
        </div>
      </div>
    </div>
  );
}

window.Reel1Cotacao = Reel1Cotacao;
