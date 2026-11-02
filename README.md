# Grimhold — the Candle Knight

A late-90s style 3D action-platformer that runs in the browser — a haunted
castle under a spiral galaxy, then a starlight carnival on a shard of the
broken moon (Three.js + Rapier, no build step, no asset files — every texture,
model, sound and song is generated in code).

## Play

```
npm start          # serves on http://localhost:5190
```

Open it in Chrome and press Start. Click the game to capture the mouse, or
just pick up a controller (PS5 DualSense, PS4, Xbox — anything the browser
reports as a standard gamepad).

| Keyboard + mouse | PS5 controller | Action |
|---|---|---|
| WASD | left stick (analog) / d-pad | move — a light tilt walks |
| Mouse / Q E · R | right stick · R1 or R3 | camera · snap behind Wick |
| Space | ✕ | jump · press again in the air to somersault (double jump) |
| Left click / J | □ | sword — three presses for a combo, the third is a spin. In the air: up to three aerial slashes that hang you in the air |
| C / middle click / L | △ | heavy — a big spin on the ground; in the air, **smash down** (ground pound: breaks guards, stuns) |
| Right click / Shift / K | L1 / L2 | shield — turns you toward the nearest threat; raise it just before a hit lands to **parry** |
| Esc / P | OPTIONS | pause (menus: d-pad / stick to pick a chapter, ✕ to go, ○ back) |

The controller rumbles on hits, parries and big impacts. Browsers only allow
sound after a click or key press, so if you start with the pad, click once.

Landing on small foes stomps them and refreshes your double jump.
Parried orbs and fireballs fly back at whoever threw them.
Your health is the candle flame on Wick's helmet (and the hearts top-left).
Every 100 star-motes grows a new heart.

## The level

1. **The Starway** — the glowing road to the crossroads plaza.
2. **The Cornfield** (west) — scarecrows wake as you pass; beat the three
   altar guardians in the clearing for the first **Moon Sigil**.
3. **Hollowmere Graves** (east) — crawling skulls, cultists, bats; climb the
   ruined bell tower (rune pad, crumbling blocks) for the second sigil.
4. **The Witch's Ring** (south-east) — Hexwhisker the cat-witch. Parry her
   hexes to knock her off her broom, then strike. Third sigil.
5. **The Moon Seal** — bring all three; the bridge to Grimhold rises.
6. **The Hall of Procession** — a checkerboard half-pipe under the galaxy and
   a marching line of red cultists.
7. **The Spiral Spire** — the main climb: moving and spinning platforms,
   pendulum blades, crumbling blocks, a rune pad, elevators, bats, a knight.
8. **The Demon Gate** — two black knights; pull both chains to open the jaw.
9. **Skorvath, the Star-Eater** — three phases. On the ground it stalks you,
   breathes a stream of fire that chases you (run, or duck behind a pillar),
   lunges to bite, sweeps its tail if you get behind it, and blasts you back
   with its wings. It pants after breathing and recovers slowly from a missed
   bite — strike its head then. Parried fireballs stun it. In the air it makes
   fire-breathing strafing runs; parry its great fireball to bring it down.
   Enraged, it charges. When it falls, a **moon gate** opens in the hoard.

## The Midnight Carnival

A starlight fair on a shard of the broken moon, drifting through a rose-and-teal
nebula: candy-striped tents, paper lanterns, candy-floss trees, a shattered
moon spilling light, a star vortex over the Big Top and a ringed planet.
Three **Moon Tickets** open the Big Top:

1. **The Midway** — stalls and lantern strings; star-hat imps lob spinning
   stars (parry them back), jack-in-the-boxes crank a tune and spring out (the
   box is armoured — strike the jester while it bobs), and wind-up tin soldiers
   march and lunge until their key runs down and they slump, wide open.
   Madame Lune, the fortune-telling automaton, tells you where the tickets are.
2. **The Orrery Carousel** — three counter-rotating decks; ride the bobbing
   moon-horses up from deck to deck to the ticket on its crown.
3. **The Lantern Wheel** — board a gondola at the bottom, ride it up while imps
   pelt you, and leap to the crow's nest at the top.
4. **The High Wire** — up the helter-skelter, along a tightrope, across balloon
   rafts that sink under you, onto a swinging trapeze and over to the Starlight
   Perch. The circus cannon fires you back across the fair.
5. **The Marionette Queen** — an eight-metre porcelain puppet in the Big Top.
   You cut her strings, not the doll: when a slammed hand sticks to the floor
   (or a parried star stuns her) strike the glowing knot at the wrist; with both
   arms cut she hangs by her crown, dives at you and plants it in the floor.
   She sweeps an arm across the ring (jump it), spins, and drops tin soldiers in.

**Chapter select** (title screen and pause menu) jumps straight to the Grounds,
the Hall, the Spire, the Demon Gate, the Dragon, the Moon Carnival or the
Puppet Queen.

## Code map

```
src/main.js            boot, loop, zones, death/respawn, victory
src/core/retro.js      low-res renderer, dithered post, RetroMaterial (Gouraud,
                       baked vertex light, sphere-mapped chrome), light pool
src/core/tex.js        procedural pixel textures and matcaps
src/core/geo.js        primitives with metre-scaled UVs, light baking, batcher
src/core/physics.js    Rapier wrapper (static colliders, platforms, KCC)
src/world/sky.js       galaxy sky, star layers, moon
src/world/kit.js       materials, glow sprites, terrain/cliffs, kit pieces
src/world/outside.js   the grounds: roads, terrain, castle exterior, bridge
src/world/grounds.js   cornfield, graveyard, witch ring, seal + population
src/world/castle.js    hall, spire, demon gate, arena
src/world/props.js     motes, hearts, urns, shrines, sigils, platforms, hazards
src/world/carnival/    the Midnight Carnival: assets.js (its textures, materials
                       and set pieces), sky.js (nebula, shattered moon, ringed
                       planet), carnival.js (layout, rides, high wire, Big Top,
                       tickets, cannon, zone)
src/actors/            hero (rig + model), player controller, enemies, witch,
                       dragon, enemy models, fairfolk.js (imps, jacks, tin
                       soldiers), queen.js (the Marionette Queen)
src/audio.js           all sound effects and music (Web Audio synthesis)
src/ui/                HUD and screens
test.html              character turntable: test.html?who=dragon&yaw=1&d=16
test/bot.js            scripted bots used to verify the boss fight
test/fairbot.js        input-only bots: carousel climb, wheel ride, high wire
                       and cannon, the Queen fight
tools/shot.mjs         full-resolution screenshots from a headless Chrome
```

Debug: `?autostart` skips the title, `?mute` silences it; `window.game` exposes
`tp(x,y,z)`, `enterCastle()`, `enterFair()`, `startAt(chapter)`,
`debugStep(frames, dt, keys)`.

## Trailer

`trailer.mp4` is real gameplay recorded by the game itself. To re-record it
(the game must be running on :5190):

```
node tools/trailer.mjs record trailer
```

The clips are scripted in `test/trailer.js` (inputs only, like a player). The
recorder renders every frame deterministically in a headless Chrome, then plays
them back in real time while capturing the game's own audio.
`node tools/trailer.mjs preview <dir> [clip,...]` writes review stills instead.

## Assets

Everything in the game is generated in code: textures (`src/core/tex.js`),
models (built from primitives), sound effects and music (`src/audio.js`).
Third-party pieces: Three.js (MIT), Rapier physics (Apache-2.0), and the fonts
Jacquard 12 and Pixelify Sans from Google Fonts (SIL Open Font License).
