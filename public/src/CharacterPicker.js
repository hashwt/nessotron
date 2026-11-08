/*
 * The character picker bar under the game. One button per character, showing their
 * front-facing idle frame (frame 3 of <Name>_idle.png). Click a portrait or press 1-9.
 */
const CharacterPicker = {
  mount(root, scene, characters, current, storageKey) {
    const buttons = new Map();

    const choose = (name) => {
      scene.switchCharacter(name);
    };

    characters.forEach((name, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pick';
      btn.title = `${name} (${i + 1})`;
      btn.innerHTML = `<span class="portrait"></span><span class="name">${name}</span>`;
      btn.querySelector('.portrait').style.backgroundImage = `url("assets/characters/${name}_idle.png")`;
      btn.addEventListener('click', () => {
        choose(name);
        btn.blur(); // otherwise Space (the sit key) would click it again
      });
      root.appendChild(btn);
      buttons.set(name, btn);
    });

    const highlight = (name) => {
      for (const [n, b] of buttons) b.classList.toggle('active', n === name);
      try { localStorage.setItem(storageKey, name); } catch { /* storage blocked */ }
    };
    highlight(current);
    // A plain callback, not scene.events: the scene isn't booted yet when the picker mounts.
    scene.onCharacterChanged = highlight;

    // Number keys 1-9 pick a character too.
    window.addEventListener('keydown', (e) => {
      const i = Number(e.key) - 1;
      if (Number.isInteger(i) && i >= 0 && i < characters.length) choose(characters[i]);
    });
  },
};
