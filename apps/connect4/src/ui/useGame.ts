import { useCallback, useMemo, useState } from 'react';
import * as feedback from '@5d/core/app';
import { GameSetup } from '@5d/core';
import { useMultiverseGame } from '@5d/core/ui';
import { Puzzle, puzzleById } from '../puzzles';
import {
  Action,
  BoardRef,
  GameState,
  Rules,
  Spec,
  canEndTurn,
  canRotate,
  engine,
  getTimeline,
  index,
  isPending,
  isTravelTarget,
  latestRef,
  sameRef,
  Spin,
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

/** The sound each kind of action makes. A win is the core's business. */
function playFeedback(action: Action): void {
  if (action.type === 'travel') feedback.warp();
  else if (action.type === 'rotate' || action.type === 'flip') feedback.spin();
  else if (action.type === 'endTurn') feedback.tap();
  else feedback.thud();
}

export function useGame(initialHistory?: GameState[], rules: Partial<Rules> = {}, initialSetup?: GameSetup): GameController {
  const [selection, setSelection] = useState<Selection>(NONE);
  const clearSelection = useCallback(() => setSelection(NONE), []);

  const game = useMultiverseGame<Spec>(
    { engine, endTurnAction: { type: 'endTurn' }, playFeedback, puzzleById, initialHistory, rules, initialSetup },
    clearSelection,
  );
  const { state, focus, setFocus, setError, commit } = game;

  const targets = useMemo(
    () => (selection.kind === 'none' ? [] : travelTargets(state, selection.from.timeline)),
    [state, selection],
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
    [selection, state, setError, setFocus],
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
    [state, focus, selection, commit, setError],
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
    game.endTurn();
  }, [selection, game]);

  const cancel = useCallback(() => {
    setError(null);
    if (selection.kind !== 'none') {
      setFocus(latestRef(getTimeline(state, selection.from.timeline)));
    }
    setSelection(NONE);
  }, [selection, state, setError, setFocus]);

  return {
    state,
    history: game.history,
    setup: game.setup,
    humanTurn: game.humanTurn,
    play: commit,
    startNew: game.startNew,
    startPuzzle: game.startPuzzle,
    load: game.load,
    movesUsed: game.movesUsed,
    focus,
    selection,
    targets,
    canSpin: selection.kind === 'none' && isPending(state, focus) && canRotate(state, focus.timeline),
    error: game.error,
    canUndo: game.canUndo,
    focusBoard,
    pressCell,
    spin,
    flip,
    popOut,
    canPopOut: state.rules.popOut && selection.kind === 'disc' && selection.from.row === 0,
    canEndTurn: selection.kind === 'none' && canEndTurn(state),
    endTurn,
    cancel,
    undo: game.undo,
    restart: game.restart,
    goToWaitingBoard: game.goToWaitingBoard,
    nextWaitingBoard: game.nextWaitingBoard,
  };
}

function sameDisc(a: DiscRef, b: DiscRef): boolean {
  return a.timeline === b.timeline && a.row === b.row && a.col === b.col;
}
