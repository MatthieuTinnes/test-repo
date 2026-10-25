// Lapin : jeu type Doodle Jump en Canvas 2D, aucune dépendance.
// Les constantes ci-dessous sont les leviers de réglage du game feel.
// La simulation (createWorld / updateWorld) ne touche pas au DOM : elle est testée dans tests/lapin.test.js.

const VIEW_W = 480;
const VIEW_H = 640;
const PX_PER_METER = 10; // le score est la hauteur maximale en mètres

const GRAVITY = 1400; // px/s²
const MAX_FALL = 900; // px/s
const MOVE_SPEED = 260; // px/s
const JUMP_VELOCITY = -640; // px/s, saut normal : environ 146 px de montée
const SPRING_VELOCITY = -1000; // px/s, rebond sur un ressort : environ 357 px
const MAX_DT = 0.05; // s
const CAMERA_LINE = 0.4; // la caméra suit quand le lapin dépasse cette ligne (fraction de la hauteur)

const RABBIT_W = 34;
const RABBIT_H = 40;

const PLATFORM_W = 72;
const PLATFORM_H = 14;
const START_PLATFORM_Y = VIEW_H - 80;
const REACH_X = 180; // px, décalage horizontal max entre deux plateformes successives (atteignable en un saut)

// Difficulté : l'espacement passe de GAP_MIN à GAP_MAX, puis reste plafonné.
const GAP_MIN = 55; // px entre deux plateformes au départ
const GAP_MAX = 120; // px au plafond, reste sous la hauteur de saut normale
const DIFF_HEIGHT = 6000; // px de montée pour atteindre le plafond de difficulté

// Probabilités d'apparition des types : [valeur au départ, valeur au plafond].
const SPRING_CHANCE = 0.07;
const MOBILE_CHANCE = [0.05, 0.3];
const BREAKABLE_CHANCE = [0.05, 0.25];

const MOBILE_AMP = 70; // px, amplitude du va-et-vient
const MOBILE_FREQ = 2.5; // rad/s

const BEST_KEY = 'lapin.record';

// --- Variables d'état ---

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const heightEl = document.getElementById('height');
const bestEl = document.getElementById('best');
const startScreen = document.getElementById('screen-start');
const endScreen = document.getElementById('screen-end');
const finalScoreEl = document.getElementById('final-score');
const finalBestEl = document.getElementById('final-best');
const btnStart = document.getElementById('btn-start');
const btnRetry = document.getElementById('btn-retry');

let state = 'menu'; // 'menu' | 'playing' | 'gameover'
let best = loadBest();
let world = createWorld(randomSeed());

const keyInput = { left: false, right: false };
const touchInput = { left: false, right: false };

let lastTime = null;

// --- Utilitaires ---

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function randomSeed() {
  return Math.floor(Math.random() * 2 ** 31);
}

// Générateur pseudo-aléatoire (mulberry32) : une graine donne toujours la même suite.
function createRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function difficulty(maxRise) {
  return clamp(maxRise / DIFF_HEIGHT, 0, 1);
}

function heightMeters(current) {
  return Math.floor(current.maxRise / PX_PER_METER);
}

// --- Persistance (localStorage peut être indisponible : navigation privée, iframe sandbox) ---

function loadBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch (e) {
    return 0;
  }
}

function saveBest() {
  try {
    localStorage.setItem(BEST_KEY, String(best));
  } catch (e) {
    // Record conservé en mémoire pour la session.
  }
}

// --- Simulation ---

// Choisit le type d'une plateforme selon la difficulté t (0 au départ, 1 au plafond).
function pickType(rng, t) {
  const r = rng();
  const mobile = lerp(MOBILE_CHANCE[0], MOBILE_CHANCE[1], t);
  const breakable = lerp(BREAKABLE_CHANCE[0], BREAKABLE_CHANCE[1], t);
  if (r < SPRING_CHANCE) return 'spring';
  if (r < SPRING_CHANCE + mobile) return 'mobile';
  if (r < SPRING_CHANCE + mobile + breakable) return 'breakable';
  return 'normal';
}

function makePlatform(type, x, y, rng) {
  return { type, x, baseX: x, y, w: PLATFORM_W, h: PLATFORM_H, phase: rng() * Math.PI * 2 };
}

// Ajoute des plateformes au-dessus de la zone visible, en partant de la plus haute.
function generatePlatforms(current) {
  const { rng } = current;
  while (current.topY > current.cameraY - VIEW_H) {
    const t = difficulty(current.maxRise);
    current.topY -= lerp(GAP_MIN, GAP_MAX, t);
    const x = clamp(current.lastX + (rng() * 2 - 1) * REACH_X, 0, VIEW_W - PLATFORM_W);
    current.platforms.push(makePlatform(pickType(rng, t), x, current.topY, rng));
    current.lastX = x;
  }
}

function createWorld(seed) {
  const rng = createRng(seed);
  const start = makePlatform('normal', VIEW_W / 2 - PLATFORM_W / 2, START_PLATFORM_Y, rng);
  const rabbit = {
    x: start.x + (PLATFORM_W - RABBIT_W) / 2,
    y: start.y - RABBIT_H,
    vx: 0,
    vy: JUMP_VELOCITY,
    facing: 1,
  };
  const current = {
    rng,
    rabbit,
    platforms: [start],
    cameraY: 0,
    topY: start.y,
    lastX: start.x,
    startY: rabbit.y,
    maxRise: 0,
    time: 0,
    over: false,
  };
  generatePlatforms(current);
  return current;
}

function updatePlatforms(current, dt) {
  current.time += dt;
  for (const p of current.platforms) {
    if (p.type !== 'mobile') continue;
    const offset = Math.sin(current.time * MOBILE_FREQ + p.phase) * MOBILE_AMP;
    p.x = clamp(p.baseX + offset, 0, VIEW_W - p.w);
  }
}

// Rebond quand le lapin tombe sur une plateforme par le haut : une plateforme traversée par en dessous ne l'arrête pas.
function bounce(current, prevBottom) {
  const r = current.rabbit;
  if (r.vy <= 0) return;
  const bottom = r.y + RABBIT_H;
  for (const p of current.platforms) {
    const landed = prevBottom <= p.y && bottom >= p.y;
    const overlapsX = r.x + RABBIT_W > p.x && r.x < p.x + p.w;
    if (!landed || !overlapsX) continue;
    r.y = p.y - RABBIT_H;
    r.vy = p.type === 'spring' ? SPRING_VELOCITY : JUMP_VELOCITY;
    // Plateforme cassable : elle disparaît après le rebond, le lapin ne reste pas dessus.
    if (p.type === 'breakable') {
      current.platforms = current.platforms.filter((q) => q !== p);
    }
    return;
  }
}

// Fait avancer la partie d'un pas de dt secondes. input : { left, right } (booléens).
function updateWorld(current, input, dt) {
  if (current.over) return;
  const r = current.rabbit;

  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (dir !== 0) r.facing = dir;
  r.vx = dir * MOVE_SPEED;

  updatePlatforms(current, dt);

  const prevBottom = r.y + RABBIT_H;
  r.vy = Math.min(r.vy + GRAVITY * dt, MAX_FALL);
  r.x += r.vx * dt;
  if (r.x + RABBIT_W < 0) r.x = VIEW_W;
  else if (r.x > VIEW_W) r.x = -RABBIT_W;
  r.y += r.vy * dt;
  bounce(current, prevBottom);

  current.maxRise = Math.max(current.maxRise, current.startY - r.y);

  // La caméra ne fait que monter, pour suivre le lapin.
  const line = current.cameraY + VIEW_H * CAMERA_LINE;
  if (r.y < line) current.cameraY = r.y - VIEW_H * CAMERA_LINE;

  generatePlatforms(current);
  // Plateformes passées sous la caméra : supprimées.
  current.platforms = current.platforms.filter((p) => p.y < current.cameraY + VIEW_H + PLATFORM_H);

  // Chute sous l'écran : fin de partie.
  if (r.y > current.cameraY + VIEW_H) current.over = true;
}

// --- Actions ---

function startGame() {
  world = createWorld(randomSeed());
  state = 'playing';
  startScreen.classList.add('hidden');
  endScreen.classList.add('hidden');
  updateHud();
}

// Démarre ou rejoue, uniquement hors partie en cours.
function startAction() {
  if (state !== 'playing') startGame();
}

function finish() {
  state = 'gameover';
  const score = heightMeters(world);
  if (score > best) {
    best = score;
    saveBest();
  }
  finalScoreEl.textContent = String(score);
  finalBestEl.textContent = String(best);
  endScreen.classList.remove('hidden');
  updateHud();
}

function updateHud() {
  heightEl.textContent = String(heightMeters(world));
  bestEl.textContent = String(best);
}

function update(dt) {
  if (state !== 'playing') return;
  updateWorld(world, {
    left: keyInput.left || touchInput.left,
    right: keyInput.right || touchInput.right,
  }, dt);
  if (world.over) finish();
  else updateHud();
}

// --- Rendu ---

function drawPlatform(p) {
  const x = p.x;
  const y = p.y;
  if (p.type === 'spring') {
    // Ressort posé sur la plateforme : spirale rouge au-dessus.
    ctx.strokeStyle = '#e53935';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i <= 4; i++) {
      ctx.lineTo(x + p.w / 2 + (i % 2 ? 8 : -8), y - 4 - i * 2.5);
    }
    ctx.stroke();
  }
  const palette = {
    normal: ['#6abf4b', '#3d7d2a'],
    mobile: ['#4fa3e0', '#2a6aa3'],
    breakable: ['#c8925a', '#7a4a22'],
    spring: ['#ffd23f', '#c98f00'],
  }[p.type];
  ctx.fillStyle = palette[0];
  ctx.strokeStyle = palette[1];
  ctx.lineWidth = 2;
  ctx.fillRect(x, y, p.w, p.h);
  ctx.strokeRect(x + 1, y + 1, p.w - 2, p.h - 2);
  if (p.type === 'breakable') {
    // Fissure : la plateforme va se casser.
    ctx.beginPath();
    ctx.moveTo(x + p.w * 0.4, y);
    ctx.lineTo(x + p.w * 0.5, y + p.h / 2);
    ctx.lineTo(x + p.w * 0.45, y + p.h);
    ctx.stroke();
  }
}

// Lapin dessiné en Canvas, origine en haut à gauche de sa boîte. Il regarde vers facing.
function drawRabbit(r) {
  ctx.save();
  ctx.translate(r.x + RABBIT_W / 2, r.y);
  ctx.scale(r.facing, 1);
  ctx.translate(-RABBIT_W / 2, 0);
  ctx.fillStyle = '#f7f3ee';
  ctx.strokeStyle = '#8a7f74';
  ctx.lineWidth = 1.5;

  // Queue (à l'arrière, à gauche quand il regarde à droite)
  ctx.beginPath();
  ctx.arc(5, 30, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Oreilles, puis intérieur rose
  for (const [ex, angle] of [[12, -0.15], [22, 0.15]]) {
    ctx.beginPath();
    ctx.ellipse(ex, 10, 3.5, 10, angle, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = '#f4a6b7';
  ctx.beginPath();
  ctx.ellipse(12, 10, 1.5, 7, -0.15, 0, Math.PI * 2);
  ctx.ellipse(22, 10, 1.5, 7, 0.15, 0, Math.PI * 2);
  ctx.fill();

  // Corps et pattes
  ctx.fillStyle = '#f7f3ee';
  ctx.beginPath();
  ctx.ellipse(17, 28, 12, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(13, 37, 4, 2.5, 0, 0, Math.PI * 2);
  ctx.ellipse(22, 37, 4, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Tête, œil et nez
  ctx.beginPath();
  ctx.ellipse(17, 16, 10, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(20, 14, 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f08aa0';
  ctx.beginPath();
  ctx.arc(24, 18, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function render() {
  const sky = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  sky.addColorStop(0, '#8fd3f4');
  sky.addColorStop(1, '#e0f7ff');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  ctx.save();
  ctx.translate(0, -world.cameraY);
  for (const p of world.platforms) drawPlatform(p);
  drawRabbit(world.rabbit);
  ctx.restore();
}

// --- Entrées ---

document.addEventListener('keydown', (e) => {
  if (e.code === 'ArrowLeft') {
    e.preventDefault();
    keyInput.left = true;
    return;
  }
  if (e.code === 'ArrowRight') {
    e.preventDefault();
    keyInput.right = true;
    return;
  }
  if (e.code === 'Space' || e.code === 'ArrowUp') {
    e.preventDefault();
    if (!e.repeat) startAction();
    return;
  }
  // Sur un bouton, Entrée déclenche déjà son clic natif : on ne le double pas.
  if (e.code === 'Enter' && !e.repeat && !(e.target instanceof HTMLButtonElement)) {
    startAction();
  }
});

document.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowLeft') keyInput.left = false;
  if (e.code === 'ArrowRight') keyInput.right = false;
});

// Boutons tactiles : chaque doigt a son propre pointeur, donc le multi-touch fonctionne.
for (const btn of document.querySelectorAll('.touch button')) {
  const dir = btn.dataset.action;
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    btn.setPointerCapture(e.pointerId);
    touchInput[dir] = true;
    btn.classList.add('active');
    startAction();
  });
  const release = () => {
    touchInput[dir] = false;
    btn.classList.remove('active');
  };
  btn.addEventListener('pointerup', release);
  btn.addEventListener('pointercancel', release);
}

btnStart.addEventListener('click', startAction);
btnRetry.addEventListener('click', startAction);

// Évite qu'une touche reste « enfoncée » si la fenêtre perd le focus en plein mouvement.
window.addEventListener('blur', () => {
  keyInput.left = false;
  keyInput.right = false;
  touchInput.left = false;
  touchInput.right = false;
});

// --- Boucle ---

function frame(now) {
  const dt = lastTime === null ? 0 : Math.min((now - lastTime) / 1000, MAX_DT);
  lastTime = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

updateHud();
requestAnimationFrame(frame);
