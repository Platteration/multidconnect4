/**
 * Hand-made puzzles. Each one is a full multiverse position plus a goal:
 * win within so many of your own actions. Positions are built either by
 * replaying actions from a new game (so they are guaranteed legal) or from
 * text boards for positions that would take too long to reach.
 *
 * `solution` is one winning line, used by the tests and the "show me" button.
 */
import {
  Action,
  Board,
  GameState,
  Player,
  Rules,
  applyAction,
  boardFromRows,
  emptyBoard,
  newGame,
} from '../engine';

export interface Puzzle {
  id: string;
  title: string;
  /** One line shown above the board. */
  brief: string;
  /** Longer nudge shown on request. */
  hint: string;
  state: GameState;
  /** The side the person plays. */
  player: Player;
  /** How many of the player's own actions may be used. */
  within: number;
  /** 'win' (default): win within the budget. 'survive': still be alive after it, whatever the bot does. */
  goal?: 'win' | 'survive';
  /** The key move(s). For multi-move puzzles, only the setup moves; the finish is any immediate win. */
  solution: Action[];
}

function fromActions(actions: Action[], rules: Partial<Rules> = {}): GameState {
  return actions.reduce((s, a) => applyAction(s, a), newGame(rules));
}

/** A single timeline whose boards are given oldest first; the last one is "now". */
function fromBoards(boards: Board[], rules: Partial<Rules> = {}): GameState {
  const base = newGame(rules);
  const toMove = ((boards.length - 1) % 2) as Player;
  return {
    ...base,
    toMove,
    timelines: [{ id: 0, startTurn: 0, boards, createdBy: null, branchedFrom: null, origin: null }],
  };
}

/** Two timelines: the root, and a branch that split off it. Both newest boards must share a parity. */
function withBranch(root: Board[], branch: { startTurn: number; boards: Board[]; from: number }, rules: Partial<Rules> = {}): GameState {
  const base = fromBoards(root, rules);
  return {
    ...base,
    timelines: [
      base.timelines[0],
      {
        id: 1,
        startTurn: branch.startTurn,
        boards: branch.boards,
        createdBy: base.toMove === 0 ? 1 : 0,
        branchedFrom: { timeline: 0, turn: branch.startTurn - 1 },
        origin: { timeline: 0, turn: branch.from },
      },
    ],
  };
}

const drop = (col: number, timeline = 0): Action => ({ type: 'drop', timeline, col });
const E = emptyBoard();

export const PUZZLES: Puzzle[] = [
  {
    id: 'warmup',
    title: 'Warm-up',
    brief: 'Red to move. Connect four right now.',
    hint: 'It is ordinary Connect Four for one more move. Look along the diagonal.',
    player: 0,
    within: 1,
    state: fromBoards([
      E,
      E,
      boardFromRows(['.......', '.......', '.......', '..RY...', '.RYY...', 'RYYR.R.']),
    ]),
    solution: [drop(3)],
  },
  {
    id: 'spin',
    title: 'Spin to win',
    brief: 'Red to move. No column wins. Turn the board.',
    hint: 'Spinning clockwise makes the floor into the left wall. Which discs are on the floor?',
    player: 0,
    within: 1,
    state: fromBoards([
      E,
      E,
      boardFromRows(['.......', '.......', '.......', 'Y.Y....', 'Y.Y....', 'R.R.R.R']),
    ]),
    solution: [{ type: 'rotate', timeline: 0, spin: 'cw' }],
  },
  {
    id: 'regret',
    title: 'The past is not fixed',
    brief: 'Red missed a win two turns ago. Go back and take it.',
    hint: 'Pick up a red disc, tap the glowing board where the three reds sit, and drop into the gap.',
    player: 0,
    within: 1,
    state: fromActions([drop(0), drop(6), drop(1), drop(6), drop(2), drop(6), drop(5), drop(3)]),
    solution: [{ type: 'travel', from: { timeline: 0, row: 0, col: 5 }, to: { timeline: 0, turn: 6 }, col: 3 }],
  },
  {
    id: 'collapse',
    title: 'Collapse',
    brief: 'Red to move. Pulling one disc out of the present lines up four.',
    hint: 'The yellow blocker in column 4 is sitting on a red disc. Send that red disc anywhere in the past.',
    player: 0,
    within: 1,
    state: fromBoards([
      E,
      E,
      boardFromRows(['.......', '.......', '.......', '...R...', 'RRRY.Y.', 'YRYR.YY']),
    ]),
    solution: [{ type: 'travel', from: { timeline: 0, row: 0, col: 3 }, to: { timeline: 0, turn: 0 }, col: 0 }],
  },
  {
    id: 'flip',
    title: 'Upside down',
    brief: 'Red to move, with the flip variant on. Turn the world over.',
    hint: 'After a flip each column lands upside down, so whatever was on top of a stack ends up on the floor.',
    player: 0,
    within: 1,
    state: fromBoards(
      [
        E,
        E,
        boardFromRows(['.......', '.......', '.......', '.R.....', 'RY.R...', 'YYRY...']),
      ],
      { flip: true },
    ),
    solution: [{ type: 'flip', timeline: 0 }],
  },
  {
    id: 'fork',
    title: 'Two threats',
    brief: 'Red to move. Win within two moves against a bot that blocks everything it sees.',
    hint: 'One drop that creates two ways to win at once cannot be blocked.',
    player: 0,
    within: 2,
    state: fromBoards([
      E,
      E,
      boardFromRows(['.......', '.......', '.......', '.......', '..YY...', '..RR...']),
    ]),
    solution: [drop(4)],
  },
];

PUZZLES.push(
  {
    id: 'pop',
    title: 'Pop goes the column',
    brief: 'Red to move, with pop-out on. Take a disc out of the bottom row.',
    hint: 'Pick up the red disc at the bottom of column 4 and pop it out. Watch what falls.',
    player: 0,
    within: 1,
    state: fromBoards(
      [E, E, boardFromRows(['.......', '.......', '.......', '...R...', 'RRRY.Y.', 'YRYR.YY'])],
      { popOut: true },
    ),
    solution: [{ type: 'pop', timeline: 0, col: 3 }],
  },
  {
    id: 'twoboards',
    title: 'Two boards, one turn',
    brief: 'Two boards are waiting for Red. Only one of them can be won right now.',
    hint: 'Look at both boards on the map. The branch, Timeline 2, has three reds with a gap.',
    player: 0,
    within: 1,
    state: withBranch(
      [E, E, E, E, boardFromRows(['.......', '.......', '.......', '.......', '.YY....', 'RRYRY..'])],
      {
        startTurn: 2,
        from: 3,
        boards: [boardFromRows(['.......', '.......', '.......', '.......', '.......', 'RR.RYY.'])],
      },
    ),
    solution: [{ type: 'drop', timeline: 1, col: 2 }],
  },
  {
    id: 'defuse',
    title: 'Defuse the fork',
    brief: 'Yellow to move. Red threatens to win on both sides. Survive one move.',
    hint: 'Blocking one side loses to the other. Spinning rearranges everything, but only one direction is safe.',
    player: 1,
    within: 1,
    goal: 'survive',
    state: fromBoards([E, E, E, boardFromRows(['.......', '.......', '.......', '.......', '......Y', '..RRR.Y'])]),
    solution: [{ type: 'rotate', timeline: 0, spin: 'ccw' }],
  },
);

export function puzzleById(id: string): Puzzle | undefined {
  return PUZZLES.find((p) => p.id === id);
}
