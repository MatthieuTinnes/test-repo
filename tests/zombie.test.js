// Tests du jeu Zombie : graine, saut, collision et rampe de difficulté, sans navigateur.
// Lancer avec : node --test tests/zombie.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('./support/loadGame');

const createGame = () => loadGame('zombie/game.js');
const {
  GROUND_Y,
  RUNNER_X,
  RUNNER_W,
  RUNNER_H,
  ZOMBIE_H,
  SPEED_MIN,
  SPEED_MAX,
  DIFF_DISTANCE,
} = createGame().json(`({
  GROUND_Y, RUNNER_X, RUNNER_W, RUNNER_H, ZOMBIE_H, SPEED_MIN, SPEED_MAX, DIFF_DISTANCE,
})`);

const NO_JUMP = '{ jump: false }';

test('une même graine produit toujours la même disposition des zombies', () => {
  const game = createGame();
  const layout = (seed) =>
    game.json(`(() => {
      const w = createWorld(${seed}, true);
      for (let i = 0; i < 600; i++) updateWorld(w, { jump: false }, 1 / 60);
      return w.zombies.map((z) => [z.x, z.w]);
    })()`);

  assert.deepEqual(layout(42), layout(42));
  assert.notDeepEqual(layout(42), layout(43));
});

test('un saut passe au-dessus d’un zombie et le coureur retombe au sol', () => {
  const game = createGame();
  const result = game.json(`(() => {
    const w = createWorld(1);
    w.nextX = Infinity; // pas d'autres zombies pendant le test
    w.zombies = [{ x: w.distance + RUNNER_X + 200, w: 34, h: ZOMBIE_H, phase: 0 }];
    let jumped = false;
    let hit = false;
    for (let i = 0; i < 300; i++) {
      // Saut quand le zombie est à environ 60 px du coureur.
      const gap = w.zombies.length ? w.zombies[0].x - (w.distance + RUNNER_X + RUNNER_W) : Infinity;
      const jump = !jumped && gap < 60;
      if (jump) jumped = true;
      updateWorld(w, { jump }, 1 / 60);
      if (w.over) {
        hit = true;
        break;
      }
    }
    return { jumped, hit, onGround: w.runner.onGround, y: w.runner.y };
  })()`);

  assert.equal(result.jumped, true);
  assert.equal(result.hit, false);
  assert.equal(result.onGround, true);
  assert.equal(result.y, GROUND_Y - RUNNER_H);
});

test('toucher un zombie termine la partie immédiatement', () => {
  const game = createGame();
  const result = game.json(`(() => {
    const w = createWorld(1);
    w.nextX = Infinity;
    w.zombies = [{ x: w.distance + RUNNER_X + 5, w: 34, h: ZOMBIE_H, phase: 0 }];
    updateWorld(w, ${NO_JUMP}, 1 / 60);
    const over = w.over;
    const distance = w.distance;
    updateWorld(w, ${NO_JUMP}, 1 / 60);
    return { over, frozen: w.distance === distance };
  })()`);

  assert.equal(result.over, true);
  assert.equal(result.frozen, true, 'le monde ne bouge plus une fois la partie finie');
});

test('la vitesse et la densité des zombies augmentent puis plafonnent', () => {
  const game = createGame();
  const r = game.json(`(() => {
    // Moyenne de l'écart entre zombies, avec la même suite aléatoire pour chaque distance.
    const gapAt = (d) => {
      const rng = createRng(5);
      let sum = 0;
      for (let i = 0; i < 200; i++) sum += spawnGap(rng, d);
      return sum / 200;
    };
    return {
      speedStart: runSpeed(0),
      speedMid: runSpeed(DIFF_DISTANCE / 2),
      speedCap: runSpeed(DIFF_DISTANCE),
      speedBeyond: runSpeed(DIFF_DISTANCE * 3),
      gapStart: gapAt(0),
      gapCap: gapAt(DIFF_DISTANCE),
      gapBeyond: gapAt(DIFF_DISTANCE * 3),
    };
  })()`);

  assert.equal(r.speedStart, SPEED_MIN);
  assert.ok(r.speedStart < r.speedMid && r.speedMid < r.speedCap);
  assert.equal(r.speedCap, SPEED_MAX);
  assert.equal(r.speedBeyond, SPEED_MAX, 'la vitesse ne dépasse pas le plafond');

  assert.ok(r.gapCap < r.gapStart, 'les zombies se rapprochent avec la distance');
  assert.equal(r.gapBeyond, r.gapCap, 'la densité ne dépasse pas le plafond');
});

test('au plafond de difficulté, un coureur qui saute au bon moment franchit les zombies consécutifs', () => {
  const game = createGame();
  const r = game.json(`(() => {
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
    const results = seeds.map((seed) => {
      const w = createWorld(seed);
      // On se place directement au plafond de difficulté, avec une piste vierge.
      w.distance = DIFF_DISTANCE;
      w.zombies = [];
      w.nextX = w.distance + VIEW_W + 120;
      const passedZombies = new Set();
      for (let i = 0; i < 60 * 60 && !w.over; i++) {
        // Saut dès qu'un zombie est à moins de 60 px, uniquement au sol.
        const runnerFront = w.distance + RUNNER_X + RUNNER_W;
        const ahead = w.zombies.filter((z) => z.x >= runnerFront).map((z) => z.x);
        const nearest = ahead.length ? Math.min(...ahead) : Infinity;
        const jump = w.runner.onGround && nearest - runnerFront < 60;
        updateWorld(w, { jump }, 1 / 60);
        for (const z of w.zombies) {
          if (z.x + z.w < w.distance + RUNNER_X) passedZombies.add(z);
        }
      }
      const passed = passedZombies.size;
      return { seed, over: w.over, passed };
    });
    return results;
  })()`);

  for (const { seed, over, passed } of r) {
    assert.equal(over, false, `graine ${seed} : le coureur a été touché après ${passed} zombies`);
    assert.ok(passed >= 10, `graine ${seed} : seulement ${passed} zombies franchis`);
  }
});

test('le mode démo de l’écran de départ ne termine jamais la partie', () => {
  const game = createGame();
  const over = game.json(`(() => {
    const w = createWorld(3, true);
    w.zombies = [{ x: w.distance + RUNNER_X + 5, w: 34, h: ZOMBIE_H, phase: 0 }];
    for (let i = 0; i < 120; i++) updateWorld(w, ${NO_JUMP}, 1 / 60);
    return w.over;
  })()`);

  assert.equal(over, false);
});
