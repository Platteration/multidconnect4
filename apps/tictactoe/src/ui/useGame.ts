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
  cellAt,
  engine,
  getTimeline,
  isPending,
  isTravelTarget,
  latestBoard,
  latestRef,
  travelTargets,
} from '../engine';

export interface MarkRef {
  timeline: number;
  cell: number;
}

/**
 * What the player is in the middle of doing.
 *  - none: tap an empty cell to mark it, or one of your marks to pick it up.
 *  - mark: a mark is picked up; tap a glowing board on the map to send it there.
 */
export type Selection = { kind: 'none' } | { kind: 'mark'; from: MarkRef };

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
  /** Strict present rule: the present boards are done and boards ahead may be left for later. */
  canEndTurn: boolean;
  endTurn: () => void;
  error: string | null;
  canUndo: boolean;
  focusBoard: (ref: BoardRef) => void;
  pressCell: (cell: number) => void;
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
  else if (action.type === 'mark') feedback.thud();
  else feedback.tap();
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
    () => (selection.kind === 'none' ? [] : travelTargets(state, selection.from.timeline, selection.from.cell)),
    [state, selection],
  );

  const focusBoard = useCallback(
    (ref: BoardRef) => {
      setError(null);
      if (selection.kind === 'mark' && isTravelTarget(state, selection.from.timeline, selection.from.cell, ref)) {
        commit({ type: 'travel', from: selection.from, to: ref });
        return;
      }
      setFocus(ref);
    },
    [selection, state, commit, setError, setFocus],
  );

  const pressCell = useCallback(
    (cell: number) => {
      setError(null);
      if (state.status !== 'playing') return;
      if (!isPending(state, focus)) return;

      const board = latestBoard(getTimeline(state, focus.timeline));
      const owner = cellAt(board, cell);

      if (owner === state.toMove) {
        if (selection.kind === 'mark' && selection.from.cell === cell && selection.from.timeline === focus.timeline) {
          setSelection(NONE);
        } else {
          feedback.tap();
          setSelection({ kind: 'mark', from: { timeline: focus.timeline, cell } });
        }
        return;
      }

      if (selection.kind === 'mark') {
        setSelection(NONE);
        return;
      }

      if (owner === null) commit({ type: 'mark', timeline: focus.timeline, cell });
    },
    [state, focus, selection, commit, setError],
  );

  const endTurn = useCallback(() => {
    if (selection.kind !== 'none') return;
    game.endTurn();
  }, [selection, game]);

  const cancel = useCallback(() => {
    setError(null);
    if (selection.kind === 'mark') {
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
    canEndTurn: selection.kind === 'none' && canEndTurn(state),
    endTurn,
    error: game.error,
    canUndo: game.canUndo,
    focusBoard,
    pressCell,
    cancel,
    undo: game.undo,
    restart: game.restart,
    goToWaitingBoard: game.goToWaitingBoard,
    nextWaitingBoard: game.nextWaitingBoard,
  };
}
