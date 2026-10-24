// Tests du jeu de plateforme : niveaux, physique et règles, sans navigateur.
// Lancer avec : node --test tests/plateforme.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'plateforme', 'game.js'), 'utf8');

function noop() {}

// Charge game.js dans un contexte isolé, avec un DOM minimal.
function createGame() {
  const ctxStub = new Proxy(
    { createLinearGradient: () => ({ addColorStop: noop }) },
    {
      get: (target, key) => (key in target ? target[key] : noop),
      set: (target, key, value) => {
        target[key] = value;
        return true;
      },
    },
  );
  const elements = {};
  const makeElement = () => ({
    textContent: '',
    dataset: {},
    style: {},
    classList: { add: noop, remove: noop },
    addEventListener: noop,
    focus: noop,
    setPointerCapture: noop,
    getContext: () => ctxStub,
  });
  const sandbox = {
    HTMLButtonElement: class {},
    document: {
      hidden: false,
      getElementById: (id) => (elements[id] ??= makeElement()),
      querySelectorAll: () => [],
      addEventListener: noop,
    },
    window: { devicePixelRatio: 1, addEventListener: noop },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: noop,
  };
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox, { filename: 'game.js' });
  return {
    run: (code) => vm.runInContext(code, sandbox),
    json: (expr) => JSON.parse(vm.runInContext(`JSON.stringify(${expr})`, sandbox)),
  };
}

test('chaque niveau est une grille rectangulaire, jouable et cohérente', () => {
  const game = createGame();
  const levels = game.json('LEVELS');
  assert.equal(levels.length, 3);
  for (const level of levels) {
    const width = level.rows[0].length;
    assert.equal(level.rows.length, 12, `${level.name} : 12 lignes`);
    assert.ok(level.rows.every((row) => row.length === width), `${level.name} : lignes de même longueur`);

    const cells = level.rows.join('');
    assert.equal(cells.split('S').length - 1, 1, `${level.name} : un seul départ`);
    assert.ok(cells.includes('F'), `${level.name} : un drapeau`);

    level.rows.forEach((row, r) => {
      [...row].forEach((ch, c) => {
        // Un ennemi patrouille sur un bloc, pas dans le vide.
        if (ch === 'E') assert.equal(level.rows[r + 1]?.[c], '#', `${level.name} : ennemi sans sol en ${c},${r}`);
        // Le départ et le drapeau reposent sur le sol.
        if (ch === 'S' || ch === 'F') assert.equal(level.rows[r + 1]?.[c], '#', `${level.name} : ${ch} sans sol en ${c},${r}`);
      });
    });

    // Un trou du sol ne dépasse pas 3 cases, à la portée du saut (environ 4 cases en longueur).
    const ground = level.rows[10];
    const longestGap = Math.max(...ground.split('#').map((gap) => gap.length));
    assert.ok(longestGap <= 3, `${level.name} : trou de ${longestGap} cases`);
  }
});

test('le drapeau de chaque niveau est atteignable depuis le départ', () => {
  // Parcours en largeur sur les positions debout : marche, chute, saut (montée ≤ 2 cases, portée ≤ 4 cases).
  // Approximation optimiste de la physique, qui sert de garde-fou sur les niveaux.
  const game = createGame();
  for (const level of game.json('LEVELS')) {
    const rows = level.rows;
    const height = rows.length;
    const width = rows[0].length;
    const solid = (c, r) => (c < 0 || c >= width ? true : r < 0 || r >= height ? false : rows[r][c] === '#');
    const standing = (c, r) => !solid(c, r) && solid(c, r + 1);
    let start;
    let flag;
    rows.forEach((row, r) => [...row].forEach((ch, c) => {
      if (ch === 'S') start = [c, r];
      if (ch === 'F') flag = [c, r];
    }));

    const seen = new Set([start.join(',')]);
    const queue = [start];
    while (queue.length) {
      const [c, r] = queue.shift();
      const next = [];
      for (const d of [-1, 1]) {
        if (!solid(c + d, r)) {
          let fall = r;
          while (!solid(c + d, fall + 1) && fall < height) fall++;
          if (fall < height) next.push([c + d, fall]);
        }
        if (!solid(c + d, r - 1) && !solid(c + d, r - 2)) {
          for (let dx = 1; dx <= 4; dx++) {
            for (let dy = 0; dy <= 2; dy++) {
              if (standing(c + d * dx, r - dy)) next.push([c + d * dx, r - dy]);
            }
          }
        }
      }
      for (const [nc, nr] of next) {
        if (nr >= height || seen.has(`${nc},${nr}`)) continue;
        seen.add(`${nc},${nr}`);
        queue.push([nc, nr]);
      }
    }
    assert.ok(seen.has(flag.join(',')), `${level.name} : drapeau inaccessible`);
  }
});

test('le joueur se pose sur le sol et ne le traverse pas', () => {
  const game = createGame();
  game.run('startGame()');
  for (let i = 0; i < 120; i++) game.run('update(1 / 60)');
  const player = game.json('world.player');
  assert.equal(player.y + player.h, 10 * 32);
  assert.equal(player.onGround, true);
});

test('le saut monte d’environ trois cases et se contrôle au relâchement', () => {
  const apex = (framesHeld) => {
    const game = createGame();
    game.run('startGame()');
    const startY = game.run('world.player.y');
    game.run('keyInput.jump = true');
    let minY = startY;
    for (let i = 0; i < 120; i++) {
      if (i === framesHeld) game.run('keyInput.jump = false');
      game.run('update(1 / 60)');
      minY = Math.min(minY, game.run('world.player.y'));
    }
    return startY - minY;
  };
  const full = apex(120);
  const short = apex(3);
  assert.ok(full >= 2 * 32 && full <= 3.5 * 32, `hauteur de saut ${full} px`);
  assert.ok(short < full * 0.7, `saut relâché tôt : ${short} px contre ${full} px`);
});

test('une pièce ramassée rapporte des points et disparaît', () => {
  const game = createGame();
  game.run('startGame()');
  game.run('world.player.x = world.coins[0].x; world.player.y = world.coins[0].y');
  game.run('update(1 / 60)');
  assert.equal(game.run('score'), 10);
  assert.equal(game.run('world.coins[0].taken'), true);
});

test('écraser un ennemi par le haut le tue, un contact latéral fait perdre une vie', () => {
  // Ennemi 0 de la prairie : sur le bloc de la case (4, 7).
  const stomp = createGame();
  stomp.run('startGame()');
  stomp.run(`
    world.player.x = world.enemies[0].x + 2;
    world.player.y = world.enemies[0].y + 5 - PLAYER_H;
    world.player.vy = 200;
    world.player.invuln = 0;
  `);
  stomp.run('update(1 / 120)');
  assert.equal(stomp.run('world.enemies[0].alive'), false);
  assert.equal(stomp.run('lives'), 3);

  const side = createGame();
  side.run('startGame()');
  side.run(`
    world.player.x = world.enemies[0].x + 2;
    world.player.y = world.enemies[0].y + 20 - PLAYER_H;
    world.player.vy = 0;
    world.player.invuln = 0;
  `);
  side.run('update(1 / 120)');
  assert.equal(side.run('world.enemies[0].alive'), true);
  assert.equal(side.run('lives'), 2);
});

test('tomber dans un trou fait perdre une vie et ramène au départ', () => {
  const game = createGame();
  game.run('startGame()');
  const spawnY = game.run('world.spawn.y');
  game.run('world.player.y = world.rows * TILE + 10');
  game.run('update(1 / 60)');
  assert.equal(game.run('lives'), 2);
  assert.equal(game.run('world.player.y'), spawnY);
  assert.ok(game.run('world.player.invuln') > 0);
});

test('atteindre le drapeau passe au niveau suivant, le dernier mène à la victoire', () => {
  const game = createGame();
  game.run('startGame()');
  game.run('world.player.x = world.flag.x; world.player.y = world.flag.y + 2');
  game.run('update(1 / 60)');
  assert.equal(game.run('levelIndex'), 1);
  assert.equal(game.run('state'), 'playing');
  assert.ok(game.run('banner') > 0);

  game.run('levelIndex = 2; loadLevel(2)');
  game.run('world.player.x = world.flag.x; world.player.y = world.flag.y + 2');
  game.run('update(1 / 60)');
  assert.equal(game.run('state'), 'victory');
});

test('perdre la dernière vie affiche la fin de partie', () => {
  const game = createGame();
  game.run('startGame()');
  game.run('lives = 1; world.player.y = world.rows * TILE + 10');
  game.run('update(1 / 60)');
  assert.equal(game.run('state'), 'gameover');
  assert.equal(game.run('lives'), 0);
});
