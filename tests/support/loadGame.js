// Charge un game.js dans un contexte vm isolé, avec un DOM minimal (sans navigateur).
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function noop() {}

// sourceFile : chemin relatif à la racine du dépôt, par exemple 'plateforme/game.js'.
function loadGame(sourceFile) {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', sourceFile), 'utf8');
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
  vm.runInContext(source, sandbox, { filename: sourceFile });
  return {
    run: (code) => vm.runInContext(code, sandbox),
    json: (expr) => JSON.parse(vm.runInContext(`JSON.stringify(${expr})`, sandbox)),
  };
}

module.exports = { loadGame };
