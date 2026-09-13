/**
 * Tic-tac-toe's multiverse map: the shared map from the core, drawing this
 * game's board thumbnails.
 */
import React from 'react';
import { MultiverseMap as CoreMap } from '@5d/core/ui';
import { BoardRef, GameState, mandatoryTimelines, pendingTimelines } from '../engine';
import { MINI_HEIGHT, MINI_WIDTH, MiniBoard } from './MiniBoard';

const MINI = { width: MINI_WIDTH, height: MINI_HEIGHT };

interface Props {
  state: GameState;
  focus: BoardRef;
  /** Boards a picked-up mark may travel to. Empty when nothing is held. */
  targets: readonly BoardRef[];
  /** The board the held mark comes from, if any. */
  origin: BoardRef | null;
  onPressBoard: (ref: BoardRef) => void;
}

export function MultiverseMap(props: Props) {
  return (
    <CoreMap
      {...props}
      pendingTimelines={pendingTimelines}
      mandatoryTimelines={mandatoryTimelines}
      winBadge="WIN"
      mini={MINI}
      renderMini={(mini) => <MiniBoard {...mini} />}
    />
  );
}
