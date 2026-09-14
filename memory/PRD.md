# Zexi — Discord Combat RPG Bot

## Overview
A Discord.js (v14) message-command bot with a MongoDB (Mongoose) backend. Players create
class-based fighters, duel in PvP, and team up for co-op raids. Runs on Railway.

## Stack
- discord.js v14, Node.js, Mongoose/MongoDB (Railway)
- Prefix commands (default `,`), per-guild prefix stored in Guild model
- Entry: `index.js` → `commandHandler.js` loads `/commands/*.js`

## Core Models
- **Fighter**: userId, slot (1-2), name, fightingStyle, level, xp, statPoints, hp, maxHp,
  attack, defense, balance, imageUrl, wins, losses, **winStreak, bestStreak**
- **Inventory**: potions, equippedWeapon/Armor, weaponsOwned[], armorOwned[]
- **Guild**: per-guild prefix

## Combat Engine — `utils/combat.js` (shared by PvP + Raid)
- 12 classes, each with a **passive** and an energy-fueled **Special/ultimate**
- **Status effects**: poison, bleed, stun, shield, regen, attack_up, evasion
- **Energy** meter (0-100) charges from actions; Specials cost energy
- Passives: Berserker bloodlust, Guardian 20% reduction, Assassin +crit, Monk/Druid regen,
  Mage defense-pierce, Paladin block, Necromancer leech, Samurai counter, Ninja evasion,
  Bard +energy, Valkyrie crit-heal
- Progression helper `applyXpAndLevel` (level = statPoints +2, +stats, full heal)

## Implemented (2026-06)
- **Fixed bot-wide crash**: `commands.find` on a Map → `[...commands.values()].find` (index.js:42).
  Any alias/typo previously crashed the whole process.
- **Global crash-guard**: process `uncaughtException`, client `error`/`shardError` handlers.
- **PvP overhaul** (`pvp.js`): 5 actions (Attack/Special/Heal/Guard/Forfeit), energy + status
  UI bars, class passives/specials, streaks + escalating gold, XP + level-up, forfeit rewards.
  Fixed maxHp bug (health bar now uses true max HP). Escalating "arena" sudden-death damage
  after turn 20 guarantees every duel resolves (verified: 144/144 matchups end, longest 51 turns).
- **Raid overhaul** (`raid.js`): 4 rotating bosses with unique attacks (single/AoE/status),
  enrage phase at <30% HP, player Specials/energy/statuses in co-op, boss can be stunned,
  loot table (coins + XP + potions + chance of weapon/armor into Inventory).
- **Leaderboard** (`leaderboard.js`, aliases lb/top/rankings): rank by wins | streak | gold.
- **Customize profile** now shows class passive + special + streak record.

## Verification
- `node -c` on all files, command loader, and a full simulated tournament of all 12x12
  class matchups (no crashes, no infinite stalemates). Live Discord interaction testing
  requires the deployed bot + DISCORD_TOKEN (Railway).

## Backlog / Next
- P1: Use owned potions as an in-battle action (Inventory already tracks them).
- P1: Equipment stat bonuses reflected in combat (weapon/armor from raid loot).
- P2: 1v1 matchmaking / tournament bracket command.
- P2: Boss mechanics telegraph (show next boss move).
- Pre-existing (not combat): `customize`/`shop`/`balance` call `Fighter.create({userId,name})`
  which fails schema validation if user has no character — should direct to `,create` instead.
