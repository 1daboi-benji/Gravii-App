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
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;800;900&family=Archivo+Black&family=Fraunces:ital,wght@0,400;0,700;0,900;1,400&family=Syne:wght@400;700;800&family=Lilita+One&display=swap');

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
const archivoBlack = "'Lilita One', sans-serif";
const fraunces = "'Fraunces', serif";
const syne = "'Lilita One', sans-serif";

/* ────────────────────────────────────────────
   PANEL DATA
──────────────────────────────────────────── */
const PANELS = [
  {
    id: "profile",
    num: "01",
    tab: "GRAVII ID",
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
    tab: "STANDING",
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
              fontSize: "72px",
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
  { name: "Smart Saver", desc: "Deposits stablecoins into low-risk yield protocols for steady returns", gradient: ["#4A6FA5","#6B8FCC","#89A8D9"] },
  { name: "Loyal Supporter", desc: "Stakes native tokens long-term to contribute to ecosystem security", gradient: ["#7A8B9E","#9EAEC0","#B8C8D8"] },
  { name: "Profit Hunter", desc: "Tracks yield spreads and new farming opportunities to move assets", gradient: ["#3DA5A0","#5CC4BF","#7EDDD8"] },
  { name: "Active Trader", desc: "Maintains high transaction frequency and asset turnover in DEXs", gradient: ["#D4875E","#E8A87C","#F0C4A0"] },
  { name: "Market Provider", desc: "Supplies liquidity to pools to reduce slippage and deepen markets", gradient: ["#7E6BAA","#9D8AC4","#BCA9DE"] },
  { name: "Strategic Holder", desc: "Maintains core assets long-term regardless of market volatility", gradient: ["#3B5998","#5B79B8","#7B99D8"] },
  { name: "Cash Manager", desc: "Utilizes the network for large stablecoin transfers and settlements", gradient: ["#C47A8A","#D89AAA","#ECBACA"] },
  { name: "Wealth Guard", desc: "Maintains massive assets to demonstrate network stability", gradient: ["#4A6FA5","#5A80B6","#7A9FCE"] },
  { name: "Major Investor", desc: "Commits significant capital to high-cap assets to build market trust", gradient: ["#8B6BAA","#A88BC8","#C5ABE6"] },
  { name: "NFT Collector", desc: "Trades and collects NFTs at scale", gradient: ["#C4727A","#D8929A","#ECB2BA"] },
  { name: "Swing Trader", desc: "Rotates positions based on on-chain cycles to maximize returns", gradient: ["#D4875E","#E09070","#F0A888"] },
  { name: "Target Buyer", desc: "Analyzes and buys assets at precise price points", gradient: ["#CC7A3E","#E0944E","#F0AE6E"] },
  { name: "Power User", desc: "Drives network activity through high gas consumption and transaction volume", gradient: ["#C06030","#D47848","#E89868"] },
  { name: "Unique Player", desc: "Exhibits unconventional smart contract interactions and patterns", gradient: ["#6E7A8A","#8E9AAA","#AEBACA"] },
  { name: "Chain Hopper", desc: "Uses bridge protocols to move assets across multiple chains", gradient: ["#3DAA7A","#5DC49A","#7DDEBA"] },
  { name: "Reward Seeker", desc: "Interacts with protocols specifically for incentive programs and airdrops", gradient: ["#8A8A9E","#A0A0B6","#BABACE"] },
  { name: "Dormant Account", desc: "Accounts that have been inactive for a prolonged period", gradient: ["#9A9AA8","#B0B0BC","#C8C8D4"] },
  { name: "New Voyager", desc: "Recently initiated on-chain activity with high onboarding potential", gradient: ["#A8B8C8","#BCC8D8","#D0D8E8"] },
  { name: "Community Leader", desc: "Participates in governance and voting to shape protocol direction", gradient: ["#7E6BAA","#9480C0","#AA96D6"] },
  { name: "Rising Star", desc: "Demonstrates rapid growth in asset value and activity velocity", gradient: ["#3DA58A","#50C0A0","#68DAB8"] },
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
function ProfileContent({ dark, connected, onConnect, onNavigate }) {
  const t = dark ? "#F5F2EB" : "#1A1A1A";
  const sub = dark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)";

  // Mock user data
  const userPersona = 5; // Strategic Holder (index)
  const userAlso = [2, 14]; // Profit Hunter, Chain Hopper
  const userChain = "Ethereum";
  const userChainCount = 4;
  const userStrength = { pct: "Top 15%", cat: "Holding Duration" };
  const userTrend = "+12.4%";
  const userMatched = 4;
  const userTier = "PLATINUM";
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
        fontFamily: fraunces, fontStyle: "italic", fontSize: "18px",
        color: "rgba(0,0,0,0.4)", marginBottom: "28px",
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
              <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "14px", color: "rgba(0,0,0,0.55)", letterSpacing: "2.5px", display: "block", marginBottom: "16px" }}>YOUR PERSONA</span>
              <h2 style={{ fontFamily: archivoBlack, fontSize: "30px", color: t, letterSpacing: "0.5px", margin: "0 0 10px", textTransform: "uppercase" }}>{persona.name}</h2>
              <p style={{ fontFamily: fraunces, fontStyle: "italic", fontSize: "15px", color: "rgba(0,0,0,0.5)", margin: "0 0 16px" }}>"{persona.desc}"</p>

              {/* ALSO tags */}
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "auto" }}>
                {userAlso.map(idx => (
                  <span key={idx} style={{
                    fontFamily: outfit, fontWeight: 600, fontSize: "13px", color: "rgba(0,0,0,0.5)",
                    letterSpacing: "1px", padding: "5px 12px",
                    background: "rgba(0,0,0,0.03)", borderRadius: "16px",
                    border: "1px solid rgba(0,0,0,0.05)",
                  }}>{PERSONA_ITEMS[idx].name}</span>
                ))}
              </div>

              {/* Tier badge + Share */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "20px" }}>
                <span style={{
                  fontFamily: outfit, fontWeight: 700, fontSize: "11px", color: "rgba(0,0,0,0.5)",
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
                    fontFamily: outfit, fontWeight: 700, fontSize: "11px", color: "#F5F2EB",
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
            <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "15px", color: "rgba(0,0,0,0.55)", letterSpacing: "2px", display: "block", marginBottom: "12px" }}>HOME CHAIN</span>
            <span style={{ fontFamily: syne, fontWeight: 800, fontSize: "28px", color: t }}>{userChain}</span>
            <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "12px", color: "rgba(0,0,0,0.4)", display: "block", marginTop: "8px" }}>ETH · BSC · Base · ARB</span>
          </div>

          {/* ③ STANDOUT */}
          <div style={{ ...glassStyle(18), padding: "20px" }}>
            <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "15px", color: "rgba(0,0,0,0.55)", letterSpacing: "2px", display: "block", marginBottom: "12px" }}>STANDOUT</span>
            <span style={{ fontFamily: syne, fontWeight: 800, fontSize: "22px", color: t, display: "block", marginBottom: "4px" }}>{userStrength.pct}</span>
            <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "13px", color: "rgba(0,0,0,0.5)" }}>in {userStrength.cat}</span>
          </div>

          {/* ④ TX COUNT (기존 ALSO 자리 좌) */}
          <div style={{ ...glassStyle(18), padding: "20px" }}>
            <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "15px", color: "rgba(0,0,0,0.55)", letterSpacing: "2px", display: "block", marginBottom: "12px" }}>TRANSACTIONS</span>
            <span style={{ fontFamily: syne, fontWeight: 800, fontSize: "28px", color: t }}>{userTxCount}</span>
            <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "13px", color: "rgba(0,0,0,0.5)", display: "block", marginTop: "4px" }}>all-time</span>
          </div>

          {/* ⑤ ACTIVE SINCE (기존 ALSO 자리 우) */}
          <div style={{ ...glassStyle(18), padding: "20px" }}>
            <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "15px", color: "rgba(0,0,0,0.55)", letterSpacing: "2px", display: "block", marginBottom: "12px" }}>ACTIVE SINCE</span>
            <span style={{ fontFamily: syne, fontWeight: 800, fontSize: "28px", color: t }}>{userActiveSince}</span>
            <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "13px", color: "rgba(0,0,0,0.5)", display: "block", marginTop: "4px" }}>on-chain</span>
          </div>

          {/* Row 3: 풀 width — 5등분 */}
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: "14px" }}>
            {/* 30D TREND */}
            <div style={{ flex: 1, ...glassStyle(18), padding: "20px" }}>
              <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "15px", color: "rgba(0,0,0,0.55)", letterSpacing: "2px", display: "block", marginBottom: "12px" }}>30D TREND</span>
              <span style={{ fontFamily: syne, fontWeight: 800, fontSize: "32px", color: "rgba(68,170,136,0.9)" }}>{userTrend}</span>
              <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "13px", color: "rgba(0,0,0,0.5)", display: "block", marginTop: "4px" }}>portfolio</span>
            </div>

            {/* REPUTATION */}
            <div style={{ flex: 1, ...glassStyle(18), padding: "20px" }}>
              <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "15px", color: "rgba(0,0,0,0.55)", letterSpacing: "2px", display: "block", marginBottom: "12px" }}>REPUTATION</span>
              <span style={{ fontFamily: syne, fontWeight: 800, fontSize: "20px", color: t, display: "block", marginBottom: "4px" }}>Trusted</span>
              <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "13px", color: "rgba(0,0,0,0.5)" }}>No flags</span>
            </div>

            {/* NFTs */}
            <div style={{ flex: 1, ...glassStyle(18), padding: "20px" }}>
              <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "15px", color: "rgba(0,0,0,0.55)", letterSpacing: "2px", display: "block", marginBottom: "12px" }}>NFTs</span>
              <span style={{ fontFamily: syne, fontWeight: 800, fontSize: "32px", color: t }}>{userNftCount}</span>
              <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "13px", color: "rgba(0,0,0,0.5)", display: "block", marginTop: "4px" }}>collected</span>
            </div>

            {/* MATCHED → My Space (보라 그라디언트 테두리) */}
            <div
              onClick={(e) => { e.stopPropagation(); if (onNavigate) onNavigate("myspace"); }}
              style={{
                flex: 1, padding: "1.5px", cursor: "pointer",
                background: "linear-gradient(135deg, rgba(200,180,240,0.4), rgba(230,220,250,0.15), rgba(200,180,240,0.3))",
                borderRadius: "18px",
                transition: "opacity 0.3s ease",
              }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = "0.85"}
              onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
            >
              <div style={{
                padding: "20px",
                background: "rgba(245,240,252,0.55)",
                backdropFilter: "blur(20px) saturate(1.4)",
                WebkitBackdropFilter: "blur(20px) saturate(1.4)",
                borderRadius: "16.5px",
                height: "100%",
              }}>
                <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "15px", color: "rgba(140,120,180,0.7)", letterSpacing: "2px", display: "block", marginBottom: "12px" }}>MATCHED</span>
                <span style={{ fontFamily: syne, fontWeight: 800, fontSize: "32px", color: t }}>{userMatched}</span>
                <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "13px", color: "rgba(0,0,0,0.5)", display: "block", marginTop: "4px" }}>campaigns →</span>
              </div>
            </div>

            {/* X-RAY → X-RAY 패널 (앰버 그라디언트 테두리) */}
            <div
              onClick={(e) => { e.stopPropagation(); if (onNavigate) onNavigate("lookup"); }}
              style={{
                flex: 1, padding: "1.5px", cursor: "pointer",
                background: "linear-gradient(135deg, rgba(80,200,210,0.35), rgba(120,220,220,0.12), rgba(60,190,200,0.3))",
                borderRadius: "18px",
                transition: "opacity 0.3s ease",
              }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = "0.85"}
              onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
            >
              <div style={{
                padding: "20px",
                background: "rgba(240,252,252,0.55)",
                backdropFilter: "blur(20px) saturate(1.4)",
                WebkitBackdropFilter: "blur(20px) saturate(1.4)",
                borderRadius: "16.5px",
                height: "100%",
                display: "flex", flexDirection: "column", justifyContent: "space-between",
              }}>
                <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "15px", color: "rgba(60,180,180,0.7)", letterSpacing: "2px", display: "block", marginBottom: "8px" }}>X-RAY</span>
                <p style={{ fontFamily: fraunces, fontStyle: "italic", fontSize: "13px", color: "rgba(0,0,0,0.5)", margin: "0 0 8px", lineHeight: 1.4 }}>
                  Dig deeper into your profile
                </p>
                <span style={{
                  fontFamily: outfit, fontWeight: 700, fontSize: "12px", color: "#1A1A1A",
                  letterSpacing: "1.5px",
                }}>SEARCH →</span>
              </div>
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
            <p style={{ fontFamily: outfit, fontWeight: 700, fontSize: "12px", color: "rgba(0,0,0,0.45)", letterSpacing: "3px", margin: "0 0 8px" }}>SIGN IN TO REVEAL</p>
            <p style={{ fontFamily: outfit, fontWeight: 400, fontSize: "11px", color: "rgba(0,0,0,0.3)", margin: 0, lineHeight: 1.5 }}>Your persona, reputation, and<br/>matched campaigns will appear here.</p>
          </div>
        </div>
      )}

      {/* ── 하단: 360° 무한 스크롤 캔버스 ── */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", animation: "fadeInScale 0.8s ease 0.6s both", position: "relative", zIndex: 1 }}>
        <InfiniteCanvas items={PERSONA_ITEMS} dark={dark} connected={connected} activeIndex={connected ? userPersona : null} />
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────
   EXPANDED CONTENT — MY SPACE
──────────────────────────────────────────── */
function MySpaceContent({ dark, connected, onConnect, onNavigate }) {
  const t = dark ? "#F5F2EB" : "#1A1A1A";
  const sub = dark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)";
  const cardBorder = dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)";
  const cardBg = dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)";

  const [activeCat, setActiveCat] = useState(0);
  const [benefitsOpen, setBenefitsOpen] = useState(true);
  const [almostOpen, setAlmostOpen] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(true);
  const [optedIn, setOptedIn] = useState({});
  const categories = BENEFIT_CATEGORIES;

  // Eligible 캠페인 (true)
  const eligibleCampaigns = PARTNERS_DATA.flatMap(p =>
    p.campaigns.filter(c => c.eligible === true).map(c => ({ ...c, partner: p.name, partnerId: p.id, partnerStatus: p.status }))
  );
  // Reach to Unlock 캠페인 (false, NOT invite only)
  const reachCampaigns = PARTNERS_DATA.flatMap(p =>
    p.campaigns.filter(c => c.eligible === false && p.status !== "INVITE ONLY").map(c => ({ ...c, partner: p.name, partnerId: p.id, partnerStatus: p.status }))
  );
  // Invite Only 캠페인 (false, invite only partner)
  const inviteCampaigns = PARTNERS_DATA.flatMap(p =>
    p.campaigns.filter(c => c.eligible === false && p.status === "INVITE ONLY").map(c => ({ ...c, partner: p.name, partnerId: p.id, partnerStatus: p.status }))
  );

  // 카테고리 필터 적용
  const filterByCat = (list) => {
    if (activeCat === 0) return list;
    return list.filter(c => c.category === categories[activeCat]);
  };

  const filteredEligible = filterByCat(eligibleCampaigns);
  const filteredReach = filterByCat(reachCampaigns);
  const filteredInvite = filterByCat(inviteCampaigns);

  const CampaignCard = ({ c, cta, ctaStyle, opacity = 1 }) => {
    const key = c.name + c.partner;
    const isOpted = optedIn[key];
    const ctaBtn = cta === "optin" ? (
      <span
        onClick={(e) => { e.stopPropagation(); setOptedIn(prev => ({ ...prev, [key]: true })); }}
        style={{
          fontFamily: outfit, fontWeight: 700, fontSize: "12px", letterSpacing: "2px",
          padding: "10px 22px", borderRadius: "8px",
          cursor: isOpted ? "default" : "pointer", whiteSpace: "nowrap",
          ...(isOpted
            ? { color: "rgba(100,200,130,0.9)", border: "1px solid rgba(100,200,130,0.3)", background: "rgba(100,200,130,0.06)" }
            : { color: "#1A1A1A", background: "rgba(100,200,130,0.8)" }
          ),
        }}>{isOpted ? "OPTED IN ✓" : "OPT IN →"}</span>
    ) : cta === "qualify" ? (
      <span
        onClick={(e) => { e.stopPropagation(); if (onNavigate) onNavigate("discovery"); }}
        style={{
          fontFamily: outfit, fontWeight: 700, fontSize: "12px", color: "rgba(255,200,80,0.9)", letterSpacing: "2px",
          padding: "10px 22px", border: "1px solid rgba(255,200,80,0.3)", borderRadius: "8px",
          cursor: "pointer", whiteSpace: "nowrap",
        }}>HOW TO QUALIFY →</span>
    ) : cta === "invite" ? (
      <span style={{
        fontFamily: outfit, fontWeight: 700, fontSize: "12px", color: "rgba(200,180,240,0.7)", letterSpacing: "2px",
        padding: "10px 22px", border: "1px solid rgba(200,180,240,0.2)", borderRadius: "8px",
        whiteSpace: "nowrap", cursor: "default",
      }}>INVITE ONLY</span>
    ) : null;

    return (
      <div style={{
        padding: "24px 28px", border: `1px solid ${cardBorder}`, borderRadius: "12px",
        background: cardBg, opacity,
      }}>
        {/* Row 1: 캠페인명 + CTA (Discovery: 캠페인명 + 상태뱃지) */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
          <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "18px", color: t }}>{c.name}</span>
          {ctaBtn}
        </div>

        {/* Row 2: 파트너명 (My Space 고유 — Discovery는 이미 파트너 안) */}
        <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "13px", color: sub, display: "block", marginBottom: "12px" }}>{c.partner}</span>

        {/* Row 3: 타입 pill + 카테고리 */}
        <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "8px" }}>
          {c.type && <span style={{ fontFamily: outfit, fontWeight: 600, fontSize: "11px", color: "rgba(200,180,240,0.7)", padding: "2px 10px", borderRadius: "4px", background: "rgba(200,180,240,0.08)", border: "1px solid rgba(200,180,240,0.12)" }}>{c.type}</span>}
          <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "12px", color: "rgba(255,255,255,0.35)" }}>{c.category}</span>
        </div>

        {/* Row 4: 체인 + 기간 */}
        <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "14px" }}>
          {c.chains && c.chains[0] !== "All" && <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "11px", color: "rgba(255,255,255,0.3)", padding: "2px 8px", borderRadius: "4px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>{c.chains.join(" · ")}</span>}
          {c.chains && c.chains[0] === "All" && <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "11px", color: "rgba(255,255,255,0.25)", padding: "2px 8px", borderRadius: "4px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>All Chains</span>}
          <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "12px", color: "rgba(255,255,255,0.35)" }}>{c.period}</span>
        </div>

        {/* Row 5: 태그 */}
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {(c.tags || []).map((tag, ti) => <SharedTagChip key={ti} tag={tag} />)}
        </div>
      </div>
    );
  };

  return (
    <div>
      <p style={{ fontFamily: fraunces, fontSize: "34px", fontWeight: 700, color: t, lineHeight: 1.4, marginBottom: "18px", animation: "fadeInUp 0.6s ease 0.3s both" }}>
        A curation service that finds you first.
      </p>
      <p style={{ fontFamily: outfit, fontWeight: 400, fontSize: "17px", color: sub, lineHeight: 1.7, marginBottom: "12px", animation: "fadeInUp 0.6s ease 0.45s both" }}>
        Gravii's engine analyzes your preferences to intuitively place only the most essential benefits here.
      </p>

      {/* 상단 요약 */}
      {connected && (
        <p style={{ fontFamily: outfit, fontWeight: 400, fontSize: "13px", color: "rgba(255,255,255,0.35)", marginBottom: "20px", animation: "fadeInUp 0.5s ease 0.48s both" }}>
          <span style={{ color: "rgba(100,200,130,0.8)", fontWeight: 700 }}>{eligibleCampaigns.length}</span> benefits available · <span style={{ color: "rgba(255,200,80,0.8)", fontWeight: 700 }}>{reachCampaigns.length}</span> almost there{inviteCampaigns.length > 0 && <> · <span style={{ color: "rgba(200,180,240,0.7)", fontWeight: 700 }}>{inviteCampaigns.length}</span> invite only</>}
        </p>
      )}

      {/* 카테고리 필터 */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "28px", animation: "fadeInUp 0.5s ease 0.5s both", flexWrap: "wrap" }}>
        {categories.map((cat, i) => (
          <span
            key={cat}
            onClick={(e) => { e.stopPropagation(); setActiveCat(i); }}
            style={{
              fontFamily: outfit, fontWeight: 700, fontSize: "12px",
              color: activeCat === i ? "#1A1A1A" : "rgba(255,255,255,0.5)",
              background: activeCat === i ? "rgba(230,220,250,0.8)" : "rgba(255,255,255,0.06)",
              padding: "7px 16px", borderRadius: "20px", letterSpacing: "1px",
              border: `1px solid ${activeCat === i ? "rgba(230,220,250,0.6)" : "rgba(255,255,255,0.1)"}`,
              cursor: "pointer",
              transition: "all 0.25s ease",
            }}
          >{cat}</span>
        ))}
      </div>

      <div style={{ position: "relative" }}>
        <div style={{
          filter: connected ? "blur(0)" : "blur(5px)",
          opacity: connected ? 1 : 0.6,
          transition: "filter 0.5s ease, opacity 0.5s ease",
        }}>
          {/* Section 1: YOUR BENEFITS */}
          <div style={{ marginBottom: "32px" }}>
            <div
              onClick={(e) => { e.stopPropagation(); setBenefitsOpen(!benefitsOpen); }}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", marginBottom: benefitsOpen ? "16px" : "0", animation: "fadeInUp 0.5s ease 0.55s both" }}
            >
              <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "14px", color: "rgba(100,200,130,0.8)", letterSpacing: "2px" }}>
                YOUR BENEFITS ({filteredEligible.length})
              </span>
              <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "13px", color: sub, transition: "color 0.2s ease" }}>
                {benefitsOpen ? "▲" : "▼"}
              </span>
            </div>
            {benefitsOpen && (filteredEligible.length === 0 ? (
              <p style={{ fontFamily: outfit, fontWeight: 400, fontSize: "14px", color: sub, fontStyle: "italic", animation: "fadeInUp 0.5s ease 0.6s both" }}>No eligible benefits in this category.</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                {filteredEligible.map((c, i) => (
                  <div key={c.name + c.partner} style={{ animation: `fadeInUp 0.5s ease ${0.6 + i * 0.08}s both` }}>
                    <CampaignCard c={c} cta="optin" />
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Divider */}
          <div style={{ height: "1px", background: "rgba(255,255,255,0.06)", marginBottom: "32px" }} />

          {/* Section 2: ALMOST THERE (Reach to Unlock only) */}
          <div style={{ marginBottom: inviteCampaigns.length > 0 ? "32px" : "0" }}>
            <div
              onClick={(e) => { e.stopPropagation(); setAlmostOpen(!almostOpen); }}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", marginBottom: almostOpen ? "16px" : "0", animation: "fadeInUp 0.5s ease 0.8s both" }}
            >
              <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "14px", color: "rgba(255,200,80,0.8)", letterSpacing: "2px" }}>
                ALMOST THERE ({filteredReach.length})
              </span>
              <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "13px", color: sub, transition: "color 0.2s ease" }}>
                {almostOpen ? "▲" : "▼"}
              </span>
            </div>
            {almostOpen && (filteredReach.length === 0 ? (
              <p style={{ fontFamily: outfit, fontWeight: 400, fontSize: "14px", color: sub, fontStyle: "italic", animation: "fadeInUp 0.5s ease 0.85s both" }}>No campaigns to unlock in this category.</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                {filteredReach.map((c, i) => (
                  <div key={c.name + c.partner} style={{ animation: `fadeInUp 0.5s ease ${0.85 + i * 0.08}s both` }}>
                    <CampaignCard c={c} cta="qualify" opacity={0.75} />
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Section 3: INVITE ONLY (if any) */}
          {inviteCampaigns.length > 0 && (
            <>
              <div style={{ height: "1px", background: "rgba(255,255,255,0.06)", marginBottom: "32px" }} />
              <div>
                <div
                  onClick={(e) => { e.stopPropagation(); setInviteOpen(!inviteOpen); }}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", marginBottom: inviteOpen ? "16px" : "0", animation: "fadeInUp 0.5s ease 0.95s both" }}
                >
                  <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "14px", color: "rgba(200,180,240,0.7)", letterSpacing: "2px" }}>
                    INVITE ONLY ({filteredInvite.length})
                  </span>
                  <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "13px", color: sub, transition: "color 0.2s ease" }}>
                    {inviteOpen ? "▲" : "▼"}
                  </span>
                </div>
                {inviteOpen && (filteredInvite.length === 0 ? (
                  <p style={{ fontFamily: outfit, fontWeight: 400, fontSize: "14px", color: sub, fontStyle: "italic" }}>No invite-only campaigns in this category.</p>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    {filteredInvite.map((c, i) => (
                      <div key={c.name + c.partner} style={{ animation: `fadeInUp 0.5s ease ${1.0 + i * 0.08}s both` }}>
                        <CampaignCard c={c} cta="invite" opacity={0.6} />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Discovery 연결 CTA */}
          {connected && (
            <div
              onClick={(e) => { e.stopPropagation(); if (onNavigate) onNavigate("discovery"); }}
              style={{
                marginTop: "36px", padding: "14px", textAlign: "center",
                border: `1px solid ${cardBorder}`, borderRadius: "8px",
                cursor: "pointer", transition: "background 0.2s ease",
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
            >
              <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "11px", color: sub, letterSpacing: "2px" }}>EXPLORE ALL CAMPAIGNS IN DISCOVERY →</span>
            </div>
          )}
        </div>

        {!connected && (
          <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "40px" }}>
            <div style={{
              padding: "40px 60px",
              background: dark ? "rgba(26,26,26,0.92)" : "rgba(245,242,235,0.92)",
              border: `1px solid ${dark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"}`,
              borderRadius: "16px", textAlign: "center", minWidth: "340px",
            }}>
              <p onClick={() => { if (onNavigate) onNavigate("profile"); }} style={{ fontFamily: outfit, fontWeight: 700, fontSize: "18px", color: t, letterSpacing: "3px", margin: "0 0 14px", cursor: "pointer" }}>GET YOUR GRAVII ID</p>
              <p style={{ fontFamily: outfit, fontWeight: 400, fontSize: "15px", color: dark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.4)", margin: "0 0 10px" }}>Unlock benefits curated just for you.</p>
              <p style={{ fontFamily: fraunces, fontStyle: "italic", fontSize: "14px", color: dark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.25)", margin: "0 0 24px" }}>Complimentary — no strings.</p>
              <p onClick={() => onConnect()} style={{ fontFamily: outfit, fontWeight: 400, fontSize: "14px", color: dark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.35)", margin: 0, cursor: "pointer" }}>Already have one? <span style={{ fontWeight: 700, textDecoration: "underline" }}>Connect →</span></p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────
   SHARED DATA — PARTNERS & CAMPAIGNS
──────────────────────────────────────────── */
const BENEFIT_CATEGORIES = ["All", "Wealth & Finance", "Lifestyle & Retail", "Exclusive Privileges", "Hidden Gems"];

const PARTNERS_DATA = [
  {
    id: "alpha", name: "Partner Alpha",
    status: "ELIGIBLE", eligible: true, delay: "0.4s",
    campaigns: [
      { name: "Yield Booster", type: "Yield Boost", chains: ["ETH", "Base"], category: "Wealth & Finance", period: "Jan 30 – Mar 1, 2026", eligible: true, desc: "Prestige rewards for verified value. We've matched your Platinum profile with this exclusive Yield Booster. Secure your spot with a single click.",
        tags: [{ persona: "Smart Saver", type: "verified" }, { persona: "Profit Hunter", type: "verified" }, { tier: "Platinum+", type: "tier" }] },
      { name: "ICO Allocation", type: "Early Access", chains: ["ETH"], category: "Exclusive Privileges", period: "Jan 30 – Mar 1, 2026", eligible: false, desc: "Exclusive allocation round for Black-tier members.",
        tags: [{ persona: "Strategic Holder", type: "requires" }, { tier: "Black", type: "tier" }],
        qualifySteps: ["Achieve the Strategic Holder persona by maintaining core assets long-term", "Reach the Black membership tier", "Maintain tier status for at least 7 consecutive days"] },
    ],
  },
  {
    id: "beta", name: "Partner Beta",
    status: "REACH TO UNLOCK", eligible: false, delay: "0.5s",
    campaigns: [
      { name: "Premium Lending Drop", type: "Cashback", chains: ["ETH", "BSC", "Base"], category: "Wealth & Finance", period: "Feb 15 – Apr 30, 2026", eligible: false, desc: "This campaign requires the Wealth Guard persona. Maintain significant stable reserves to qualify.",
        tags: [{ persona: "Wealth Guard", type: "requires" }, { persona: "Cash Manager", type: "requires" }, { tier: "Gold+", type: "tier" }],
        qualifySteps: ["Maintain $50,000+ in stable reserves across supported chains", "Hold stablecoins for 30+ consecutive days", "Reach Gold tier or above on your Gravii ID"] },
    ],
  },
  {
    id: "gamma", name: "Partner Gamma",
    status: "COMING SOON", eligible: null, delay: "0.55s",
    campaigns: [
      { name: "Lifestyle Rewards", type: "Loyalty Reward", chains: ["All"], category: "Lifestyle & Retail", period: "Opens Mar 15, 2026", eligible: null, desc: "Details will be revealed when the campaign goes live. Stay tuned.",
        tags: [{ tier: "All Tiers", type: "open" }] },
    ],
  },
  {
    id: "delta", name: "Partner Delta",
    status: "INVITE ONLY", eligible: false, delay: "0.6s",
    campaigns: [
      { name: "Collector's Access", type: "Early Access", chains: ["ETH"], category: "Exclusive Privileges", period: "Ongoing", eligible: false, desc: "This privilege is reserved for users with the NFT Collector persona. Invitations are issued based on on-chain collection activity.",
        tags: [{ persona: "NFT Collector", type: "targeting" }, { tier: "Gold+", type: "tier" }],
        qualifySteps: ["Build the NFT Collector persona by trading and collecting NFTs at scale", "Reach Gold tier or above", "Maintain active collection activity for 14+ days"] },
      { name: "Collector's Circle", type: "Loyalty Reward", chains: ["ETH", "Base"], category: "Exclusive Privileges", period: "Ongoing", eligible: false, desc: "Inner circle access for top-tier collectors.",
        tags: [{ persona: "NFT Collector", type: "targeting" }, { persona: "Power User", type: "targeting" }, { tier: "Platinum+", type: "tier" }],
        qualifySteps: ["Achieve both NFT Collector and Power User personas", "Reach Platinum tier or above", "Be in the top 1,000 collectors on Standing"] },
      { name: "Early Mint Pass", type: "Airdrop", chains: ["ETH", "Base"], category: "Hidden Gems", period: "Apr 1 – Apr 30, 2026", eligible: false, desc: "Priority minting access for upcoming partner drops.",
        tags: [{ persona: "NFT Collector", type: "verified" }, { tier: "All Tiers", type: "open" }],
        qualifySteps: ["Achieve the NFT Collector persona", "Any membership tier qualifies"] },
    ],
  },
  {
    id: "epsilon", name: "Partner Epsilon",
    status: "ELIGIBLE", eligible: true, delay: "0.65s",
    campaigns: [
      { name: "Trading Fee Rebate", type: "Fee Discount", chains: ["ETH", "BSC", "ARB"], category: "Wealth & Finance", period: "Feb 1 – May 31, 2026", eligible: true, desc: "Earn back a percentage of your trading fees based on your monthly volume. Verified Active Traders get priority access.",
        tags: [{ persona: "Active Trader", type: "verified" }, { persona: "Swing Trader", type: "verified" }, { tier: "Classic+", type: "tier" }] },
      { name: "VIP Desk Access", type: "Early Access", chains: ["All"], category: "Exclusive Privileges", period: "Ongoing", eligible: true, desc: "Direct access to a dedicated trading desk with premium execution and priority support.",
        tags: [{ persona: "Active Trader", type: "verified" }, { tier: "Platinum+", type: "tier" }] },
    ],
  },
  {
    id: "zeta", name: "Partner Zeta",
    status: "ELIGIBLE", eligible: true, delay: "0.7s",
    campaigns: [
      { name: "Community Airdrop", type: "Airdrop", chains: ["All"], category: "Hidden Gems", period: "Mar 1 – Mar 31, 2026", eligible: true, desc: "A surprise token distribution for all active Gravii members. No strings attached — just show up.",
        tags: [{ tier: "All Tiers", type: "open" }] },
    ],
  },
  {
    id: "eta", name: "Partner Eta",
    status: "REACH TO UNLOCK", eligible: false, delay: "0.75s",
    campaigns: [
      { name: "Private Round Access", type: "Early Access", chains: ["ETH"], category: "Wealth & Finance", period: "Apr 1 – Jun 30, 2026", eligible: false, desc: "Early-stage investment allocation reserved for Major Investor persona holders with significant on-chain capital commitment.",
        tags: [{ persona: "Major Investor", type: "requires" }, { persona: "Wealth Guard", type: "requires" }, { tier: "Black", type: "tier" }],
        qualifySteps: ["Commit significant capital to high-cap assets to build market trust", "Maintain Wealth Guard-level stable reserves", "Achieve Black membership tier"] },
      { name: "Luxury Travel Package", type: "Loyalty Reward", chains: ["All"], category: "Lifestyle & Retail", period: "May 1 – Jul 31, 2026", eligible: false, desc: "Exclusive travel packages and premium hospitality experiences for top-tier members.",
        tags: [{ persona: "Major Investor", type: "requires" }, { tier: "Platinum+", type: "tier" }],
        qualifySteps: ["Achieve the Major Investor persona", "Reach Platinum tier or above", "Maintain tier for at least 14 days"] },
    ],
  },
  {
    id: "theta", name: "Partner Theta",
    status: "INELIGIBLE", eligible: "ineligible", delay: "0.8s",
    campaigns: [
      { name: "Growth Accelerator", type: "Referral Bonus", chains: ["ETH", "Base", "ARB"], category: "Hidden Gems", period: "Apr 15 – May 31, 2026", eligible: "ineligible", desc: "This campaign is strictly limited to users who meet the exact persona and tier requirements. No alternative path to entry.",
        tags: [{ persona: "Rising Star", type: "targeting" }, { persona: "New Voyager", type: "targeting" }, { tier: "Classic+", type: "tier" }] },
    ],
  },
];

const sharedTagStyle = (tag) => {
  if (tag.type === "tier" || tag.type === "open") {
    return { color: "rgba(200,180,240,0.8)", border: "rgba(200,180,240,0.25)", bg: "rgba(200,180,240,0.06)", radius: "12px", icon: tag.type === "open" ? "" : "◆ " };
  }
  if (tag.type === "verified") {
    return { color: "rgba(100,200,130,0.85)", border: "rgba(100,200,130,0.25)", bg: "rgba(100,200,130,0.06)", radius: "6px", icon: "✓ " };
  }
  if (tag.type === "requires") {
    return { color: "rgba(255,200,80,0.85)", border: "rgba(255,200,80,0.25)", bg: "rgba(255,200,80,0.06)", radius: "6px", icon: "" };
  }
  return { color: "rgba(255,255,255,0.4)", border: "rgba(255,255,255,0.12)", bg: "rgba(255,255,255,0.03)", radius: "6px", icon: "" };
};

const SharedTagChip = ({ tag }) => {
  const s = sharedTagStyle(tag);
  const label = tag.persona || tag.tier;
  return (
    <span style={{
      fontFamily: outfit, fontWeight: 700, fontSize: "11px",
      color: s.color, letterSpacing: "0.5px",
      padding: "4px 10px", borderRadius: s.radius,
      background: s.bg, border: `1px solid ${s.border}`,
      display: "inline-flex", alignItems: "center", whiteSpace: "nowrap",
    }}>{s.icon}{label}</span>
  );
};

/* ────────────────────────────────────────────
   EXPANDED CONTENT — DISCOVERY (DARK)
──────────────────────────────────────────── */
function DiscoveryContent({ dark, connected, onConnect, onNavigate }) {
  const t = "#F5F2EB";
  const sub = "rgba(255,255,255,0.5)";
  const cardBorder = "rgba(255,255,255,0.1)";

  const [activeCat, setActiveCat] = useState(0);
  const [statusOpen, setStatusOpen] = useState(false);
  const [activeStatus, setActiveStatus] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPartner, setSelectedPartner] = useState(null);
  const [expandedCampaign, setExpandedCampaign] = useState(null);
  const [showQualify, setShowQualify] = useState(null);
  const [verifyState, setVerifyState] = useState(null); // null | "loading" | "failed"

  const categories = BENEFIT_CATEGORIES;
  const statuses = ["All", "Eligible", "Reach to Unlock", "Upcoming"];
  const partners = PARTNERS_DATA;
  const TagChip = SharedTagChip;

  // 파트너 대표 태그 추출 (첫 캠페인의 태그에서 persona 1~2개 + tier 1개)
  const getRepTags = (p) => {
    const allTags = p.campaigns.flatMap(c => c.tags || []);
    const personas = allTags.filter(t => t.persona);
    const tiers = allTags.filter(t => t.tier);
    const unique = [];
    const seen = new Set();
    for (const t of personas) {
      if (!seen.has(t.persona)) { seen.add(t.persona); unique.push(t); }
      if (unique.length >= 2) break;
    }
    if (tiers.length > 0 && tiers[0].type !== "open") unique.push(tiers[0]);
    return { shown: unique, extra: Math.max(0, new Set(personas.map(p=>p.persona)).size - 2) };
  };

  const statusColor = (status) => {
    if (status === "ELIGIBLE") return "rgba(100,200,130,0.8)";
    if (status === "REACH TO UNLOCK") return "rgba(255,200,80,0.7)";
    if (status === "COMING SOON") return "rgba(255,255,255,0.35)";
    if (status === "INVITE ONLY") return "rgba(200,180,240,0.7)";
    if (status === "INELIGIBLE") return "rgba(255,90,90,0.7)";
    return "rgba(255,255,255,0.25)";
  };

  const campaignStatusColor = (eligible) => {
    if (eligible === true) return "rgba(100,200,130,0.8)";
    if (eligible === false) return "rgba(255,200,80,0.7)";
    if (eligible === "ineligible") return "rgba(255,90,90,0.7)";
    return "rgba(255,255,255,0.35)";
  };

  const filteredPartners = partners.filter(p => {
    // 검색 필터
    if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    // 카테고리 필터: 파트너의 캠페인 중 해당 카테고리가 하나라도 있으면 표시
    if (activeCat > 0 && !p.campaigns.some(c => c.category === categories[activeCat])) return false;
    // Status 필터
    if (activeStatus === 1 && p.status !== "ELIGIBLE") return false;
    if (activeStatus === 2 && p.status !== "REACH TO UNLOCK" && p.status !== "INVITE ONLY") return false;
    if (activeStatus === 3 && p.status !== "COMING SOON") return false;
    return true;
  });

  // ── 상세 뷰 ──
  if (selectedPartner) {
    const p = partners.find(x => x.id === selectedPartner);
    if (!p) return null;
    return (
      <div>
        {/* Back + Breadcrumb */}
        <div style={{ marginBottom: "28px", animation: "fadeInUp 0.4s ease both" }}>
          <span
            onClick={(e) => { e.stopPropagation(); setSelectedPartner(null); }}
            style={{ fontFamily: outfit, fontWeight: 700, fontSize: "13px", color: sub, letterSpacing: "2px", cursor: "pointer", display: "inline-block", marginBottom: "8px" }}
          >← BACK TO DISCOVERY</span>
          {(activeCat > 0 || activeStatus > 0) && (
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              {activeCat > 0 && <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "11px", color: "rgba(230,220,250,0.5)", padding: "2px 8px", borderRadius: "4px", background: "rgba(230,220,250,0.08)" }}>{categories[activeCat]}</span>}
              {activeStatus > 0 && <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "11px", color: "rgba(230,220,250,0.5)", padding: "2px 8px", borderRadius: "4px", background: "rgba(230,220,250,0.08)" }}>{statuses[activeStatus]}</span>}
              <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "11px", color: "rgba(255,255,255,0.2)" }}>›</span>
              <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>{p.name}</span>
            </div>
          )}
        </div>

        {/* Partner header */}
        <div style={{ marginBottom: "32px", animation: "fadeInUp 0.5s ease 0.1s both" }}>
          <h2 style={{ fontFamily: archivoBlack, fontSize: "32px", color: t, margin: 0, textTransform: "uppercase" }}>{p.name}</h2>
        </div>

        <div style={{ height: "1px", background: "rgba(255,255,255,0.08)", marginBottom: "28px" }} />

        {/* Campaigns count */}
        <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "14px", color: sub, letterSpacing: "2px", display: "block", marginBottom: "20px", animation: "fadeInUp 0.5s ease 0.2s both" }}>
          CAMPAIGNS ({p.campaigns.length})
        </span>

        {/* Campaign list */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {p.campaigns.map((c, i) => {
            const isOpen = expandedCampaign === i;
            return (
            <div
              key={c.name}
              onClick={(e) => { e.stopPropagation(); setExpandedCampaign(isOpen ? null : i); setShowQualify(null); setVerifyState(null); }}
              style={{
                padding: "24px", border: `1px solid ${isOpen ? "rgba(230,220,250,0.3)" : cardBorder}`, borderRadius: "12px",
                background: isOpen ? "rgba(230,220,250,0.04)" : c.eligible === false ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.04)",
                animation: `fadeInUp 0.5s ease ${0.25 + i * 0.1}s both`,
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => { if (!isOpen) e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
              onMouseLeave={(e) => { if (!isOpen) e.currentTarget.style.background = c.eligible === false ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.04)"; }}
            >
              {/* Row 1: 이름 + 상태 */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "22px", color: t }}>{c.name}</span>
                <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "13px", color: campaignStatusColor(c.eligible), letterSpacing: "1.5px" }}>
                  {c.eligible === true ? "ELIGIBLE" : c.eligible === "ineligible" ? "INELIGIBLE" : c.eligible === null ? "UPCOMING" : p.status === "INVITE ONLY" ? "INVITE ONLY" : "REACH TO UNLOCK"}
                </span>
              </div>
              {/* Row 2: 타입 + 카테고리 */}
              <div style={{ display: "flex", gap: "10px", marginBottom: "8px", flexWrap: "wrap", alignItems: "center" }}>
                {c.type && <span style={{ fontFamily: outfit, fontWeight: 600, fontSize: "12px", color: "rgba(200,180,240,0.7)", padding: "2px 10px", borderRadius: "4px", background: "rgba(200,180,240,0.08)", border: "1px solid rgba(200,180,240,0.12)" }}>{c.type}</span>}
                <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "13px", color: "rgba(255,255,255,0.4)" }}>{c.category}</span>
              </div>
              {/* Row 2b: 체인 + 기간 */}
              <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap", alignItems: "center" }}>
                {c.chains && c.chains[0] !== "All" && <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "11px", color: "rgba(255,255,255,0.3)", padding: "2px 8px", borderRadius: "4px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>{c.chains.join(" · ")}</span>}
                {c.chains && c.chains[0] === "All" && <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "11px", color: "rgba(255,255,255,0.25)", padding: "2px 8px", borderRadius: "4px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>All Chains</span>}
                <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "13px", color: "rgba(255,255,255,0.35)" }}>{c.period}</span>
              </div>
              {/* Row 3: Tag chips (Persona 각진 + Tier 둥근) */}
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center", marginBottom: "16px" }}>
                {(c.tags || []).map((tag, ti) => <TagChip key={ti} tag={tag} />)}
              </div>
              {/* expand/close */}
              <div style={{ textAlign: "center", paddingTop: "6px" }}>
                <span style={{
                  fontFamily: outfit, fontWeight: 700, fontSize: "12px", color: isOpen ? "rgba(230,220,250,0.7)" : "rgba(230,220,250,0.4)",
                  letterSpacing: "1.5px",
                  padding: "6px 16px", borderRadius: "6px",
                  background: isOpen ? "rgba(230,220,250,0.06)" : "transparent",
                  border: `1px solid ${isOpen ? "rgba(230,220,250,0.15)" : "transparent"}`,
                  transition: "all 0.2s ease",
                  display: "inline-block",
                }}>{isOpen ? "▲ Close" : "▼ View details →"}</span>
              </div>

              {/* Expanded content */}
              {isOpen && (
                <div style={{ marginTop: "18px", paddingTop: "18px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                  <p style={{ fontFamily: outfit, fontWeight: 400, fontSize: "15px", color: "rgba(255,255,255,0.45)", lineHeight: 1.7, margin: "0 0 24px" }}>{c.desc}</p>
                  {/* CTA */}
                  {c.eligible === true && (
                    <span onClick={(e) => e.stopPropagation()} style={{
                      fontFamily: outfit, fontWeight: 700, fontSize: "13px", color: "#1A1A1A", letterSpacing: "2px",
                      padding: "12px 28px", background: "rgba(100,200,130,0.8)", borderRadius: "8px",
                      cursor: "pointer", display: "inline-block",
                    }}>OPT IN →</span>
                  )}
                  {c.eligible === false && p.status === "INVITE ONLY" && (
                    <span onClick={(e) => e.stopPropagation()} style={{
                      fontFamily: outfit, fontWeight: 700, fontSize: "13px", color: "rgba(255,200,80,0.7)", letterSpacing: "2px",
                      padding: "12px 28px", border: "1px solid rgba(255,200,80,0.2)", borderRadius: "8px",
                      display: "inline-block", cursor: "default",
                    }}>INVITE ONLY — REQUEST ACCESS</span>
                  )}
                  {c.eligible === false && p.status !== "INVITE ONLY" && (
                    <div onClick={(e) => e.stopPropagation()}>
                      <span
                        onClick={() => { setShowQualify(showQualify === i ? null : i); setVerifyState(null); }}
                        style={{
                          fontFamily: outfit, fontWeight: 700, fontSize: "13px", color: "rgba(255,200,80,0.9)", letterSpacing: "2px",
                          padding: "12px 28px", border: "1px solid rgba(255,200,80,0.3)", borderRadius: "8px",
                          cursor: "pointer", display: "inline-block",
                        }}>{showQualify === i ? "CLOSE GUIDE ▲" : "HOW TO QUALIFY →"}</span>

                      {showQualify === i && c.qualifySteps && (
                        <div style={{ marginTop: "20px", padding: "24px", background: "rgba(255,200,80,0.04)", border: "1px solid rgba(255,200,80,0.12)", borderRadius: "12px" }}>
                          {/* YOUR STATUS */}
                          <div style={{ marginBottom: "20px", padding: "16px 20px", background: "rgba(255,255,255,0.03)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.06)" }}>
                            <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "11px", color: sub, letterSpacing: "2px", display: "block", marginBottom: "12px" }}>YOUR STATUS</span>
                            <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
                              <div>
                                <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "12px", color: sub, display: "block", marginBottom: "4px" }}>Current Persona</span>
                                <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "14px", color: t }}>Smart Saver</span>
                              </div>
                              <div>
                                <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "12px", color: sub, display: "block", marginBottom: "4px" }}>Current Tier</span>
                                <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "14px", color: t }}>Platinum</span>
                              </div>
                            </div>
                          </div>

                          {/* REQUIRED */}
                          <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "11px", color: sub, letterSpacing: "2px", display: "block", marginBottom: "4px" }}>REQUIRED</span>
                          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "20px" }}>
                            {(c.tags || []).map((tag, ti) => <TagChip key={ti} tag={tag} />)}
                          </div>

                          {/* STEPS */}
                          <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "13px", color: "rgba(255,200,80,0.9)", letterSpacing: "1.5px", display: "block", marginBottom: "14px" }}>HOW TO GET THERE</span>
                          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "24px" }}>
                            {c.qualifySteps.map((step, si) => (
                              <div key={si} style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                                <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "14px", color: "rgba(255,200,80,0.6)", minWidth: "24px" }}>{si + 1}.</span>
                                <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "14px", color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>{step}</span>
                              </div>
                            ))}
                          </div>

                          {/* VERIFY BUTTON */}
                          <div style={{ marginBottom: "20px" }}>
                            <span
                              onClick={() => {
                                if (verifyState === "loading") return;
                                setVerifyState("loading");
                                setTimeout(() => setVerifyState("failed"), 1800);
                              }}
                              style={{
                                fontFamily: outfit, fontWeight: 700, fontSize: "13px",
                                letterSpacing: "2px",
                                padding: "14px 0", borderRadius: "8px",
                                cursor: verifyState === "loading" ? "wait" : "pointer",
                                display: "block", textAlign: "center", width: "100%",
                                transition: "all 0.3s ease",
                                ...(verifyState === "failed"
                                  ? { background: "rgba(255,200,80,0.08)", border: "1px solid rgba(255,200,80,0.2)", color: "rgba(255,200,80,0.9)" }
                                  : verifyState === "loading"
                                  ? { background: "rgba(200,180,240,0.15)", border: "1px solid rgba(200,180,240,0.3)", color: "rgba(200,180,240,0.9)" }
                                  : { background: "rgba(200,180,240,0.2)", border: "1px solid rgba(200,180,240,0.4)", color: "#F5F2EB" }
                                ),
                              }}
                            >
                              {verifyState === "loading" ? "VERIFYING..." : verifyState === "failed" ? "NOT YET — KEEP GOING" : "VERIFY MY ELIGIBILITY"}
                            </span>
                          </div>

                          {/* PANEL CTAs */}
                          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                            <span
                              onClick={() => { if (onNavigate) onNavigate("profile"); }}
                              style={{
                                fontFamily: outfit, fontWeight: 700, fontSize: "11px", color: "rgba(200,180,240,0.9)", letterSpacing: "2px",
                                padding: "10px 20px", border: "1px solid rgba(200,180,240,0.25)", borderRadius: "8px",
                                cursor: "pointer", display: "inline-block",
                              }}>VIEW YOUR GRAVII ID →</span>
                            <span
                              onClick={() => { if (onNavigate) onNavigate("leaderboard"); }}
                              style={{
                                fontFamily: outfit, fontWeight: 700, fontSize: "11px", color: sub, letterSpacing: "2px",
                                padding: "10px 20px", border: `1px solid ${cardBorder}`, borderRadius: "8px",
                                cursor: "pointer", display: "inline-block",
                              }}>BOOST STANDING →</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {c.eligible === null && (
                    <span onClick={(e) => e.stopPropagation()} style={{
                      fontFamily: outfit, fontWeight: 700, fontSize: "13px", color: sub, letterSpacing: "2px",
                      padding: "12px 28px", border: `1px solid ${cardBorder}`, borderRadius: "8px",
                      cursor: "pointer", display: "inline-block",
                    }}>NOTIFY ME WHEN LIVE</span>
                  )}
                  {c.eligible === "ineligible" && (
                    <span style={{
                      fontFamily: outfit, fontWeight: 700, fontSize: "13px", color: "rgba(255,90,90,0.6)", letterSpacing: "2px",
                      padding: "12px 28px", border: "1px solid rgba(255,90,90,0.15)", borderRadius: "8px",
                      display: "inline-block", opacity: 0.7, cursor: "default",
                    }}>NOT AVAILABLE</span>
                  )}
                </div>
              )}
            </div>
            );
          })}
        </div>

        {/* 파트너 간 이동 */}
        {(() => {
          const currentIdx = filteredPartners.findIndex(x => x.id === selectedPartner);
          const prevPartner = currentIdx > 0 ? filteredPartners[currentIdx - 1] : null;
          const nextPartner = currentIdx < filteredPartners.length - 1 ? filteredPartners[currentIdx + 1] : null;
          return (
          <div style={{ display: "flex", gap: "10px", marginTop: "28px", animation: "fadeInUp 0.5s ease 0.6s both" }}>
            {prevPartner ? (
              <div
                onClick={(e) => { e.stopPropagation(); setSelectedPartner(prevPartner.id); setExpandedCampaign(null); setShowQualify(null); setVerifyState(null); }}
                style={{
                  flex: 1, padding: "14px 18px", border: `1px solid ${cardBorder}`, borderRadius: "8px",
                  cursor: "pointer", transition: "background 0.2s ease",
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
              >
                <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "11px", color: sub, letterSpacing: "2px" }}>← {prevPartner.name}</span>
              </div>
            ) : <div style={{ flex: 1 }} />}
            <div
              onClick={(e) => { e.stopPropagation(); setSelectedPartner(null); }}
              style={{
                padding: "14px 24px", border: `1px solid ${cardBorder}`, borderRadius: "8px",
                cursor: "pointer", transition: "background 0.2s ease", textAlign: "center",
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
            >
              <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "11px", color: sub, letterSpacing: "2px" }}>ALL PARTNERS</span>
            </div>
            {nextPartner ? (
              <div
                onClick={(e) => { e.stopPropagation(); setSelectedPartner(nextPartner.id); setExpandedCampaign(null); setShowQualify(null); setVerifyState(null); }}
                style={{
                  flex: 1, padding: "14px 18px", border: `1px solid ${cardBorder}`, borderRadius: "8px",
                  cursor: "pointer", transition: "background 0.2s ease", textAlign: "right",
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
              >
                <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "11px", color: sub, letterSpacing: "2px" }}>{nextPartner.name} →</span>
              </div>
            ) : <div style={{ flex: 1 }} />}
          </div>
          );
        })()}
      </div>
    );
  }

  // ── 메인 리스트 뷰 ──
  return (
    <div>
      <p style={{ fontFamily: fraunces, fontSize: "34px", fontWeight: 700, color: t, lineHeight: 1.4, marginBottom: "18px", animation: "fadeInUp 0.6s ease 0.3s both" }}>
        Discover the Full Spectrum of Benefits.
      </p>
      <p style={{ fontFamily: outfit, fontWeight: 400, fontSize: "17px", color: sub, lineHeight: 1.7, marginBottom: "28px", animation: "fadeInUp 0.6s ease 0.45s both" }}>
        Browse diverse offers across the ecosystem. Claim available benefits, or fulfill the requirements to qualify for exclusive privileges.
      </p>

      {/* 필터 row: All Partners + 카테고리 칩 + Status 드롭다운 + 검색 */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "24px", animation: "fadeInUp 0.5s ease 0.5s both", flexWrap: "wrap" }}>
        {/* 1차 필터: All Partners + 카테고리 칩 */}
        {categories.map((cat, i) => (
          <span
            key={cat}
            onClick={(e) => { e.stopPropagation(); setActiveCat(i); }}
            style={{
              fontFamily: outfit, fontWeight: 700, fontSize: "12px",
              color: activeCat === i ? "#1A1A1A" : "rgba(255,255,255,0.5)",
              background: activeCat === i ? "rgba(230,220,250,0.8)" : "rgba(255,255,255,0.06)",
              padding: "7px 16px", borderRadius: "20px", letterSpacing: "1px",
              border: `1px solid ${activeCat === i ? "rgba(230,220,250,0.6)" : "rgba(255,255,255,0.1)"}`,
              cursor: "pointer",
              transition: "all 0.25s ease",
            }}
          >{cat}</span>
        ))}

        {/* 구분선 */}
        <div style={{ width: "1px", height: "20px", background: "rgba(255,255,255,0.1)", margin: "0 4px" }} />

        {/* 2차 필터: Status 드롭다운 */}
        <div style={{ position: "relative" }}>
          <span
            onClick={(e) => { e.stopPropagation(); setStatusOpen(!statusOpen); }}
            style={{
              fontFamily: outfit, fontWeight: 700, fontSize: "12px",
              color: activeStatus > 0 ? "#1A1A1A" : "rgba(255,255,255,0.5)", letterSpacing: "1px",
              padding: "7px 16px", borderRadius: "20px",
              border: activeStatus > 0 ? "1px solid rgba(230,220,250,0.6)" : "1px solid rgba(255,255,255,0.1)",
              background: activeStatus > 0 ? "rgba(230,220,250,0.8)" : "rgba(255,255,255,0.04)",
              cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: "6px",
              transition: "all 0.25s ease",
            }}
          >
            {statuses[activeStatus]}
            <span style={{ fontSize: "8px", opacity: 0.6 }}>{statusOpen ? "▲" : "▼"}</span>
          </span>
          {statusOpen && (
            <div style={{
              position: "absolute", top: "calc(100% + 6px)", left: 0,
              background: "rgba(26,26,26,0.95)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "12px",
              padding: "6px 0",
              zIndex: 10,
              minWidth: "180px",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
            }}>
              {statuses.map((s, i) => (
                <div
                  key={s}
                  onClick={(e) => { e.stopPropagation(); setActiveStatus(i); setStatusOpen(false); }}
                  style={{
                    fontFamily: outfit, fontWeight: activeStatus === i ? 700 : 400, fontSize: "11px",
                    color: activeStatus === i ? "rgba(230,220,250,0.9)" : "rgba(255,255,255,0.5)",
                    padding: "8px 18px",
                    cursor: "pointer",
                    letterSpacing: "0.5px",
                    transition: "background 0.2s ease",
                    background: "transparent",
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                >{s}</div>
              ))}
            </div>
          )}
        </div>

        {/* 검색 (마지막) */}
        <div style={{
          display: "flex", alignItems: "center", gap: "6px",
          padding: "6px 14px", borderRadius: "20px",
          border: "1px solid rgba(255,255,255,0.1)",
          background: "rgba(255,255,255,0.04)",
          marginLeft: "auto",
        }}>
          <span style={{ fontSize: "11px", opacity: 0.4 }}>🔍</span>
          <input
            type="text"
            placeholder="Search partners..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "transparent", border: "none", outline: "none",
              fontFamily: outfit, fontSize: "12px", color: t, letterSpacing: "0.5px",
              width: "130px",
            }}
          />
        </div>
      </div>

      {/* 파트너 카드 그리드 */}
      <div style={{ position: "relative" }}>
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px",
          filter: connected ? "blur(0)" : "blur(5px)",
          opacity: connected ? 1 : 0.6,
          transition: "filter 0.5s ease, opacity 0.5s ease",
        }}>
          {filteredPartners.length === 0 && connected && (
            <div style={{ gridColumn: "1 / -1", padding: "48px 24px", textAlign: "center" }}>
              <p style={{ fontFamily: outfit, fontWeight: 700, fontSize: "14px", color: sub, letterSpacing: "1px", marginBottom: "8px" }}>No partners match your filters.</p>
              <p style={{ fontFamily: outfit, fontWeight: 400, fontSize: "13px", color: "rgba(255,255,255,0.3)" }}>Try adjusting the category or status filter above.</p>
            </div>
          )}
          {filteredPartners.map((p) => (
            <div
              key={p.id}
              onClick={(e) => { e.stopPropagation(); if (connected) { setSelectedPartner(p.id); setExpandedCampaign(null); } }}
              style={{
                padding: "24px", border: `1px solid ${cardBorder}`, borderRadius: "12px",
                background: p.eligible === false ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.04)",
                opacity: p.eligible === false ? 0.7 : 1,
                animation: `fadeInUp 0.6s ease ${p.delay} both`,
                cursor: connected ? "pointer" : "default",
                transition: "background 0.2s ease",
              }}
              onMouseEnter={(e) => { if (connected) e.currentTarget.style.background = "rgba(255,255,255,0.07)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = p.eligible === false ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.04)"; }}
            >
              {/* Row 1: 아바타 + 파트너명 + 상태 */}
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px" }}>
                <div style={{
                  width: "36px", height: "36px", borderRadius: "8px", flexShrink: 0,
                  background: `hsl(${p.name.charCodeAt(0) * 37 % 360}, 35%, 25%)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}>
                  <span style={{ fontFamily: syne, fontWeight: 800, fontSize: "14px", color: "rgba(255,255,255,0.7)" }}>{p.name.charAt(p.name.length - 1)}</span>
                </div>
                <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "18px", color: t, flex: 1 }}>{p.name}</span>
                <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "12px", color: statusColor(p.status), letterSpacing: "1.5px" }}>{p.status}</span>
              </div>
              {/* Row 2: 캠페인 수 + eligible 카운트 */}
              <div style={{ marginBottom: "12px" }}>
                <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "13px", color: sub }}>
                  {p.campaigns.length} campaign{p.campaigns.length > 1 ? "s" : ""}
                  {(() => {
                    const elig = p.campaigns.filter(c => c.eligible === true).length;
                    return elig > 0 && elig < p.campaigns.length ? ` · ${elig} eligible` : "";
                  })()}
                </span>
              </div>
              {/* Row 3: 대표 태그 chips */}
              {(() => {
                const rep = getRepTags(p);
                return (
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
                    {rep.shown.map((tag, ti) => <TagChip key={ti} tag={tag} />)}
                    {rep.extra > 0 && <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "11px", color: sub }}>+{rep.extra} more</span>}
                  </div>
                );
              })()}
            </div>
          ))}
        </div>
        {!connected && (
          <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ padding: "40px 60px", background: "rgba(26,26,26,0.92)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "16px", textAlign: "center", minWidth: "340px" }}>
              <p onClick={() => { if (onNavigate) onNavigate("profile"); }} style={{ fontFamily: outfit, fontWeight: 700, fontSize: "18px", color: "#F5F2EB", letterSpacing: "3px", margin: "0 0 14px", cursor: "pointer" }}>GET YOUR GRAVII ID</p>
              <p style={{ fontFamily: outfit, fontWeight: 400, fontSize: "15px", color: "rgba(255,255,255,0.5)", margin: "0 0 10px" }}>Discover campaigns matched to your profile.</p>
              <p style={{ fontFamily: fraunces, fontStyle: "italic", fontSize: "14px", color: "rgba(255,255,255,0.3)", margin: "0 0 24px" }}>Complimentary — no strings.</p>
              <p onClick={() => onConnect()} style={{ fontFamily: outfit, fontWeight: 400, fontSize: "14px", color: "rgba(255,255,255,0.4)", margin: 0, cursor: "pointer" }}>Already have one? <span style={{ fontWeight: 700, textDecoration: "underline" }}>Connect →</span></p>
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
  const cardBg = dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";
  const cardBorder = dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.1)";
  const dashBg = "#0F1118";
  const green = "rgba(100,200,130,0.85)";
  const amber = "rgba(255,200,80,0.85)";
  const purple = "rgba(200,180,240,0.8)";
  const red = "rgba(255,90,90,0.8)";

  const [walletInput, setWalletInput] = useState("");
  const [showPayModal, setShowPayModal] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [historyPage, setHistoryPage] = useState(0);
  const PER_PAGE = 5;

  const analysisHistory = [
    { date: "Mar 8, 2026", wallet: "0x7a3b...9f2c", persona: "Strategic Holder" },
    { date: "Mar 5, 2026", wallet: "0x1D4e...a8B3", persona: "Profit Hunter" },
    { date: "Feb 28, 2026", wallet: "0xF92c...3e7A", persona: "Chain Hopper" },
    { date: "Feb 20, 2026", wallet: "0x8B1d...4c2F", persona: "NFT Collector" },
    { date: "Feb 15, 2026", wallet: "0xA3e7...d91B", persona: "Active Trader" },
    { date: "Feb 10, 2026", wallet: "0xC5f8...72eD", persona: "Cash Manager" },
    { date: "Feb 3, 2026", wallet: "0x2E9a...b4C1", persona: "Rising Star" },
    { date: "Jan 28, 2026", wallet: "0xD7b3...f8A2", persona: "Swing Trader" },
    { date: "Jan 20, 2026", wallet: "0x4F1c...e3D9", persona: "Major Investor" },
    { date: "Jan 15, 2026", wallet: "0x6A8d...1bF7", persona: "Community Leader" },
    { date: "Jan 8, 2026", wallet: "0x9C2e...5dA4", persona: "Smart Saver" },
    { date: "Dec 30, 2025", wallet: "0xB1f7...8cE3", persona: "Wealth Guard" },
  ];
  const totalPages = Math.ceil(analysisHistory.length / PER_PAGE);
  const pagedHistory = analysisHistory.slice(historyPage * PER_PAGE, (historyPage + 1) * PER_PAGE);

  const handleAnalyze = () => {
    if (!connected || !walletInput.trim()) return;
    setShowPayModal(true);
  };

  const handleConfirmPay = () => {
    setShowPayModal(false);
    setAnalyzing(true);
    setTimeout(() => {
      setAnalyzing(false);
      setResult(walletInput.trim() || "0x7a3b...9f2c");
    }, 2200);
  };

  // Mock data
  const mock = {
    wallet: result || "0x7a3b...9f2c",
    persona: "Strategic Holder",
    also: ["Profit Hunter", "Chain Hopper"],
    tier: "Platinum",
    since: "Oct 2023",
    risk: "LOW",
    sybil: "CLEAN",
    flags: "NONE",
    entropy: "0.15",
    totalValue: "$142,300",
    txCount: "1,247",
    monthlyVol: "$12,010",
    activeChains: "4",
    defiTvl: "$68,200",
    nftCount: "12",
    unclaimed: "$4,120",
    assets: {
      stables: { pct: 45, total: "$64,000", tokens: [
        { name: "USDC", total: "$48,500", breakdown: [{ chain: "ETH", val: "$28,000" }, { chain: "BSC", val: "$12,000" }, { chain: "Base", val: "$5,200" }, { chain: "ARB", val: "$3,300" }] },
        { name: "USDT", total: "$11,500", breakdown: [{ chain: "ETH", val: "$8,800" }, { chain: "BSC", val: "$2,700" }] },
        { name: "BUSD", total: "$4,200", breakdown: [{ chain: "BSC", val: "$4,200" }] },
        { name: "DAI", total: "$2,100", breakdown: [{ chain: "ETH", val: "$2,100" }] },
        { name: "USDbC", total: "$1,200", breakdown: [{ chain: "Base", val: "$1,200" }] },
        { name: "Others", total: "$500", isOthers: true, breakdown: [{ chain: "Various", val: "$500" }] },
      ]},
      native: { pct: 35, total: "$49,800", tokens: [
        { name: "ETH", total: "$43,000", breakdown: [{ chain: "ETH", val: "$38,100" }, { chain: "Base", val: "$3,800" }, { chain: "ARB", val: "$1,100" }] },
        { name: "BNB", total: "$8,400", breakdown: [{ chain: "BSC", val: "$8,400" }] },
        { name: "MATIC", total: "$1,800", breakdown: [{ chain: "Polygon", val: "$1,800" }] },
        { name: "AVAX", total: "$1,200", breakdown: [{ chain: "Avalanche", val: "$1,200" }] },
        { name: "SOL", total: "$800", breakdown: [{ chain: "Solana", val: "$800" }] },
        { name: "Others", total: "$600", isOthers: true, breakdown: [{ chain: "Various", val: "$600" }] },
      ]},
      others: { pct: 20, total: "$28,500", tokens: [
        { name: "ARB", total: "$4,200", breakdown: [{ chain: "Arbitrum", val: "$4,200" }] },
        { name: "CAKE", total: "$3,100", breakdown: [{ chain: "BSC", val: "$3,100" }] },
        { name: "LINK", total: "$1,200", breakdown: [{ chain: "ETH", val: "$1,200" }] },
        { name: "AERO", total: "$980", breakdown: [{ chain: "Base", val: "$980" }] },
        { name: "cbETH", total: "$720", breakdown: [{ chain: "Base", val: "$720" }] },
        { name: "Others", total: "$18,300", isOthers: true, breakdown: [{ chain: "Various", val: "$18,300" }] },
      ]},
    },
    chains: [
      { name: "Ethereum", pct: 52, value: "$74,200", tokenCount: 5 },
      { name: "BSC", pct: 28, value: "$38,400", tokenCount: 5 },
      { name: "Base", pct: 12, value: "$17,100", tokenCount: 5 },
      { name: "Arbitrum", pct: 6, value: "$8,300", tokenCount: 4 },
      { name: "Others", pct: 2, value: "$4,300", tokenCount: 4 },
    ],
    funding: { cex: 55, bridge: 30, wallet: 15, top3: ["Binance", "OKX", "Bybit"] },
    defi: {
      lp: { pct: 40, protocols: [{ name: "Uniswap V3", pct: 45 }, { name: "Aerodrome", pct: 30 }, { name: "PancakeSwap", pct: 15 }, { name: "Others", pct: 10 }] },
      lending: { pct: 25, protocols: [{ name: "Aave V3", pct: 52 }, { name: "Compound", pct: 28 }, { name: "Venus", pct: 12 }, { name: "Others", pct: 8 }] },
      staking: { pct: 20, protocols: [{ name: "Lido", pct: 60 }, { name: "Rocket Pool", pct: 22 }, { name: "Eigenlayer", pct: 12 }, { name: "Others", pct: 6 }] },
      vault: { pct: 15, protocols: [{ name: "Yearn", pct: 48 }, { name: "Beefy", pct: 32 }, { name: "Convex", pct: 14 }, { name: "Others", pct: 6 }] },
    },
    transfer: { incoming: 68, outgoing: 32, inVal: "$96,800", outVal: "$45,500", top3: ["0xABCD...1234", "0x7F2E...89ab", "0x3D1C...ef56"] },
    gas: { total: "$2,340", top3Chains: ["Ethereum 72%", "BSC 18%", "Base 10%"], avgTx: "$1.87" },
    recentTx: [
      { date: "Mar 7", action: "Swap 2.5 ETH → USDC", platform: "Uniswap", chain: "Ethereum" },
      { date: "Mar 5", action: "Stake 1,000 USDC", platform: "Aave", chain: "Ethereum" },
      { date: "Mar 3", action: "Bridge 500 USDC", platform: "Across", chain: "ETH → Base" },
      { date: "Mar 1", action: "LP 2,000 USDC-ETH", platform: "Aerodrome", chain: "Base" },
      { date: "Feb 28", action: "Claim 45 ARB rewards", platform: "Arbitrum", chain: "Arbitrum" },
    ],
  };

  // 대시보드 전용 다크 색상 (항상 다크)
  const dt = "#F5F2EB";
  const dsub = "rgba(255,255,255,0.5)";
  const dcardBg = "rgba(255,255,255,0.04)";
  const dcardBorder = "rgba(255,255,255,0.08)";

  const SectionTitle = ({ children }) => (
    <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "15px", color: "rgba(255,255,255,0.6)", letterSpacing: "2.5px", display: "block", marginBottom: "16px" }}>{children}</span>
  );

  const Card = ({ children, style: s = {} }) => (
    <div style={{ padding: "20px", border: `1px solid ${dcardBorder}`, borderRadius: "12px", background: dcardBg, ...s }}>{children}</div>
  );

  const MiniBar = ({ pct, color = purple }) => (
    <div style={{ flex: 1, height: "6px", borderRadius: "3px", background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", borderRadius: "3px", background: color, transition: "width 0.8s ease" }} />
    </div>
  );

  // ── 결과 대시보드 ──
  if (result) {
    return (
      <div style={{ color: dt, background: dashBg, margin: "-40px -60px", padding: "40px 60px", minHeight: "100%" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px", animation: "fadeInUp 0.4s ease both" }}>
          <span onClick={(e) => { e.stopPropagation(); setResult(null); setWalletInput(""); }} style={{ fontFamily: outfit, fontWeight: 700, fontSize: "13px", color: dsub, letterSpacing: "2px", cursor: "pointer" }}>← BACK TO SEARCH</span>
          <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "12px", color: dsub }}>ANALYZED</span>
        </div>

        <div style={{ fontFamily: outfit, fontWeight: 400, fontSize: "13px", color: dsub, marginBottom: "8px", animation: "fadeInUp 0.4s ease 0.05s both" }}>WALLET</div>
        <div style={{ fontFamily: syne, fontWeight: 800, fontSize: "22px", color: dt, marginBottom: "32px", animation: "fadeInUp 0.4s ease 0.1s both", wordBreak: "break-all" }}>{mock.wallet}</div>

        {/* ① IDENTITY */}
        <div style={{ animation: "fadeInUp 0.5s ease 0.15s both", marginBottom: "24px" }}>
          <SectionTitle>IDENTITY</SectionTitle>
          <Card>
            <div style={{ display: "flex", gap: "24px", alignItems: "flex-start" }}>
              <div style={{ flex: 1.3 }}>
                <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "12px", color: dsub, display: "block", marginBottom: "6px" }}>Primary Persona</span>
                <span style={{ fontFamily: syne, fontWeight: 800, fontSize: "20px", color: dt }}>{mock.persona}</span>
              </div>
              <div style={{ flex: 1.3 }}>
                <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "12px", color: dsub, display: "block", marginBottom: "6px" }}>Also (up to 2)</span>
                <div style={{ display: "flex", gap: "6px" }}>{mock.also.map(a => <span key={a} style={{ fontFamily: outfit, fontWeight: 600, fontSize: "12px", color: purple, padding: "3px 10px", borderRadius: "6px", background: "rgba(200,180,240,0.08)", border: "1px solid rgba(200,180,240,0.15)" }}>{a}</span>)}</div>
              </div>
              <div style={{ flex: 0.7 }}>
                <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "12px", color: dsub, display: "block", marginBottom: "6px" }}>Tier</span>
                <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "16px", color: dt }}>{mock.tier}</span>
              </div>
              <div style={{ flex: 0.8 }}>
                <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "12px", color: dsub, display: "block", marginBottom: "6px" }}>Active Since</span>
                <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "16px", color: dt }}>{mock.since}</span>
              </div>
              <div style={{ flex: 0.7 }}>
                <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "12px", color: dsub, display: "block", marginBottom: "6px" }}>Reputation</span>
                <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "16px", color: green }}>Trusted</span>
              </div>
            </div>
          </Card>
        </div>

        {/* ② KEY METRICS */}
        <div style={{ animation: "fadeInUp 0.5s ease 0.2s both", marginBottom: "10px" }}>
          <SectionTitle>KEY METRICS</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
            {[
              { label: "TOTAL VALUE", value: mock.totalValue },
              { label: "TRANSACTIONS", value: mock.txCount },
              { label: "AVG MONTHLY TRADING VOL", value: mock.monthlyVol },
              { label: "ACTIVE CHAINS", value: mock.activeChains },
              { label: "DeFi TVL", value: mock.defiTvl },
              { label: "NFTs HELD", value: mock.nftCount },
            ].map(m => (
              <Card key={m.label}>
                <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "10px", color: dsub, letterSpacing: "1.5px", display: "block", marginBottom: "8px" }}>{m.label}</span>
                <span style={{ fontFamily: syne, fontWeight: 800, fontSize: "22px", color: dt }}>{m.value}</span>
              </Card>
            ))}
          </div>
        </div>

        {/* ②-b PORTFOLIO TREND */}
        <div style={{ animation: "fadeInUp 0.5s ease 0.22s both", marginBottom: "24px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
            {[
              { label: "7D TREND", value: "+3.2%", up: true },
              { label: "30D TREND", value: "+12.4%", up: true },
              { label: "90D TREND", value: "-2.8%", up: false },
            ].map(tr => (
              <Card key={tr.label}>
                <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "10px", color: dsub, letterSpacing: "1.5px", display: "block", marginBottom: "8px" }}>{tr.label}</span>
                <span style={{ fontFamily: syne, fontWeight: 800, fontSize: "22px", color: tr.up ? green : red }}>{tr.value}</span>
                <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "10px", color: dsub, display: "block", marginTop: "4px" }}>portfolio</span>
              </Card>
            ))}
          </div>
        </div>

        {/* ③ PORTFOLIO OVERVIEW (Asset + Chain 통합) */}
        <div style={{ animation: "fadeInUp 0.5s ease 0.25s both", marginBottom: "24px" }}>
          <SectionTitle>PORTFOLIO OVERVIEW</SectionTitle>
          <Card style={{ padding: "28px" }}>
            {/* Total */}
            <div style={{ marginBottom: "24px" }}>
              <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "12px", color: dsub, display: "block", marginBottom: "6px" }}>Total Value</span>
              <span style={{ fontFamily: syne, fontWeight: 800, fontSize: "28px", color: dt }}>{mock.totalValue}</span>
            </div>

            {/* Donut + 유형별 요약 */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "28px", marginBottom: "28px" }}>
              {/* 좌: 도넛 + 유형별 */}
              <div style={{ display: "flex", gap: "20px", alignItems: "center", borderRight: `1px solid ${dcardBorder}`, paddingRight: "28px" }}>
                <div style={{
                  width: "120px", height: "120px", borderRadius: "50%", flexShrink: 0,
                  background: `conic-gradient(${green} 0% ${mock.assets.stables.pct}%, rgba(130,160,240,0.8) ${mock.assets.stables.pct}% ${mock.assets.stables.pct + mock.assets.native.pct}%, ${amber} ${mock.assets.stables.pct + mock.assets.native.pct}% 100%)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <div style={{ width: "68px", height: "68px", borderRadius: "50%", background: dashBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "9px", color: dsub, letterSpacing: "1px" }}>ASSETS</span>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1 }}>
                  {[
                    { label: "Stablecoins", data: mock.assets.stables, color: green },
                    { label: "Native Tokens", data: mock.assets.native, color: "rgba(130,160,240,0.8)" },
                    { label: "Other Tokens", data: mock.assets.others, color: amber },
                  ].map(a => (
                    <div key={a.label} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{ width: "7px", height: "7px", borderRadius: "2px", background: a.color, flexShrink: 0 }} />
                      <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "12px", color: dsub, flex: 1 }}>{a.label}</span>
                      <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "13px", color: dt }}>{a.data.total}</span>
                      <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "11px", color: dsub }}>{a.data.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 우: 체인 분포 + 건강도 */}
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {/* 체인 분포 */}
                <div>
                  <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "11px", color: "rgba(255,255,255,0.4)", letterSpacing: "1.5px", display: "block", marginBottom: "10px" }}>BY CHAIN</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {mock.chains.map(ch => (
                      <div key={ch.name} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{ fontFamily: outfit, fontWeight: 600, fontSize: "12px", color: dt, minWidth: "70px" }}>{ch.name}</span>
                        <div style={{ flex: 1, height: "5px", borderRadius: "3px", background: "rgba(255,255,255,0.04)", overflow: "hidden" }}>
                          <div style={{ width: `${ch.pct}%`, height: "100%", borderRadius: "3px", background: purple, opacity: 0.6 }} />
                        </div>
                        <span style={{ fontFamily: outfit, fontWeight: 600, fontSize: "11px", color: dt, minWidth: "58px", textAlign: "right" }}>{ch.value}</span>
                        <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "10px", color: dsub, minWidth: "28px", textAlign: "right" }}>{ch.pct}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 건강도 */}
                <div style={{ paddingTop: "12px", borderTop: `1px solid ${dcardBorder}` }}>
                  <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "11px", color: "rgba(255,255,255,0.4)", letterSpacing: "1.5px", display: "block", marginBottom: "10px" }}>HEALTH</span>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px" }}>
                    {[
                      { label: "Diversification", value: "High", color: green },
                      { label: "Chain Spread", value: `${mock.activeChains} active`, color: green },
                      { label: "Stable Ratio", value: `${mock.assets.stables.pct}%`, color: mock.assets.stables.pct > 30 ? green : amber },
                      { label: "DeFi Usage", value: "Strong", color: green },
                    ].map(h => (
                      <div key={h.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "11px", color: dsub }}>{h.label}</span>
                        <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "11px", color: h.color }}>{h.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ height: "1px", background: dcardBorder, marginBottom: "24px" }} />

            {/* BY ASSET TYPE — 중첩 바 비주얼 */}
            <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "16px" }}>
              <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "14px", color: "rgba(255,255,255,0.6)", letterSpacing: "2px" }}>BY ASSET TYPE</span>
              <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "11px", color: "rgba(255,255,255,0.3)", fontStyle: "italic" }}>Top 5 per category · remaining grouped as Others</span>
            </div>

            {[
              { label: "STABLECOINS", data: mock.assets.stables, color: green },
              { label: "NATIVE TOKENS", data: mock.assets.native, color: "rgba(130,160,240,0.8)" },
              { label: "OTHER TOKENS", data: mock.assets.others, color: amber },
            ].map(cat => {
              const maxVal = Math.max(...cat.data.tokens.map(tk => parseFloat(tk.total.replace(/[$,]/g, ""))));
              return (
              <div key={cat.label} style={{ marginBottom: "24px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
                  <div style={{ width: "6px", height: "6px", borderRadius: "2px", background: cat.color }} />
                  <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "13px", color: "rgba(255,255,255,0.55)", letterSpacing: "1.5px" }}>{cat.label}</span>
                  <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "11px", color: "rgba(255,255,255,0.3)", marginLeft: "auto", marginRight: "4px" }}>Total</span>
                  <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "13px", color: dt }}>{cat.data.total}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px", paddingLeft: "14px" }}>
                  {cat.data.tokens.map(tk => {
                    const tkVal = parseFloat(tk.total.replace(/[$,]/g, ""));
                    const tkPct = (tkVal / maxVal) * 100;
                    const isOthers = tk.isOthers;
                    return (
                    <div key={tk.name} style={{ opacity: isOthers ? 0.5 : 1 }}>
                      {/* 토큰 바 */}
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                        <span style={{ fontFamily: outfit, fontWeight: isOthers ? 400 : 700, fontSize: "13px", color: isOthers ? dsub : dt, minWidth: "55px", fontStyle: isOthers ? "italic" : "normal" }}>{tk.name}</span>
                        <div style={{ flex: 1, height: isOthers ? "4px" : "8px", borderRadius: "4px", background: "rgba(255,255,255,0.04)", overflow: "hidden" }}>
                          <div style={{ width: `${tkPct}%`, height: "100%", borderRadius: "4px", background: cat.color, opacity: isOthers ? 0.3 : 0.7, transition: "width 0.8s ease" }} />
                        </div>
                        <span style={{ fontFamily: outfit, fontWeight: isOthers ? 400 : 700, fontSize: "12px", color: isOthers ? dsub : dt, minWidth: "70px", textAlign: "right" }}>{tk.total}</span>
                      </div>
                      {/* 체인별 서브 바 */}
                      {tk.breakdown.length > 1 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "3px", paddingLeft: "65px" }}>
                          {tk.breakdown.map(b => {
                            const bVal = parseFloat(b.val.replace(/[$,]/g, ""));
                            const bPct = (bVal / tkVal) * 100;
                            return (
                            <div key={b.chain} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "10px", color: "rgba(255,255,255,0.3)", minWidth: "58px" }}>on {b.chain}</span>
                              <div style={{ flex: 1, height: "4px", borderRadius: "2px", background: "rgba(255,255,255,0.03)", overflow: "hidden" }}>
                                <div style={{ width: `${bPct}%`, height: "100%", borderRadius: "2px", background: cat.color, opacity: 0.35 }} />
                              </div>
                              <span style={{ fontFamily: outfit, fontWeight: 600, fontSize: "10px", color: dsub, minWidth: "55px", textAlign: "right" }}>{b.val}</span>
                            </div>
                            );
                          })}
                        </div>
                      )}
                      {tk.breakdown.length === 1 && (
                        <div style={{ paddingLeft: "65px" }}>
                          <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "10px", color: "rgba(255,255,255,0.3)" }}>on {tk.breakdown[0].chain}</span>
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              </div>
              );
            })}

          </Card>
        </div>

        {/* ⑤ FUNDING SOURCES */}
        <div style={{ animation: "fadeInUp 0.5s ease 0.35s both", marginBottom: "24px" }}>
          <SectionTitle>FUNDING SOURCES</SectionTitle>
          <Card>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {[
                { label: "CEX (Centralized Exchange)", pct: mock.funding.cex },
                { label: "Bridge", pct: mock.funding.bridge },
                { label: "Direct Wallet", pct: mock.funding.wallet },
              ].map(f => (
                <div key={f.label} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "13px", color: dsub, minWidth: "200px" }}>{f.label}</span>
                  <MiniBar pct={f.pct} />
                  <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "13px", color: dt, minWidth: "36px", textAlign: "right" }}>{f.pct}%</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: "14px", paddingTop: "14px", borderTop: `1px solid ${dcardBorder}` }}>
              <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "12px", color: dsub }}>Top 3 Sources: <span style={{ color: dt, fontWeight: 700 }}>{mock.funding.top3.join(" · ")}</span></span>
            </div>
          </Card>
        </div>

        {/* ⑥ DeFi ENGAGEMENT */}
        <div style={{ animation: "fadeInUp 0.5s ease 0.4s both", marginBottom: "24px" }}>
          <SectionTitle>DeFi ENGAGEMENT</SectionTitle>
          <Card>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {[
                { label: "Liquidity Providing", data: mock.defi.lp, color: "rgba(100,200,200,0.8)" },
                { label: "Lending", data: mock.defi.lending, color: "rgba(130,160,240,0.8)" },
                { label: "Staking", data: mock.defi.staking, color: purple },
                { label: "Vault", data: mock.defi.vault, color: amber },
              ].map(d => (
                <div key={d.label}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "6px" }}>
                    <span style={{ fontFamily: outfit, fontWeight: 500, fontSize: "13px", color: dsub, minWidth: "160px" }}>{d.label}</span>
                    <MiniBar pct={d.data.pct} color={d.color} />
                    <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "13px", color: dt, minWidth: "36px", textAlign: "right" }}>{d.data.pct}%</span>
                  </div>
                  <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", paddingLeft: "172px" }}>
                    {d.data.protocols.map(p => (
                      <span key={p.name} style={{ fontFamily: outfit, fontWeight: 400, fontSize: "10px", color: p.name === "Others" ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.35)" }}>
                        {p.name} <span style={{ color: dsub, fontWeight: 600 }}>{p.pct}%</span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: `1px solid ${dcardBorder}` }}>
              <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "12px", color: dsub }}>Unclaimed Rewards: <span style={{ color: green, fontWeight: 700 }}>{mock.unclaimed}</span></span>
            </div>
          </Card>
        </div>

        {/* ⑦ RISK ASSESSMENT */}
        <div style={{ animation: "fadeInUp 0.5s ease 0.45s both", marginBottom: "24px" }}>
          <SectionTitle>RISK ASSESSMENT</SectionTitle>
          <Card>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
              {[
                { label: "RISK LEVEL", value: mock.risk, color: green },
                { label: "SYBIL STATUS", value: mock.sybil, color: green },
                { label: "ENTROPY", value: mock.entropy, color: dsub },
                { label: "FLAGS", value: mock.flags, color: green },
              ].map(r => (
                <div key={r.label} style={{ textAlign: "center" }}>
                  <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "10px", color: dsub, letterSpacing: "1.5px", display: "block", marginBottom: "8px" }}>{r.label}</span>
                  <span style={{ fontFamily: syne, fontWeight: 800, fontSize: "18px", color: r.color }}>{r.value}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* ⑧ TRANSFER & GAS */}
        <div style={{ animation: "fadeInUp 0.5s ease 0.5s both", marginBottom: "24px" }}>
          <SectionTitle>TRANSFER PATTERNS & GAS</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <Card>
              <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "14px", color: "rgba(255,255,255,0.6)", letterSpacing: "1.5px", display: "block", marginBottom: "14px" }}>TRANSFERS</span>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "13px", color: dsub, minWidth: "80px" }}>Incoming</span>
                <MiniBar pct={mock.transfer.incoming} color={green} />
                <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "13px", color: dt, minWidth: "36px", textAlign: "right" }}>{mock.transfer.incoming}%</span>
                <span style={{ fontFamily: outfit, fontWeight: 600, fontSize: "12px", color: green, minWidth: "65px", textAlign: "right" }}>{mock.transfer.inVal}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
                <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "13px", color: dsub, minWidth: "80px" }}>Outgoing</span>
                <MiniBar pct={mock.transfer.outgoing} color={amber} />
                <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "13px", color: dt, minWidth: "36px", textAlign: "right" }}>{mock.transfer.outgoing}%</span>
                <span style={{ fontFamily: outfit, fontWeight: 600, fontSize: "12px", color: amber, minWidth: "65px", textAlign: "right" }}>{mock.transfer.outVal}</span>
              </div>
              <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "11px", color: dsub }}>Top 3 Counterparties: <span style={{ color: dt }}>{mock.transfer.top3.join(" · ")}</span></span>
            </Card>
            <Card>
              <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "14px", color: "rgba(255,255,255,0.6)", letterSpacing: "1.5px", display: "block", marginBottom: "14px" }}>GAS SPENDING</span>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div><span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "12px", color: dsub }}>Total Spent</span><br/><span style={{ fontFamily: syne, fontWeight: 800, fontSize: "20px", color: dt }}>{mock.gas.total}</span></div>
                <div><span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "12px", color: dsub }}>Top 3 Chains: <span style={{ color: dt }}>{mock.gas.top3Chains.join(" · ")}</span></span></div>
                <div><span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "12px", color: dsub }}>Avg per TX: <span style={{ color: dt }}>{mock.gas.avgTx}</span></span></div>
              </div>
            </Card>
          </div>
        </div>

        {/* ⑨ RECENT ACTIVITY */}
        <div style={{ animation: "fadeInUp 0.5s ease 0.55s both", marginBottom: "24px" }}>
          <SectionTitle>RECENT ACTIVITY</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {mock.recentTx.map((tx, i) => (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "70px 1fr 100px 100px", gap: "12px", alignItems: "center",
                padding: "14px 18px", border: `1px solid ${dcardBorder}`, borderRadius: "10px", background: dcardBg,
              }}>
                <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "12px", color: dsub }}>{tx.date}</span>
                <span style={{ fontFamily: outfit, fontWeight: 500, fontSize: "13px", color: dt }}>{tx.action}</span>
                <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "11px", color: purple }}>{tx.platform}</span>
                <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "11px", color: dsub, textAlign: "right" }}>{tx.chain}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── 로딩 화면 ──
  if (analyzing) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "300px", color: dt, background: dashBg, margin: "-40px -60px", padding: "40px 60px" }}>
        <div style={{
          width: "48px", height: "48px", border: "3px solid rgba(255,255,255,0.1)", borderTop: "3px solid rgba(200,180,240,0.8)",
          borderRadius: "50%", animation: "spin 1s linear infinite", marginBottom: "24px",
        }} />
        <p style={{ fontFamily: outfit, fontWeight: 700, fontSize: "14px", color: dsub, letterSpacing: "3px", marginBottom: "8px" }}>ANALYZING WALLET</p>
        <p style={{ fontFamily: outfit, fontWeight: 400, fontSize: "13px", color: "rgba(255,255,255,0.3)" }}>{walletInput || "0x..."}</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── 입력 화면 ──
  return (
    <div>
      {/* 결제 확인 모달 */}
      {showPayModal && (
        <div onClick={(e) => { e.stopPropagation(); setShowPayModal(false); }} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: "#1A1A1A", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "16px",
            padding: "36px 40px", maxWidth: "400px", width: "90%", textAlign: "center",
          }}>
            <p style={{ fontFamily: syne, fontWeight: 800, fontSize: "24px", color: "#F5F2EB", marginBottom: "12px" }}>0.1 USDC</p>
            <p style={{ fontFamily: outfit, fontWeight: 400, fontSize: "14px", color: "rgba(255,255,255,0.6)", marginBottom: "24px", lineHeight: 1.6 }}>
              Confirm payment to analyze this wallet through the Gravii intelligence layer.
            </p>
            <p style={{ fontFamily: outfit, fontWeight: 400, fontSize: "11px", color: "rgba(255,255,255,0.25)", marginBottom: "28px" }}>* All transactions are final.</p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
              <span onClick={() => setShowPayModal(false)} style={{
                fontFamily: outfit, fontWeight: 700, fontSize: "12px", color: "rgba(255,255,255,0.5)", letterSpacing: "2px",
                padding: "12px 28px", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "8px", cursor: "pointer",
              }}>CANCEL</span>
              <span onClick={handleConfirmPay} style={{
                fontFamily: outfit, fontWeight: 700, fontSize: "12px", color: "#1A1A1A", letterSpacing: "2px",
                padding: "12px 28px", background: "rgba(200,180,240,0.85)", borderRadius: "8px", cursor: "pointer",
              }}>CONFIRM & PAY</span>
            </div>
          </div>
        </div>
      )}

      <p style={{ fontFamily: fraunces, fontSize: "34px", fontWeight: 700, color: t, lineHeight: 1.4, marginBottom: "18px", animation: "fadeInUp 0.6s ease 0.3s both" }}>
        Deep-dive into any wallet's footprint.
      </p>
      <p style={{ fontFamily: outfit, fontWeight: 400, fontSize: "17px", color: sub, lineHeight: 1.7, marginBottom: "12px", animation: "fadeInUp 0.6s ease 0.45s both" }}>
        Unlock the in-depth Dashboard to analyze any wallet address through the Gravii intelligence layer.
      </p>
      <p style={{ fontFamily: outfit, fontWeight: 400, fontSize: "11px", color: "rgba(255,255,255,0.3)", marginBottom: "36px", animation: "fadeInUp 0.6s ease 0.48s both" }}>
        * All transactions are final.
      </p>
      <div>
          <div style={{
            display: "flex", alignItems: "center", gap: "12px",
            padding: "16px 20px", border: `1px solid rgba(255,255,255,0.1)`, borderRadius: "10px",
            background: cardBg, marginBottom: "20px", animation: "fadeInUp 0.6s ease 0.55s both",
          }}>
            <input
              type="text"
              placeholder="0x000... enter any wallet address"
              value={walletInput}
              onChange={(e) => setWalletInput(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              style={{
                background: "transparent", border: "none", outline: "none",
                fontFamily: outfit, fontWeight: 400, fontSize: "14px", color: t,
                flex: 1,
              }}
            />
            <span
              onClick={(e) => { e.stopPropagation(); handleAnalyze(); }}
              style={{
                fontFamily: outfit, fontWeight: 700, fontSize: "11px", color: connected ? t : sub, letterSpacing: "2px",
                padding: "8px 20px", background: "rgba(255,255,255,0.08)", borderRadius: "6px",
                opacity: connected ? 1 : 0.5,
                cursor: connected ? "pointer" : "default",
              }}>{connected ? "ANALYZE" : "SIGN IN TO SEARCH"}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", animation: "fadeInUp 0.6s ease 0.65s both" }}>
            {[
              { label: "COST", value: "0.1 USDC" },
              { label: "IN-DEPTH", value: "MULTI-CHAIN" },
              { label: "SPEED", value: "< 30 SEC" },
            ].map(s => (
              <div key={s.label} style={{
                padding: "16px", border: `1px solid rgba(255,255,255,0.1)`, borderRadius: "10px",
                background: cardBg, textAlign: "center",
              }}>
                <div style={{ fontFamily: syne, fontWeight: 800, fontSize: "16px", color: t, marginBottom: "4px" }}>{s.value}</div>
                <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "10px", color: sub, letterSpacing: "2px" }}>{s.label}</span>
              </div>
            ))}
          </div>
          {!connected && (
            <div onClick={(e) => { e.stopPropagation(); onConnect(); }} style={{ marginTop: "28px", textAlign: "center", cursor: "pointer", animation: "fadeInUp 0.6s ease 0.75s both" }}>
              <span style={{
                fontFamily: outfit, fontWeight: 700, fontSize: "13px", color: t, letterSpacing: "2px",
                padding: "14px 40px", background: "transparent", border: `1.5px solid ${t}`, borderRadius: "10px",
                display: "inline-block", transition: "opacity 0.2s ease",
              }}>SIGN IN TO START ANALYZING</span>
            </div>
          )}

          {/* ANALYSIS HISTORY — connected only */}
          {connected && (
            <div style={{ marginTop: "36px", animation: "fadeInUp 0.6s ease 0.8s both" }}>
              <div style={{ height: "1px", background: cardBorder, marginBottom: "28px" }} />
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "16px" }}>
                <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "15px", color: "rgba(255,255,255,0.6)", letterSpacing: "2.5px" }}>ANALYSIS HISTORY</span>
                <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "12px", color: sub }}>{analysisHistory.length} analyzed</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "16px" }}>
                {pagedHistory.map((h, i) => (
                  <div
                    key={h.wallet}
                    onClick={(e) => { e.stopPropagation(); setWalletInput(h.wallet); setResult(h.wallet); }}
                    style={{
                      display: "grid", gridTemplateColumns: "110px 1fr 140px 24px", gap: "12px", alignItems: "center",
                      padding: "14px 18px", border: `1px solid ${cardBorder}`, borderRadius: "10px", background: cardBg,
                      cursor: "pointer", transition: "border-color 0.2s ease",
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.borderColor = "rgba(200,180,240,0.3)"}
                    onMouseLeave={(e) => e.currentTarget.style.borderColor = cardBorder}
                  >
                    <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "12px", color: sub }}>{h.date}</span>
                    <span style={{ fontFamily: outfit, fontWeight: 600, fontSize: "13px", color: t }}>{h.wallet}</span>
                    <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "12px", color: "rgba(200,180,240,0.7)" }}>{h.persona}</span>
                    <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "13px", color: sub }}>→</span>
                  </div>
                ))}
              </div>
              {/* 페이지네이션 */}
              {totalPages > 1 && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                  <span
                    onClick={(e) => { e.stopPropagation(); if (historyPage > 0) setHistoryPage(historyPage - 1); }}
                    style={{
                      fontFamily: outfit, fontWeight: 700, fontSize: "12px", color: historyPage > 0 ? t : "rgba(255,255,255,0.15)",
                      padding: "6px 12px", borderRadius: "6px", cursor: historyPage > 0 ? "pointer" : "default",
                    }}>←</span>
                  {Array.from({ length: totalPages }, (_, i) => (
                    <span
                      key={i}
                      onClick={(e) => { e.stopPropagation(); setHistoryPage(i); }}
                      style={{
                        fontFamily: outfit, fontWeight: 700, fontSize: "12px",
                        color: i === historyPage ? "#1A1A1A" : sub,
                        background: i === historyPage ? "rgba(200,180,240,0.8)" : "transparent",
                        padding: "6px 10px", borderRadius: "6px", cursor: "pointer",
                        minWidth: "28px", textAlign: "center",
                      }}>{i + 1}</span>
                  ))}
                  <span
                    onClick={(e) => { e.stopPropagation(); if (historyPage < totalPages - 1) setHistoryPage(historyPage + 1); }}
                    style={{
                      fontFamily: outfit, fontWeight: 700, fontSize: "12px", color: historyPage < totalPages - 1 ? t : "rgba(255,255,255,0.15)",
                      padding: "6px 12px", borderRadius: "6px", cursor: historyPage < totalPages - 1 ? "pointer" : "default",
                    }}>→</span>
                </div>
              )}
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

  const [activeCat, setActiveCat] = useState(0);
  const categories = ["Top Movers", "Power Users", "High Volume", "Rising Stars", "Trendsetters", "Most Active"];

  const tierColor = (tier) => {
    if (tier === "Black") return "rgba(255,255,255,0.85)";
    if (tier === "Platinum") return "rgba(200,200,220,0.8)";
    if (tier === "Gold") return "rgba(255,200,80,0.8)";
    if (tier === "Classic") return "rgba(160,200,160,0.7)";
    return sub;
  };

  // 카테고리별 리더보드 데이터
  const leaderboards = {
    0: [ // Top Movers
      { rank: "1", tier: "Black", name: "Benji", id: "xxx...sfxx", change: "+1", up: true },
      { rank: "2", tier: "Black", name: "Diddy", id: "xxx...pxxx", change: "-1", up: false },
      { rank: "3", tier: "Platinum", name: "Satoshi", id: "xxx...a1b2", change: "+3", up: true },
      { rank: "4", tier: "Platinum", name: "Vitalik", id: "xxx...e4f5", change: "+2", up: true },
      { rank: "5", tier: "Platinum", name: "CZ", id: "xxx...g6h7", change: "-2", up: false },
      { rank: "6", tier: "Gold", name: "Punk6529", id: "xxx...i8j9", change: "+5", up: true },
      { rank: "7", tier: "Gold", name: "Cobie", id: "xxx...k0l1", change: "0", up: null },
      { rank: "8", tier: "Gold", name: "Hsaka", id: "xxx...m2n3", change: "+1", up: true },
      { rank: "9", tier: "Gold", name: "DCFgod", id: "xxx...o4p5", change: "-3", up: false },
      { rank: "10", tier: "Classic", name: "Ansem", id: "xxx...q6r7", change: "+4", up: true },
    ],
    1: [ // Power Users
      { rank: "1", tier: "Black", name: "Diddy", id: "xxx...pxxx", change: "+2", up: true },
      { rank: "2", tier: "Black", name: "Benji", id: "xxx...sfxx", change: "-1", up: false },
      { rank: "3", tier: "Platinum", name: "Vitalik", id: "xxx...e4f5", change: "0", up: null },
      { rank: "4", tier: "Platinum", name: "CZ", id: "xxx...g6h7", change: "+1", up: true },
      { rank: "5", tier: "Gold", name: "Hsaka", id: "xxx...m2n3", change: "+3", up: true },
      { rank: "6", tier: "Gold", name: "Punk6529", id: "xxx...i8j9", change: "-2", up: false },
      { rank: "7", tier: "Gold", name: "Cobie", id: "xxx...k0l1", change: "+1", up: true },
      { rank: "8", tier: "Platinum", name: "Satoshi", id: "xxx...a1b2", change: "-4", up: false },
      { rank: "9", tier: "Classic", name: "Ansem", id: "xxx...q6r7", change: "+2", up: true },
      { rank: "10", tier: "Classic", name: "GCR", id: "xxx...s8t9", change: "+1", up: true },
    ],
    2: [ // High Volume
      { rank: "1", tier: "Black", name: "Benji", id: "xxx...sfxx", change: "+3", up: true },
      { rank: "2", tier: "Platinum", name: "CZ", id: "xxx...g6h7", change: "+1", up: true },
      { rank: "3", tier: "Black", name: "Diddy", id: "xxx...pxxx", change: "-2", up: false },
      { rank: "4", tier: "Gold", name: "Cobie", id: "xxx...k0l1", change: "+4", up: true },
      { rank: "5", tier: "Platinum", name: "Vitalik", id: "xxx...e4f5", change: "-1", up: false },
      { rank: "6", tier: "Gold", name: "DCFgod", id: "xxx...o4p5", change: "+2", up: true },
      { rank: "7", tier: "Gold", name: "Hsaka", id: "xxx...m2n3", change: "0", up: null },
      { rank: "8", tier: "Platinum", name: "Satoshi", id: "xxx...a1b2", change: "-1", up: false },
      { rank: "9", tier: "Gold", name: "Punk6529", id: "xxx...i8j9", change: "+1", up: true },
      { rank: "10", tier: "Classic", name: "Ansem", id: "xxx...q6r7", change: "-3", up: false },
    ],
    3: [ // Rising Stars
      { rank: "1", tier: "Gold", name: "Ansem", id: "xxx...q6r7", change: "+8", up: true },
      { rank: "2", tier: "Gold", name: "Punk6529", id: "xxx...i8j9", change: "+6", up: true },
      { rank: "3", tier: "Gold", name: "Hsaka", id: "xxx...m2n3", change: "+5", up: true },
      { rank: "4", tier: "Classic", name: "GCR", id: "xxx...s8t9", change: "+4", up: true },
      { rank: "5", tier: "Classic", name: "Nova", id: "xxx...u0v1", change: "+12", up: true },
      { rank: "6", tier: "Platinum", name: "Satoshi", id: "xxx...a1b2", change: "+3", up: true },
      { rank: "7", tier: "Gold", name: "DCFgod", id: "xxx...o4p5", change: "+2", up: true },
      { rank: "8", tier: "Gold", name: "Cobie", id: "xxx...k0l1", change: "+1", up: true },
      { rank: "9", tier: "Black", name: "Benji", id: "xxx...sfxx", change: "0", up: null },
      { rank: "10", tier: "Black", name: "Diddy", id: "xxx...pxxx", change: "-1", up: false },
    ],
    4: [ // Trendsetters
      { rank: "1", tier: "Platinum", name: "Vitalik", id: "xxx...e4f5", change: "+2", up: true },
      { rank: "2", tier: "Black", name: "Benji", id: "xxx...sfxx", change: "0", up: null },
      { rank: "3", tier: "Gold", name: "Punk6529", id: "xxx...i8j9", change: "+4", up: true },
      { rank: "4", tier: "Black", name: "Diddy", id: "xxx...pxxx", change: "-1", up: false },
      { rank: "5", tier: "Platinum", name: "CZ", id: "xxx...g6h7", change: "+1", up: true },
      { rank: "6", tier: "Platinum", name: "Satoshi", id: "xxx...a1b2", change: "+3", up: true },
      { rank: "7", tier: "Gold", name: "Cobie", id: "xxx...k0l1", change: "-2", up: false },
      { rank: "8", tier: "Gold", name: "Hsaka", id: "xxx...m2n3", change: "+1", up: true },
      { rank: "9", tier: "Gold", name: "DCFgod", id: "xxx...o4p5", change: "0", up: null },
      { rank: "10", tier: "Classic", name: "Ansem", id: "xxx...q6r7", change: "+2", up: true },
    ],
    5: [ // Most Active
      { rank: "1", tier: "Black", name: "Diddy", id: "xxx...pxxx", change: "+1", up: true },
      { rank: "2", tier: "Black", name: "Benji", id: "xxx...sfxx", change: "+2", up: true },
      { rank: "3", tier: "Platinum", name: "CZ", id: "xxx...g6h7", change: "-1", up: false },
      { rank: "4", tier: "Gold", name: "Cobie", id: "xxx...k0l1", change: "+3", up: true },
      { rank: "5", tier: "Gold", name: "Hsaka", id: "xxx...m2n3", change: "+1", up: true },
      { rank: "6", tier: "Platinum", name: "Satoshi", id: "xxx...a1b2", change: "-2", up: false },
      { rank: "7", tier: "Platinum", name: "Vitalik", id: "xxx...e4f5", change: "0", up: null },
      { rank: "8", tier: "Gold", name: "Punk6529", id: "xxx...i8j9", change: "+1", up: true },
      { rank: "9", tier: "Gold", name: "DCFgod", id: "xxx...o4p5", change: "-1", up: false },
      { rank: "10", tier: "Classic", name: "GCR", id: "xxx...s8t9", change: "+5", up: true },
    ],
  };

  const currentBoard = leaderboards[activeCat] || leaderboards[0];

  // 내 카테고리별 랭크
  const myRanks = { 0: "56,247", 1: "41,892", 2: "63,104", 3: "12,340", 4: "38,771", 5: "27,553" };
  const myRank = myRanks[activeCat];
  const totalUsers = "279,941";

  return (
    <div>
      <p style={{ fontFamily: fraunces, fontSize: "34px", fontWeight: 700, color: t, lineHeight: 1.4, marginBottom: "18px", animation: "fadeInUp 0.5s ease 0.2s both" }}>See where you stand.</p>
      <p style={{ fontFamily: outfit, fontWeight: 400, fontSize: "17px", color: sub, lineHeight: 1.7, marginBottom: "32px", animation: "fadeInUp 0.5s ease 0.3s both" }}>Rankings updated daily based on on-chain behavior.</p>

      {/* YOU 섹션 */}
      <div style={{ padding: "28px 32px", borderRadius: "14px", border: connected ? `1px solid ${cardBorder}` : `1px dashed ${cardBorder}`, background: cardBg, marginBottom: "32px", animation: "fadeInUp 0.5s ease 0.35s both" }}>
        {connected ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr auto 1fr auto 1fr auto 1fr", gap: "0", alignItems: "center" }}>
            <div style={{ padding: "0 16px" }}>
              <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "14px", color: sub, letterSpacing: "2px", display: "block", marginBottom: "10px" }}>YOU</span>
              <span style={{ fontFamily: syne, fontWeight: 800, fontSize: "36px", color: t }}>Messi</span>
            </div>
            <div style={{ width: "1px", height: "60%", background: "rgba(255,255,255,0.08)" }} />
            <div style={{ padding: "0 16px" }}>
              <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "14px", color: sub, letterSpacing: "2px", display: "block", marginBottom: "10px" }}>YOUR RANK</span>
              <span style={{ fontFamily: syne, fontWeight: 800, fontSize: "28px", color: "rgba(230,220,250,0.8)" }}>#{myRank}</span>
              <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "12px", color: "rgba(255,255,255,0.35)", display: "block", marginTop: "4px" }}>of {totalUsers} users</span>
            </div>
            <div style={{ width: "1px", height: "60%", background: "rgba(255,255,255,0.08)" }} />
            <div style={{ padding: "0 16px" }}>
              <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "14px", color: sub, letterSpacing: "2px", display: "block", marginBottom: "10px" }}>PERCENTILE</span>
              <span style={{ fontFamily: syne, fontWeight: 800, fontSize: "28px", color: "rgba(100,200,130,0.8)" }}>Top {Math.round(parseInt(myRank.replace(/,/g, "")) / parseInt(totalUsers.replace(/,/g, "")) * 100)}%</span>
            </div>
            <div style={{ width: "1px", height: "60%", background: "rgba(255,255,255,0.08)" }} />
            <div style={{ padding: "0 16px" }}>
              <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "14px", color: sub, letterSpacing: "2px", display: "block", marginBottom: "10px" }}>WEEKLY</span>
              <span style={{ fontFamily: syne, fontWeight: 800, fontSize: "28px", color: "rgba(100,200,130,0.8)" }}>+342</span>
              <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "12px", color: "rgba(255,255,255,0.35)", display: "block", marginTop: "4px" }}>positions gained</span>
            </div>
            <div style={{ width: "1px", height: "60%", background: "rgba(255,255,255,0.08)" }} />
            <div style={{ padding: "0 16px" }}>
              <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "14px", color: sub, letterSpacing: "2px", display: "block", marginBottom: "10px" }}>TOP CATEGORY</span>
              <span style={{ fontFamily: syne, fontWeight: 800, fontSize: "22px", color: "rgba(230,220,250,0.8)" }}>{categories[activeCat === 0 ? 1 : 0 ]}</span>
              <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "12px", color: "rgba(255,255,255,0.35)", display: "block", marginTop: "4px" }}>your strongest</span>
            </div>
          </div>
        ) : (
          <div onClick={(e) => e.stopPropagation()} style={{ textAlign: "center", padding: "20px 0" }}>
            <p onClick={() => onConnect()} style={{ fontFamily: outfit, fontWeight: 700, fontSize: "18px", color: sub, letterSpacing: "3px", margin: "0 0 14px", cursor: "pointer" }}>GET YOUR GRAVII ID</p>
            <p style={{ fontFamily: outfit, fontWeight: 400, fontSize: "15px", color: "rgba(255,255,255,0.45)", margin: "0 0 10px" }}>See where you stand among peers.</p>
            <p style={{ fontFamily: fraunces, fontStyle: "italic", fontSize: "14px", color: "rgba(255,255,255,0.25)", margin: "0 0 24px" }}>Complimentary — no strings.</p>
            <p onClick={() => onConnect()} style={{ fontFamily: outfit, fontWeight: 400, fontSize: "14px", color: "rgba(255,255,255,0.35)", margin: 0, cursor: "pointer" }}>Already have one? <span style={{ fontWeight: 700, textDecoration: "underline" }}>Connect →</span></p>
          </div>
        )}
      </div>

      {/* 카테고리 필터 */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "28px", animation: "fadeInUp 0.5s ease 0.4s both" }}>
        {categories.map((cat, i) => (
          <span
            key={cat}
            onClick={(e) => { e.stopPropagation(); setActiveCat(i); }}
            style={{
              fontFamily: outfit, fontWeight: 700, fontSize: "13px",
              color: i === activeCat ? "#1A1A1A" : sub,
              background: i === activeCat ? "rgba(230,220,250,0.8)" : (dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"),
              padding: "9px 18px", borderRadius: "6px", letterSpacing: "1px", cursor: "pointer",
              transition: "all 0.25s ease",
            }}
          >{cat}</span>
        ))}
      </div>

      {/* 리더보드 테이블 */}
      <div style={{ animation: "fadeInUp 0.5s ease 0.45s both" }}>
        {/* 헤더 */}
        <div style={{ display: "grid", gridTemplateColumns: "80px 100px 1fr 1fr 90px", gap: "8px", padding: "14px 24px", marginBottom: "8px", background: cardBg, borderRadius: "8px" }}>
          {["#", "TIER", "NAME", "ID", "CHANGE"].map(h => (<span key={h} style={{ fontFamily: outfit, fontWeight: 700, fontSize: "13px", color: sub, letterSpacing: "2px" }}>{h}</span>))}
        </div>

        {/* 내 행 (connected) */}
        {connected && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "80px 100px 1fr 1fr 90px", gap: "8px", padding: "18px 24px", marginBottom: "4px", border: "1px solid rgba(230,220,250,0.3)", borderRadius: "12px", background: "rgba(230,220,250,0.06)" }}>
              <span style={{ fontFamily: syne, fontWeight: 800, fontSize: "18px", color: "rgba(230,220,250,0.8)" }}>{myRank}</span>
              <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "15px", color: tierColor("Gold") }}>Gold</span>
              <span style={{ fontFamily: outfit, fontWeight: 500, fontSize: "17px", color: t }}>Messi (You)</span>
              <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "15px", color: sub }}>xxx...2fxx</span>
              <span style={{ fontFamily: syne, fontWeight: 800, fontSize: "18px", color: "rgba(100,200,100,0.8)" }}>+342</span>
            </div>
            {/* 갭 표시 */}
            <div style={{ textAlign: "center", padding: "8px 0", marginBottom: "4px" }}>
              <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "12px", color: "rgba(255,255,255,0.2)", letterSpacing: "4px" }}>· · ·</span>
            </div>
          </>
        )}

        {/* Top 10 */}
        <div>
          {currentBoard.map(r => (
            <div key={r.rank + r.name} style={{ display: "grid", gridTemplateColumns: "80px 100px 1fr 1fr 90px", gap: "8px", padding: "18px 24px", marginBottom: "8px", border: `1px solid ${cardBorder}`, borderRadius: "12px" }}>
              <span style={{ fontFamily: syne, fontWeight: 800, fontSize: "22px", color: t }}>{r.rank}</span>
              <span style={{ fontFamily: outfit, fontWeight: 700, fontSize: "15px", color: tierColor(r.tier) }}>{r.tier}</span>
              <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "17px", color: "rgba(255,255,255,0.7)" }}>{r.name}</span>
              <span style={{ fontFamily: outfit, fontWeight: 400, fontSize: "15px", color: sub }}>{r.id}</span>
              <span style={{ fontFamily: syne, fontWeight: 800, fontSize: "18px", color: r.up === true ? "rgba(100,200,100,0.8)" : r.up === false ? "rgba(200,100,100,0.8)" : "rgba(255,255,255,0.25)" }}>{r.change === "0" ? "—" : r.change}</span>
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
                    color: (panel.xray && isHovered) ? "rgba(100,210,200,0.3)"
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
                      fontFamily: fraunces, fontStyle: "italic", fontSize: "clamp(14px, 1.5vw, 24px)",
                      color: (panel.xray && isHovered) ? "rgba(100,210,210,0.45)"
                        : panel.xray ? "rgba(50,110,220,0.55)"
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
                      letterSpacing: "4px",
                      transition: "color 0.35s ease",
                    }}>GRAVII ID</span>
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
                    }}>GRAVII ID</span>
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
                      fontSize: "clamp(48px, 6.6vw, 72px)",
                      color: isHovered ? "rgba(255,255,255,0.7)" : op.tabName,
                      letterSpacing: "4px",
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
                      fontFamily: archivoBlack, fontSize: "18px",
                      color: op.tabName, letterSpacing: "6px",
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
                        background: "radial-gradient(ellipse, rgba(80,200,190,0.07) 0%, transparent 70%)",
                        animation: "thermalPulse 4s ease-in-out infinite",
                      }} />
                      {/* 미세 노이즈 그리드 */}
                      {[20, 40, 60, 80].map(p => (
                        <div key={p} style={{
                          position: "absolute", left: 0, right: 0, top: `${p}%`,
                          height: "1px", background: "rgba(80,200,190,0.03)",
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
                      color: isHovered ? "rgba(100,210,200,0.9)" : "rgba(50,110,220,0.7)",
                      letterSpacing: "4px",
                      transition: "color 0.35s ease, text-shadow 0.35s ease",
                      textShadow: isHovered ? "0 0 40px rgba(80,200,190,0.3), 0 0 80px rgba(60,180,170,0.1)" : "none",
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
                      fontFamily: archivoBlack, fontSize: "18px",
                      color: "rgba(50,110,220,0.7)", letterSpacing: "6px",
                      transition: "color 0.4s ease",
                    }}>X-RAY</span>
                  </div>
                )}

                {/* STANDING */}
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
                      letterSpacing: "4px",
                      transition: "color 0.35s ease",
                    }}>STANDING</span>
                  </div>
                </>)}
                {panel.id === "leaderboard" && isCollapsed && (
                  <div style={{
                    position: "absolute", top: "50%", left: "50%",
                    transform: "translate(-50%, -50%) rotate(90deg)",
                    whiteSpace: "nowrap",
                  }}>
                    <span style={{
                      fontFamily: archivoBlack, fontSize: "18px",
                      color: op.tabName, letterSpacing: "6px",
                      transition: "color 0.4s ease",
                    }}>STANDING</span>
                  </div>
                )}

                {/* ── 공통: 하단 GRAVII 마크 ── */}
                <div style={{ position: "absolute", bottom: "20px", left: "20px" }}>
                  <span style={{
                    fontFamily: outfit, fontWeight: 700, fontSize: "11px",
                    color: (panel.xray && isHovered) ? "rgba(100,210,200,0.3)"
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
                        fontFamily: archivoBlack, fontSize: "clamp(48px, 5vw, 72px)",
                        color: usesDarkTokens ? "#F5F2EB" : "#1A1A1A",
                        textTransform: "uppercase", letterSpacing: "4px", margin: 0,
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
                    <ExpandedContent dark={usesDarkTokens} connected={isConnected} onConnect={() => setIsConnected(true)} onNavigate={(id) => setActivePanel(id)} />
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

      {/* ── STANDING 하단 바 ── */}
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
              {/* 넘버링 좌상단 */}
              <span style={{
                position: "absolute", top: "20px", left: "20px",
                fontFamily: outfit, fontWeight: 700, fontSize: "16px",
                color: isMySpaceHovered ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.25)",
                letterSpacing: "2px", transition: "color 0.35s ease",
              }}>05/05</span>
              <span style={{
                fontFamily: archivoBlack,
                fontSize: isSmall ? "18px" : "80px",
                color: isMySpaceHovered ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.55)",
                letterSpacing: isSmall ? "6px" : "8px",
                transition: "font-size 0.4s ease, letter-spacing 0.4s ease, color 0.35s ease",
              }}>MY SPACE</span>
              {!isSmall && (
                <span style={{
                  fontFamily: fraunces, fontStyle: "italic", fontSize: "clamp(14px, 1.5vw, 24px)",
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
                <h1 style={{ fontFamily: archivoBlack, fontSize: "clamp(48px, 5vw, 72px)", color: "#F5F2EB", textTransform: "uppercase", letterSpacing: "4px", margin: 0 }}>MY SPACE</h1>
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
              <MySpaceContent dark={true} connected={isConnected} onConnect={() => setIsConnected(true)} onNavigate={(id) => setActivePanel(id)} />
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
