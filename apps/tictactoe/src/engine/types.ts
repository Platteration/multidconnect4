/**
 * Player, board references and turn parity live in the shared core. This
 * re-export names exactly what the engine uses, so the engine barrel does not
 * also pull in the core's own generic multiverse types and collide with this
 * game's concrete ones.
 */
export type { BoardRef, Bot, BotLevel, Player, Rng } from '@5d/core';
export { BOT_NAMES, otherPlayer, playerToMoveAt, sameRef } from '@5d/core';
