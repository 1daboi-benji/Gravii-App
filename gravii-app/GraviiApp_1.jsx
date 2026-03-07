import { useState, useEffect, useRef } from "react";

/* ────────────────────────────────────────────
   SIMPLEX NOISE (compact implementation)
   — My Space 에어브러시 그레인용
──────────────────────────────────────────── */
const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const grad3 = [[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];

function buildPermTable(seed) {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let s = seed;
  for (let i = 255; i > 0; i--) {
    s = (s * 16807 + 0) % 2147483647;
    const j = s % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  const perm = new Uint8Array(512);
  const permMod8 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255];
    permMod8[i] = perm[i] % 8;
  }
  return { perm, permMod8 };
}

function simplex2D(x, y, perm, permMod8) {
  const s = (x + y) * F2;
  const i = Math.floor(x + s);
  const j = Math.floor(y + s);
  const t = (i + j) * G2;
  const X0 = i - t, Y0 = j - t;
  const x0 = x - X0, y0 = y - Y0;
  const i1 = x0 > y0 ? 1 : 0;
  const j1 = x0 > y0 ? 0 : 1;
  const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
  const ii = i & 255, jj = j & 255;

  let n0 = 0, n1 = 0, n2 = 0;
  let t0 = 0.5 - x0*x0 - y0*y0;
  if (t0 > 0) { t0 *= t0; const g = grad3[permMod8[ii + perm[jj]]]; n0 = t0*t0*(g[0]*x0+g[1]*y0); }
  let t1 = 0.5 - x1*x1 - y1*y1;
  if (t1 > 0) { t1 *= t1; const g = grad3[permMod8[ii+i1+perm[jj+j1]]]; n1 = t1*t1*(g[0]*x1+g[1]*y1); }
  let t2 = 0.5 - x2*x2 - y2*y2;
  if (t2 > 0) { t2 *= t2; const g = grad3[permMod8[ii+1+perm[jj+1]]]; n2 = t2*t2*(g[0]*x2+g[1]*y2); }

  return 70 * (n0 + n1 + n2);
}

/* ────────────────────────────────────────────
   GRAIN OVERLAY (범용)
   — seed: 노이즈 패턴 시드
   — scale: 블롭 크기 (높을수록 작은 패턴)
   — darkThreshold / lightThreshold: 명암 경계
   — foldY: 접힘선 위치 (0~1)
──────────────────────────────────────────── */
function GrainOverlay({ opacity = 0.12, seed = 42, scale = 3.5, darkThreshold = 0.38, lightThreshold = 0.62, foldY = 0.48, canvasW = 600, canvasH = 800, fit = "cover", position = "center" }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const offscreen = document.createElement("canvas");
    const ctx = offscreen.getContext("2d");
    const w = canvasW;
    const h = canvasH;
    offscreen.width = w;
    offscreen.height = h;

    const { perm, permMod8 } = buildPermTable(seed);
    const imageData = ctx.createImageData(w, h);
    const data = imageData.data;

    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const idx = (py * w + px) * 4;
        const nx = px / w;
        const ny = py / h;

        const n1 = simplex2D(nx * scale, ny * scale, perm, permMod8);
        const n2 = simplex2D(nx * scale * 2, ny * scale * 2, perm, permMod8) * 0.5;
        const n3 = simplex2D(nx * scale * 4, ny * scale * 4, perm, permMod8) * 0.25;
        const n4 = simplex2D(nx * scale * 8, ny * scale * 8, perm, permMod8) * 0.125;

        let blob = (n1 + n2 + n3 + n4) / 1.875;
        blob = blob * 0.5 + 0.5;

        const grain = Math.random();
        let val;
        if (blob < darkThreshold) {
          val = grain < 0.85 ? 255 : (grain < 0.93 ? 180 + Math.random() * 75 : Math.random() * 80);
        } else if (blob > lightThreshold) {
          val = grain < 0.82 ? 0 : (grain < 0.92 ? Math.random() * 80 : 180 + Math.random() * 75);
        } else {
          const mix = (blob - darkThreshold) / (lightThreshold - darkThreshold);
          val = grain < mix ? (Math.random() * 60) : (200 + Math.random() * 55);
          if (Math.random() < 0.15) val = Math.random() * 255;
        }

        const foldDist = Math.abs(py - h * foldY);
        if (foldDist < 2) {
          val = val * 0.3 + 180 * 0.7;
        } else if (foldDist < 6) {
          val = val * 0.85 + 140 * 0.15;
        }

        data[idx] = val;
        data[idx + 1] = val;
        data[idx + 2] = val;
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    
    if (containerRef.current) {
      const dataUrl = offscreen.toDataURL();
      containerRef.current.style.backgroundImage = `url(${dataUrl})`;
    }
  }, [seed, scale, darkThreshold, lightThreshold, foldY, canvasW, canvasH]);

  return (
    <div ref={containerRef} style={{
      position: "absolute",
      inset: 0,
      pointerEvents: "none",
      zIndex: 1,
      opacity: opacity,
      mixBlendMode: "soft-light",
      transition: "opacity 0.5s ease",
      overflow: "hidden",
      backgroundSize: fit === "tile" ? "auto 100%" : "cover",
      backgroundRepeat: fit === "tile" ? "repeat-x" : "no-repeat",
      backgroundPosition: position,
    }} />
  );
}

/* ────────────────────────────────────────────
   FONTS & GLOBAL RESET
──────────────────────────────────────────── */
const FONTS_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;800;900&family=Archivo+Black&family=Fraunces:ital,wght@0,400;0,700;0,900;1,400&family=Syne:wght@400;700;800&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body { background: #F5F2EB; color: #1A1A1A; -webkit-font-smoothing: antialiased; }

  ::selection {
    background: rgba(0,0,0,0.15);
    color: #1A1A1A;
  }

  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(16px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes fadeInScale {
    from { opacity: 0; transform: scale(0.97); }
    to   { opacity: 1; transform: scale(1); }
  }
  @keyframes subtlePulse {
    0%, 100% { opacity: 0.4; }
    50%      { opacity: 0.7; }
  }
  @keyframes scanLine {
    0%   { top: -2px; }
    100% { top: 100%; }
  }
  @keyframes thermalPulse {
    0%, 100% { opacity: 0.06; }
    50%      { opacity: 0.12; }
  }
`;

const outfit = "'Outfit', sans-serif";
const archivoBlack = "'Archivo Black', sans-serif";
const fraunces = "'Fraunces', serif";
const syne = "'Syne', sans-serif";

/* ────────────────────────────────────────────
   PANEL DATA
──────────────────────────────────────────── */
const PANELS = [
  {
    id: "profile",
    num: "01",
    tab: "PROFILE",
    tagline: "CONNECT YOUR IDENTITY",
    sub: "GRAVII ID",
    editorCopy: "Your identity, distilled.",
    dark: false,
    bg: "#F5F2EB",
    bgHover: "#EDEAE3",
  },
  {
    id: "discovery",
    num: "02",
    tab: "DISCOVERY",
    tagline: "EXPLORE THE UNKNOWN",
    sub: "CAMPAIGNS",
    editorCopy: "Browse what's running.",
    dark: true,
    bg: "#1A1A1A",
    bgHover: "#1F1F1F",
  },
  {
    id: "leaderboard",
    num: "03",
    tab: "LEADERBOARD",
    tagline: "SEE WHERE YOU STAND",
    sub: "RANKING",
    editorCopy: "See where you stand.",
    dark: false,
    bg: "#EDEAE3",
    bgHover: "#1A1A1A",
    hoverDark: true,
  },
  {
    id: "lookup",
    num: "04",
    tab: "X-RAY",
    tagline: "SEARCH THE LEDGER",
    sub: "VERIFY",
    editorCopy: "Peel back any account.",
    dark: false,
    bg: "#F0EDE6",
    bgHover: "#F0EDE6",
    xray: true,
  },
];

/* ────────────────────────────────────────────
   OPACITY HIERARCHY TOKENS
──────────────────────────────────────────── */
const OP = {
  tabName:    "rgba(0,0,0,0.5)",
  num:        "rgba(0,0,0,0.35)",
  code:       "rgba(0,0,0,0.25)",
  tagline:    "rgba(0,0,0,0.4)",
  keyword:    "rgba(0,0,0,0.12)",
  subLabel:   "rgba(0,0,0,0.35)",
  brandMark:  "rgba(0,0,0,0.4)",
  line:       "rgba(0,0,0,0.06)",
  dot:        "rgba(0,0,0,0.1)",
  border:     "rgba(0,0,0,0.12)",
};

const OP_DARK = {
  tabName:    "rgba(255,255,255,0.55)",
  num:        "rgba(255,255,255,0.35)",
  code:       "rgba(255,255,255,0.25)",
  tagline:    "rgba(255,255,255,0.4)",
  keyword:    "rgba(255,255,255,0.1)",
  subLabel:   "rgba(255,255,255,0.35)",
  brandMark:  "rgba(255,255,255,0.4)",
  line:       "rgba(255,255,255,0.08)",
  dot:        "rgba(255,255,255,0.12)",
  border:     "rgba(255,255,255,0.12)",
};

/* ────────────────────────────────────────────
   INFINITE CANVAS — 360° FREE-SCROLL GRID
   Garden Eight /archives 스타일
──────────────────────────────────────────── */
function InfiniteCanvas({ items, dark, connected, activeIndex }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const stateRef = useRef({ scrollX: 0, scrollY: 0, velX: 0, velY: 0, animFrame: null });

  const CARD_W = 360;
  const CARD_H = 260;
  const GAP = 32;
  const COLS = 5;
  const ROWS = Math.ceil(items.length / COLS);
  const GRID_W = COLS * (CARD_W + GAP);
  const GRID_H = ROWS * (CARD_H + GAP);

  const t = dark ? "#F5F2EB" : "#1A1A1A";
  const sub = dark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.35)";
  const cardBg = dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)";
  const cardBorder = dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const accentBorder = "rgba(230,220,250,0.4)";

  useEffect(() => {
    const s = stateRef.current;
    s.scrollX = -GRID_W;
    s.scrollY = -GRID_H;
    if (canvasRef.current) {
      canvasRef.current.style.transform = `translate(${s.scrollX}px, ${s.scrollY}px)`;
    }
  }, []);

  // Wheel → velocity 주입
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e) => {
      e.preventDefault();
      const s = stateRef.current;
      // deltaX/Y 방향 그대로 반영 (trackpad + mouse wheel 모두 지원)
      s.velX += -e.deltaX * 0.1;
      s.velY += -e.deltaY * 0.1;
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Animation loop — 관성 감속만
  useEffect(() => {
    const s = stateRef.current;
    let running = true;

    const tick = () => {
      if (!running) return;

      if (Math.abs(s.velX) > 0.05 || Math.abs(s.velY) > 0.05) {
        s.scrollX += s.velX;
        s.scrollY += s.velY;
        s.velX *= 0.95;
        s.velY *= 0.95;

        // Wrap
        if (s.scrollX > 0) s.scrollX -= GRID_W;
        if (s.scrollX < -2 * GRID_W) s.scrollX += GRID_W;
        if (s.scrollY > 0) s.scrollY -= GRID_H;
        if (s.scrollY < -2 * GRID_H) s.scrollY += GRID_H;

        if (canvasRef.current) {
          canvasRef.current.style.transform = `translate(${s.scrollX}px, ${s.scrollY}px)`;
        }
      }

      s.animFrame = requestAnimationFrame(tick);
    };
    s.animFrame = requestAnimationFrame(tick);
    return () => { running = false; cancelAnimationFrame(s.animFrame); };
  }, [GRID_W, GRID_H]);

  // 3x3 tiled grid for infinite wrap
  const tiles = [];
  for (let ty = 0; ty < 3; ty++) {
    for (let tx = 0; tx < 3; tx++) {
      items.forEach((item, i) => {
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        const x = tx * GRID_W + col * (CARD_W + GAP);
        const y = ty * GRID_H + row * (CARD_H + GAP);
        const isActive = connected && i === activeIndex;
        const ig = item.gradient || ["#ccc","#ddd","#eee"];
        tiles.push(
          <div key={`${tx}-${ty}-${i}`} style={{
            position: "absolute",
            left: x, top: y,
            width: CARD_W, height: CARD_H,
            border: `1px solid ${isActive ? accentBorder : cardBorder}`,
            borderRadius: "16px",
            background: isActive ? (dark ? "rgba(230,220,250,0.06)" : "rgba(230,220,250,0.08)") : cardBg,
            overflow: "hidden",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            cursor: "default",
            transition: "transform 0.25s ease, border-color 0.3s ease, background 0.3s ease",
            userSelect: "none",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.03)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
          >
            {/* Gradient bg */}
            <div style={{
              position: "absolute", inset: 0, opacity: isActive ? 0.15 : 0.06,
              background: `radial-gradient(ellipse at 30% 30%, ${ig[0]} 0%, transparent 60%), radial-gradient(ellipse at 70% 70%, ${ig[1]} 0%, transparent 60%)`,
              transition: "opacity 0.3s ease",
            }} />
            <div style={{
              fontFamily: syne, fontWeight: 800,
              fontSize: "48px",
              color: isActive ? "rgba(230,220,250,0.8)" : t,
              opacity: isActive ? 1 : 0.12 + (i % 4) * 0.08,
              marginBottom: "10px",
              lineHeight: 1,
              position: "relative", zIndex: 1,
            }}>{String(i + 1).padStart(2, "0")}</div>
            <span style={{
              fontFamily: outfit, fontWeight: 700,
              fontSize: "11px",
              color: isActive ? "rgba(230,220,250,0.8)" : sub,
              letterSpacing: "3px",
              textTransform: "uppercase",
              position: "relative", zIndex: 1,
              marginBottom: "6px",
            }}>{item.name}</span>
            {item.desc && (
              <span style={{
                fontFamily: fraunces, fontStyle: "italic",
                fontSize: "10px",
                color: isActive ? "rgba(230,220,250,0.5)" : "rgba(0,0,0,0.2)",
                position: "relative", zIndex: 1,
                maxWidth: "80%", textAlign: "center",
              }}>"{item.desc}"</span>
            )}
          </div>
        );
      });
    }
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        height: "480px",
        overflow: "hidden",
        cursor: "default",
        margin: "0 -60px",
        width: "calc(100% + 120px)",
        borderRadius: 0,
      }}
    >
      {/* Fade edges */}
      <div style={{ position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none",
        background: dark
          ? "linear-gradient(90deg, #1A1A1A 0%, transparent 8%, transparent 92%, #1A1A1A 100%), linear-gradient(180deg, #1A1A1A 0%, transparent 10%, transparent 90%, #1A1A1A 100%)"
          : "linear-gradient(90deg, #F5F2EB 0%, transparent 8%, transparent 92%, #F5F2EB 100%), linear-gradient(180deg, #F5F2EB 0%, transparent 10%, transparent 90%, #F5F2EB 100%)",
      }} />
      <div ref={canvasRef} style={{
        position: "absolute",
        width: GRID_W * 3,
        height: GRID_H * 3,
        willChange: "transform",
      }}>
        {tiles}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────
   EXPANDED CONTENT — PROFILE
──────────────────────────────────────────── */
/* ────────────────────────────────────────────
   PERSONA DATA (20개)
──────────────────────────────────────────── */
const PERSONA_ITEMS = [
  { name: "Steady Earner", desc: "You earn yield the safe way", gradient: ["#4A6FA5","#6B8FCC","#89A8D9"] },
  { name: "Chain Believer", desc: "You stake what you believe in", gradient: ["#7A8B9E","#9EAEC0","#B8C8D8"] },
  { name: "Yield Explorer", desc: "You find yield in unexpected places", gradient: ["#3DA5A0","#5CC4BF","#7EDDD8"] },
  { name: "Fast Mover", desc: "You trade often and move quick", gradient: ["#D4875E","#E8A87C","#F0C4A0"] },
  { name: "Pool Builder", desc: "You fuel the markets", gradient: ["#7E6BAA","#9D8AC4","#BCA9DE"] },
  { name: "Diamond Hands", desc: "You buy and hold with conviction", gradient: ["#3B5998","#5B79B8","#7B99D8"] },
  { name: "Cash Flow King", desc: "You move serious stables regularly", gradient: ["#C47A8A","#D89AAA","#ECBACA"] },
  { name: "Vault Keeper", desc: "You hold massive stable reserves", gradient: ["#4A6FA5","#5A80B6","#7A9FCE"] },
  { name: "Big Believer", desc: "You hold serious conviction bags", gradient: ["#8B6BAA","#A88BC8","#C5ABE6"] },
  { name: "Digital Collector", desc: "You collect at scale", gradient: ["#C4727A","#D8929A","#ECB2BA"] },
  { name: "Quick Flipper", desc: "You move in and out fast", gradient: ["#D4875E","#E09070","#F0A888"] },
  { name: "Sniper", desc: "You buy to sell within hours", gradient: ["#CC7A3E","#E0944E","#F0AE6E"] },
  { name: "Machine Gun", desc: "You transact at insane volume", gradient: ["#C06030","#D47848","#E89868"] },
  { name: "Glitch in the Matrix", desc: "Something doesn't add up", gradient: ["#6E7A8A","#8E9AAA","#AEBACA"] },
  { name: "Chain Hopper", desc: "You move across chains fearlessly", gradient: ["#3DAA7A","#5DC49A","#7DDEBA"] },
  { name: "Drop Chaser", desc: "You chase every opportunity", gradient: ["#8A8A9E","#A0A0B6","#BABACE"] },
  { name: "Sleeping Giant", desc: "Your wallet is resting... for now", gradient: ["#9A9AA8","#B0B0BC","#C8C8D4"] },
  { name: "Fresh Start", desc: "Welcome — your journey begins here", gradient: ["#A8B8C8","#BCC8D8","#D0D8E8"] },
  { name: "Voice of the DAO", desc: "You vote and shape protocols", gradient: ["#7E6BAA","#9480C0","#AA96D6"] },
  { name: "Rising Star", desc: "Your portfolio is exploding", gradient: ["#3DA58A","#50C0A0","#68DAB8"] },
];

/* ────────────────────────────────────────────
   LIQUID GLASS STYLE HELPER
──────────────────────────────────────────── */
const glassStyle = (extraRadius = 20) => ({
  background: "rgba(255,255,255,0.45)",
  backdropFilter: "blur(20px) saturate(1.4)",
  WebkitBackdropFilter: "blur(20px) saturate(1.4)",
  border: "1px solid rgba(255,255,255,0.55)",
  borderRadius: `${extraRadius}px`,
  boxShadow: "0 8px 32px rgba(0,0,0,0.06)",
});

/* ────────────────────────────────────────────
   EXPANDED CONTENT — PROFILE (Liquid Glass Bento)
──────────────────────────────────────────── */
function ProfileContent({ dark, connected, onConnect }) {
  const t = dark ? "#F5F2EB" : "#1A1A1A";
  const sub = dark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)";

  // Mock user data
  const userPersona = 5; // Diamond Hands (index)
  const userAlso = [2, 14]; // Yield Explorer, Chain Hopper
  const userChain = "Ethereum";
  const userChainCount = 4;
  const userStrength = { pct: "Top 15%", cat: "Holding Duration" };
  const userTrend = "+12.4%";
  const userMatched = 4;
  const userTier = "ARCHITECT";
  const userTxCount = "1,247";
  const userActiveSince = "Oct 2023";
  const userNftCount = 12;

  const persona = PERSONA_ITEMS[userPersona];
  const [g0, g1, g2] = persona.gradient;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>

      {/* Mesh gradient 배경 (glass 효과용) */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0,
        background: `
          radial-gradient(ellipse at 15% 25%, rgba(230,220,250,0.18) 0%, transparent 55%),
          radial-gradient(ellipse at 85% 65%, rgba(200,225,245,0.14) 0%, transparent 55%),
          radial-gradient(ellipse at 50% 90%, rgba(220,240,230,0.1) 0%, transparent 50%)
        `,
      }} />

      {/* 카피 한 줄 */}
      <p style={{
        fontFamily: fraunces, fontStyle: "italic", fontSize: "16px",
        color: "rgba(0,0,0,0.35)", marginBottom: "28px",
        animation: "fadeInUp 0.5s ease 0.15s both",
        position: "relative", zIndex: 1,
      }}>Your digital identity, valid everywhere.</p>

      {/* ── BENTO GRID ── */}
      {connected ? (
        <div style={{
          display: "grid",
          gridTemplateColumns: "1.8fr 1fr 1fr",
          gridTemplateRows: "auto auto auto",
          gap: "14px",
          marginBottom: "28px",
          animation: "fadeInUp 0.6s ease 0.25s both",
          position: "relative", zIndex: 1,
        }}>

          {/* ① HERO: Persona Card (spans 2 rows) — 좌: 텍스트 / 우: 비주얼 */}
          <div style={{
            gridRow: "1 / 3",
            ...glassStyle(22),
            overflow: "hidden",
            position: "relative",
            minHeight: "280px",
            display: "flex",
          }}>
            {/* 좌측: 텍스트 정보 */}
            <div style={{ flex: 1, position: "relative", zIndex: 1, padding: "28px", display: "flex", flexDirection: "column" }}>
              <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "13px", color: "rgba(0,0,0,0.5)", letterSpacing: "2.5px", display: "block", marginBottom: "16px" }}>YOUR PERSONA</span>
              <h2 style={{ fontFamily: archivoBlack, fontSize: "26px", color: t, letterSpacing: "0.5px", margin: "0 0 8px", textTransform: "uppercase" }}>{persona.name}</h2>
              <p style={{ fontFamily: fraunces, fontStyle: "italic", fontSize: "14px", color: "rgba(0,0,0,0.45)", margin: "0 0 16px" }}>"{persona.desc}"</p>

              {/* ALSO tags */}
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "auto" }}>
                {userAlso.map(idx => (
                  <span key={idx} style={{
                    fontFamily: outfit, fontWeight: 600, fontSize: "12px", color: "rgba(0,0,0,0.45)",
                    letterSpacing: "1px", padding: "5px 12px",
                    background: "rgba(0,0,0,0.03)", borderRadius: "16px",
                    border: "1px solid rgba(0,0,0,0.05)",
                  }}>{PERSONA_ITEMS[idx].name}</span>
                ))}
              </div>

              {/* Tier badge + Share */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "20px" }}>
                <span style={{
                  fontFamily: outfit, fontWeight: 700, fontSize: "9px", color: "rgba(0,0,0,0.45)",
                  letterSpacing: "2px", padding: "6px 14px",
                  background: "rgba(0,0,0,0.04)", borderRadius: "20px",
                  border: "1px solid rgba(0,0,0,0.06)",
                }}>{userTier}</span>
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    const text = encodeURIComponent(`I'm a ${persona.name} on @Gravii — ${userStrength.pct} in ${userStrength.cat} 💎`);
                    window.open(`https://twitter.com/intent/tweet?text=${text}`, "_blank");
                  }}
                  style={{
                    fontFamily: outfit, fontWeight: 700, fontSize: "9px", color: "#F5F2EB",
                    letterSpacing: "1.5px", padding: "6px 16px",
                    background: "#1A1A1A", borderRadius: "20px",
                    cursor: "pointer", transition: "opacity 0.2s ease",
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = "0.8"}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
                >SHARE ON 𝕏</span>
              </div>
            </div>

            {/* 우측: 페르소나 그라디언트 비주얼 */}
            <div style={{
              width: "50%", minWidth: "200px",
              position: "relative",
              overflow: "hidden",
              borderLeft: "1px solid rgba(255,255,255,0.3)",
            }}>
              {/* Multi-layer gradient blob */}
              <div style={{
                position: "absolute", inset: "-20%",
                background: `
                  radial-gradient(circle at 35% 35%, ${g0} 0%, transparent 50%),
                  radial-gradient(circle at 65% 65%, ${g1} 0%, transparent 50%),
                  radial-gradient(circle at 50% 20%, ${g2} 0%, transparent 45%)
                `,
                opacity: 0.35,
                filter: "blur(30px)",
              }} />
              {/* Noise texture overlay */}
              <div style={{
                position: "absolute", inset: 0,
                background: "radial-gradient(circle at 50% 50%, rgba(255,255,255,0.15) 0%, transparent 70%)",
              }} />
              {/* Center number watermark */}
              <div style={{
                position: "absolute", top: "50%", left: "50%",
                transform: "translate(-50%, -50%)",
                fontFamily: syne, fontWeight: 800,
                fontSize: "120px", color: "rgba(255,255,255,0.12)",
                lineHeight: 1, userSelect: "none",
              }}>{String(userPersona + 1).padStart(2, "0")}</div>
            </div>
          </div>

          {/* ② CHAIN (+ 활동 체인 수) */}
          <div style={{ ...glassStyle(18), padding: "20px" }}>
            <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "13px", color: "rgba(0,0,0,0.5)", letterSpacing: "2px", display: "block", marginBottom: "12px" }}>YOUR GROUND</span>
            <span style={{ fontFamily: syne, fontWeight: 800, fontSize: "24px", color: t }}>{userChain}</span>
            <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "12px", color: "rgba(0,0,0,0.45)", display: "block", marginTop: "6px" }}>across {userChainCount} chains</span>
          </div>

          {/* ③ STANDOUT */}
          <div style={{ ...glassStyle(18), padding: "20px" }}>
            <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "13px", color: "rgba(0,0,0,0.5)", letterSpacing: "2px", display: "block", marginBottom: "12px" }}>STANDOUT</span>
            <span style={{ fontFamily: syne, fontWeight: 800, fontSize: "18px", color: t, display: "block", marginBottom: "4px" }}>{persona.name}</span>
            <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "13px", color: "rgba(0,0,0,0.45)" }}>{userStrength.pct}</span>
          </div>

          {/* ④ TX COUNT (기존 ALSO 자리 좌) */}
          <div style={{ ...glassStyle(18), padding: "20px" }}>
            <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "13px", color: "rgba(0,0,0,0.5)", letterSpacing: "2px", display: "block", marginBottom: "12px" }}>TRANSACTIONS</span>
            <span style={{ fontFamily: syne, fontWeight: 800, fontSize: "24px", color: t }}>{userTxCount}</span>
            <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "12px", color: "rgba(0,0,0,0.45)", display: "block", marginTop: "4px" }}>all-time</span>
          </div>

          {/* ⑤ ACTIVE SINCE (기존 ALSO 자리 우) */}
          <div style={{ ...glassStyle(18), padding: "20px" }}>
            <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "13px", color: "rgba(0,0,0,0.5)", letterSpacing: "2px", display: "block", marginBottom: "12px" }}>ACTIVE SINCE</span>
            <span style={{ fontFamily: syne, fontWeight: 800, fontSize: "24px", color: t }}>{userActiveSince}</span>
            <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "12px", color: "rgba(0,0,0,0.45)", display: "block", marginTop: "4px" }}>on-chain</span>
          </div>

          {/* Row 3: 풀 width — 5등분 */}
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: "14px" }}>
            {/* 30D TREND */}
            <div style={{ flex: 1, ...glassStyle(18), padding: "20px" }}>
              <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "13px", color: "rgba(0,0,0,0.5)", letterSpacing: "2px", display: "block", marginBottom: "12px" }}>30D TREND</span>
              <span style={{ fontFamily: syne, fontWeight: 800, fontSize: "28px", color: "rgba(68,170,136,0.9)" }}>{userTrend}</span>
              <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "12px", color: "rgba(0,0,0,0.45)", display: "block", marginTop: "4px" }}>portfolio</span>
            </div>

            {/* REPUTATION */}
            <div style={{ flex: 1, ...glassStyle(18), padding: "20px" }}>
              <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "13px", color: "rgba(0,0,0,0.5)", letterSpacing: "2px", display: "block", marginBottom: "12px" }}>REPUTATION</span>
              <span style={{ fontFamily: syne, fontWeight: 800, fontSize: "16px", color: t, display: "block", marginBottom: "4px" }}>Trusted</span>
              <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "12px", color: "rgba(0,0,0,0.45)" }}>No flags</span>
            </div>

            {/* NFTs */}
            <div style={{ flex: 1, ...glassStyle(18), padding: "20px" }}>
              <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "13px", color: "rgba(0,0,0,0.5)", letterSpacing: "2px", display: "block", marginBottom: "12px" }}>NFTs</span>
              <span style={{ fontFamily: syne, fontWeight: 800, fontSize: "28px", color: t }}>{userNftCount}</span>
              <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "12px", color: "rgba(0,0,0,0.45)", display: "block", marginTop: "4px" }}>collected</span>
            </div>

            {/* MATCHED */}
            <div style={{ flex: 1, ...glassStyle(18), padding: "20px" }}>
              <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "13px", color: "rgba(0,0,0,0.5)", letterSpacing: "2px", display: "block", marginBottom: "12px" }}>MATCHED</span>
              <span style={{ fontFamily: syne, fontWeight: 800, fontSize: "28px", color: t }}>{userMatched}</span>
              <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "12px", color: "rgba(0,0,0,0.45)", display: "block", marginTop: "4px" }}>campaigns →</span>
            </div>

            {/* X-RAY */}
            <div
              onClick={(e) => { e.stopPropagation(); }}
              style={{
                flex: 1, ...glassStyle(18), padding: "20px",
                cursor: "pointer",
                display: "flex", flexDirection: "column", justifyContent: "space-between",
                transition: "background 0.3s ease",
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.6)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.45)"}
            >
              <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "13px", color: "rgba(0,0,0,0.5)", letterSpacing: "2px", display: "block", marginBottom: "8px" }}>X-RAY</span>
              <p style={{ fontFamily: fraunces, fontStyle: "italic", fontSize: "11px", color: "rgba(0,0,0,0.45)", margin: "0 0 6px", lineHeight: 1.4 }}>
                Dig deeper into your profile
              </p>
              <span style={{
                fontFamily: outfit, fontWeight: 700, fontSize: "10px", color: "#1A1A1A",
                letterSpacing: "1.5px",
              }}>SEARCH →</span>
            </div>
          </div>
        </div>
      ) : (
        /* ── DISCONNECTED: 블러 Bento + SIGN IN 오버레이 ── */
        <div style={{ position: "relative", marginBottom: "28px", animation: "fadeInUp 0.6s ease 0.25s both", zIndex: 1 }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "1.8fr 1fr 1fr",
            gridTemplateRows: "auto auto auto",
            gap: "14px",
            filter: "blur(6px)",
            opacity: 0.5,
          }}>
            <div style={{ gridRow: "1 / 3", ...glassStyle(22), minHeight: "280px", background: "rgba(0,0,0,0.03)" }} />
            <div style={{ ...glassStyle(18), height: "80px", background: "rgba(0,0,0,0.02)" }} />
            <div style={{ ...glassStyle(18), height: "80px", background: "rgba(0,0,0,0.02)" }} />
            <div style={{ ...glassStyle(18), height: "80px", background: "rgba(0,0,0,0.02)" }} />
            <div style={{ ...glassStyle(18), height: "80px", background: "rgba(0,0,0,0.02)" }} />
            <div style={{ gridColumn: "1 / -1", display: "flex", gap: "14px" }}>
              <div style={{ flex: 1, ...glassStyle(18), height: "90px", background: "rgba(0,0,0,0.02)" }} />
              <div style={{ flex: 1, ...glassStyle(18), height: "90px", background: "rgba(0,0,0,0.02)" }} />
              <div style={{ flex: 1, ...glassStyle(18), height: "90px", background: "rgba(0,0,0,0.02)" }} />
              <div style={{ flex: 1, ...glassStyle(18), height: "90px", background: "rgba(0,0,0,0.02)" }} />
              <div style={{ flex: 1, ...glassStyle(18), height: "90px", background: "rgba(0,0,0,0.02)" }} />
            </div>
          </div>
          {/* SIGN IN overlay */}
          <div
            onClick={(e) => { e.stopPropagation(); onConnect(); }}
            style={{
              position: "absolute", top: "50%", left: "50%",
              transform: "translate(-50%, -50%)",
              ...glassStyle(22),
              background: "rgba(255,255,255,0.75)",
              padding: "24px 40px",
              textAlign: "center",
              cursor: "pointer",
              zIndex: 2,
            }}
          >
            <div style={{ fontFamily: fraunces, fontSize: "28px", fontWeight: 900, color: t, opacity: 0.08, marginBottom: "8px" }}>?</div>
            <p style={{ fontFamily: outfit, fontWeight: 700, fontSize: "12px", color: "rgba(0,0,0,0.45)", letterSpacing: "3px", margin: 0 }}>SIGN IN TO REVEAL</p>
          </div>
        </div>
      )}

      {/* ── 하단: 360° 무한 스크롤 캔버스 ── */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", animation: "fadeInScale 0.8s ease 0.6s both", position: "relative", zIndex: 1 }}>
        <InfiniteCanvas items={PERSONA_ITEMS} dark={dark} connected={connected} activeIndex={userPersona} />
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────
   EXPANDED CONTENT — MY SPACE
──────────────────────────────────────────── */
function MySpaceContent({ dark, connected, onConnect }) {
  const t = dark ? "#F5F2EB" : "#1A1A1A";
  const sub = dark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)";
  const cardBg = dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)";
  const cardBorder = dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)";
  const accent = "rgba(230,220,250,0.8)";

  const deals = [
    { label: "EXCLUSIVE DISCOUNT", protocol: "Partner Alpha", value: "—12%", delay: "0.5s" },
    { label: "YIELD BOOST", protocol: "Partner Beta", value: "+0.8%", delay: "0.6s" },
    { label: "EARLY ACCESS", protocol: "Partner Gamma", value: "INVITED", delay: "0.7s" },
  ];

  return (
    <div>
      <p style={{ fontFamily: fraunces, fontSize: "28px", fontWeight: 700, color: t, lineHeight: 1.4, marginBottom: "16px", animation: "fadeInUp 0.6s ease 0.3s both" }}>
        A curation service<br />that finds you first.
      </p>
      <p style={{ fontFamily: outfit, fontWeight: 400, fontSize: "15px", color: sub, lineHeight: 1.7, marginBottom: "40px", maxWidth: "520px", animation: "fadeInUp 0.6s ease 0.45s both" }}>
        Gravii's engine analyzes your preferences to intuitively place only the most essential benefits in My Space.
      </p>

      <div style={{ position: "relative" }}>
        <div style={{
          display: "flex", flexDirection: "column", boxShadow: "inset 0 0 30px rgba(0,0,0,0.08)", gap: "12px",
          filter: connected ? "blur(0)" : "blur(5px)",
          opacity: connected ? 1 : 0.6,
          transition: "filter 0.5s ease, opacity 0.5s ease",
        }}>
          {deals.map((deal) => (
            <div key={deal.label} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "20px 24px", border: `1px solid ${cardBorder}`, borderRadius: "10px",
              background: cardBg, animation: `fadeInUp 0.6s ease ${deal.delay} both`,
            }}>
              <div>
                <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "13px", color: t, letterSpacing: "2px", display: "block", marginBottom: "4px" }}>{deal.label}</span>
                <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "12px", color: sub }}>{deal.protocol}</span>
              </div>
              <span style={{ fontFamily: syne, fontWeight: 800, fontSize: "18px", color: accent }}>{deal.value}</span>
            </div>
          ))}
        </div>

        {!connected && (
          <div onClick={(e) => { e.stopPropagation(); onConnect(); }} style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", transition: "opacity 0.5s ease", cursor: "pointer" }}>
            <div style={{
              padding: "16px 32px",
              background: dark ? "rgba(26,26,26,0.9)" : "rgba(245,242,235,0.9)",
              border: `1px solid ${dark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"}`,
              borderRadius: "8px",
            }}>
              <p style={{ fontFamily: outfit, fontWeight: 700, fontSize: "12px", color: t, letterSpacing: "3px" }}>SIGN IN TO SEE YOUR DEALS</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────
   EXPANDED CONTENT — DISCOVERY (DARK)
──────────────────────────────────────────── */
function DiscoveryContent({ dark, connected, onConnect }) {
  const t = "#F5F2EB";
  const sub = "rgba(255,255,255,0.5)";
  const cardBorder = "rgba(255,255,255,0.1)";

  const campaigns = [
    { name: "CAMPAIGN ALPHA", status: "ACTIVE", tier: "ARCHITECT+", delay: "0.5s" },
    { name: "MISSION BETA", status: "COMING SOON", tier: "ALL TIERS", delay: "0.6s" },
    { name: "REWARD GAMMA", status: "ACTIVE", tier: "VISIONARY", delay: "0.7s" },
    { name: "ACCESS DELTA", status: "LOCKED", tier: "BUILDER+", delay: "0.8s" },
  ];

  return (
    <div>
      <p style={{ fontFamily: fraunces, fontSize: "28px", fontWeight: 700, color: t, lineHeight: 1.4, marginBottom: "16px", animation: "fadeInUp 0.6s ease 0.3s both" }}>
        Unlock missions<br />designed for your rank.
      </p>
      <p style={{ fontFamily: outfit, fontWeight: 400, fontSize: "15px", color: sub, lineHeight: 1.7, marginBottom: "40px", maxWidth: "520px", animation: "fadeInUp 0.6s ease 0.45s both" }}>
        Various projects host unique campaigns with multi-layered access. Based on your digital footprints, unlock exclusive opportunities.
      </p>
      <div style={{ position: "relative" }}>
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px",
          filter: connected ? "blur(0)" : "blur(5px)",
          opacity: connected ? 1 : 0.6,
          transition: "filter 0.5s ease, opacity 0.5s ease",
        }}>
          {campaigns.map((c) => (
            <div key={c.name} style={{
              padding: "20px", border: `1px solid ${cardBorder}`, borderRadius: "10px",
              background: "rgba(255,255,255,0.04)", animation: `fadeInUp 0.6s ease ${c.delay} both`,
            }}>
              <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "12px", color: t, letterSpacing: "1px", display: "block", marginBottom: "8px" }}>{c.name}</span>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "10px", color: sub, letterSpacing: "1px" }}>{c.status}</span>
                <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "10px", color: "rgba(230,220,250,0.6)", letterSpacing: "1px" }}>{c.tier}</span>
              </div>
            </div>
          ))}
        </div>
        {!connected && (
          <div onClick={(e) => { e.stopPropagation(); onConnect(); }} style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <div style={{ padding: "16px 32px", background: "rgba(26,26,26,0.9)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "8px" }}>
              <p style={{ fontFamily: outfit, fontWeight: 700, fontSize: "12px", color: "#F5F2EB", letterSpacing: "3px" }}>SIGN IN TO UNLOCK</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────
   EXPANDED CONTENT — LOOK UP
──────────────────────────────────────────── */
function LookUpContent({ dark, connected, onConnect }) {
  const t = dark ? "#F5F2EB" : "#1A1A1A";
  const sub = dark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)";
  const cardBg = dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)";
  const cardBorder = dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)";

  return (
    <div>
      <p style={{ fontFamily: fraunces, fontSize: "28px", fontWeight: 700, color: t, lineHeight: 1.4, marginBottom: "16px", animation: "fadeInUp 0.6s ease 0.3s both" }}>
        Search the ledger.<br />Verify the source.
      </p>
      <p style={{ fontFamily: outfit, fontWeight: 400, fontSize: "15px", color: sub, lineHeight: 1.7, marginBottom: "40px", maxWidth: "520px", animation: "fadeInUp 0.6s ease 0.45s both" }}>
        Pay with stablecoin to analyze any wallet address through the Gravii intelligence layer. All transactions are final.
      </p>
      <div>
          <div style={{
            display: "flex", alignItems: "center", gap: "12px",
            padding: "16px 20px", border: `1px solid ${cardBorder}`, borderRadius: "10px",
            background: cardBg, marginBottom: "20px", animation: "fadeInUp 0.6s ease 0.55s both",
          }}>
            <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "14px", color: sub, flex: 1 }}>0x000...enter wallet address</span>
            <span style={{
              fontFamily: outfit, fontWeight: 700, fontSize: "11px", color: connected ? t : sub, letterSpacing: "2px",
              padding: "8px 20px", background: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", borderRadius: "6px",
              opacity: connected ? 1 : 0.5,
              cursor: connected ? "pointer" : "default",
            }}>{connected ? "ANALYZE" : "SIGN IN TO SEARCH"}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", animation: "fadeInUp 0.6s ease 0.65s both" }}>
            {[
              { label: "COST", value: "0.1 USDC" },
              { label: "DEPTH", value: "FULL CHAIN" },
              { label: "SPEED", value: "< 30 SEC" },
            ].map(s => (
              <div key={s.label} style={{
                padding: "16px", border: `1px solid ${cardBorder}`, borderRadius: "10px",
                background: cardBg, textAlign: "center",
              }}>
                <div style={{ fontFamily: syne, fontWeight: 800, fontSize: "16px", color: t, marginBottom: "4px" }}>{s.value}</div>
                <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "10px", color: sub, letterSpacing: "2px" }}>{s.label}</span>
              </div>
            ))}
          </div>
          {!connected && (
            <div onClick={(e) => { e.stopPropagation(); onConnect(); }} style={{ marginTop: "20px", textAlign: "center", cursor: "pointer", animation: "fadeInUp 0.6s ease 0.75s both" }}>
              <p style={{ fontFamily: outfit, fontWeight: 700, fontSize: "12px", color: sub, letterSpacing: "3px" }}>SIGN IN TO START ANALYZING</p>
            </div>
          )}
      </div>
    </div>
  );
}

function LeaderboardContent({ dark, connected, onConnect }) {
  const t = dark ? "#F5F2EB" : "#1A1A1A";
  const sub = dark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)";
  const cardBorder = dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)";
  const cardBg = dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)";
  return (
    <div>
      <p style={{ fontFamily: fraunces, fontSize: "28px", fontWeight: 700, color: t, lineHeight: 1.4, marginBottom: "16px", animation: "fadeInUp 0.5s ease 0.2s both" }}>See where you stand.</p>
      <p style={{ fontFamily: outfit, fontWeight: 400, fontSize: "15px", color: sub, lineHeight: 1.7, marginBottom: "28px", maxWidth: "520px", animation: "fadeInUp 0.5s ease 0.3s both" }}>Real-time behavioral rankings updated daily.</p>
      <div style={{ padding: "20px 24px", borderRadius: "10px", border: connected ? `1px solid ${cardBorder}` : `1px dashed ${cardBorder}`, background: cardBg, marginBottom: "24px", animation: "fadeInUp 0.5s ease 0.35s both" }}>
        {connected ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
            <div><span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "10px", color: sub, letterSpacing: "2px", display: "block", marginBottom: "6px" }}>YOU</span><span style={{ fontFamily: syne, fontWeight: 800, fontSize: "20px", color: t }}>Messi</span></div>
            <div><span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "10px", color: sub, letterSpacing: "2px", display: "block", marginBottom: "6px" }}>TOP CATEGORY</span><span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "14px", color: "rgba(230,220,250,0.8)" }}>Power User</span></div>
            <div><span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "10px", color: sub, letterSpacing: "2px", display: "block", marginBottom: "6px" }}>LABELS</span><span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "12px", color: sub }}>Top Spender, Early Adopter, Trend Setter</span></div>
          </div>
        ) : (
          <div onClick={(e) => { e.stopPropagation(); onConnect(); }} style={{ textAlign: "center", cursor: "pointer", padding: "12px 0" }}>
            <p style={{ fontFamily: outfit, fontWeight: 700, fontSize: "12px", color: sub, letterSpacing: "3px" }}>SIGN IN TO SEE YOUR RANK</p>
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "20px", animation: "fadeInUp 0.5s ease 0.4s both" }}>
        {["Top Movers", "Power Users", "High Volume", "Rising Stars", "Trendsetters", "Most Active"].map((cat, i) => (
          <span key={cat} style={{ fontFamily: outfit, fontWeight: 700, fontSize: "10px", color: i === 0 ? "#1A1A1A" : sub, background: i === 0 ? "rgba(230,220,250,0.8)" : (dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"), padding: "6px 14px", borderRadius: "4px", letterSpacing: "1px", cursor: "pointer" }}>{cat}</span>
        ))}
      </div>
      <div style={{ animation: "fadeInUp 0.5s ease 0.45s both" }}>
        <div style={{ display: "grid", gridTemplateColumns: "50px 80px 1fr 1fr 80px", gap: "8px", padding: "10px 16px", marginBottom: "4px", background: cardBg, borderRadius: "8px" }}>
          {["#", "TIER", "NAME", "ID", "CHANGE"].map(h => (<span key={h} style={{ fontFamily: outfit, fontWeight: 700, fontSize: "9px", color: sub, letterSpacing: "2px" }}>{h}</span>))}
        </div>
        {connected && (
          <div style={{ display: "grid", gridTemplateColumns: "50px 80px 1fr 1fr 80px", gap: "8px", padding: "12px 16px", marginBottom: "4px", border: "1px solid rgba(230,220,250,0.3)", borderRadius: "8px", background: "rgba(230,220,250,0.06)" }}>
            <span style={{ fontFamily: syne, fontWeight: 800, fontSize: "14px", color: "rgba(230,220,250,0.8)" }}>56K</span>
            <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "11px", color: "rgba(230,220,250,0.8)" }}>Gold</span>
            <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "13px", color: t }}>Messi (You)</span>
            <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "13px", color: sub }}>xxx...2fxx</span>
            <span style={{ fontFamily: syne, fontWeight: 800, fontSize: "13px", color: "rgba(100,200,100,0.8)" }}>—</span>
          </div>
        )}
        <div>
          {[{ rank: "1", tier: "Diamond", name: "Benji", id: "xxx...sfxx", change: "+1", up: true }, { rank: "2", tier: "Diamond", name: "Diddy", id: "xxx...pxxx", change: "-1", up: false }, { rank: "3", tier: "Platinum", name: "Satoshi", id: "xxx...a1b2", change: "+3", up: true }].map(r => (
            <div key={r.rank} style={{ display: "grid", gridTemplateColumns: "50px 80px 1fr 1fr 80px", gap: "8px", padding: "12px 16px", marginBottom: "4px", border: `1px solid ${cardBorder}`, borderRadius: "8px" }}>
              <span style={{ fontFamily: syne, fontWeight: 800, fontSize: "14px", color: t }}>{r.rank}</span>
              <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "11px", color: sub }}>{r.tier}</span>
              <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "13px", color: sub }}>{r.name}</span>
              <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "13px", color: sub }}>{r.id}</span>
              <span style={{ fontFamily: syne, fontWeight: 800, fontSize: "13px", color: r.up ? "rgba(100,200,100,0.8)" : "rgba(200,100,100,0.8)" }}>{r.change}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const CONTENT_MAP = {
  profile: ProfileContent,
  myspace: MySpaceContent,
  discovery: DiscoveryContent,
  lookup: LookUpContent,
  leaderboard: LeaderboardContent,
};

/* ────────────────────────────────────────────
   MAIN COMPONENT
──────────────────────────────────────────── */
export default function GraviiApp() {
  const [activePanel, setActivePanel] = useState(null);
  const [hoveredPanel, setHoveredPanel] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  const handleClick = (id) => {
    setActivePanel(activePanel === id ? null : id);
  };

  return (
    <div style={{ height: "100vh", overflow: "hidden", background: "#F5F2EB", display: "flex", flexDirection: "column", boxShadow: "inset 0 0 30px rgba(0,0,0,0.08)"}}>
      <style>{FONTS_CSS}</style>

      {/* Minimal top bar */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "16px 24px", background: "#F5F2EB",
        flexShrink: 0,
        position: "relative",
        zIndex: 20,
        boxShadow: "0 8px 16px -6px rgba(0,0,0,0.1)",
      }}>
        <span style={{
          fontFamily: archivoBlack, fontSize: "13px", color: "#1A1A1A",
          letterSpacing: "3px", opacity: 0.6,
        }}>GRAVII</span>
        <span
          onClick={(e) => { e.stopPropagation(); setIsConnected(!isConnected); }}
          style={{
            fontFamily: outfit, fontWeight: 700, fontSize: "11px",
            color: "#1A1A1A", opacity: isConnected ? 0.7 : 0.4, letterSpacing: "2px",
            cursor: "pointer",
            padding: "6px 14px",
            border: isConnected ? "1px solid rgba(0,0,0,0.2)" : "none",
            borderRadius: "4px",
            transition: "all 0.3s ease",
          }}
        >{isConnected ? "SIGN OUT" : "SIGN IN"}</span>
      </div>

      <div style={{
        display: "flex",
        height: activePanel === "myspace" ? "0px" : (activePanel ? "calc(100vh - 48px - 60px)" : "calc(100vh - 48px - 234px)"),
        overflow: "hidden",
        transition: "height 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
        position: "relative",
        boxShadow: "0 8px 20px -6px rgba(0,0,0,0.15)",
      }}>
        {PANELS.map((panel, idx) => {
          const isActive = activePanel === panel.id;
          const isCollapsed = activePanel !== null && !isActive;
          const isHovered = hoveredPanel === panel.id && !isActive;
          const isDark = panel.dark;
          // Discovery: hover 또는 expanded 시 다크 토큰
          const usesDarkTokens = isDark || ((isHovered || isActive) && panel.hoverDark);
          const op = usesDarkTokens ? OP_DARK : OP;

          const bg = panel.bg;
          // Discovery expanded → 다크 배경
          const activeBg = panel.hoverDark ? "#1A1A1A" : bg;
          const borderColor = usesDarkTokens ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.1)";

          const ExpandedContent = CONTENT_MAP[panel.id];

          return (
            <div
              key={panel.id}
              onClick={() => { if (!isActive) handleClick(panel.id); }}
              onMouseEnter={() => setHoveredPanel(panel.id)}
              onMouseLeave={() => setHoveredPanel(null)}
              style={{
                flex: isActive ? 8 : isCollapsed ? 0.8 : 2.5,
                height: "100%",
                borderRight: (idx < PANELS.length - 1 && !isActive) ? `1px solid ${usesDarkTokens ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.18)"}` : "none",
                position: "relative",
                overflow: "hidden",
                cursor: "pointer",
                transition: "flex 0.6s cubic-bezier(0.4, 0, 0.2, 1), background 0.4s ease, box-shadow 0.4s ease",
                background: isActive ? activeBg : isHovered ? panel.bgHover : bg,
                boxShadow: isActive ? "none" : (usesDarkTokens
                  ? "inset 12px 0 20px -8px rgba(0,0,0,0.5), inset -12px 0 20px -8px rgba(0,0,0,0.5), inset 0 12px 20px -8px rgba(0,0,0,0.4), inset 0 -12px 20px -8px rgba(0,0,0,0.4)"
                  : "inset 12px 0 20px -8px rgba(0,0,0,0.12), inset -12px 0 20px -8px rgba(0,0,0,0.12), inset 0 12px 20px -8px rgba(0,0,0,0.08), inset 0 -12px 20px -8px rgba(0,0,0,0.08)"),
              }}
            >
              {/* My Space grain — 항상 표시 */}
              {panel.id === "discovery" && (
                <GrainOverlay
                  opacity={isActive ? 0.09 : 0.16}
                  seed={42}
                  scale={3.5}
                  darkThreshold={0.38}
                  lightThreshold={0.62}
                  foldY={0.48}
                />
              )}

              {/* === COLLAPSED / DEFAULT === */}
              <div style={{
                position: "absolute", inset: 0,
                opacity: isActive ? 0 : 1,
                transition: "opacity 0.4s ease",
                pointerEvents: isActive ? "none" : "auto",
                display: "flex", flexDirection: "column", boxShadow: "inset 0 0 30px rgba(0,0,0,0.08)",
                zIndex: 2,
                overflow: "hidden",
              }}>
                {/* ── 공통: 번호 좌상단 ── */}
                <div style={{ padding: "20px 20px 0", position: "relative", zIndex: 3 }}>
                  <span style={{
                    fontFamily: outfit, fontWeight: 700, fontSize: "16px",
                    color: (panel.xray && isHovered) ? "rgba(255,170,50,0.3)"
                      : isHovered ? (usesDarkTokens ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.55)")
                      : op.num,
                    letterSpacing: "2px", transition: "color 0.35s ease",
                  }}>{panel.num}/05</span>
                </div>

                {/* ── 공통: 에디터 카피 (하단 고정) ── */}
                {!isCollapsed && panel.editorCopy && (
                  <div style={{
                    position: "absolute", bottom: "max(48px, 12%)", left: "50%",
                    transform: "translateX(-50%)",
                    whiteSpace: "nowrap", zIndex: 3,
                  }}>
                    <span style={{
                      fontFamily: fraunces, fontStyle: "italic", fontSize: "26px",
                      color: (panel.xray && isHovered) ? "rgba(255,170,50,0.45)"
                        : isHovered ? (usesDarkTokens ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.6)")
                        : usesDarkTokens ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.4)",
                      transition: "color 0.35s ease",
                    }}>"{panel.editorCopy}"</span>
                  </div>
                )}

                {/* ══════════════════════════════
                   PROFILE — 대각선 반복 텍스트 벽 + 하단 초대형 이름
                   "벽에 스프레이로 쓴" 느낌
                ══════════════════════════════ */}
                {panel.id === "profile" && !isCollapsed && (<>
                  <div style={{
                    position: "absolute", top: "50%", left: "50%",
                    transform: "translate(-50%, -50%) rotate(90deg)",
                    whiteSpace: "nowrap",
                  }}>
                    <span style={{
                      fontFamily: archivoBlack,
                      fontSize: "clamp(38px, 5.2vw, 58px)",
                      color: isHovered ? (usesDarkTokens ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.65)") : op.tabName,
                      letterSpacing: "-1px",
                      transition: "color 0.35s ease",
                    }}>PROFILE</span>
                  </div>
                </>)}
                {panel.id === "profile" && isCollapsed && (
                  <div style={{
                    position: "absolute", top: "50%", left: "50%",
                    transform: "translate(-50%, -50%) rotate(90deg)",
                    whiteSpace: "nowrap",
                  }}>
                    <span style={{
                      fontFamily: archivoBlack, fontSize: "14px",
                      color: op.tabName, letterSpacing: "4px",
                      transition: "color 0.4s ease",
                    }}>PROFILE</span>
                  </div>
                )}

                {/* ══════════════════════════════
                   DISCOVERY — 세로 키워드 벽(좌) + 우측 초대형 이름
                   hover→dark 전환 시 드라마틱
                ══════════════════════════════ */}
                {panel.id === "discovery" && !isCollapsed && (<>
                  <div style={{
                    position: "absolute", top: "50%", left: "50%",
                    transform: "translate(-50%, -50%) rotate(90deg)",
                    whiteSpace: "nowrap",
                  }}>
                    <span style={{
                      fontFamily: archivoBlack,
                      fontSize: "clamp(32px, 4.4vw, 48px)",
                      color: isHovered ? "rgba(255,255,255,0.7)" : op.tabName,
                      letterSpacing: "-1px",
                      transition: "color 0.35s ease",
                    }}>DISCOVERY</span>
                  </div>
                </>)}
                {panel.id === "discovery" && isCollapsed && (
                  <div style={{
                    position: "absolute", top: "50%", left: "50%",
                    transform: "translate(-50%, -50%) rotate(90deg)",
                    whiteSpace: "nowrap",
                  }}>
                    <span style={{
                      fontFamily: archivoBlack, fontSize: "13px",
                      color: op.tabName, letterSpacing: "4px",
                      transition: "color 0.4s ease",
                    }}>DISCOVERY</span>
                  </div>
                )}

                {/* ══════════════════════════════
                   LOOK UP — 가로 반복 코드 벽(하단) + 상단 초대형 이름
                   Profile과 대칭 (Profile=하단 이름, LookUp=상단 이름)
                ══════════════════════════════ */}
                {panel.id === "lookup" && !isCollapsed && (<>
                  {/* X-RAY Thermal 오버레이 */}
                  {isHovered && (
                    <div style={{
                      position: "absolute", inset: 0, zIndex: 2,
                      background: "#000",
                      transition: "opacity 0.4s ease",
                      pointerEvents: "none",
                    }}>
                      {/* 앰버 글로우 — 중앙 */}
                      <div style={{
                        position: "absolute", top: "45%", left: "50%",
                        transform: "translate(-50%, -50%)",
                        width: "60%", height: "50%",
                        background: "radial-gradient(ellipse, rgba(255,160,40,0.07) 0%, transparent 70%)",
                        animation: "thermalPulse 4s ease-in-out infinite",
                      }} />
                      {/* 미세 노이즈 그리드 */}
                      {[20, 40, 60, 80].map(p => (
                        <div key={p} style={{
                          position: "absolute", left: 0, right: 0, top: `${p}%`,
                          height: "1px", background: "rgba(255,160,40,0.03)",
                        }} />
                      ))}
                    </div>
                  )}
                  {/* 탭 이름 */}
                  <div style={{
                    position: "absolute", top: "50%", left: "50%",
                    transform: "translate(-50%, -50%)",
                    whiteSpace: "nowrap", zIndex: 3,
                  }}>
                    <span style={{
                      fontFamily: archivoBlack,
                      fontSize: "clamp(45px, 4.5vw, 60px)",
                      color: isHovered ? "rgba(255,170,50,0.9)" : op.tabName,
                      letterSpacing: "-1px",
                      transition: "color 0.35s ease, text-shadow 0.35s ease",
                      textShadow: isHovered ? "0 0 40px rgba(255,140,30,0.3), 0 0 80px rgba(255,120,20,0.1)" : "none",
                    }}>X-RAY</span>
                  </div>
                </>)}
                {panel.id === "lookup" && isCollapsed && (
                  <div style={{
                    position: "absolute", top: "50%", left: "50%",
                    transform: "translate(-50%, -50%) rotate(90deg)",
                    whiteSpace: "nowrap",
                  }}>
                    <span style={{
                      fontFamily: archivoBlack, fontSize: "14px",
                      color: op.tabName, letterSpacing: "4px",
                      transition: "color 0.4s ease",
                    }}>X-RAY</span>
                  </div>
                )}

                {/* LEADERBOARD */}
                {panel.id === "leaderboard" && !isCollapsed && (<>
                  <div style={{
                    position: "absolute", top: "50%", left: "50%",
                    transform: "translate(-50%, -50%) rotate(90deg)",
                    whiteSpace: "nowrap",
                  }}>
                    <span style={{
                      fontFamily: archivoBlack,
                      fontSize: "clamp(32px, 4.5vw, 50px)",
                      color: isHovered ? (usesDarkTokens ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.65)") : op.tabName,
                      letterSpacing: "-1px",
                      transition: "color 0.35s ease",
                    }}>LEADERBOARD</span>
                  </div>
                </>)}
                {panel.id === "leaderboard" && isCollapsed && (
                  <div style={{
                    position: "absolute", top: "50%", left: "50%",
                    transform: "translate(-50%, -50%) rotate(90deg)",
                    whiteSpace: "nowrap",
                  }}>
                    <span style={{
                      fontFamily: archivoBlack, fontSize: "13px",
                      color: op.tabName, letterSpacing: "4px",
                      transition: "color 0.4s ease",
                    }}>LEADERBOARD</span>
                  </div>
                )}

                {/* ── 공통: 하단 GRAVII 마크 ── */}
                <div style={{ position: "absolute", bottom: "20px", left: "20px" }}>
                  <span style={{
                    fontFamily: outfit, fontWeight: 700, fontSize: "11px",
                    color: (panel.xray && isHovered) ? "rgba(255,170,50,0.3)"
                      : isHovered ? (usesDarkTokens ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.6)")
                      : op.brandMark,
                    letterSpacing: "3px",
                    transition: "color 0.35s ease",
                  }}>GRAVII</span>
                </div>

                {/* Discovery scan line */}
                {panel.dark && !isCollapsed && (
                  <div style={{ position: "absolute", left: 0, right: 0, height: "1px", background: "rgba(255,255,255,0.04)", animation: "scanLine 8s linear infinite" }} />
                )}
              </div>

              {/* === EXPANDED === */}
              {isActive && (
                <div style={{
                  position: "absolute", inset: 0, padding: "40px 60px",
                  display: "flex", flexDirection: "column", boxShadow: "inset 0 0 30px rgba(0,0,0,0.08)", overflow: "auto",
                  zIndex: 2,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "32px", animation: "fadeInUp 0.5s ease 0.15s both" }}>
                    <div>
                      <span style={{
                        fontFamily: outfit, fontWeight: 400, fontSize: "12px",
                        color: usesDarkTokens ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)",
                        letterSpacing: "2px", display: "block", marginBottom: "8px",
                      }}>{panel.num}/05</span>
                      <h1 style={{
                        fontFamily: archivoBlack, fontSize: "clamp(32px, 3.5vw, 48px)",
                        color: usesDarkTokens ? "#F5F2EB" : "#1A1A1A",
                        textTransform: "uppercase", letterSpacing: "-1px", margin: 0,
                      }}>{panel.tab}</h1>
                    </div>
                    <span
                      onClick={(e) => { e.stopPropagation(); setActivePanel(null); }}
                      style={{
                        fontFamily: outfit, fontWeight: 700, fontSize: "11px",
                        color: usesDarkTokens ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)",
                        letterSpacing: "2px", cursor: "pointer", padding: "8px 16px",
                        border: `1px solid ${usesDarkTokens ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)"}`,
                        borderRadius: "4px", transition: "background 0.2s ease",
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = usesDarkTokens ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >CLOSE ×</span>
                  </div>

                  <div style={{ height: "1px", background: usesDarkTokens ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)", marginBottom: "36px", animation: "fadeInUp 0.5s ease 0.2s both" }} />

                  <div style={{ flex: 1 }}>
                    <ExpandedContent dark={usesDarkTokens} connected={isConnected} onConnect={() => setIsConnected(true)} />
                  </div>

                  <div style={{
                    marginTop: "40px", paddingTop: "16px",
                    borderTop: `1px solid ${usesDarkTokens ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
                    display: "flex", justifyContent: "space-between",
                    animation: "fadeInUp 0.5s ease 0.8s both",
                  }}>
                    <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "11px", color: usesDarkTokens ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.25)", letterSpacing: "2px" }}>GRAVII — {panel.sub}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── LEADERBOARD 하단 바 ── */}
      <div
        onClick={() => { if (activePanel !== "myspace") handleClick("myspace"); }}
        onMouseEnter={() => setHoveredPanel("myspace")}
        onMouseLeave={() => setHoveredPanel(null)}
        style={{
          height: activePanel === "myspace" ? "calc(100vh - 48px)" : (activePanel && activePanel !== "myspace") ? "60px" : "234px",
          background: "#1A1A1A",
          borderTop: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          cursor: "pointer",
          transition: "height 0.6s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.4s ease",
          overflow: "hidden",
          position: "relative",
          zIndex: 6,
          boxShadow: activePanel === "myspace" ? "none" : "inset 0 12px 20px -8px rgba(0,0,0,0.6), inset 12px 0 20px -8px rgba(0,0,0,0.4), inset -12px 0 20px -8px rgba(0,0,0,0.4), inset 0 -12px 20px -8px rgba(0,0,0,0.4)",
        }}
      >
        {/* 상단 엣지 라인 — 호버 시 페이드인 */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: "1px",
          background: "linear-gradient(90deg, transparent 10%, rgba(220,210,245,0.35) 50%, transparent 90%)",
          opacity: hoveredPanel === "myspace" && activePanel !== "myspace" ? 1 : 0,
          transition: "opacity 0.35s ease",
          zIndex: 3,
          pointerEvents: "none",
        }} />
        {/* Grain overlay — My Space와 동일 */}
        <GrainOverlay
          opacity={activePanel === "myspace" ? 0.09 : 0.16}
          seed={42}
          scale={3.5}
          darkThreshold={0.38}
          lightThreshold={0.62}
          foldY={0.48}
          canvasW={600}
          canvasH={800}
          fit="tile"
          position="center"
        />

        {/* Collapsed view */}
        {(() => {
          const isSmall = activePanel && activePanel !== "myspace";
          const isMySpaceHovered = hoveredPanel === "myspace" && activePanel !== "myspace";
          return (
            <div style={{
              position: "absolute", inset: 0,
              display: "flex", flexDirection: isSmall ? "row" : "column", alignItems: "center", justifyContent: "center",
              gap: isSmall ? "12px" : "0",
              opacity: activePanel === "myspace" ? 0 : 1,
              transition: "opacity 0.3s ease",
              zIndex: 2,
            }}>
              <span style={{
                fontFamily: archivoBlack,
                fontSize: isSmall ? "14px" : "54px",
                color: isMySpaceHovered ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.55)",
                letterSpacing: isSmall ? "4px" : "6px",
                transition: "font-size 0.4s ease, letter-spacing 0.4s ease, color 0.35s ease",
              }}>MY SPACE</span>
              {!isSmall && (
                <span style={{
                  fontFamily: fraunces, fontStyle: "italic", fontSize: "26px",
                  color: "rgba(255,255,255,0.3)",
                  marginTop: "8px",
                }}>"Handpicked for your profile."</span>
              )}
            </div>
          );
        })()}

        {/* Expanded view */}
        {activePanel === "myspace" && (
          <div style={{
            position: "absolute", inset: 0, padding: "40px 60px",
            display: "flex", flexDirection: "column", boxShadow: "inset 0 0 30px rgba(0,0,0,0.08)", overflow: "auto",
            animation: "fadeInUp 0.4s ease 0.3s both",
            zIndex: 2,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "32px" }}>
              <div>
                <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "12px", color: "rgba(255,255,255,0.3)", letterSpacing: "2px", display: "block", marginBottom: "8px" }}>05/05</span>
                <h1 style={{ fontFamily: archivoBlack, fontSize: "clamp(32px, 3.5vw, 48px)", color: "#F5F2EB", textTransform: "uppercase", letterSpacing: "-1px", margin: 0 }}>MY SPACE</h1>
              </div>
              <span
                onClick={(e) => { e.stopPropagation(); setActivePanel(null); }}
                style={{
                  fontFamily: outfit, fontWeight: 700, fontSize: "11px",
                  color: "rgba(255,255,255,0.4)", letterSpacing: "2px", cursor: "pointer",
                  padding: "8px 16px", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "4px",
                  transition: "background 0.2s ease",
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
              >CLOSE ×</span>
            </div>
            <div style={{ height: "1px", background: "rgba(255,255,255,0.08)", marginBottom: "36px" }} />
            <div style={{ flex: 1 }}>
              <MySpaceContent dark={true} connected={isConnected} onConnect={() => setIsConnected(true)} />
            </div>
            <div style={{ marginTop: "40px", paddingTop: "16px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "11px", color: "rgba(255,255,255,0.25)", letterSpacing: "2px" }}>GRAVII — CONCIERGE</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
