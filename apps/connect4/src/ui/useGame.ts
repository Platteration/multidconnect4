import { useCallback, useMemo, useState } from 'react';
import * as feedback from '../app/feedback';
import { DEFAULT_SETUP, GameSetup } from '../app/setup';
import { Puzzle, puzzleById } from '../puzzles';
import {
  Action,
  BoardRef,
  GameState,
  IllegalAction,
  Rules,
  Spin,
  applyAction,
  otherPlayer,
  canEndTurn,
  canRotate,
  mandatoryTimelines,
  getTimeline,
  index,
  isPending,
  isTravelTarget,
  latestRef,
  newGame,
  pendingTimelines,
  sameRef,
  travelTargets,
} from '../engine';

export interface DiscRef {
  timeline: number;
  row: number;
  col: number;
}

/**
 * What the player is in the middle of doing.
 *  - none:   tap a column to drop, or tap your disc to start a time travel.
 *  - disc:   a disc is picked up; choose a past board on the map.
 *  - target: a past board is chosen; tap a column on it to land the disc.
 */
export type Selection =
  | { kind: 'none' }
  | { kind: 'disc'; from: DiscRef }
  | { kind: 'target'; from: DiscRef; to: BoardRef };

export interface GameController {
  state: GameState;
  /** Every state so far, oldest first. Saved so a game survives closing the app. */
  history: GameState[];
  setup: GameSetup;
  /** True when a person, not the bot, is expected to act now. */
  humanTurn: boolean;
  /** Apply any action directly, e.g. one the bot chose. */
  play: (action: Action) => void;
  /** Throw the game away and start a new one with this setup. */
  startNew: (setup: GameSetup) => void;
  /** Load a puzzle position; the strongest bot answers for the other side. */
  startPuzzle: (puzzle: Puzzle) => void;
  /** Replace the game with one loaded from elsewhere (a shared code). */
  load: (history: GameState[], setup: GameSetup) => void;
  /** In puzzle mode, how many of the player's own actions have been used. */
  movesUsed: number;
  focus: BoardRef;
  selection: Selection;
  targets: BoardRef[];
  /** True when the focused board may be spun right now. */
  canSpin: boolean;
  error: string | null;
  canUndo: boolean;
  focusBoard: (ref: BoardRef) => void;
  pressCell: (row: number, col: number) => void;
  /** Spin the focused board a quarter turn; gravity does the rest. */
  spin: (spin: Spin) => void;
  /** Turn the focused board upside down (only with the flip variant). */
  flip: () => void;
  /** Pop the picked-up disc out of the bottom row (only with the pop-out variant). */
  popOut: () => void;
  /** True when the held disc sits on the bottom row and pop-out is allowed. */
  canPopOut: boolean;
  /** Strict present rule: the present boards are done and boards ahead may be left for later. */
  canEndTurn: boolean;
  endTurn: () => void;
  cancel: () => void;
  undo: () => void;
  restart: () => void;
  goToWaitingBoard: () => void;
  /** Cycle focus through the boards still waiting for the current player. */
  nextWaitingBoard: () => void;
}

const NONE: Selection = { kind: 'none' };

function firstPending(state: GameState): BoardRef | null {
  const must = mandatoryTimelines(state);
  if (must.length) return latestRef(must[0]);
  const p = pendingTimelines(state);
  return p.length ? latestRef(p[0]) : null;
}

export function useGame(initialHistory?: GameState[], rules: Partial<Rules> = {}, initialSetup: GameSetup = DEFAULT_SETUP): GameController {
  const [history, setHistory] = useState<GameState[]>(() => (initialHistory?.length ? initialHistory : [newGame(rules)]));
  const [setup, setSetup] = useState<GameSetup>(initialSetup);
  const [focus, setFocus] = useState<BoardRef>(() => {
    const last = initialHistory?.[initialHistory.length - 1];
    return (last && (last.win?.board ?? firstPending(last))) || { timeline: 0, turn: 0 };
  });
  const [selection, setSelection] = useState<Selection>(NONE);
  const [error, setError] = useState<string | null>(null);

  const state = history[history.length - 1];
  const humanTurn = !(setup.bot && state.toMove === setup.bot.player && state.status === 'playing');
  const movesUsed = useMemo(() => {
    if (setup.mode !== 'puzzle' || setup.player === undefined) return 0;
    let n = 0;
    for (let i = 1; i < history.length; i++) if (history[i - 1].toMove === setup.player) n++;
    return n;
  }, [history, setup]);

  const targets = useMemo(
    () => (selection.kind === 'none' ? [] : travelTargets(state, selection.from.timeline)),
    [state, selection],
  );

  const commit = useCallback(
    (action: Action) => {
      try {
        const next = applyAction(state, action);
        setHistory((h) => [...h, next]);
        setSelection(NONE);
        setError(null);
        if (next.status === 'won' && next.win) {
          feedback.win();
          setFocus(next.win.board);
        } else {
          if (action.type === 'travel') feedback.warp();
          else if (action.type === 'rotate' || action.type === 'flip') feedback.spin();
          else if (action.type === 'endTurn') feedback.tap();
          else feedback.thud();
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
    [state, focus.timeline],
  );

  const focusBoard = useCallback(
    (ref: BoardRef) => {
      setError(null);
      if (selection.kind !== 'none') {
        const from = selection.from;
        if (isTravelTarget(state, from.timeline, ref)) {
          setSelection({ kind: 'target', from, to: ref });
        } else {
          // Looking around while holding a disc keeps the disc picked up.
          setSelection({ kind: 'disc', from });
        }
      }
      setFocus(ref);
    },
    [selection, state],
  );

  const pressCell = useCallback(
    (row: number, col: number) => {
      setError(null);
      if (state.status !== 'playing') return;

      if (selection.kind === 'target' && sameRef(selection.to, focus)) {
        commit({ type: 'travel', from: selection.from, to: selection.to, col });
        return;
      }

      if (!isPending(state, focus)) return;

      const tl = getTimeline(state, focus.timeline);
      const board = tl.boards[tl.boards.length - 1];
      const mine = board.cells[index(board, row, col)] === state.toMove;

      if (mine) {
        const from: DiscRef = { timeline: focus.timeline, row, col };
        if (selection.kind !== 'none' && sameDisc(selection.from, from)) {
          setSelection(NONE);
        } else {
          feedback.tap();
          setSelection({ kind: 'disc', from });
        }
        return;
      }

      if (selection.kind !== 'none') {
        setSelection(NONE);
        return;
      }

      commit({ type: 'drop', timeline: focus.timeline, col });
    },
    [state, focus, selection, commit],
  );

  const spin = useCallback(
    (direction: Spin) => {
      if (selection.kind !== 'none') return;
      commit({ type: 'rotate', timeline: focus.timeline, spin: direction });
    },
    [selection, focus.timeline, commit],
  );

  const flip = useCallback(() => {
    if (selection.kind !== 'none') return;
    commit({ type: 'flip', timeline: focus.timeline });
  }, [selection, focus.timeline, commit]);

  const popOut = useCallback(() => {
    if (selection.kind === 'none') return;
    commit({ type: 'pop', timeline: selection.from.timeline, col: selection.from.col });
  }, [selection, commit]);

  const endTurn = useCallback(() => {
    if (selection.kind !== 'none') return;
    commit({ type: 'endTurn' });
  }, [selection, commit]);

  const cancel = useCallback(() => {
    setError(null);
    if (selection.kind !== 'none') {
      setFocus(latestRef(getTimeline(state, selection.from.timeline)));
    }
    setSelection(NONE);
  }, [selection, state]);

  const undo = useCallback(() => {
    if (history.length <= 1) return;
    setError(null);
    setSelection(NONE);
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
    setFocus(firstPending(prev) ?? { timeline: 0, turn: 0 });
  }, [history, setup]);

  const startNew = useCallback(
    (nextSetup: GameSetup) => {
      setError(null);
      setSelection(NONE);
      setSetup(nextSetup);
      setHistory([newGame(rules)]);
      setFocus({ timeline: 0, turn: 0 });
    },
    [rules],
  );

  const startPuzzle = useCallback((puzzle: Puzzle) => {
    setError(null);
    setSelection(NONE);
    setSetup({
      mode: 'puzzle',
      puzzleId: puzzle.id,
      within: puzzle.within,
      player: puzzle.player,
      bot: { level: 3, player: otherPlayer(puzzle.player) },
    });
    setHistory([puzzle.state]);
    setFocus(firstPending(puzzle.state) ?? { timeline: 0, turn: 0 });
  }, []);

  const load = useCallback((nextHistory: GameState[], nextSetup: GameSetup) => {
    setError(null);
    setSelection(NONE);
    setSetup(nextSetup);
    setHistory(nextHistory);
    const last = nextHistory[nextHistory.length - 1];
    setFocus(last.win?.board ?? firstPending(last) ?? { timeline: 0, turn: 0 });
  }, []);

  const restart = useCallback(() => {
    const puzzle = setup.mode === 'puzzle' && setup.puzzleId ? puzzleById(setup.puzzleId) : undefined;
    if (puzzle) startPuzzle(puzzle);
    else startNew(setup);
  }, [startNew, startPuzzle, setup]);

  const goToWaitingBoard = useCallback(() => {
    const pending = firstPending(state);
    if (pending) setFocus(pending);
  }, [state]);

  const nextWaitingBoard = useCallback(() => {
    const pending = pendingTimelines(state);
    if (pending.length === 0) return;
    const at = pending.findIndex((tl) => tl.id === focus.timeline);
    setFocus(latestRef(pending[(at + 1) % pending.length]));
  }, [state, focus.timeline]);

  return {
    state,
    history,
    setup,
    humanTurn,
    play: commit,
    startNew,
    startPuzzle,
    load,
    movesUsed,
    focus,
    selection,
    targets,
    canSpin: selection.kind === 'none' && isPending(state, focus) && canRotate(state, focus.timeline),
    error,
    canUndo: history.length > 1,
    focusBoard,
    pressCell,
    spin,
    flip,
    popOut,
    canPopOut: state.rules.popOut && selection.kind === 'disc' && selection.from.row === 0,
    canEndTurn: selection.kind === 'none' && canEndTurn(state),
    endTurn,
    cancel,
    undo,
    restart,
    goToWaitingBoard,
    nextWaitingBoard,
  };
}

function sameDisc(a: DiscRef, b: DiscRef): boolean {
  return a.timeline === b.timeline && a.row === b.row && a.col === b.col;
}
