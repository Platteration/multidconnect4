/**
 * The coached first game. The mechanic takes about ninety seconds to explain
 * and three static pages don't carry it, so instead the game says one thing at
 * a time and waits until you have actually done it.
 *
 * A step is a line to show and a question to ask of the live state. Both games
 * and boards differ, but the questions worth asking — has anything been
 * played, is there a second timeline yet, is more than one board waiting —
 * don't, so they live here.
 */
import type { GameSpec, GameState, bindMultiverse } from '../engine';

type Engine<G extends GameSpec> = ReturnType<typeof bindMultiverse<G>>;

export interface TutorialStep<G extends GameSpec> {
  /** What to tell the player now. */
  hint: string;
  /** True once they have done it, which moves the tutorial on. */
  done: (state: GameState<G>) => boolean;
}

/**
 * The questions a tutorial asks, for one game's engine. A game writes the
 * words; these decide when each one has been answered.
 */
export function tutorialChecks<G extends GameSpec>(engine: Engine<G>) {
  return {
    /** Anything at all has been played. */
    played: (state: GameState<G>) => state.lastAction !== null,
    /** A round has gone by: both sides have moved at least once. */
    roundPlayed: (state: GameState<G>) => state.round >= 1,
    /** A time travel has happened, so there is a second timeline. */
    branched: (state: GameState<G>) => state.timelines.length > 1,
    /** More than one board is waiting for the player to move. */
    waitingOnSeveral: (state: GameState<G>) => engine.pendingTimelines(state).length > 1,
    /**
     * The other side has answered on every board the travel left them, so the
     * turn is back with whoever branched.
     */
    answeredTheBranch: (state: GameState<G>) => {
      const newest = state.timelines[state.timelines.length - 1];
      return state.timelines.length > 1 && newest.createdBy !== null && state.toMove === newest.createdBy;
    },
    /** The game is over, however it ended. */
    finished: (state: GameState<G>) => state.status !== 'playing',
  };
}
