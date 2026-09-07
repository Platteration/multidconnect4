import { Action, GameState, playerToMoveAt, timelineLabel } from '../engine';

/** One sentence describing how `state` came to be, for the replay bar. */
export function narrate(state: GameState, names: readonly [string, string]): string {
  const a = state.lastAction;
  const created = state.lastCreated[0];
  if (!a || !created) return 'The beginning. One board, one timeline.';
  const who = names[playerToMoveAt(created.turn - 1)];
  const where = (t: number) => timelineLabel(t);
  let text: string;
  switch (a.type) {
    case 'drop':
      text = `${who} dropped a disc in column ${a.col + 1} on ${where(a.timeline)}.`;
      break;
    case 'rotate':
      text = `${who} spun ${where(a.timeline)} ${a.spin === 'cw' ? 'clockwise' : 'counter-clockwise'}.`;
      break;
    case 'flip':
      text = `${who} flipped ${where(a.timeline)} upside down.`;
      break;
    case 'pop':
      text = `${who} popped a disc out of column ${a.col + 1} on ${where(a.timeline)}.`;
      break;
    case 'travel':
      text = `${who} sent a disc from ${where(a.from.timeline)} back to turn ${a.to.turn} of ${where(a.to.timeline)}, branching ${where(state.timelines.length - 1)}.`;
      break;
  }
  if (state.status === 'won' && state.win) text += ` ${names[state.win.player]} wins.`;
  if (state.status === 'draw') text += ' The game is drawn.';
  return text;
}
