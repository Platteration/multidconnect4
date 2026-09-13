import { useCallback, useMemo, useState } from 'react';
import * as feedback from '@5d/core/app';
import { GameSetup } from '@5d/core';
import { useMultiverseGame } from '@5d/core/ui';
import { Puzzle, puzzleById } from '../puzzles';
import {
  Action,
  BoardRef,
  GameState,
  Move,
  Rules,
  Spec,
  canEndTurn,
  engine,
  getTimeline,
  isPending,
  isTravelTarget,
  latestBoard,
  latestRef,
  legalMovesOn,
  moveTarget,
  movesForPiece,
  travelTargets,
} from '../engine';

export interface PieceRef {
  timeline: number;
  square: number;
}

/**
 * What the player is in the middle of doing.
 *  - none:  tap one of your pieces to pick it up.
 *  - piece: a piece is picked up; tap a highlighted square to move it, or a
 *           glowing board on the map to send it into the past.
 */
export type Selection = { kind: 'none' } | { kind: 'piece'; from: PieceRef; moves: Move[] };

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
  /** True when the current player has a jump available on the focused board. */
  mustCapture: boolean;
  /** Strict present rule: the present boards are done and boards ahead may be left for later. */
  canEndTurn: boolean;
  endTurn: () => void;
  error: string | null;
  canUndo: boolean;
  focusBoard: (ref: BoardRef) => void;
  pressSquare: (square: number) => void;
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
  else if (action.type === 'move' && action.move.captures.length > 0) feedback.thud();
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
    () => (selection.kind === 'none' ? [] : travelTargets(state, selection.from.timeline, selection.from.square)),
    [state, selection],
  );

  const mustCapture = useMemo(
    () => isPending(state, focus) && legalMovesOn(state, focus.timeline).some((m) => m.captures.length > 0),
    [state, focus],
  );

  const focusBoard = useCallback(
    (ref: BoardRef) => {
      setError(null);
      if (selection.kind === 'piece' && isTravelTarget(state, selection.from.timeline, selection.from.square, ref)) {
        commit({ type: 'travel', from: selection.from, to: ref });
        return;
      }
      setFocus(ref);
    },
    [selection, state, commit, setError, setFocus],
  );

  const pressSquare = useCallback(
    (square: number) => {
      setError(null);
      if (state.status !== 'playing') return;
      if (!isPending(state, focus)) return;

      const board = latestBoard(getTimeline(state, focus.timeline));
      const cell = board.cells[square];

      if (cell && cell.player === state.toMove) {
        if (selection.kind === 'piece' && selection.from.square === square && selection.from.timeline === focus.timeline) {
          setSelection(NONE);
        } else {
          feedback.tap();
          setSelection({
            kind: 'piece',
            from: { timeline: focus.timeline, square },
            moves: movesForPiece(board, state.toMove, square, state.rules),
          });
        }
        return;
      }

      if (selection.kind === 'piece' && selection.from.timeline === focus.timeline) {
        const candidates = selection.moves.filter((m) => moveTarget(m) === square);
        if (candidates.length > 0) {
          // Several jump chains can end on the same square; take the longest.
          const best = candidates.reduce((a, b) => (b.captures.length > a.captures.length ? b : a));
          commit({ type: 'move', timeline: focus.timeline, move: best });
          return;
        }
      }
      setSelection(NONE);
    },
    [state, focus, selection, commit, setError],
  );

  const endTurn = useCallback(() => {
    if (selection.kind !== 'none') return;
    game.endTurn();
  }, [selection, game]);

  const cancel = useCallback(() => {
    setError(null);
    if (selection.kind === 'piece') {
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
    mustCapture,
    canEndTurn: selection.kind === 'none' && canEndTurn(state),
    endTurn,
    error: game.error,
    canUndo: game.canUndo,
    focusBoard,
    pressSquare,
    cancel,
    undo: game.undo,
    restart: game.restart,
    goToWaitingBoard: game.goToWaitingBoard,
    nextWaitingBoard: game.nextWaitingBoard,
  };
}
