// Jeu de plateforme : Canvas 2D, aucune dépendance.
// Les constantes ci-dessous sont les leviers de réglage du game feel.
// Les niveaux sont des grilles de caractères, déclarées en bas de fichier.

const TILE = 32; // px par case
const VIEW_W = 480;
const VIEW_H = 384; // 12 cases de haut

const GRAVITY = 1500; // px/s²
const MAX_FALL = 900; // px/s
const MOVE_SPEED = 190; // px/s, portée d'un saut d'environ 4 cases
const JUMP_VELOCITY = -560; // px/s, monte d'environ 3 cases
const JUMP_CUT = 0.45; // vitesse conservée si Saut est relâché pendant la montée
const COYOTE_TIME = 0.08; // s pour sauter juste après avoir quitté une plateforme
const JUMP_BUFFER = 0.12; // s pendant lesquelles un appui trop tôt reste mémorisé
const STOMP_BOUNCE = -380; // px/s, rebond après un écrasement
const INVULN_TIME = 1.5; // s sans dégât après une perte de vie
const MAX_STEP = 8; // px max par sous-pas de collision, pour ne pas traverser une case
const MAX_DT = 0.05; // s

const PLAYER_W = 24;
const PLAYER_H = 30;
const PLAYER_LIVES = 3;

const ENEMY_W = 28;
const ENEMY_H = 28;
const ENEMY_SPEED = 60; // px/s

const COIN_SIZE = 16;
const COIN_POINTS = 10;
const BANNER_TIME = 1.6; // s

const SOLID = '#';

// --- Niveaux : une chaîne par ligne, une lettre par case ---
// # bloc solide · C pièce · E ennemi (posé sur un bloc) · S départ · F drapeau · . vide

const LEVELS = [
  {
    name: 'Prairie',
    sky: ['#5ec8f2', '#e4f6ff'],
    rows: [
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '...........CC...........................',
      '..........####..........................',
      '....ECC...........C.....................',
      '....####.........###....................',
      '.S......................E........CCCE.F.',
      '##############...#############..########',
      '##############...#############..########',
    ],
  },
  {
    name: 'Collines',
    sky: ['#8fb8e8', '#fde3c4'],
    rows: [
      '..................................................',
      '..................................................',
      '..................................................',
      '................CC................................',
      '................###...............................',
      '...........CC..............................C......',
      '...........###............................###.....',
      '......CC.......................CC....E............',
      '......###.............###.....####..####..........',
      '.S...............E..CC........................EF..',
      '############...###########..############...#######',
      '############...###########..############...#######',
    ],
  },
  {
    name: 'Ciel',
    sky: ['#2c3e75', '#8e7cc3'],
    rows: [
      '............................................................',
      '................CEC.........................................',
      '................###.........................................',
      '............CCC...................................CCC.......',
      '............###...................................###.......',
      '........CEC..........CEC.......CEC............CEC...........',
      '........###..........####......###............###...........',
      '....CEC.....................C..............C................',
      '....###....................###............###...............',
      '.S............CCC.E.........E.CCC.......E...............F...',
      '##########...#########..###########..#######################',
      '##########...#########..###########..#######################',
    ],
  },
];

// --- Variables d'état ---

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');
const levelEl = document.getElementById('level');
const startScreen = document.getElementById('screen-start');
const endScreen = document.getElementById('screen-end');
const endTitleEl = document.getElementById('end-title');
const endTextEl = document.getElementById('end-text');
const finalScoreEl = document.getElementById('final-score');
const btnStart = document.getElementById('btn-start');
const btnRetry = document.getElementById('btn-retry');

let state = 'menu'; // 'menu' | 'playing' | 'gameover' | 'victory'
let score = 0;
let lives = PLAYER_LIVES;
let levelIndex = 0;
let world = null; // niveau courant : grille, pièces, ennemis, joueur
let banner = 0; // s restantes pour l'annonce du niveau
let time = 0;
let jumpBuffer = 0;
let prevJump = false;

const keyInput = { left: false, right: false, jump: false };
const touchInput = { left: false, right: false, jump: false };

let running = false;
let rafId = 0;
let lastTime = null;

// --- Utilitaires de collision ---

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function isSolid(col, row) {
  if (col < 0 || col >= world.cols) return true; // murs aux bords du niveau
  if (row < 0 || row >= world.rows) return false; // au-dessus : ciel, en dessous : vide (chute)
  return world.tiles[row][col] === SOLID;
}

// Appelle fn(col, row) pour chaque case solide touchée par la boîte.
function forEachSolid(x, y, w, h, fn) {
  const c0 = Math.floor(x / TILE);
  const c1 = Math.floor((x + w - 0.01) / TILE);
  const r0 = Math.floor(y / TILE);
  const r1 = Math.floor((y + h - 0.01) / TILE);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (isSolid(c, r)) fn(c, r);
    }
  }
}

// Axe X puis axe Y, séparés : on ne traverse pas les blocs à grande vitesse.
function moveX(body, dist) {
  if (dist === 0) return;
  body.x += dist;
  forEachSolid(body.x, body.y, body.w, body.h, (c) => {
    if (dist > 0) body.x = Math.min(body.x, c * TILE - body.w);
    else body.x = Math.max(body.x, (c + 1) * TILE);
  });
}

function moveY(body, dist) {
  if (dist === 0) return;
  body.y += dist;
  forEachSolid(body.x, body.y, body.w, body.h, (c, r) => {
    if (dist > 0) body.y = Math.min(body.y, r * TILE - body.h);
    else body.y = Math.max(body.y, (r + 1) * TILE);
    body.vy = 0;
  });
}

function moveBody(body, dx, dy) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / MAX_STEP));
  for (let i = 0; i < steps; i++) {
    moveX(body, dx / steps);
    moveY(body, dy / steps);
  }
}

function touchesGround(body) {
  let grounded = false;
  forEachSolid(body.x, body.y + 1, body.w, body.h, () => {
    grounded = true;
  });
  return grounded;
}

// --- Niveaux et entités ---

function loadLevel(index) {
  const def = LEVELS[index];
  world = {
    def,
    tiles: def.rows,
    rows: def.rows.length,
    cols: def.rows[0].length,
    coins: [],
    enemies: [],
    flag: null,
    spawn: null,
    player: null,
  };
  def.rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const x = c * TILE;
      const y = r * TILE;
      const ch = row[c];
      if (ch === 'C') {
        world.coins.push({
          x: x + (TILE - COIN_SIZE) / 2,
          y: y + (TILE - COIN_SIZE) / 2,
          w: COIN_SIZE,
          h: COIN_SIZE,
          taken: false,
        });
      } else if (ch === 'E') {
        const enemy = { x: x + (TILE - ENEMY_W) / 2, y: y + TILE - ENEMY_H, w: ENEMY_W, h: ENEMY_H };
        enemy.spawn = { x: enemy.x, y: enemy.y };
        enemy.dir = -1;
        enemy.alive = true;
        world.enemies.push(enemy);
      } else if (ch === 'S') {
        world.spawn = { x: x + (TILE - PLAYER_W) / 2, y: y + TILE - PLAYER_H };
      } else if (ch === 'F') {
        world.flag = { x, y, w: TILE, h: TILE };
      }
    }
  });
  placePlayer(0);
  banner = BANNER_TIME;
}

function placePlayer(invuln) {
  world.player = {
    x: world.spawn.x,
    y: world.spawn.y,
    w: PLAYER_W,
    h: PLAYER_H,
    vx: 0,
    vy: 0,
    onGround: false,
    coyote: 0,
    cut: false,
    invuln,
    facing: 1,
  };
  // Les ennemis reviennent à leur position de départ à chaque nouvelle vie.
  for (const enemy of world.enemies) {
    enemy.x = enemy.spawn.x;
    enemy.y = enemy.spawn.y;
    enemy.dir = -1;
    enemy.alive = true;
  }
}

function cameraX() {
  const maxX = Math.max(0, world.cols * TILE - VIEW_W);
  return clamp(world.player.x + PLAYER_W / 2 - VIEW_W / 2, 0, maxX);
}

// --- Règles ---

function updateHud() {
  scoreEl.textContent = String(score);
  livesEl.textContent = String(lives);
  levelEl.textContent = `${levelIndex + 1}/${LEVELS.length}`;
}

function finish(kind) {
  state = kind;
  const won = kind === 'victory';
  endTitleEl.textContent = won ? 'Victoire !' : 'Partie terminée';
  endTextEl.textContent = won ? 'Les trois niveaux sont franchis.' : 'Plus de vies.';
  finalScoreEl.textContent = String(score);
  endScreen.classList.remove('hidden');
  btnRetry.focus({ preventScroll: true });
}

function loseLife() {
  lives -= 1;
  updateHud();
  if (lives <= 0) finish('gameover');
  else placePlayer(INVULN_TIME);
}

function nextLevel() {
  levelIndex += 1;
  if (levelIndex >= LEVELS.length) finish('victory');
  else loadLevel(levelIndex);
}

function startGame() {
  score = 0;
  lives = PLAYER_LIVES;
  levelIndex = 0;
  state = 'playing';
  startScreen.classList.add('hidden');
  endScreen.classList.add('hidden');
  loadLevel(levelIndex);
  updateHud();
}

// Démarre ou rejoue, uniquement hors partie en cours.
function startAction() {
  if (state !== 'playing') startGame();
}

// --- Simulation ---

function updatePlayer(dt) {
  const p = world.player;
  const left = keyInput.left || touchInput.left;
  const right = keyInput.right || touchInput.right;
  const jump = keyInput.jump || touchInput.jump;

  const dir = (right ? 1 : 0) - (left ? 1 : 0);
  if (dir !== 0) p.facing = dir;
  p.vx = dir * MOVE_SPEED;

  // Saut : appui mémorisé brièvement, et saut encore permis juste après une chute.
  if (jump && !prevJump) jumpBuffer = JUMP_BUFFER;
  prevJump = jump;
  jumpBuffer -= dt;
  p.coyote = p.onGround ? COYOTE_TIME : p.coyote - dt;
  if (jumpBuffer > 0 && p.coyote > 0) {
    p.vy = JUMP_VELOCITY;
    p.cut = false;
    jumpBuffer = 0;
    p.coyote = 0;
  }
  // Saut à hauteur contrôlée : relâcher tôt coupe la montée.
  if (!jump && p.vy < 0 && !p.cut) {
    p.vy *= JUMP_CUT;
    p.cut = true;
  }

  p.vy = Math.min(p.vy + GRAVITY * dt, MAX_FALL);
  moveBody(p, p.vx * dt, p.vy * dt);

  if (p.y > world.rows * TILE) {
    loseLife();
    return;
  }
  p.onGround = touchesGround(p);
  p.invuln = Math.max(0, p.invuln - dt);
}

function patrol(enemy, dt) {
  const prevX = enemy.x;
  enemy.x += enemy.dir * ENEMY_SPEED * dt;
  const footRow = Math.floor((enemy.y + enemy.h - 1) / TILE);
  const aheadCol = Math.floor((enemy.dir > 0 ? enemy.x + enemy.w : enemy.x - 1) / TILE);
  let blocked = false;
  forEachSolid(enemy.x, enemy.y, enemy.w, enemy.h, () => {
    blocked = true;
  });
  // Demi-tour contre un mur ou au bord de la plateforme.
  if (blocked || !isSolid(aheadCol, footRow + 1)) {
    enemy.x = prevX;
    enemy.dir = -enemy.dir;
  }
}

function updateEnemies(dt) {
  const p = world.player;
  for (const enemy of world.enemies) {
    if (!enemy.alive) continue;
    patrol(enemy, dt);
    if (!overlaps(p, enemy)) continue;
    // Écrasé : le bas du joueur est au-dessus du milieu de l'ennemi, et il tombe.
    if (p.vy > 0 && p.y + p.h <= enemy.y + enemy.h / 2) {
      enemy.alive = false;
      p.vy = STOMP_BOUNCE;
      p.cut = true;
    } else if (p.invuln <= 0) {
      loseLife();
      return;
    }
  }
}

function collectCoins() {
  for (const coin of world.coins) {
    if (coin.taken || !overlaps(world.player, coin)) continue;
    coin.taken = true;
    score += COIN_POINTS;
    updateHud();
  }
}

function update(dt) {
  time += dt;
  if (state !== 'playing') return;
  banner = Math.max(0, banner - dt);

  updatePlayer(dt);
  if (state !== 'playing') return;
  updateEnemies(dt);
  if (state !== 'playing') return;
  collectCoins();
  if (overlaps(world.player, world.flag)) nextLevel();
}

// --- Rendu ---

function drawTiles() {
  world.tiles.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      if (row[c] !== SOLID) continue;
      const x = c * TILE;
      const y = r * TILE;
      ctx.fillStyle = '#b9733b';
      ctx.fillRect(x, y, TILE, TILE);
      ctx.strokeStyle = '#7a4a22';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, TILE - 2, TILE - 2);
      // Herbe sur le dessus des blocs exposés au ciel.
      if (!isSolid(c, r - 1)) {
        ctx.fillStyle = '#5cb83a';
        ctx.fillRect(x, y, TILE, 8);
      }
    }
  });
}

function drawFlag() {
  const { x, y } = world.flag;
  ctx.fillStyle = '#eeeeee';
  ctx.fillRect(x + TILE / 2 - 2, y - TILE, 4, TILE * 2);
  ctx.fillStyle = '#e53935';
  ctx.beginPath();
  ctx.moveTo(x + TILE / 2 + 2, y - TILE);
  ctx.lineTo(x + TILE / 2 + 20, y - TILE + 8);
  ctx.lineTo(x + TILE / 2 + 2, y - TILE + 16);
  ctx.closePath();
  ctx.fill();
}

function drawCoins() {
  const spin = Math.max(Math.abs(Math.cos(time * 4)), 0.2);
  ctx.fillStyle = '#ffd23f';
  ctx.strokeStyle = '#c98f00';
  ctx.lineWidth = 2;
  for (const coin of world.coins) {
    if (coin.taken) continue;
    ctx.beginPath();
    ctx.ellipse(coin.x + COIN_SIZE / 2, coin.y + COIN_SIZE / 2, (COIN_SIZE * spin) / 2, COIN_SIZE / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

function drawEnemies() {
  for (const enemy of world.enemies) {
    if (!enemy.alive) continue;
    const cx = enemy.x + enemy.w / 2;
    const pupil = enemy.dir * 1.5;
    ctx.fillStyle = '#8d5524';
    ctx.beginPath();
    ctx.ellipse(cx, enemy.y + enemy.h / 2, enemy.w / 2, enemy.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4e2a12';
    ctx.fillRect(enemy.x + 2, enemy.y + enemy.h - 6, 9, 6);
    ctx.fillRect(enemy.x + enemy.w - 11, enemy.y + enemy.h - 6, 9, 6);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(cx - 5, enemy.y + 11, 4, 0, Math.PI * 2);
    ctx.arc(cx + 5, enemy.y + 11, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.fillRect(cx - 6 + pupil, enemy.y + 10, 2, 2);
    ctx.fillRect(cx + 4 + pupil, enemy.y + 10, 2, 2);
  }
}

function drawPlayer() {
  const p = world.player;
  // Clignotement pendant l'invulnérabilité.
  if (p.invuln > 0 && Math.floor(p.invuln * 10) % 2 === 0) return;
  ctx.fillStyle = '#e53935'; // casquette
  ctx.fillRect(p.x + 2, p.y, PLAYER_W - 4, 8);
  ctx.fillStyle = '#ffcc80'; // visage
  ctx.fillRect(p.x + 4, p.y + 8, PLAYER_W - 8, 8);
  ctx.fillStyle = '#1e3a8a'; // salopette
  ctx.fillRect(p.x + 2, p.y + 16, PLAYER_W - 4, 14);
  ctx.fillStyle = '#5d4037'; // chaussures
  ctx.fillRect(p.x, p.y + PLAYER_H - 4, 10, 4);
  ctx.fillRect(p.x + PLAYER_W - 10, p.y + PLAYER_H - 4, 10, 4);
  ctx.fillStyle = '#111';
  ctx.fillRect(p.x + (p.facing > 0 ? 15 : 6), p.y + 11, 2, 3);
}

function drawBanner() {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillRect(0, VIEW_H / 2 - 36, VIEW_W, 72);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 28px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`Niveau ${levelIndex + 1} : ${world.def.name}`, VIEW_W / 2, VIEW_H / 2);
}

function render() {
  const sky = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  sky.addColorStop(0, world.def.sky[0]);
  sky.addColorStop(1, world.def.sky[1]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  ctx.save();
  ctx.translate(-cameraX(), 0);
  drawTiles();
  drawFlag();
  drawCoins();
  drawEnemies();
  drawPlayer();
  ctx.restore();

  if (state === 'playing' && banner > 0) drawBanner();
}

// Le backing store suit devicePixelRatio ; le jeu raisonne toujours en 480 × 384.
function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = VIEW_W * dpr;
  canvas.height = VIEW_H * dpr;
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

function releaseInputs() {
  for (const input of [keyInput, touchInput]) {
    input.left = false;
    input.right = false;
    input.jump = false;
  }
}

// --- Entrées ---

const KEY_ACTIONS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'jump', Space: 'jump' };

document.addEventListener('keydown', (e) => {
  const action = KEY_ACTIONS[e.code];
  if (action) {
    e.preventDefault();
    keyInput[action] = true;
    return;
  }
  // Sur un bouton, Entrée déclenche déjà son clic natif : on ne le double pas.
  if (e.code === 'Enter' && !e.repeat && !(e.target instanceof HTMLButtonElement)) startAction();
});

document.addEventListener('keyup', (e) => {
  const action = KEY_ACTIONS[e.code];
  if (action) keyInput[action] = false;
});

// Boutons tactiles : chacun capture son propre pointeur, donc le multi-touch fonctionne.
document.querySelectorAll('[data-action]').forEach((btn) => {
  const action = btn.dataset.action;
  const release = () => {
    touchInput[action] = false;
    btn.classList.remove('active');
  };
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    btn.setPointerCapture(e.pointerId);
    touchInput[action] = true;
    btn.classList.add('active');
    if (action === 'jump' && state === 'menu') startGame();
  });
  btn.addEventListener('pointerup', release);
  btn.addEventListener('pointercancel', release);
  btn.addEventListener('lostpointercapture', release);
});

btnStart.addEventListener('click', startAction);
btnRetry.addEventListener('click', startAction);

window.addEventListener('resize', resize);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopLoop();
  else startLoop();
});
window.addEventListener('blur', () => {
  releaseInputs();
  stopLoop();
});
window.addEventListener('focus', startLoop);

loadLevel(0);
updateHud();
resize();
startLoop();
