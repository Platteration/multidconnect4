/**
 * The half of a game controller that has nothing to do with the board: the
 * history every game keeps, undo, the focused board, the error banner, and
 * the lifecycle (new game, puzzle, load, restart).
 *
 * What is left to a game is its selection state machine — what a tap means
 * while a piece is held — which is the part that genuinely differs.
 */
import { useCallback, useMemo, useState } from 'react';
import * as feedback from '../app/feedback';
import { DEFAULT_SETUP, GameSetup } from '../setup';
import { BoardRef, Player, otherPlayer } from '../types';
import { GameSpec, GameState, IllegalAction, bindMultiverse } from '../engine';

type Engine<G extends GameSpec> = ReturnType<typeof bindMultiverse<G>>;

/** The part of a puzzle the controller needs; a game's own puzzle has more. */
export interface PuzzleStart<S> {
  id: string;
  state: S;
  /** The side the person plays. */
  player: Player;
  /** How many of the player's own actions may be used. */
  within: number;
}

export interface MultiverseGameOptions<G extends GameSpec> {
  engine: Engine<G>;
  /** The game's own "I am done for this turn" action. */
  endTurnAction: G['action'];
  /** The sound an action makes, for everything but a win. */
  playFeedback: (action: G['action']) => void;
  /** Looks a puzzle up by id, so restarting a puzzle restarts the puzzle. */
  puzzleById: (id: string) => PuzzleStart<GameState<G>> | undefined;
  initialHistory?: GameState<G>[];
  rules?: Partial<G['rules']>;
  initialSetup?: GameSetup;
}

export interface MultiverseGame<G extends GameSpec> {
  state: GameState<G>;
  /** Every state so far, oldest first. Saved so a game survives closing the app. */
  history: GameState<G>[];
  setup: GameSetup;
  /** True when a person, not the bot, is expected to act now. */
  humanTurn: boolean;
  /** In puzzle mode, how many of the player's own actions have been used. */
  movesUsed: number;
  focus: BoardRef;
  setFocus: (ref: BoardRef) => void;
  error: string | null;
  setError: (message: string | null) => void;
  /** Apply an action, or show why it was illegal. Clears the selection either way. */
  commit: (action: G['action']) => void;
  /** The newest board of the first timeline waiting for the player, if any. */
  firstPending: (state: GameState<G>) => BoardRef | null;
  canUndo: boolean;
  undo: () => void;
  endTurn: () => void;
  startNew: (setup: GameSetup) => void;
  startPuzzle: (puzzle: PuzzleStart<GameState<G>>) => void;
  load: (history: GameState<G>[], setup: GameSetup) => void;
  restart: () => void;
  goToWaitingBoard: () => void;
  /** Cycle focus through the boards still waiting for the current player. */
  nextWaitingBoard: () => void;
}

const START: BoardRef = { timeline: 0, turn: 0 };

/**
 * @param clearSelection called whenever the game moves on and whatever the
 *   player was holding no longer applies.
 */
export function useMultiverseGame<G extends GameSpec>(
  options: MultiverseGameOptions<G>,
  clearSelection: () => void,
): MultiverseGame<G> {
  const { engine, endTurnAction, playFeedback, puzzleById, initialHistory, rules, initialSetup } = options;
  const { applyAction, latestRef, mandatoryTimelines, newGame, pendingTimelines } = engine;

  const firstPending = useCallback(
    (state: GameState<G>): BoardRef | null => {
      const must = mandatoryTimelines(state);
      if (must.length) return latestRef(must[0]);
      const p = pendingTimelines(state);
      return p.length ? latestRef(p[0]) : null;
    },
    [mandatoryTimelines, pendingTimelines, latestRef],
  );

  const [history, setHistory] = useState<GameState<G>[]>(
    () => (initialHistory?.length ? initialHistory : [newGame(rules ?? {})]),
  );
  const [setup, setSetup] = useState<GameSetup>(initialSetup ?? DEFAULT_SETUP);
  const [focus, setFocus] = useState<BoardRef>(() => {
    const last = initialHistory?.[initialHistory.length - 1];
    return (last && (last.win?.board ?? firstPending(last))) || START;
  });
  const [error, setError] = useState<string | null>(null);

  const state = history[history.length - 1];
  const humanTurn = !(setup.bot && state.toMove === setup.bot.player && state.status === 'playing');
  const movesUsed = useMemo(() => {
    if (setup.mode !== 'puzzle' || setup.player === undefined) return 0;
    let n = 0;
    for (let i = 1; i < history.length; i++) if (history[i - 1].toMove === setup.player) n++;
    return n;
  }, [history, setup]);

  const commit = useCallback(
    (action: G['action']) => {
      try {
        const next = applyAction(state, action);
        setHistory((h) => [...h, next]);
        clearSelection();
        setError(null);
        if (next.status === 'won' && next.win) {
          feedback.win();
          setFocus(next.win.board);
        } else {
          playFeedback(action);
          // Prefer the board that was just created on the same timeline the
          // player was looking at; otherwise jump to whatever is waiting.
          const created = next.lastCreated.find((r) => r.timeline === focus.timeline);
          const pending = firstPending(next);
          if (pending) setFocus(pending);
          else if (created) setFocus(created);
        }
      } catch (e) {
        feedback.nope();
        setError(e instanceof IllegalAction ? e.message : String(e));
      }
    },
    [state, focus.timeline, applyAction, clearSelection, playFeedback, firstPending],
  );

  const endTurn = useCallback(() => commit(endTurnAction), [commit, endTurnAction]);

  const undo = useCallback(() => {
    if (history.length <= 1) return;
    setError(null);
    clearSelection();
    let next = history.slice(0, -1);
    // Against a bot, rewind through its replies too, back to your own move.
    if (setup.bot) {
      const bot = setup.bot.player;
      while (next.length > 1 && (next[next.length - 1].toMove === bot || next[next.length - 1].status !== 'playing')) {
        next = next.slice(0, -1);
      }
    }
    const prev = next[next.length - 1];
    setHistory(next);
    setFocus(firstPending(prev) ?? START);
  }, [history, setup, clearSelection, firstPending]);

  const startNew = useCallback(
    (nextSetup: GameSetup) => {
      setError(null);
      clearSelection();
      setSetup(nextSetup);
      setHistory([newGame(rules ?? {})]);
      setFocus(START);
    },
    [rules, clearSelection, newGame],
  );

  const startPuzzle = useCallback(
    (puzzle: PuzzleStart<GameState<G>>) => {
      setError(null);
      clearSelection();
      setSetup({
        mode: 'puzzle',
        puzzleId: puzzle.id,
        within: puzzle.within,
        player: puzzle.player,
        bot: { level: 3, player: otherPlayer(puzzle.player) },
      });
      setHistory([puzzle.state]);
      setFocus(firstPending(puzzle.state) ?? START);
    },
    [clearSelection, firstPending],
  );

  const load = useCallback(
    (nextHistory: GameState<G>[], nextSetup: GameSetup) => {
      setError(null);
      clearSelection();
      setSetup(nextSetup);
      setHistory(nextHistory);
      const last = nextHistory[nextHistory.length - 1];
      setFocus(last.win?.board ?? firstPending(last) ?? START);
    },
    [clearSelection, firstPending],
  );

  const restart = useCallback(() => {
    const puzzle = setup.mode === 'puzzle' && setup.puzzleId ? puzzleById(setup.puzzleId) : undefined;
    if (puzzle) startPuzzle(puzzle);
    else startNew(setup);
  }, [startNew, startPuzzle, setup, puzzleById]);

  const goToWaitingBoard = useCallback(() => {
    const pending = firstPending(state);
    if (pending) setFocus(pending);
  }, [state, firstPending]);

  const nextWaitingBoard = useCallback(() => {
    const pending = pendingTimelines(state);
    if (pending.length === 0) return;
    const at = pending.findIndex((tl) => tl.id === focus.timeline);
    setFocus(latestRef(pending[(at + 1) % pending.length]));
  }, [state, focus.timeline, pendingTimelines, latestRef]);

  return {
    state,
    history,
    setup,
    humanTurn,
    movesUsed,
    focus,
    setFocus,
    error,
    setError,
    commit,
    firstPending,
    canUndo: history.length > 1,
    undo,
    endTurn,
    startNew,
    startPuzzle,
    load,
    restart,
    goToWaitingBoard,
    nextWaitingBoard,
  };
}
