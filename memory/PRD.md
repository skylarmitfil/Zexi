# Zexi — Discord Combat RPG Bot

## Overview
Discord.js (v14) message-command bot with MongoDB (Mongoose). Players create class-based
fighters, equip move loadouts, duel in PvP, and team up for co-op raids. Runs on Railway.
Prefix commands (default `,`). Entry: `index.js` → `commandHandler.js` loads `/commands/*.js`.

## Models
- **Fighter**: userId, slot, name, fightingStyle, level, xp, statPoints, hp, maxHp, attack,
  defense, balance, imageUrl, wins, losses, winStreak, bestStreak, **unlockedMoves[]**, **loadout[]**
- **Inventory**: potions, equippedWeapon/Armor, weaponsOwned[], armorOwned[]
- **Guild**: per-guild prefix

## Shared modules
- `utils/classData.js` — single source of truth for the 12 classes' base stats (rebalanced).
- `utils/combat.js` — engine: passives, energy, status effects (poison/bleed/stun/shield/regen/
  attack_up/**attack_down (weaken)**/evasion), `performAttack`, `performGuard` (Block = no damage),
  `performSpecial` (signature), and generic `performMove(attacker, defender, move)`.
- `utils/moves.js` — 33 moves per class (3 pickable weak starters + 15 level-unlock + signature
  + 14 shop), themed names (adjective×root), shared balanced templates, unlock/loadout helpers.
  Players pick 1 of 3 starter moves during `,create`; only the chosen one is unlocked.

## Implemented (2026-06)
- Fixed bot-wide crash (`commands.find` on a Map) + global crash-guard.
- Combat overhaul: class passives, energy specials, full status effects.
- PvP: streaks + escalating gold, XP/level-up, sudden-death arena damage, Potion action.
- Raids: 4 rotating bosses (unique attacks + enrage), co-op specials, loot table.
- Leaderboard (`,leaderboard`).
- **Move/loadout system + class rebalance (this session):**
  - `,moveshop` (aliases attackshop/abilities/learn): buy attacks with gold + level gate, per-character.
  - `,moves` (aliases loadout/movelist/equip): equip up to 5 moves from your unlocked pool.
  - Battle UIs (PvP + Raid) now expose core buttons (Attack/Block/Potion/Forfeit or
    Strike/Special/Heal/Potion/Guard) plus a move select-menu for the equipped loadout.
  - Block deals **no damage** to either side (pure mitigation).
  - Auto-balanced all 12 classes: win-rate spread cut from ~85 pts (2.8%–88%) to ~8.5 pts
    (46%–55%) via simulation. Weaker classes (Guardian/Berserker/Necromancer/Valkyrie) then
    given small buffs. Base stats live in `utils/classData.js`; passives in `utils/combat.js`.
  - Backward compatible: pre-existing characters (empty loadout) fall back to the starter move.
- **Progression + Story mode (latest):**
  - **Level cap = 100** (`MAX_LEVEL` in combat.js; XP stops accruing at cap).
  - **`,moveshop` pagination**: Prev/Next arrows, 6 moves/page (fixes only-seeing-up-to-Lvl-19).
  - **`,story`** (aliases campaign/adventure/pve): solo PvE vs a scaled AI enemy. Pick
    Small/Medium/Boss → XP 5-10 / 11-20 / 25 + gold. Full combat engine + loadout; ~44%
    player win-rate in sim; all battles terminate. Adds `story.js`.
  - **XP progress display**: story battle footer + victory embed show `xp/(level×50)` bar
    toward next level (requirement scales with level).

## Verification
- `node -c` + command loader on all 12 commands; move pool sizes (33/class) and unlock gating;
  balance tournaments (1000+ games/pair); move-based duel simulation. Live Discord button/menu
  flows require the deployed bot + DISCORD_TOKEN (Railway).

## Update — 2026-06 (Potion crash hardening)
- Investigated user-reported live "Error" after the shop/potion expansion. All shop/potion
  files pass `node --check`; headless sim of shop-buy + tiered-potion drink runs clean; all
  16 commands load. Could NOT reproduce the exact crash without the Railway stack trace.
- Hardened the one genuinely crash-prone new path: drinking a potion when `bestPotion()`
  returns `null` (potion-bag/counter desync) previously threw `TypeError: best.field`.
  Added a null-guard in `pvp.js`, `story.js`, `raid.js`, `endless.js` → resets the counter
  and replies "no potions" instead of crashing the interaction.
- Added regression sim `tests/sim_shop_potion.js`.

## Backlog / Next
- P1: Equipment stat bonuses (weapon/armor from raid loot) reflected in combat.
- P1: Boss move telegraph (show next boss action).
- P2: Tournament bracket command; per-class move flavor text.
- Pre-existing (not combat): `customize`/`shop`/`balance` call `Fighter.create({userId,name})`
  which fails schema validation if the user has no character — should direct to `,create`.
