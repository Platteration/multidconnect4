import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  BOT_NAMES,
  GameState,
  MAX_SIDE,
  chooseAction,
  dropRow,
  sameRef,
  Spin,
  getBoard,
  getTimeline,
  isPending,
  latestRef,
  otherPlayer,
  pendingTimelines,
  playerToMoveAt,
  timelineLabel,
} from '../engine';
import { setHapticsEnabled, setSoundEnabled } from '../app/feedback';
import { keys, removeKey, saveJson } from '../app/persist';
import { useSettings } from '../app/settings';
import { narrate } from '../app/narrate';
import { useProgress } from '../app/progress';
import { decodeGame, encodeGame } from '../app/share';
import { GameSetup } from '../app/setup';
import { PUZZLES, puzzleById } from '../puzzles';
import { DiscBoard } from './DiscBoard';
import { MenuModal } from './MenuModal';
import { NewGameModal } from './NewGameModal';
import { PuzzleResultModal } from './PuzzleResultModal';
import { ExtrasModal } from './ExtrasModal';
import { PuzzlesModal } from './PuzzlesModal';
import { ReplayBar } from './ReplayBar';
import { ShareModal } from './ShareModal';
import { Button, GameOverModal, RulesModal } from './Modals';
import { MultiverseMap } from './MultiverseMap';
import { Row, Section, SettingsModal } from './SettingsModal';
import { Theme, radius, spacing } from './theme';
import { useTheme } from '../app/theme';
import { useGame } from './useGame';

interface Props {
  /** A saved game to resume, oldest state first. */
  initialHistory?: GameState[];
  initialSetup?: GameSetup;
}

export function GameScreen({ initialHistory, initialSetup }: Props) {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { settings, setVariant } = useSettings();
  const rules = useMemo(
    () => ({ popOut: !!settings.variants.popOut, flip: !!settings.variants.flip }),
    [settings.variants.popOut, settings.variants.flip],
  );
  const game = useGame(initialHistory, rules, initialSetup);
  const { selection, targets } = game;
  // Replay: look at any earlier state read-only, without touching the live game.
  const [replayIndex, setReplayIndex] = useState<number | null>(null);
  const replaying = replayIndex !== null && replayIndex < game.history.length;
  const state = replaying ? game.history[replayIndex] : game.state;
  const focus = replaying ? (state.lastCreated[0] ?? { timeline: 0, turn: 0 }) : game.focus;
  const humanTurn = game.humanTurn && !replaying;
  const [shareOpen, setShareOpen] = useState(false);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const shareCode = useMemo(
    () => (game.history.length > 1 && game.setup.mode !== 'puzzle' ? encodeGame(game.history, game.setup) : null),
    [game.history, game.setup],
  );
  const { width, height } = useWindowDimensions();
  const [rulesOpen, setRulesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [newGameOpen, setNewGameOpen] = useState(false);
  const [puzzlesOpen, setPuzzlesOpen] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [resultDismissed, setResultDismissed] = useState(false);
  const { markSolved } = useProgress();
  const [gameOverDismissed, setGameOverDismissed] = useState(false);

  useEffect(() => setHapticsEnabled(settings.haptics), [settings.haptics]);
  useEffect(() => setSoundEnabled(settings.sound), [settings.sound]);

  // Save the game whenever it changes, a moment after the last change.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (game.history.length > 1) void saveJson(keys.game, { version: 2, history: game.history, setup: game.setup });
      else void removeKey(keys.game);
    }, 250);
    return () => clearTimeout(timer);
  }, [game.history, game.setup]);

  useEffect(() => {
    if (state.status === 'playing') setGameOverDismissed(false);
  }, [state.status]);

  // Size cells so the board fits in either orientation (7 wide or 7 tall).
  const cellSize = useMemo(() => {
    const byWidth = Math.floor((width - spacing.lg * 2) / MAX_SIDE);
    const byHeight = Math.floor((height * 0.36) / MAX_SIDE);
    return Math.max(26, Math.min(56, byWidth, byHeight));
  }, [width, height]);

  // Spinning: turn the board view a quarter turn, then swap in the spun board.
  const spinAnim = useRef(new Animated.Value(0)).current;
  const [spinning, setSpinning] = useState(false);
  const rotation = spinAnim.interpolate({ inputRange: [-1, 0, 1, 2], outputRange: ['-90deg', '0deg', '90deg', '180deg'] });
  // Shrink a little mid-turn so the board's corners stay clear of the text around it.
  const shrink = spinAnim.interpolate({ inputRange: [-1, -0.5, 0, 0.5, 1, 1.5, 2], outputRange: [1, 0.8, 1, 0.8, 1, 0.8, 1] });
  const animateSpin = (direction: Spin | 'flip', done: () => void) => {
    setSpinning(true);
    Animated.timing(spinAnim, {
      toValue: direction === 'cw' ? 1 : direction === 'ccw' ? -1 : 2,
      duration: direction === 'flip' ? 520 : 380,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      done();
      spinAnim.setValue(0);
      setSpinning(false);
    });
  };
  const startSpin = (direction: Spin) => {
    if (spinning || !game.canSpin || !humanTurn) return;
    animateSpin(direction, () => game.spin(direction));
  };
  const startFlip = () => {
    if (spinning || !game.canSpin || !humanTurn) return;
    animateSpin('flip', () => game.flip());
  };

  // The bot's turn: one action at a time, with a beat between them so the
  // person can follow what is happening across the boards.
  const bot = game.setup.bot;
  const puzzle = game.setup.mode === 'puzzle' && game.setup.puzzleId ? puzzleById(game.setup.puzzleId) : undefined;
  const puzzleIndex = puzzle ? PUZZLES.findIndex((p) => p.id === puzzle.id) : -1;
  const puzzleSolved = !!puzzle && state.status === 'won' && state.win?.player === puzzle.player;
  const puzzleFailed =
    !!puzzle && !puzzleSolved && (state.status !== 'playing' || (humanTurn && game.movesUsed >= puzzle.within));
  useEffect(() => {
    if (puzzleSolved && puzzle) markSolved(puzzle.id);
  }, [puzzleSolved, puzzle, markSolved]);
  useEffect(() => {
    setResultDismissed(false);
    setShowHint(false);
  }, [game.setup.puzzleId, game.history.length === 1]);
  useEffect(() => {
    if (!bot || humanTurn || spinning || state.status !== 'playing') return;
    const timer = setTimeout(() => {
      const action = chooseAction(state, bot.level);
      if (!action) return;
      if (action.type === 'rotate') {
        game.focusBoard({ timeline: action.timeline, turn: state.timelines[action.timeline].boards.length - 1 + state.timelines[action.timeline].startTurn });
        animateSpin(action.spin, () => game.play(action));
      } else if (action.type === 'flip') {
        animateSpin('flip', () => game.play(action));
      } else {
        game.play(action);
      }
    }, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, bot, humanTurn, spinning]);

  const board = getBoard(state, focus) ?? state.timelines[0].boards[0];
  const timeline = getTimeline(state, focus.timeline);
  const focusIsPending = isPending(state, focus);
  const pending = pendingTimelines(state);
  const totalWaiting = pending.length;
  const mover = state.toMove;

  const origin = selection.kind === 'none' ? null : latestRef(getTimeline(state, selection.from.timeline));
  const landingHere = selection.kind === 'target' && selection.to.timeline === focus.timeline && selection.to.turn === focus.turn;
  const selectedDisc =
    selection.kind !== 'none' && selection.from.timeline === focus.timeline && focusIsPending
      ? { row: selection.from.row, col: selection.from.col }
      : null;

  const status =
    state.status === 'won' && state.win
      ? `${colors.playerNames[state.win.player]} wins!`
      : state.status === 'draw'
        ? 'Draw - every board is full'
        : !humanTurn && bot
          ? `${BOT_NAMES[bot.level]} is thinking…`
          : `${colors.playerNames[mover]} to move · ${totalWaiting} board${totalWaiting === 1 ? '' : 's'} waiting`;
  const subtitle = puzzle
    ? `Puzzle ${puzzleIndex + 1}: ${puzzle.title} · ${Math.max(0, puzzle.within - game.movesUsed)} move${puzzle.within - game.movesUsed === 1 ? '' : 's'} left`
    : bot
      ? `you vs ${BOT_NAMES[bot.level]} · you are ${colors.playerNames[bot.player === 0 ? 1 : 0]}`
      : 'with multiverse time travel';

  let boardTitle = `${timelineLabel(focus.timeline)} · turn ${focus.turn}`;
  if (focusIsPending) boardTitle += ' · now';
  else if (focus.turn === latestRef(timeline).turn) boardTitle += ' · finished';
  else boardTitle += ` · past (${colors.playerNames[playerToMoveAt(focus.turn)]} was to move)`;

  let hint: string;
  if (puzzle && state.status === 'playing' && humanTurn && selection.kind === 'none') {
    hint = showHint ? puzzle.hint : puzzle.brief;
  } else if (state.status !== 'playing') {
    hint = 'Game over. Tap any board on the map to look around, or start a new game.';
  } else if (selection.kind === 'target') {
    hint = landingHere
      ? 'Tap a column on this past board. A new timeline will branch off from here.'
      : 'Go back to the highlighted board to drop the disc, or cancel.';
  } else if (selection.kind === 'disc') {
    hint =
      targets.length > 0
        ? 'Disc picked up. Tap a glowing board on the map to send it there.'
        : 'No past board can take this disc yet. Play a few more turns first.';
    if (game.canPopOut) hint += ' Or pop it out of the bottom row.';
  } else if (!humanTurn) {
    hint = 'The bot is taking its turn.';
  } else if (focusIsPending) {
    hint = board.spun
      ? 'Freshly spun. Tap a column to drop a disc, or tap one of your discs to send it into the past.'
      : 'Tap a column to drop a disc, spin the board, or tap one of your discs to send it into the past.';
  } else {
    hint = 'This board is history. Only time travel can change it.';
  }

  // The disc that just landed on the focused board, for the falling animation.
  const dropped = useMemo(() => {
    const a = state.lastAction;
    if (!a || (a.type !== 'drop' && a.type !== 'travel')) return null;
    const landedOn = a.type === 'drop' ? state.lastCreated[0] : state.lastCreated[1];
    if (!landedOn || !sameRef(landedOn, focus)) return null;
    const top = dropRow(board, a.col);
    return { row: (top < 0 ? board.rows : top) - 1, col: a.col };
  }, [state.lastAction, state.lastCreated, focus, board]);

  const winCells = state.win && state.win.board.timeline === focus.timeline && state.win.board.turn === focus.turn ? state.win.cells : undefined;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit>
            5D Connect Four
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <Button label="Undo" small onPress={game.undo} disabled={!game.canUndo} />
        <View style={{ width: spacing.xs }} />
        <Button label="Menu" small onPress={() => setMenuOpen(true)} />
      </View>

      <View style={[styles.statusPill, { borderColor: state.win ? colors.players[state.win.player] : colors.players[mover] }]}>
        <View style={[styles.dot, { backgroundColor: state.win ? colors.players[state.win.player] : colors.players[mover] }]} />
        <Text style={styles.statusText}>{status}</Text>
      </View>

      <Text style={styles.boardTitle}>{boardTitle}</Text>
      <View style={{ height: cellSize * MAX_SIDE + 8, justifyContent: 'center' }}>
        <Animated.View style={{ transform: [{ rotate: rotation }, { scale: shrink }] }}>
          <DiscBoard
            board={board}
            cellSize={cellSize}
            interactive={!spinning && humanTurn && state.status === 'playing' && (focusIsPending || landingHere)}
            selected={selectedDisc}
            highlight={winCells}
            ghostPlayer={humanTurn && state.status === 'playing' && (focusIsPending || landingHere) && selection.kind !== 'disc' ? mover : null}
            patterns={settings.patterns}
            dropped={dropped}
            onPressCell={game.pressCell}
          />
        </Animated.View>
      </View>
      {state.status === 'playing' && humanTurn && focusIsPending && selection.kind === 'none' ? (
        <View style={styles.spinRow}>
          <Button label="↺  Spin left" small onPress={() => startSpin('ccw')} disabled={!game.canSpin || spinning} />
          {state.rules.flip ? (
            <>
              <View style={{ width: spacing.sm }} />
              <Button label="Flip ⟳" small onPress={startFlip} disabled={!game.canSpin || spinning} />
            </>
          ) : null}
          <View style={{ width: spacing.sm }} />
          <Button label="Spin right  ↻" small onPress={() => startSpin('cw')} disabled={!game.canSpin || spinning} />
        </View>
      ) : null}

      {replaying ? (
        <ReplayBar
          index={replayIndex}
          count={game.history.length}
          narration={narrate(state, colors.playerNames)}
          onSeek={setReplayIndex}
          onLive={() => setReplayIndex(null)}
        />
      ) : null}
      <View style={[styles.hintRow, replaying && { display: 'none' }]}>
        <Text style={[styles.hint, game.error ? { color: colors.danger } : null]} numberOfLines={3}>
          {game.error ?? hint}
        </Text>
        {puzzle && selection.kind === 'none' && humanTurn && state.status === 'playing' ? (
          <Button label={showHint ? 'Brief' : 'Hint'} small onPress={() => setShowHint((h) => !h)} />
        ) : selection.kind !== 'none' ? (
          <View style={{ flexDirection: 'row' }}>
            {game.canPopOut ? (
              <>
                <Button label="Pop out ⤓" small tone="primary" onPress={game.popOut} />
                <View style={{ width: spacing.xs }} />
              </>
            ) : null}
            <Button label="Cancel" small onPress={game.cancel} />
          </View>
        ) : !focusIsPending && state.status === 'playing' ? (
          <Button label="Go play" small tone="primary" onPress={game.goToWaitingBoard} />
        ) : null}
      </View>

      <View style={styles.mapHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={styles.mapTitle}>Multiverse</Text>
          {totalWaiting > 1 && state.status === 'playing' ? (
            <View style={{ marginLeft: spacing.sm }}>
              <Button label="Next waiting ▸" small onPress={game.nextWaitingBoard} />
            </View>
          ) : null}
        </View>
        <Text style={styles.mapLegend}>
          {state.status !== 'playing' ? null : selection.kind === 'none' ? (
            <>
              <Text style={{ color: colors.players[mover] }}>■</Text> waiting for {colors.playerNames[mover]}
              {'   '}
              <Text style={{ color: colors.players[otherPlayer(mover)] }}>t</Text> = {colors.playerNames[otherPlayer(mover)]}'s turns
            </>
          ) : (
            <>
              <Text style={{ color: colors.travel }}>■</Text> can travel here
            </>
          )}
        </Text>
      </View>
      <View style={styles.map}>
        <MultiverseMap state={state} focus={focus} targets={targets} origin={origin} onPressBoard={game.focusBoard} />
      </View>

      <MenuModal
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        gameInProgress={game.canUndo && state.status === 'playing'}
        onNewGame={() => setNewGameOpen(true)}
        items={[
          ...(game.history.length > 1 ? [{ label: 'Replay this game', onPress: () => setReplayIndex(0) }] : []),
          { label: 'Play by message', onPress: () => setShareOpen(true) },
          { label: 'Puzzles', onPress: () => setPuzzlesOpen(true) },
          { label: 'How to play', onPress: () => setRulesOpen(true) },
          { label: 'Settings', onPress: () => setSettingsOpen(true) },
          { label: 'Extras', onPress: () => setExtrasOpen(true) },
        ]}
      />
      <NewGameModal
        visible={newGameOpen}
        initial={game.setup}
        onClose={() => setNewGameOpen(false)}
        onStart={(setup) => {
          setNewGameOpen(false);
          game.startNew(setup);
        }}
      />
      <ExtrasModal visible={extrasOpen} onClose={() => setExtrasOpen(false)} />
      <ShareModal
        visible={shareOpen}
        code={shareCode}
        onClose={() => setShareOpen(false)}
        onLoad={(code) => {
          try {
            const loaded = decodeGame(code);
            game.load(loaded.history, loaded.setup);
            setReplayIndex(null);
            setShareOpen(false);
            return null;
          } catch (e) {
            return e instanceof Error ? e.message : String(e);
          }
        }}
      />
      <SettingsModal visible={settingsOpen} onClose={() => setSettingsOpen(false)}>
        <Section title="Variants (apply to new games)">
          <Row label="Pop out" hint="Pull one of your own discs out of the bottom row as a move.">
            <Switch value={!!settings.variants.popOut} onValueChange={(v) => setVariant('popOut', v)} />
          </Row>
          <Row label="Flip" hint="Turn the board upside down as a move, gravity included.">
            <Switch value={!!settings.variants.flip} onValueChange={(v) => setVariant('flip', v)} />
          </Row>
        </Section>
      </SettingsModal>
      <RulesModal visible={rulesOpen} onClose={() => setRulesOpen(false)} />
      <PuzzlesModal
        visible={puzzlesOpen}
        onClose={() => setPuzzlesOpen(false)}
        onPick={(p) => {
          setPuzzlesOpen(false);
          game.startPuzzle(p);
        }}
      />
      <PuzzleResultModal
        visible={!!puzzle && (puzzleSolved || puzzleFailed) && !resultDismissed}
        solved={puzzleSolved}
        title={puzzle?.title ?? ''}
        hasNext={puzzleIndex >= 0 && puzzleIndex < PUZZLES.length - 1}
        onNext={() => {
          setResultDismissed(true);
          game.startPuzzle(PUZZLES[puzzleIndex + 1]);
        }}
        onRetry={() => {
          setResultDismissed(true);
          game.restart();
        }}
        onList={() => {
          setResultDismissed(true);
          setPuzzlesOpen(true);
        }}
      />
      <GameOverModal
        state={state}
        visible={!puzzle && state.status !== 'playing' && !gameOverDismissed}
        onRestart={() => {
          setGameOverDismissed(true);
          setNewGameOpen(true);
        }}
        onDismiss={() => setGameOverDismissed(true)}
        onReplay={() => {
          setGameOverDismissed(true);
          setReplayIndex(0);
        }}
      />
    </SafeAreaView>
  );
}

const makeStyles = (colors: Theme) =>
  StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  title: { color: colors.text, fontSize: 18, fontWeight: '900', letterSpacing: 0.3 },
  subtitle: { color: colors.textMuted, fontSize: 11 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    marginVertical: spacing.xs,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    backgroundColor: colors.panel,
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  statusText: { color: colors.text, fontWeight: '700', fontSize: 14 },
  boardTitle: { color: colors.textMuted, fontSize: 12, textAlign: 'center', marginBottom: spacing.xs },
  spinRow: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.sm },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: 52,
  },
  hint: { flex: 1, color: colors.textMuted, fontSize: 13, lineHeight: 18, marginRight: spacing.sm },
  mapHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },
  mapTitle: { color: colors.text, fontWeight: '800', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 },
  mapLegend: { color: colors.textMuted, fontSize: 11 },
  map: {
    flex: 1,
    marginHorizontal: spacing.sm,
    marginBottom: spacing.sm,
    backgroundColor: colors.panel,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs,
    overflow: 'hidden',
  },
});
