# Grimhold — the Candle Knight

A late-90s style 3D action-platformer castle level that runs in the browser
(Three.js + Rapier, no build step, no asset files — every texture, model,
sound and song is generated in code).

## Play

```
npm start          # serves on http://localhost:5190
```

Open it in Chrome and press Start. Click the game to capture the mouse.

| Input | Action |
|---|---|
| WASD | move |
| Mouse / Q E | camera |
| Space | jump · press again in the air to somersault (double jump) |
| Left click / J | sword — three clicks for a combo, the third is a spin |
| Left click in the air | plunge attack (ground pound; breaks guards, stuns) |
| Right click / Shift / K | shield — turns you toward the nearest threat; raise it just before a hit lands to **parry** |
| Esc / P | pause |

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
   Enraged, it charges.

**Chapter select** (title screen and pause menu) jumps straight to the Grounds,
the Hall, the Spire, the Demon Gate or the Dragon.

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
src/actors/            hero (rig + model), player controller, enemies, witch,
                       dragon, enemy models
src/audio.js           all sound effects and music (Web Audio synthesis)
src/ui/                HUD and screens
test.html              character turntable: test.html?who=dragon&yaw=1&d=16
test/bot.js            scripted bots used to verify the boss fight
```

Debug: `?autostart` skips the title; `window.game` exposes `tp(x,y,z)`,
`enterCastle()`, `debugStep(frames, dt, keys)`.

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
