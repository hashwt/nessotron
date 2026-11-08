// Entry point. Loads the map data and the character list, then starts the game.
//   ?char=Doctor   start as this character (else the last one you picked)
// The map is drawn from its finished images (named in assets/maps/sunnyside_hq.json), so the game
// needs nothing beyond what is in this folder.
const query = new URLSearchParams(location.search);
const MAP_KEY = 'sunnyside_hq';
const CHAR_STORE = 'pixel-agents.character';

const getJSON = (url, fallback) => fetch(url).then((r) => (r.ok ? r.json() : fallback)).catch(() => fallback);

Promise.all([
  getJSON(`assets/maps/${MAP_KEY}.json`, {}),
  getJSON('assets/characters/characters.json', { characters: ['Developer'] }),
]).then(([mapJson, charInfo]) => {
  const characters = charInfo.characters;
  let saved = null;
  try { saved = localStorage.getItem(CHAR_STORE); } catch { /* storage blocked */ }
  const wanted = query.get('char') || saved;
  const start = characters.includes(wanted) ? wanted : characters[0];

  const scene = new GameScene(MAP_KEY, characters, start, mapJson);
  window.game = new Phaser.Game({
    type: Phaser.AUTO,
    width: 800,
    height: 640,
    parent: 'game',
    backgroundColor: '#2b2b3d',
    pixelArt: true,
    roundPixels: true,
    physics: { default: 'arcade', arcade: { debug: false } },
    scene: [scene],
  });

  CharacterPicker.mount(document.getElementById('picker'), scene, characters, start, CHAR_STORE);
});
