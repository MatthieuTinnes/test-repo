// Tests du jeu Lapin : génération, rebond et fin de partie, sans navigateur.
// Lancer avec : node --test tests/lapin.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('./support/loadGame');

const createGame = () => loadGame('lapin/game.js');
const { JUMP_VELOCITY, SPRING_VELOCITY, DIFF_HEIGHT } = createGame().json(
  '({ JUMP_VELOCITY, SPRING_VELOCITY, DIFF_HEIGHT })',
);

const IDLE = '{ left: false, right: false }';

test('une même graine produit toujours la même partie', () => {
  const game = createGame();
  const simulate = (seed) =>
    game.json(`(() => {
      const w = createWorld(${seed});
      for (let i = 0; i < 300; i++) updateWorld(w, { left: i % 2 === 0, right: i % 2 === 1 }, 1 / 60);
      return { platforms: w.platforms, rabbit: w.rabbit, maxRise: w.maxRise };
    })()`);

  assert.deepEqual(simulate(42), simulate(42));
  assert.notDeepEqual(simulate(42), simulate(43));
});

test('les quatre types de plateformes apparaissent, les mobiles et cassables sont plus fréquents en haut', () => {
  const game = createGame();
  // Génère beaucoup de plateformes à une hauteur donnée et renvoie leurs types.
  const typesAt = (maxRise) =>
    game.json(`(() => {
      const w = createWorld(7);
      w.maxRise = ${maxRise};
      w.cameraY = -200000;
      generatePlatforms(w);
      return w.platforms.map((p) => p.type);
    })()`);

  const count = (types, type) => types.filter((t) => t === type).length;
  const low = typesAt(0);
  const high = typesAt(DIFF_HEIGHT);

  assert.deepEqual([...new Set(high)].sort(), ['breakable', 'mobile', 'normal', 'spring']);
  assert.ok(count(high, 'mobile') > count(low, 'mobile'));
  assert.ok(count(high, 'breakable') > count(low, 'breakable'));
});

test('le lapin rebondit en tombant sur une plateforme par le haut', () => {
  const game = createGame();
  const result = game.json(`(() => {
    const w = createWorld(1);
    w.platforms = [makePlatform('normal', 100, 300, createRng(1))];
    w.rabbit = { x: 110, y: 300 - RABBIT_H - 4, vx: 0, vy: 300, facing: 1 };
    updateWorld(w, ${IDLE}, 1 / 60);
    return { vy: w.rabbit.vy, y: w.rabbit.y, over: w.over };
  })()`);

  assert.equal(result.vy, JUMP_VELOCITY);
  assert.equal(result.y, 300 - 40);
  assert.equal(result.over, false);
});

test('une plateforme traversée par en dessous ne fait pas rebondir', () => {
  const game = createGame();
  const result = game.json(`(() => {
    const w = createWorld(1);
    w.platforms = [makePlatform('normal', 100, 300, createRng(1))];
    w.rabbit = { x: 110, y: 300 + 10, vx: 0, vy: 100, facing: 1 };
    updateWorld(w, ${IDLE}, 1 / 60);
    return { vy: w.rabbit.vy, y: w.rabbit.y };
  })()`);

  assert.notEqual(result.vy, JUMP_VELOCITY);
  assert.ok(result.y > 310, 'le lapin continue de tomber sous la plateforme');
});

test('un ressort donne un rebond plus fort, une plateforme cassable disparaît après le rebond', () => {
  const game = createGame();
  const result = game.json(`(() => {
    const spring = createWorld(1);
    spring.platforms = [makePlatform('spring', 100, 300, createRng(1))];
    spring.rabbit = { x: 110, y: 300 - 40 - 2, vx: 0, vy: 300, facing: 1 };
    updateWorld(spring, ${IDLE}, 1 / 60);

    const breakable = createWorld(1);
    breakable.platforms = [makePlatform('breakable', 100, 300, createRng(1))];
    breakable.rabbit = { x: 110, y: 300 - 40 - 2, vx: 0, vy: 300, facing: 1 };
    updateWorld(breakable, ${IDLE}, 1 / 60);

    return {
      springVy: spring.rabbit.vy,
      breakableStillThere: breakable.platforms.some((p) => p.type === 'breakable'),
    };
  })()`);

  assert.equal(result.springVy, SPRING_VELOCITY);
  assert.equal(result.breakableStillThere, false);
});

test('une chute sous l’écran termine la partie', () => {
  const game = createGame();
  const result = game.json(`(() => {
    const w = createWorld(1);
    w.platforms = [];
    w.rabbit = { x: 100, y: w.cameraY + VIEW_H - 1, vx: 0, vy: MAX_FALL, facing: 1 };
    updateWorld(w, ${IDLE}, 1 / 60);
    return { over: w.over };
  })()`);

  assert.equal(result.over, true);
});

test('la caméra ne descend pas et les plateformes sous elle sont supprimées', () => {
  const game = createGame();
  const result = game.json(`(() => {
    const w = createWorld(1);
    w.platforms = [makePlatform('normal', 0, 2000, createRng(1))];
    w.cameraY = 0;
    updateWorld(w, ${IDLE}, 1 / 60);
    return { cameraY: w.cameraY, platformBelow: w.platforms.some((p) => p.y === 2000) };
  })()`);

  assert.equal(result.cameraY, 0);
  assert.equal(result.platformBelow, false);
});

test('le choix de personnage accepte lapin et grenouille, un nom inconnu retombe sur le lapin', () => {
  const game = createGame();
  const result = game.json(`({
    frog: normalizeCharacter('frog'),
    rabbit: normalizeCharacter('rabbit'),
    unknown: normalizeCharacter('dragon'),
  })`);

  assert.deepEqual(result, { frog: 'frog', rabbit: 'rabbit', unknown: 'rabbit' });
});
