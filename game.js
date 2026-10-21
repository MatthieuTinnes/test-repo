// Flappy Bird : Canvas 2D, sons WebAudio, aucune dépendance.
// Les constantes ci-dessous sont les seuls leviers de réglage du game feel.

const LOGICAL_W = 480;
const LOGICAL_H = 640;

const GRAVITY = 1800; // px/s²
const FLAP_VELOCITY = -520; // px/s

const PIPE_SPEED_BASE = 150; // px/s
const PIPE_SPEED_MAX = 320;
const PIPE_SPEED_STEP = 4; // px/s gagnés par point
const PIPE_GAP_BASE = 180; // px
const PIPE_GAP_MIN = 120;
const PIPE_GAP_STEP = 2; // px retirés par point
const PIPE_WIDTH = 60;
const PIPE_SPACING = 240;
const PIPE_CAP_HEIGHT = 24;
const PIPE_MARGIN = 60; // marge minimale au-dessus et en dessous de l'ouverture

const GROUND_HEIGHT = 60;
const GROUND_TOP = LOGICAL_H - GROUND_HEIGHT;
const GROUND_STRIPE = 24;

const BIRD_X = 100;
const BIRD_RADIUS = 14;
const BIRD_START_Y = 290;
const MAX_TILT = (25 * Math.PI) / 180;

const MAX_DT = 0.05; // s
const BEST_KEY = 'flappy.bestScore';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const finalScoreEl = document.getElementById('final-score');
const finalBestEl = document.getElementById('final-best');
const startScreen = document.getElementById('screen-start');
const gameOverScreen = document.getElementById('screen-gameover');
const btnStart = document.getElementById('btn-start');
const btnRetry = document.getElementById('btn-retry');
const btnMute = document.getElementById('btn-mute');

let state = 'menu'; // 'menu' | 'playing' | 'gameover'
let score = 0;
let best = loadBest();
let time = 0;
let groundOffset = 0;

const bird = { x: BIRD_X, y: BIRD_START_Y, vy: 0, tilt: 0 };
const pipes = [];
const pipePool = [];
const clouds = [
  { x: 80, y: 90, scale: 1, speed: 18 },
  { x: 300, y: 170, scale: 0.7, speed: 12 },
  { x: 440, y: 60, scale: 0.85, speed: 15 },
];

const skyGradient = ctx.createLinearGradient(0, 0, 0, GROUND_TOP);
skyGradient.addColorStop(0, '#4ec0ca');
skyGradient.addColorStop(1, '#cdeff5');

let muted = false;
let audioCtx = null;
let audioUnavailable = false;

let running = false;
let rafId = 0;
let lastTime = null;

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

// --- Audio (sons synthétisés, AudioContext créé au premier geste utilisateur) ---

function ensureAudio() {
  if (audioCtx) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return;
  }
  if (audioUnavailable) return;
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) {
    audioUnavailable = true;
    return;
  }
  audioCtx = new AudioCtor();
}

function playTone({ freq, endFreq, duration, type, gain, delay = 0 }) {
  if (!audioCtx || muted) return;
  const t0 = audioCtx.currentTime + delay;
  const osc = audioCtx.createOscillator();
  const amp = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + duration);
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(amp).connect(audioCtx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

function playFlap() {
  playTone({ freq: 520, endFreq: 680, duration: 0.08, type: 'square', gain: 0.05 });
}

function playPoint() {
  playTone({ freq: 880, duration: 0.08, type: 'sine', gain: 0.1 });
  playTone({ freq: 1175, duration: 0.1, type: 'sine', gain: 0.1, delay: 0.08 });
}

function playHit() {
  playTone({ freq: 320, endFreq: 70, duration: 0.25, type: 'sawtooth', gain: 0.1 });
}

function playGameOver() {
  [392, 330, 262].forEach((freq, i) => {
    playTone({ freq, duration: 0.15, type: 'triangle', gain: 0.08, delay: 0.2 + i * 0.12 });
  });
}

function toggleMute() {
  muted = !muted;
  btnMute.textContent = muted ? 'Son : coupé' : 'Son : activé';
}

// --- Difficulté : recalculée à chaque utilisation à partir du score ---

function currentSpeed() {
  return Math.min(PIPE_SPEED_BASE + score * PIPE_SPEED_STEP, PIPE_SPEED_MAX);
}

function currentGap() {
  return Math.max(PIPE_GAP_BASE - score * PIPE_GAP_STEP, PIPE_GAP_MIN);
}

// --- Entités ---

function spawnPipe() {
  const gap = currentGap();
  const pipe = pipePool.pop() || { x: 0, gapY: 0, gap: 0, passed: false };
  pipe.x = LOGICAL_W;
  pipe.gap = gap;
  pipe.gapY = PIPE_MARGIN + Math.random() * (GROUND_TOP - gap - 2 * PIPE_MARGIN);
  pipe.passed = false;
  pipes.push(pipe);
}

function releasePipes() {
  while (pipes.length) pipePool.push(pipes.pop());
}

function addPoint() {
  score += 1;
  scoreEl.textContent = String(score);
  if (score > best) {
    best = score;
    bestEl.textContent = String(best);
    saveBest();
  }
  playPoint();
}

function die() {
  state = 'gameover';
  finalScoreEl.textContent = String(score);
  finalBestEl.textContent = String(best);
  gameOverScreen.classList.remove('hidden');
  btnRetry.focus({ preventScroll: true });
  playHit();
  playGameOver();
}

function startGame() {
  ensureAudio();
  releasePipes();
  score = 0;
  scoreEl.textContent = '0';
  bird.y = BIRD_START_Y;
  bird.vy = 0;
  state = 'playing';
  startScreen.classList.add('hidden');
  gameOverScreen.classList.add('hidden');
}

function flap() {
  if (state !== 'playing') return;
  bird.vy = FLAP_VELOCITY;
  playFlap();
}

// --- Simulation ---

function updateScenery(dt) {
  const scroll = state === 'playing' ? currentSpeed() : 40;
  groundOffset = (groundOffset + scroll * dt) % GROUND_STRIPE;
  for (const cloud of clouds) {
    cloud.x -= cloud.speed * dt;
    if (cloud.x < -50 * cloud.scale) cloud.x = LOGICAL_W + 50 * cloud.scale;
  }
}

function updateBird(dt) {
  if (state === 'menu') {
    bird.y = BIRD_START_Y + Math.sin(time * 4) * 8;
    bird.vy = 0;
  } else if (state === 'playing') {
    bird.vy += GRAVITY * dt;
    bird.y += bird.vy * dt;
    if (bird.y < BIRD_RADIUS) {
      bird.y = BIRD_RADIUS;
      bird.vy = Math.max(bird.vy, 0);
    }
  }
  const target = bird.vy < 0 ? -MAX_TILT : Math.min(bird.vy / 600, 1) * MAX_TILT;
  bird.tilt += (target - bird.tilt) * Math.min(1, dt * 12);
}

function updatePlaying(dt) {
  const speed = currentSpeed();
  for (const pipe of pipes) pipe.x -= speed * dt;

  const last = pipes[pipes.length - 1];
  if (!last || last.x <= LOGICAL_W - PIPE_SPACING) spawnPipe();

  let kept = 0;
  for (let i = 0; i < pipes.length; i++) {
    const pipe = pipes[i];
    if (pipe.x + PIPE_WIDTH < 0) {
      pipePool.push(pipe);
      continue;
    }
    if (!pipe.passed && pipe.x + PIPE_WIDTH < BIRD_X) {
      pipe.passed = true;
      addPoint();
    }
    pipes[kept++] = pipe;
  }
  pipes.length = kept;

  if (bird.y + BIRD_RADIUS >= GROUND_TOP) {
    bird.y = GROUND_TOP - BIRD_RADIUS;
    die();
    return;
  }
  for (const pipe of pipes) {
    const overlapX = bird.x + BIRD_RADIUS > pipe.x && bird.x - BIRD_RADIUS < pipe.x + PIPE_WIDTH;
    const hitsGap = bird.y - BIRD_RADIUS < pipe.gapY || bird.y + BIRD_RADIUS > pipe.gapY + pipe.gap;
    if (overlapX && hitsGap) {
      die();
      return;
    }
  }
}

function update(dt) {
  time += dt;
  updateScenery(dt);
  if (state === 'playing') updatePlaying(dt);
  updateBird(dt);
}

// --- Rendu ---

function drawClouds() {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  for (const c of clouds) {
    const s = c.scale;
    for (const [dx, r] of [[0, 18], [22, 24], [44, 18]]) {
      ctx.beginPath();
      ctx.arc(c.x + dx * s, c.y, r * s, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawPipeRect(x, y, w, h) {
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);
}

function drawPipes() {
  ctx.fillStyle = '#5cb83a';
  ctx.strokeStyle = '#2d6b1c';
  ctx.lineWidth = 3;
  for (const p of pipes) {
    const bottomCapY = p.gapY + p.gap;
    // Tuyau du haut : corps puis rebord (capuchon) juste au-dessus de l'ouverture.
    drawPipeRect(p.x, 0, PIPE_WIDTH, p.gapY - PIPE_CAP_HEIGHT);
    drawPipeRect(p.x - 4, p.gapY - PIPE_CAP_HEIGHT, PIPE_WIDTH + 8, PIPE_CAP_HEIGHT);
    // Tuyau du bas : rebord juste sous l'ouverture puis corps jusqu'au sol.
    drawPipeRect(p.x - 4, bottomCapY, PIPE_WIDTH + 8, PIPE_CAP_HEIGHT);
    drawPipeRect(p.x, bottomCapY + PIPE_CAP_HEIGHT, PIPE_WIDTH, GROUND_TOP - bottomCapY - PIPE_CAP_HEIGHT);
  }
}

function drawGround() {
  ctx.fillStyle = '#ded895';
  ctx.fillRect(0, GROUND_TOP, LOGICAL_W, GROUND_HEIGHT);
  ctx.fillStyle = '#8fd14f';
  ctx.fillRect(0, GROUND_TOP, LOGICAL_W, 12);
  ctx.fillStyle = '#c9bd6e';
  for (let x = -groundOffset; x < LOGICAL_W; x += GROUND_STRIPE) {
    ctx.fillRect(x, GROUND_TOP + 14, 12, GROUND_HEIGHT - 14);
  }
}

function drawBird() {
  ctx.save();
  ctx.translate(bird.x, bird.y);
  ctx.rotate(bird.tilt);
  ctx.fillStyle = '#ffd23f';
  ctx.strokeStyle = '#c98f00';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, 17, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fff4b0';
  ctx.beginPath();
  ctx.ellipse(-4, 2, 8, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(6, -4, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(7, -4, 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ff8c1a';
  ctx.beginPath();
  ctx.moveTo(14, -2);
  ctx.lineTo(22, 2);
  ctx.lineTo(14, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function render() {
  ctx.fillStyle = skyGradient;
  ctx.fillRect(0, 0, LOGICAL_W, GROUND_TOP);
  drawClouds();
  drawPipes();
  drawGround();
  drawBird();
}

// Le backing store suit devicePixelRatio ; le jeu raisonne toujours en 480 × 640.
function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = LOGICAL_W * dpr;
  canvas.height = LOGICAL_H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  render();
}

// --- Boucle ---

function loop(now) {
  const dt = lastTime === null ? 0 : Math.min((now - lastTime) / 1000, MAX_DT);
  lastTime = now;
  update(dt);
  render();
  rafId = requestAnimationFrame(loop);
}

function startLoop() {
  if (running || document.hidden) return;
  running = true;
  lastTime = null;
  rafId = requestAnimationFrame(loop);
}

function stopLoop() {
  running = false;
  cancelAnimationFrame(rafId);
}

// --- Entrées ---

canvas.addEventListener('pointerdown', () => {
  ensureAudio();
  if (state === 'menu') startGame();
  else flap();
});

document.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') {
    if (!e.repeat) toggleMute();
    return;
  }
  if (e.code === 'Space' || e.code === 'ArrowUp') {
    e.preventDefault();
    if (e.repeat) return;
    ensureAudio();
    if (state === 'menu') startGame();
    else flap();
    return;
  }
  // Sur un bouton, Entrée déclenche déjà son clic natif : on ne le double pas.
  if (e.code === 'Enter' && !e.repeat && !(e.target instanceof HTMLButtonElement)) {
    ensureAudio();
    if (state === 'menu' || state === 'gameover') startGame();
  }
});

btnStart.addEventListener('click', () => {
  ensureAudio();
  if (state === 'menu') startGame();
});

btnRetry.addEventListener('click', () => {
  ensureAudio();
  if (state === 'gameover') startGame();
});

btnMute.addEventListener('click', toggleMute);

window.addEventListener('resize', resize);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopLoop();
  else startLoop();
});
window.addEventListener('blur', stopLoop);
window.addEventListener('focus', startLoop);

bestEl.textContent = String(best);
resize();
startLoop();
