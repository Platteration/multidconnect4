import React, { useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Action,
  BOT_NAMES,
  GameState,
  applyAction,
  newGame,
  MAX_SIDE,
  chooseAction,
  dropRow,
  sameRef,
  Spin,
  getBoard,
  getTimeline,
  isPending,
  latestRef,
  mandatoryTimelines,
  optionalTimelines,
  otherPlayer,
  pendingTimelines,
  playerToMoveAt,
  timelineLabel,
  engine,
  Spec,
} from '../engine';
import { useEntitlements, useProgress, useSettings, webLinkFor } from '@5d/core/app';
import { GameSetup, todayIso } from '@5d/core';
import { narrate } from '../app/narrate';
import { useStats } from '../app/stats';
import { decodeGame, encodeGame } from '../app/share';
import { PUZZLES, puzzleById } from '../puzzles';
import { dailyPuzzle } from '../puzzles/daily';
import { DiscBoard } from './DiscBoard';
import { AchievementsModal, Button, ExtrasModal, TutorialStep, tutorialChecks, MenuModal, NewGameModal, PuzzleResultModal, PuzzlesModal, ReplayBar, Row, Section, SettingsModal, ShareModal, StatsModal, WelcomeModal, useGameShell } from '@5d/core/ui';
import { MiniBoard } from './MiniBoard';
import { GameOverModal, RulesModal } from './Modals';
import { MultiverseMap } from './MultiverseMap';
import { PIECE_SETS, radius, SKINS, spacing, Theme, useTheme } from './theme';
import { useGame } from './useGame';


/** The coached first game: five things to do, in the order they make sense. */
const TUTORIAL: TutorialStep<Spec>[] = (() => {
  const check = tutorialChecks(engine);
  return [
    { hint: 'Tap a column to drop a disc. Watch the row of boards at the bottom: your move makes a new one.', done: check.played },
    { hint: 'Now the other side. Drop a few discs between you — each one adds a board to the map.', done: check.roundPlayed },
    {
      hint: 'Here is the trick: tap one of YOUR discs on this board to pick it up, then tap a glowing board further left to send it back there.',
      done: check.branched,
    },
    {
      hint: 'Now two boards are marked "play", and both must be answered before the turn passes. You are playing both sides here, so play them both.',
      done: check.answeredTheBranch,
    },
  ];
})();

interface Props {
  /** A saved game to resume, oldest state first. */
  initialHistory?: GameState[];
  initialSetup?: GameSetup;
}

export function GameScreen({ initialHistory, initialSetup }: Props) {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { settings, setVariant, update: updateSettings } = useSettings();
  const { recordGame, stats } = useStats();
  const { solved: solvedPuzzles } = useProgress();
  const { entitlements } = useEntitlements();
  const rules = useMemo(
    () => ({ popOut: !!settings.variants.popOut, flip: !!settings.variants.flip, strictPresent: !!settings.variants.strictPresent }),
    [settings.variants.popOut, settings.variants.flip, settings.variants.strictPresent],
  );
  const game = useGame(initialHistory, rules, initialSetup);
  const { selection, targets } = game;
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

  const shell = useGameShell({
    game,
    puzzles: PUZZLES,
    puzzleById,
    isSurvival: (p) => p.goal === 'survive',
    decodeGame,
    encodeGame,
    chooseAction,
    recordGame,
    tutorial: TUTORIAL,
    board: { cells: MAX_SIDE, portrait: 0.36, landscape: 0.6, min: 26, max: 56 },
    busy: spinning,
    // A bot that spins or flips turns the board on screen before the move lands.
    playBotAction: (action, commit) => {
      if (action.type === 'rotate') {
        game.focusBoard(latestRef(getTimeline(game.state, action.timeline)));
        animateSpin(action.spin, commit);
      } else if (action.type === 'flip') {
        animateSpin('flip', commit);
      } else {
        commit();
      }
    },
  });
  const { state, focus, humanTurn, replayIndex, setReplayIndex, replaying, shareCode, loadCode } = shell;
  const { bot, puzzle, puzzleIndex, survive, puzzleSolved, puzzleFailed } = shell;
  const { Left, landscape, cellSize } = shell;
  const { showHint, setShowHint, resultDismissed, setResultDismissed, gameOverDismissed, setGameOverDismissed } = shell;
  const { menuOpen, setMenuOpen, newGameOpen, setNewGameOpen, puzzlesOpen, setPuzzlesOpen } = shell;
  const { rulesOpen, setRulesOpen, settingsOpen, setSettingsOpen, statsOpen, setStatsOpen } = shell;
  const { badgesOpen, setBadgesOpen, justEarned } = shell;
  const { tutorialHint, tutorialFinished, startTutorial, stopTutorial } = shell;
  const { shareOpen, setShareOpen, extrasOpen, setExtrasOpen } = shell;

  const startSpin = (direction: Spin) => {
    if (spinning || !game.canSpin || !humanTurn) return;
    animateSpin(direction, () => game.spin(direction));
  };
  const startFlip = () => {
    if (spinning || !game.canSpin || !humanTurn) return;
    animateSpin('flip', () => game.flip());
  };

  // A tiny multiverse for the welcome pages: three moves, then a travel.
  const welcomeDemo = useMemo(() => {
    const drop = (col: number): Action => ({ type: 'drop', timeline: 0, col });
    const steps: Action[] = [drop(3), drop(3), drop(2), drop(4), { type: 'travel', from: { timeline: 0, row: 0, col: 2 }, to: { timeline: 0, turn: 2 }, col: 5 }];
    return steps.reduce((st, a) => applyAction(st, a), newGame());
  }, []);
  const welcomePages = useMemo(
    () => [
      {
        title: "It's Connect Four. Every move is remembered.",
        body: 'Each turn makes a new board. The map at the bottom shows every board that ever existed, left to right through time.',
        art: (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {welcomeDemo.timelines[0].boards.slice(0, 4).map((b, i) => (
              <MiniBoard key={i} board={b} />
            ))}
          </View>
        ),
      },
      {
        title: 'Send a disc into the past.',
        body: 'Tap one of your discs, then a glowing past board. History branches: a new timeline starts there with your extra disc, and your opponent must answer on it too.',
        art: (
          <View style={{ alignItems: 'center', gap: 6 }}>
            <MiniBoard board={welcomeDemo.timelines[0].boards[2]} ring={colors.travel} badge="GO" />
            <Text style={{ color: colors.travel, fontWeight: '800' }}>↓</Text>
            <MiniBoard board={welcomeDemo.timelines[1].boards[0]} ring={colors.players[1]} badge="play" />
          </View>
        ),
      },
      {
        title: 'Four in a row anywhere wins.',
        body: 'Play every board marked "play" before your turn ends. Spin a board to let the discs fall the other way. Pulling a disc out of the present collapses its column.',
      },
    ],
    [welcomeDemo, colors],
  );
  const board = getBoard(state, focus) ?? state.timelines[0].boards[0];
  const timeline = getTimeline(state, focus.timeline);
  const focusIsPending = isPending(state, focus);
  const pending = pendingTimelines(state);
  const mandatory = mandatoryTimelines(state);
  const optionalCount = optionalTimelines(state).length;
  const totalWaiting = mandatory.length;
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
          : `${colors.playerNames[mover]} to move · ${totalWaiting} board${totalWaiting === 1 ? '' : 's'} waiting${optionalCount ? ` · ${optionalCount} optional` : ''}`;
  const left = puzzle ? Math.max(0, puzzle.within - game.movesUsed) : 0;
  // The daily is not in the numbered list, so it goes by its own name.
  const puzzleName = puzzle ? (puzzleIndex >= 0 ? `Puzzle ${puzzleIndex + 1}: ${puzzle.title}` : puzzle.title) : '';
  const subtitle = puzzle
    ? `${puzzleName} · ${left} move${left === 1 ? '' : 's'} left`
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
  } else if (game.canEndTurn) {
    hint = 'Every board at the present is played. Play the boards ahead of it too, or end your turn.';
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

  // Today's challenge: one generated position a day, the same for everyone.
  const today = todayIso();
  const todaysDone = solvedPuzzles.has(`daily-${today}`);
  const todaysLabel = todaysDone ? "Today's challenge ✓" : "Today's challenge";
  const startDaily = () => game.startPuzzle(dailyPuzzle(today) ?? PUZZLES[0]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit>
            5D Connect Four{entitlements.supporter ? ' ✦' : ''}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <Button label="Undo" small onPress={game.undo} disabled={!game.canUndo} />
        <View style={{ width: spacing.xs }} />
        <Button label="Menu" small onPress={() => setMenuOpen(true)} />
      </View>

      <View style={landscape ? styles.split : styles.stack}>
      <Left style={landscape ? styles.splitLeft : undefined}>
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
          index={replayIndex ?? 0}
          count={game.history.length}
          narration={narrate(state, colors.playerNames)}
          onSeek={setReplayIndex}
          onLive={() => setReplayIndex(null)}
        />
      ) : null}
      <View style={[styles.hintRow, replaying && { display: 'none' }]}>
        <Text
          style={[styles.hint, game.error ? { color: colors.danger } : tutorialHint ? { color: colors.travel } : null]}
          numberOfLines={3}
        >
          {game.error ?? tutorialHint ?? hint}
        </Text>
        {tutorialHint ? (
          <Button label={tutorialFinished ? 'Done' : 'Stop'} small tone={tutorialFinished ? 'primary' : 'ghost'} onPress={stopTutorial} />
        ) : puzzle && selection.kind === 'none' && humanTurn && state.status === 'playing' ? (
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
        ) : game.canEndTurn && humanTurn ? (
          <Button label="End turn" small tone="primary" onPress={game.endTurn} />
        ) : !focusIsPending && state.status === 'playing' ? (
          <Button label="Go play" small tone="primary" onPress={game.goToWaitingBoard} />
        ) : null}
      </View>

      </Left>
      <View style={landscape ? styles.splitRight : styles.stack}>
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
              {totalWaiting > 1 ? null : (
                <>
                  {'   '}
                  <Text style={{ color: colors.players[otherPlayer(mover)] }}>t</Text> = {colors.playerNames[otherPlayer(mover)]}'s turns
                </>
              )}
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

      </View>
      </View>

      <MenuModal
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        gameInProgress={game.canUndo && state.status === 'playing'}
        onNewGame={() => setNewGameOpen(true)}
        items={[
          ...(game.history.length > 1 ? [{ label: 'Replay this game', onPress: () => setReplayIndex(0) }] : []),
          { label: todaysLabel, onPress: startDaily },
          { label: 'Play by message', onPress: () => setShareOpen(true) },
          { label: 'Puzzles', onPress: () => setPuzzlesOpen(true) },
          { label: 'How to play', onPress: () => setRulesOpen(true) },
          { label: 'Teach me the mechanic', onPress: startTutorial },
          { label: 'Your record', onPress: () => setStatsOpen(true) },
          { label: 'Badges', onPress: () => setBadgesOpen(true) },
          { label: 'Settings', onPress: () => setSettingsOpen(true) },
          { label: 'Extras', onPress: () => setExtrasOpen(true) },
        ]}
      />
      <NewGameModal
        visible={newGameOpen}
        levelHints={{
          1: 'Plays discs, takes wins, usually blocks. Never travels.',
          2: 'Blocks everything it sees and likes the centre. Spins the board.',
          3: 'Travels through time when it pays. Expect branches.',
        }}
        initial={game.setup}
        onClose={() => setNewGameOpen(false)}
        onStart={(setup) => {
          setNewGameOpen(false);
          game.startNew(setup);
        }}
      />
      <ExtrasModal
        visible={extrasOpen}
        onClose={() => setExtrasOpen(false)}
        premiumSkins={SKINS.filter((s) => s.premium).map((s) => s.name)}
        premiumPieces={PIECE_SETS.filter((p) => p.premium).map((p) => p.name)}
      />
      <AchievementsModal visible={badgesOpen} onClose={() => setBadgesOpen(false)} />
      <StatsModal visible={statsOpen} onClose={() => setStatsOpen(false)} stats={stats} puzzleCount={PUZZLES.length} />
      <WelcomeModal
        visible={!settings.welcomed}
        pages={welcomePages}
        onClose={() => updateSettings({ welcomed: true })}
        onPuzzles={() => {
          updateSettings({ welcomed: true });
          setPuzzlesOpen(true);
        }}
        onTutorial={() => {
          updateSettings({ welcomed: true });
          startTutorial();
        }}
      />
      <ShareModal
        visible={shareOpen}
        codePrefix="5DC4."
        code={shareCode}
        onClose={() => setShareOpen(false)}
        link={shareCode ? webLinkFor(shareCode) : null}
        onLoad={(code) => {
          const problem = loadCode(code);
          if (!problem) setShareOpen(false);
          return problem;
        }}
      />
      <SettingsModal
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        vibrationHint="A tick when you place, a thud when things fall."
        skins={SKINS.map((s) => ({ id: s.id, name: s.name, premium: s.premium, swatch: [s.board, s.boardDark] as const }))}
        pieceSets={PIECE_SETS.map((p) => ({ id: p.id, name: p.name, premium: p.premium, swatch: p.colors }))}
      >
        <Section title="Variants (apply to new games)">
          <Row label="Pop out" hint="Pull one of your own discs out of the bottom row as a move.">
            <Switch value={!!settings.variants.popOut} onValueChange={(v) => setVariant('popOut', v)} />
          </Row>
          <Row label="Flip" hint="Turn the board upside down as a move, gravity included.">
            <Switch value={!!settings.variants.flip} onValueChange={(v) => setVariant('flip', v)} />
          </Row>
          <Row label="Strict present (5D rules)" hint="Only boards at the present must be played; boards ahead are optional and you end your turn yourself.">
            <Switch value={!!settings.variants.strictPresent} onValueChange={(v) => setVariant('strictPresent', v)} />
          </Row>
        </Section>
      </SettingsModal>
      <RulesModal visible={rulesOpen} onClose={() => setRulesOpen(false)} />
      <PuzzlesModal
        visible={puzzlesOpen}
        puzzles={PUZZLES}
        onClose={() => setPuzzlesOpen(false)}
        onPick={(p) => {
          setPuzzlesOpen(false);
          game.startPuzzle(p);
        }}
      />
      <PuzzleResultModal
        visible={!!puzzle && (puzzleSolved || puzzleFailed) && !resultDismissed}
        solved={puzzleSolved}
        survived={survive}
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
        newBadges={justEarned}
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
  stack: { flex: 1 },
  split: { flex: 1, flexDirection: 'row' },
  splitLeft: { flex: 1, justifyContent: 'flex-start' },
  splitRight: { flex: 1, paddingTop: spacing.sm },
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
