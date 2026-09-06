import { useCallback, useMemo, useState } from 'react';
import {
  Action,
  BoardRef,
  GameState,
  IllegalAction,
  applyAction,
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
  focus: BoardRef;
  selection: Selection;
  targets: BoardRef[];
  error: string | null;
  canUndo: boolean;
  focusBoard: (ref: BoardRef) => void;
  pressCell: (row: number, col: number) => void;
  cancel: () => void;
  undo: () => void;
  restart: () => void;
  goToWaitingBoard: () => void;
}

const NONE: Selection = { kind: 'none' };

function firstPending(state: GameState): BoardRef | null {
  const p = pendingTimelines(state);
  return p.length ? latestRef(p[0]) : null;
}

export function useGame(): GameController {
  const [history, setHistory] = useState<GameState[]>(() => [newGame()]);
  const [focus, setFocus] = useState<BoardRef>({ timeline: 0, turn: 0 });
  const [selection, setSelection] = useState<Selection>(NONE);
  const [error, setError] = useState<string | null>(null);

  const state = history[history.length - 1];

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
          setFocus(next.win.board);
        } else {
          // Prefer the board that was just created on the same timeline the
          // player was looking at; otherwise jump to whatever is waiting.
          const created = next.lastCreated.find((r) => r.timeline === focus.timeline);
          const pending = firstPending(next);
          if (pending) setFocus(pending);
          else if (created) setFocus(created);
        }
      } catch (e) {
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
      const mine = board.cells[index(row, col)] === state.toMove;

      if (mine) {
        const from: DiscRef = { timeline: focus.timeline, row, col };
        if (selection.kind !== 'none' && sameDisc(selection.from, from)) {
          setSelection(NONE);
        } else {
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
    const next = history.slice(0, -1);
    const prev = next[next.length - 1];
    setHistory(next);
    setFocus(firstPending(prev) ?? { timeline: 0, turn: 0 });
  }, [history]);

  const restart = useCallback(() => {
    setError(null);
    setSelection(NONE);
    setHistory([newGame()]);
    setFocus({ timeline: 0, turn: 0 });
  }, []);

  const goToWaitingBoard = useCallback(() => {
    const pending = firstPending(state);
    if (pending) setFocus(pending);
  }, [state]);

  return {
    state,
    focus,
    selection,
    targets,
    error,
    canUndo: history.length > 1,
    focusBoard,
    pressCell,
    cancel,
    undo,
    restart,
    goToWaitingBoard,
  };
}

function sameDisc(a: DiscRef, b: DiscRef): boolean {
  return a.timeline === b.timeline && a.row === b.row && a.col === b.col;
}
