import { writeFileSync } from 'node:fs';

const colors = [
  '#00d4ff', '#c77dff', '#ff6b9d', '#00ff88', '#ffaa00', '#ff4466',
  '#7cffcb', '#ffe566', '#b8a0ff', '#ff9de2', '#6bcbff', '#ffb347',
];

function miniBot(x, y, c, p = 2, dark = '#0a0a18') {
  const d = p;
  return [
    `<rect x="${x + 6 * d}" y="${y}" width="${d}" height="${d}" fill="${c}"/>`,
    `<rect x="${x + 4 * d}" y="${2 * d}" width="${d}" height="${d}" fill="${c}"/>`,
    `<rect x="${x + 6 * d}" y="${2 * d}" width="${d}" height="${d}" fill="${c}"/>`,
    `<rect x="${x + 8 * d}" y="${2 * d}" width="${d}" height="${d}" fill="${c}"/>`,
    `<rect x="${x + 2 * d}" y="${4 * d}" width="${d}" height="${d}" fill="${c}"/>`,
    `<rect x="${x + 4 * d}" y="${4 * d}" width="${d}" height="${d}" fill="${dark}"/>`,
    `<rect x="${x + 6 * d}" y="${4 * d}" width="${d}" height="${d}" fill="${dark}"/>`,
    `<rect x="${x + 8 * d}" y="${4 * d}" width="${d}" height="${d}" fill="${dark}"/>`,
    `<rect x="${x + 10 * d}" y="${4 * d}" width="${d}" height="${d}" fill="${c}"/>`,
    `<rect x="${x + 2 * d}" y="${6 * d}" width="${d}" height="${d}" fill="${c}"/>`,
    `<rect x="${x + 4 * d}" y="${6 * d}" width="${d}" height="${d}" fill="${c}"/>`,
    `<rect x="${x + 6 * d}" y="${6 * d}" width="${d}" height="${d}" fill="${c}"/>`,
    `<rect x="${x + 8 * d}" y="${6 * d}" width="${d}" height="${d}" fill="${c}"/>`,
    `<rect x="${x + 10 * d}" y="${6 * d}" width="${d}" height="${d}" fill="${c}"/>`,
    `<rect x="${x + 4 * d}" y="${8 * d}" width="${d}" height="${d}" fill="${c}"/>`,
    `<rect x="${x + 8 * d}" y="${8 * d}" width="${d}" height="${d}" fill="${c}"/>`,
    `<rect x="${x + 3 * d}" y="${10 * d}" width="${d}" height="${d}" fill="${c}"/>`,
    `<rect x="${x + 9 * d}" y="${10 * d}" width="${d}" height="${d}" fill="${c}"/>`,
  ].join('');
}

function leaderBot(x, y) {
  const c = '#ffd93d';
  const dark = '#1a1400';
  const p = 3;
  const d = p;
  return (
    miniBot(x, y, c, d, dark)
    + `<rect x="${x}" y="${6 * d}" width="${d}" height="${d}" fill="#fff4a3"/>`
    + `<rect x="${x + 12 * d}" y="${6 * d}" width="${d}" height="${d}" fill="#fff4a3"/>`
    + `<rect x="${x + 5 * d}" y="${8 * d}" width="${d * 2}" height="${d}" fill="#39ff14"/>`
    + `<rect x="${x + 5 * d}" y="${11 * d}" width="${d}" height="${d}" fill="#ff6b9d"/>`
    + `<rect x="${x + 7 * d}" y="${11 * d}" width="${d}" height="${d}" fill="#ff6b9d"/>`
  );
}

const cx = 360;
const cy = 108;
const bots = [{ x: cx - 18, y: cy - 16, c: '#ffd93d', leader: true }];
let ci = 0;

for (const [r, n, yScale] of [[32, 6, 0.82], [54, 9, 0.88], [76, 12, 0.92], [96, 10, 0.95]]) {
  for (let i = 0; i < n; i += 1) {
    const a = ((Math.PI * 2 * i) / n) - Math.PI / 2 + (r > 50 ? 0.2 : 0);
    bots.push({
      x: Math.round(cx + r * Math.cos(a) - 7),
      y: Math.round(cy + r * Math.sin(a) * yScale - 8),
      c: colors[ci++ % colors.length],
      p: 2,
    });
  }
}

for (const [x, y, c] of [
  [cx - 7, cy - 58, '#00d4ff'],
  [cx + 28, cy - 48, '#ff6b9d'],
  [cx - 42, cy - 48, '#00ff88'],
  [cx - 55, cy - 8, '#c77dff'],
  [cx + 45, cy + 5, '#ffaa00'],
  [cx + 50, cy + 35, '#7cffcb'],
  [cx - 52, cy + 30, '#ff4466'],
  [cx + 8, cy + 52, '#ffe566'],
  [cx - 30, cy + 55, '#6bcbff'],
]) {
  bots.push({ x, y, c, p: 2 });
}

const centers = bots.map((b) => ({ x: b.x + 7, y: b.y + 6 }));
const lines = [];
const hub = centers[0];

for (let i = 1; i < centers.length; i += 1) {
  if (i <= 8 || i % 3 === 0) {
    lines.push(
      `<line x1="${hub.x}" y1="${hub.y}" x2="${centers[i].x}" y2="${centers[i].y}" stroke="#39ff14" stroke-width="1" opacity="0.35"/>`,
    );
  }
}

const ringStarts = [1, 7, 16, 28];
const ringCounts = [6, 9, 12, 10];
for (let ring = 0; ring < ringCounts.length; ring += 1) {
  const start = ringStarts[ring];
  const count = ringCounts[ring];
  for (let i = 0; i < count; i += 1) {
    const a = centers[start + i];
    const b = centers[start + ((i + 1) % count)];
    if (a && b) {
      lines.push(
        `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#00f0ff" stroke-width="1" opacity="0.28"/>`,
      );
    }
  }
}

for (let i = 0; i < centers.length; i += 1) {
  const j = (i + 5) % centers.length;
  if (i !== 0 && j !== 0 && i % 4 === 0) {
    lines.push(
      `<line x1="${centers[i].x}" y1="${centers[i].y}" x2="${centers[j].x}" y2="${centers[j].y}" stroke="#c77dff" stroke-width="1" opacity="0.18"/>`,
    );
  }
}

const scanlines = Array.from({ length: 14 }, (_, i) => (
  `<rect x="16" y="${24 + i * 16}" width="688" height="1" fill="#7cffcb"/>`
)).join('');

const stars = [
  [40, 34], [120, 28], [300, 26], [480, 28], [660, 36], [350, 58], [580, 200],
].map(([x, y]) => `<rect x="${x}" y="${y}" width="2" height="2"/>`).join('');

const titlePixels = 'BOT RIDER'.split('').map((ch, i) => {
  const bx = 238 + i * 22;
  if (ch === ' ') return '';
  return `<rect x="${bx}" y="228" width="4" height="4"/>`
    + `<rect x="${bx + 6}" y="228" width="4" height="4"/>`
    + `<rect x="${bx}" y="234" width="4" height="4"/>`
    + `<rect x="${bx + 6}" y="234" width="4" height="4"/>`
    + `<rect x="${bx}" y="240" width="4" height="4"/>`
    + `<rect x="${bx + 3}" y="240" width="4" height="4"/>`
    + `<rect x="${bx + 6}" y="240" width="4" height="4"/>`;
}).join('');

const botSvg = bots.map((b) => (b.leader ? leaderBot(b.x, b.y) : miniBot(b.x, b.y, b.c, b.p))).join('');

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 280" role="img" aria-label="Bot Rider swarm sphere of linked bots">
<title>Bot Rider Swarm Sphere</title>
<defs>
  <linearGradient id="nebula" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="#12082a"/>
    <stop offset="50%" stop-color="#1a0f3d"/>
    <stop offset="100%" stop-color="#1f0a2e"/>
  </linearGradient>
  <radialGradient id="sphereGlow" cx="50%" cy="45%" r="45%">
    <stop offset="0%" stop-color="#4a3aff" stop-opacity="0.25"/>
    <stop offset="100%" stop-color="#4a3aff" stop-opacity="0"/>
  </radialGradient>
</defs>
<rect x="6" y="6" width="708" height="268" rx="16" fill="url(#nebula)" stroke="#5b6cff" stroke-width="3"/>
<rect x="16" y="16" width="688" height="248" rx="12" fill="#060612" stroke="#2a2a5a" stroke-width="2"/>
<ellipse cx="360" cy="108" rx="108" ry="88" fill="url(#sphereGlow)"/>
<ellipse cx="360" cy="108" rx="100" ry="78" fill="none" stroke="#3d5a9a" stroke-width="1" opacity="0.45"/>
<ellipse cx="360" cy="108" rx="72" ry="56" fill="none" stroke="#3d5a9a" stroke-width="1" opacity="0.35"/>
<ellipse cx="360" cy="108" rx="44" ry="34" fill="none" stroke="#3d5a9a" stroke-width="1" opacity="0.3"/>
<ellipse cx="360" cy="108" rx="100" ry="78" fill="none" stroke="#5b7cff" stroke-width="1" opacity="0.2" transform="rotate(25 360 108)"/>
<ellipse cx="360" cy="108" rx="100" ry="78" fill="none" stroke="#5b7cff" stroke-width="1" opacity="0.2" transform="rotate(-25 360 108)"/>
<g opacity="0.06">${scanlines}</g>
<g fill="#fff8c4">${stars}</g>
<g>${lines.join('')}</g>
<g>${botSvg}</g>
<g fill="#f0f4ff">${titlePixels}</g>
<text x="210" y="258" fill="#7cffcb" font-family="monospace" font-size="11" letter-spacing="2">SWARM SPHERE · ${bots.length} BOTS LINKED</text>
<text x="32" y="252" fill="#ff6b9d" font-family="monospace" font-size="9">▶ MESH ACTIVE</text>
<text x="580" y="252" fill="#ff6b9d" font-family="monospace" font-size="9">DEBATE · CO-OP</text>
</svg>
`;

writeFileSync(new URL('../media/logo.svg', import.meta.url), svg);
console.log(`Wrote media/logo.svg with ${bots.length} inline bots`);
