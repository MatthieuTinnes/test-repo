// Zombie : coureur infini en Canvas 2D, aucune dépendance.
// Le coureur avance tout seul : le joueur ne fait que sauter par-dessus les zombies.
// Les constantes ci-dessous sont les leviers de réglage du game feel.
// La simulation (createWorld / updateWorld) ne touche pas au DOM : elle est testée dans tests/zombie.test.js.

const VIEW_W = 640;
const VIEW_H = 360;
const PX_PER_METER = 10; // le score est la distance parcourue, en mètres

const GROUND_Y = 290; // px, ligne du sol (haut de la piste)
const GRAVITY = 2400; // px/s²
const JUMP_VELOCITY = -780; // px/s, saut normal : environ 127 px de montée
const JUMP_BUFFER = 0.12; // s, un appui juste avant l'atterrissage reste pris en compte
const MAX_DT = 0.05; // s, évite qu'un changement d'onglet téléporte le coureur

const RUNNER_X = 110; // px, position horizontale fixe du coureur à l'écran
const RUNNER_W = 30;
const RUNNER_H = 56;
const HIT_INSET = 6; // px, marge horizontale de la collision (plus indulgente que le dessin)

const ZOMBIE_H = 44;
const ZOMBIE_W_MIN = 30;
const ZOMBIE_W_MAX = 40;

// Vitesse et densité : elles passent de la valeur de départ à celle du plafond, sur DIFF_DISTANCE px.
const SPEED_MIN = 300; // px/s
const SPEED_MAX = 500; // px/s
const GAP_MAX = 420; // px entre deux zombies au départ
const GAP_MIN = 290; // px au plafond : un saut couvre ~325 px à SPEED_MAX, l'écart moyen reste au-dessus
const GAP_JITTER = 80; // px, variation aléatoire ajoutée à chaque écart
const DIFF_DISTANCE = 3000; // px parcourus (300 m) pour atteindre le plafond

const SPAWN_AHEAD = 200; // px, les zombies sont générés juste avant d'entrer dans l'écran
const ATTRACT_LOOKAHEAD = 150; // px, à l'écran de départ, le coureur saute quand un zombie approche

const BEST_KEY = 'zombie.record';

// --- Variables d'état ---

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const distanceEl = document.getElementById('distance');
const bestEl = document.getElementById('best');
const startScreen = document.getElementById('screen-start');
const endScreen = document.getElementById('screen-end');
const finalScoreEl = document.getElementById('final-score');
const finalBestEl = document.getElementById('final-best');
const btnStart = document.getElementById('btn-start');
const btnRetry = document.getElementById('btn-retry');
const btnJump = document.getElementById('btn-jump');

let state = 'menu'; // 'menu' | 'playing' | 'gameover'
let best = loadBest();
// Au menu, le monde tourne en démo (coureur qui saute tout seul, sans collision).
let world = createWorld(randomSeed(), true);
let pendingJump = false; // appui sur saut, pas encore consommé par la simulation

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

// Difficulté t : 0 au départ, 1 au plafond.
function difficulty(distance) {
  return clamp(distance / DIFF_DISTANCE, 0, 1);
}

function runSpeed(distance) {
  return lerp(SPEED_MIN, SPEED_MAX, difficulty(distance));
}

// Écart entre le bord droit d'un zombie et le bord gauche du suivant.
function spawnGap(rng, distance) {
  return lerp(GAP_MAX, GAP_MIN, difficulty(distance)) + rng() * GAP_JITTER;
}

function metersOf(current) {
  return Math.floor(current.distance / PX_PER_METER);
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

// Coordonnées monde : le zombie est placé en x sur la piste, le coureur est en distance + RUNNER_X.
function makeZombie(x, rng) {
  return {
    x,
    w: lerp(ZOMBIE_W_MIN, ZOMBIE_W_MAX, rng()),
    h: ZOMBIE_H,
    phase: rng() * Math.PI * 2,
  };
}

// Ajoute des zombies jusqu'à dépasser l'écran de SPAWN_AHEAD px.
function generateZombies(current) {
  while (current.nextX < current.distance + VIEW_W + SPAWN_AHEAD) {
    const zombie = makeZombie(current.nextX, current.rng);
    current.zombies.push(zombie);
    current.nextX += zombie.w + spawnGap(current.rng, current.distance);
  }
}

// attract : mode démo de l'écran de départ, sans collision ni fin de partie.
function createWorld(seed, attract = false) {
  const rng = createRng(seed);
  const current = {
    rng,
    attract,
    runner: { y: GROUND_Y - RUNNER_H, vy: 0, onGround: true, jumpBuffer: 0 },
    zombies: [],
    distance: 0, // px parcourus ; la piste défile d'autant
    nextX: VIEW_W + 120, // position monde du prochain zombie à générer
    time: 0,
    over: false,
  };
  generateZombies(current);
  return current;
}

function nextZombieAhead(current, range) {
  const runnerLeft = current.distance + RUNNER_X;
  return current.zombies.some((z) => z.x >= runnerLeft && z.x - runnerLeft < range);
}

// Le coureur touche-t-il un zombie ? Il suffit que ses pieds soient sous le haut du zombie
// alors que les deux se chevauchent horizontalement.
function hitsZombie(current) {
  const r = current.runner;
  const left = current.distance + RUNNER_X + HIT_INSET;
  const right = current.distance + RUNNER_X + RUNNER_W - HIT_INSET;
  const feet = r.y + RUNNER_H;
  return current.zombies.some((z) => {
    const zombieTop = GROUND_Y - z.h;
    return right > z.x && left < z.x + z.w && feet > zombieTop;
  });
}

// Fait avancer la partie d'un pas de dt secondes. input : { jump } (booléen : appui sur saut).
function updateWorld(current, input, dt) {
  if (current.over) return;
  const r = current.runner;
  current.time += dt;

  current.distance += runSpeed(current.distance) * dt;

  const wantsJump = !!input.jump || (current.attract && nextZombieAhead(current, ATTRACT_LOOKAHEAD));
  r.jumpBuffer = wantsJump ? JUMP_BUFFER : Math.max(0, r.jumpBuffer - dt);
  if (r.jumpBuffer > 0 && r.onGround) {
    r.vy = JUMP_VELOCITY;
    r.onGround = false;
    r.jumpBuffer = 0;
  }

  r.vy += GRAVITY * dt;
  r.y += r.vy * dt;
  if (r.y >= GROUND_Y - RUNNER_H) {
    r.y = GROUND_Y - RUNNER_H;
    r.vy = 0;
    r.onGround = true;
  }

  generateZombies(current);
  if (!current.attract && hitsZombie(current)) current.over = true;
  // Zombies entièrement sortis de l'écran à gauche : supprimés.
  current.zombies = current.zombies.filter((z) => z.x + z.w > current.distance);
}

// --- Actions ---

function startGame() {
  world = createWorld(randomSeed());
  state = 'playing';
  pendingJump = false;
  startScreen.classList.add('hidden');
  endScreen.classList.add('hidden');
  updateHud();
}

// Démarre ou rejoue, uniquement hors partie en cours.
function startAction() {
  if (state !== 'playing') startGame();
}

// Pendant la partie, un appui fait sauter ; hors partie, il démarre.
function jumpAction() {
  if (state === 'playing') pendingJump = true;
  else startAction();
}

function finish() {
  state = 'gameover';
  const score = metersOf(world);
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
  distanceEl.textContent = String(state === 'menu' ? 0 : metersOf(world));
  bestEl.textContent = String(best);
}

function update(dt) {
  if (state === 'playing') {
    const jump = pendingJump;
    pendingJump = false;
    updateWorld(world, { jump }, dt);
    if (world.over) finish();
    else updateHud();
  } else if (state === 'menu') {
    updateWorld(world, { jump: false }, dt);
  }
}

// --- Rendu ---

function drawTombstone(x, baseY) {
  ctx.fillStyle = '#2b2236';
  ctx.fillRect(x, baseY - 40, 22, 40);
  ctx.beginPath();
  ctx.arc(x + 11, baseY - 40, 11, Math.PI, 0);
  ctx.fill();
}

// Ciel, lune et pierres tombales en parallaxe (elles défilent moins vite que le sol).
function drawBackground(distance) {
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  sky.addColorStop(0, '#1d1a2e');
  sky.addColorStop(1, '#5a3550');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  ctx.fillStyle = '#f4ecd8';
  ctx.beginPath();
  ctx.arc(540, 70, 28, 0, Math.PI * 2);
  ctx.fill();

  const spacing = 150;
  const offset = (distance * 0.3) % spacing;
  for (let x = -offset; x < VIEW_W; x += spacing) {
    drawTombstone(x, GROUND_Y);
  }
}

// Sol et traits qui défilent : ils donnent l'impression de vitesse.
function drawGround(distance) {
  ctx.fillStyle = '#3b3427';
  ctx.fillRect(0, GROUND_Y, VIEW_W, VIEW_H - GROUND_Y);
  ctx.fillStyle = '#5c5240';
  ctx.fillRect(0, GROUND_Y, VIEW_W, 3);

  ctx.fillStyle = '#4a4131';
  const spacing = 60;
  const offset = distance % spacing;
  for (let x = -offset; x < VIEW_W; x += spacing) {
    ctx.fillRect(x, GROUND_Y + 22, 28, 3);
  }
}

// Zombie dessiné en Canvas, origine en haut à gauche de sa boîte. Il avance vers la gauche, vers le coureur.
function drawZombie(z, distance, time) {
  const sway = Math.sin(time * 8 + z.phase) * 3;
  ctx.save();
  ctx.translate(z.x - distance, GROUND_Y - z.h);
  ctx.fillStyle = '#7fa650';

  // Bras tendus vers l'avant
  ctx.fillRect(-6, 19, z.w * 0.5 + 6, 4);
  // Torse
  ctx.fillRect(z.w * 0.2, 17, z.w * 0.6, 15);
  // Jambes qui se balancent
  ctx.fillRect(z.w * 0.25 + sway, 32, 5, 12);
  ctx.fillRect(z.w * 0.55 - sway, 32, 5, 12);
  // Tête
  ctx.beginPath();
  ctx.arc(z.w / 2, 9, 8, 0, Math.PI * 2);
  ctx.fill();
  // Yeux rouges
  ctx.fillStyle = '#ff3b30';
  ctx.beginPath();
  ctx.arc(z.w / 2 - 4, 7, 1.8, 0, Math.PI * 2);
  ctx.arc(z.w / 2, 7, 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Coureur dessiné en Canvas, origine en haut à gauche de sa boîte. Il court vers la droite.
function drawRunner(r, time) {
  ctx.save();
  ctx.translate(RUNNER_X, r.y);
  ctx.lineCap = 'round';

  // Jambes : alternées au sol, repliées en l'air.
  const cycle = r.onGround ? Math.sin(time * 16) : 0;
  const legA = r.onGround ? [15 + 8 * cycle, 56 - 6 * Math.max(cycle, 0)] : [21, 46];
  const legB = r.onGround ? [15 - 8 * cycle, 56 - 6 * Math.max(-cycle, 0)] : [9, 48];
  ctx.strokeStyle = '#1f3a5f';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(15, 36);
  ctx.lineTo(...legA);
  ctx.moveTo(15, 36);
  ctx.lineTo(...legB);
  ctx.stroke();

  // Bras : ils balancent à l'opposé des jambes.
  ctx.strokeStyle = '#e0ac7e';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(15, 22);
  ctx.lineTo(15 - 7 * cycle, 34);
  ctx.moveTo(15, 22);
  ctx.lineTo(15 + 7 * cycle, 30);
  ctx.stroke();

  // Torse (veste jaune)
  ctx.strokeStyle = '#f2c14e';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(15, 18);
  ctx.lineTo(15, 36);
  ctx.stroke();

  // Tête et cheveux
  ctx.fillStyle = '#e0ac7e';
  ctx.beginPath();
  ctx.arc(15, 9, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3b2a1a';
  ctx.beginPath();
  ctx.arc(15, 8, 7, Math.PI, 0);
  ctx.fill();
  ctx.restore();
}

function render() {
  drawBackground(world.distance);
  drawGround(world.distance);
  for (const z of world.zombies) drawZombie(z, world.distance, world.time);
  drawRunner(world.runner, world.time);
}

// --- Entrées ---

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'ArrowUp') {
    e.preventDefault();
    if (!e.repeat) jumpAction();
    return;
  }
  // Sur un bouton, Entrée déclenche déjà son clic natif : on ne le double pas.
  if (e.code === 'Enter' && !e.repeat && !(e.target instanceof HTMLButtonElement)) {
    startAction();
  }
});

// Bouton tactile de saut.
btnJump.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  btnJump.setPointerCapture(e.pointerId);
  btnJump.classList.add('active');
  jumpAction();
});
const releaseJump = () => btnJump.classList.remove('active');
btnJump.addEventListener('pointerup', releaseJump);
btnJump.addEventListener('pointercancel', releaseJump);

btnStart.addEventListener('click', startAction);
btnRetry.addEventListener('click', startAction);

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
