import { GameState, cellName, playerToMoveAt, timelineLabel } from '../engine';

/** One sentence describing how `state` came to be, for the replay bar. */
export function narrate(state: GameState, names: readonly [string, string]): string {
  const a = state.lastAction;
  const created = state.lastCreated[0];
  if (a?.type === 'endTurn') return `${names[state.toMove === 0 ? 1 : 0]} ended the turn, leaving boards ahead of the present for later.`;
  if (!a || !created) return 'The beginning. One board, one timeline.';
  const who = names[playerToMoveAt(created.turn - 1)];
  let text: string;
  if (a.type === 'mark') {
    text = `${who} marked ${cellName(a.cell)} on ${timelineLabel(a.timeline)}.`;
  } else {
    text = `${who} sent the mark on ${cellName(a.from.cell)} from ${timelineLabel(a.from.timeline)} back to turn ${a.to.turn} of ${timelineLabel(a.to.timeline)}, branching ${timelineLabel(state.timelines.length - 1)}.`;
  }
  if (state.status === 'won' && state.win) text += ` ${names[state.win.player]} wins.`;
  if (state.status === 'draw') text += ' The game is drawn.';
  return text;
}
