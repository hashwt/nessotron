# Pixel Agents Office

A pixel-art office made with Phaser 3, set in **Sunnyside HQ**: a sunny office block on a street
corner with its own bus stop. Walk around the office, sit at desks, step outside onto the street,
cross the road and catch the bus.

## Run

You only need Node.js. There are no dependencies to install.

```
npm run dev
```

Then open http://localhost:8080. Set `PORT` to use a different port.

## Controls

- Arrow keys or WASD to move, or click somewhere to walk there.
- Enter / Space / E to sit or stand. You sit facing whichever way you face. Next to a chair, you
  sit in the chair, facing the way it faces.
- Pick who you play with the portrait bar under the game, or number keys 1–7. Your choice is
  remembered; `?char=Manager` in the URL overrides it.

Outside, the lounge door slides open as you walk up. Cars and a bus drive both ways and stop for
you, whether you're on the crosswalk or anywhere in their lane. The bus pulls in at the stop and
opens its doors, and you can sit on the shelter's bench.

## What's in here

```
server.js                     tiny static server for public/
public/index.html             page, picker bar
public/src/                   game code (GameScene, Character, Traffic, Pathfinder, ...)
public/assets/maps/           the finished map, Sunnyside HQ:
                              sunnyside_hq.png (under the characters),
                              sunnyside_hq_canopy.png (tree tops and lamp heads, over them),
                              sunnyside_hq_seat_overlays.png (chair backs drawn over seated people),
                              sunnyside_hq.json (collision, spawn, seats, door, traffic lanes)
public/assets/characters/     7 characters, 6 sheets each, plus characters.json
public/assets/outdoor/        door, cars and bus sprites, and the street tileset
tools/make_characters.js      draws Student, Teacher and Doctor
tools/make_outdoor.js         draws the street, bus stop, trees, door, cars and bus
```

Sitting facing up or down isn't in the character sheets: the game builds those two poses when it
loads, from each character's own standing back and front frames (`CharacterAnims.seatPose`).

## Credits

Office art (inside the baked map) and the Developer, Designer, Receptionist and Manager
Credits: itch.io

Student, Teacher, Doctor and all the outdoor art (street, bus stop, trees, door, cars, bus) are
original, drawn by the scripts in `tools/`.
