import React, { useMemo } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Action,
  BOT_NAMES,
  GameState,
  SIZE,
  applyAction,
  chooseAction,
  getBoard,
  getTimeline,
  index,
  isPending,
  latestRef,
  mandatoryTimelines,
  newGame,
  optionalTimelines,
  otherPlayer,
  playerToMoveAt,
  sameRef,
  timelineLabel,
} from '../engine';
import { useEntitlements, useProgress, useSettings, webLinkFor } from '@5d/core/app';
import { GameSetup, todayIso } from '@5d/core';
import { narrate } from '../app/narrate';
import { useStats } from '../app/stats';
import { decodeGame, encodeGame } from '../app/share';
import { PUZZLES, puzzleById } from '../puzzles';
import { dailyPuzzle } from '../puzzles/daily';
import { MarkBoard } from './MarkBoard';
import { Button, ExtrasModal, MenuModal, NewGameModal, PuzzleResultModal, PuzzlesModal, ReplayBar, Row, Section, SettingsModal, ShareModal, StatsModal, WelcomeModal, useGameShell } from '@5d/core/ui';
import { MiniBoard } from './MiniBoard';
import { GameOverModal, RulesModal } from './Modals';
import { MultiverseMap } from './MultiverseMap';
import { PIECE_SETS, radius, SKINS, spacing, Theme, useTheme } from './theme';
import { useGame } from './useGame';

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
    () => ({ strictPresent: !!settings.variants.strictPresent }),
    [settings.variants.strictPresent],
  );
  const game = useGame(initialHistory, rules, initialSetup);
  const { selection, targets } = game;
  const shell = useGameShell({
    game,
    puzzles: PUZZLES,
    puzzleById,
    isSurvival: (p) => p.goal === 'survive',
    decodeGame,
    encodeGame,
    chooseAction,
    recordGame,
    board: { cells: SIZE, portrait: 0.34, landscape: 0.62, min: 56, max: 108 },
  });
  const { state, focus, humanTurn, replayIndex, setReplayIndex, replaying, shareCode, loadCode } = shell;
  const { bot, puzzle, puzzleIndex, survive, puzzleSolved, puzzleFailed } = shell;
  const { Left, landscape, cellSize } = shell;
  const { showHint, setShowHint, resultDismissed, setResultDismissed, gameOverDismissed, setGameOverDismissed } = shell;
  const { menuOpen, setMenuOpen, newGameOpen, setNewGameOpen, puzzlesOpen, setPuzzlesOpen } = shell;
  const { rulesOpen, setRulesOpen, settingsOpen, setSettingsOpen, statsOpen, setStatsOpen } = shell;
  const { shareOpen, setShareOpen, extrasOpen, setExtrasOpen } = shell;

  // A tiny multiverse for the welcome pages: four marks, then a travel.
  const welcomeDemo = useMemo(() => {
    const mark = (cell: number): Action => ({ type: 'mark', timeline: 0, cell });
    const steps: Action[] = [
      mark(index(0, 0)),
      mark(index(1, 1)),
      mark(index(2, 2)),
      mark(index(0, 2)),
      { type: 'travel', from: { timeline: 0, cell: index(2, 2) }, to: { timeline: 0, turn: 2 } },
    ];
    return steps.reduce((st, a) => applyAction(st, a), newGame());
  }, []);
  const welcomePages = useMemo(
    () => [
      {
        title: "It's noughts and crosses. Every move is remembered.",
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
        title: 'Send a mark into the past.',
        body: 'Tap one of your marks, then a glowing past board where its cell is still free. History branches: a new timeline starts there with your extra mark, and your opponent must answer on it too.',
        art: (
          <View style={{ alignItems: 'center', gap: 6 }}>
            <MiniBoard board={welcomeDemo.timelines[0].boards[2]} ring={colors.travel} badge="GO" />
            <Text style={{ color: colors.travel, fontWeight: '800' }}>↓</Text>
            <MiniBoard board={welcomeDemo.timelines[1].boards[0]} ring={colors.playerAccent[1]} badge="play" />
          </View>
        ),
      },
      {
        title: 'Three in a row anywhere wins.',
        body: 'Play every board marked "play" before your turn ends. A mark you send back is gone from the present, so a travel can undo your own line as easily as it makes one.',
      },
    ],
    [welcomeDemo, colors],
  );

  const board = getBoard(state, focus) ?? state.timelines[0].boards[0];
  const timeline = getTimeline(state, focus.timeline);
  const focusIsPending = isPending(state, focus);
  const mandatory = mandatoryTimelines(state);
  const optionalCount = optionalTimelines(state).length;
  const totalWaiting = mandatory.length;
  const mover = state.toMove;
  const accent = state.win ? colors.playerAccent[state.win.player] : colors.playerAccent[mover];

  const origin = selection.kind === 'none' ? null : latestRef(getTimeline(state, selection.from.timeline));
  const holdingHere = selection.kind === 'mark' && selection.from.timeline === focus.timeline && focusIsPending;

  // Tint the cell the action that produced the focused board touched.
  const landed = useMemo(() => {
    const a = state.lastAction;
    if (!a || !state.lastCreated.some((r) => sameRef(r, focus))) return null;
    if (a.type === 'mark') return focus.timeline === a.timeline ? a.cell : null;
    if (a.type === 'travel') return a.from.cell;
    return null;
  }, [state.lastAction, state.lastCreated, focus]);

  const winCells = state.win && sameRef(state.win.board, focus) ? state.win.cells : undefined;

  const status =
    state.status === 'won' && state.win
      ? `${colors.playerNames[state.win.player]} wins!`
      : state.status === 'draw'
        ? 'Draw - nobody connected three'
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
  else if (focus.turn === latestRef(timeline).turn) boardTitle += state.status === 'playing' ? ' · waiting on the other side' : ' · final';
  else boardTitle += ` · past (${colors.playerNames[playerToMoveAt(focus.turn)]} was to move)`;

  let hint: string;
  if (puzzle && state.status === 'playing' && humanTurn && selection.kind === 'none') {
    hint = showHint ? puzzle.hint : puzzle.brief;
  } else if (state.status !== 'playing') {
    hint = 'Game over. Tap any board on the map to look around, or start a new game.';
  } else if (selection.kind === 'mark') {
    if (!holdingHere) {
      hint = 'Mark picked up on another board. Tap a glowing board to send it there, or cancel.';
    } else if (targets.length > 0) {
      hint = 'Mark picked up. Tap a glowing board on the map to send it into the past.';
    } else {
      hint = 'No past board can take this mark: its cell is taken on every one. Tap it again to put it back.';
    }
  } else if (!humanTurn) {
    hint = 'The bot is taking its turn.';
  } else if (game.canEndTurn) {
    hint = 'Every board at the present is played. Play the boards ahead of it too, or end your turn.';
  } else if (focusIsPending) {
    hint = 'Tap an empty cell to mark it, or one of your own marks to send it into the past.';
  } else {
    hint = 'This board is history. Only time travel can change it.';
  }

  // Today's challenge: one generated position a day, the same for everyone.
  const today = todayIso();
  const todaysDone = solvedPuzzles.has(`daily-${today}`);
  const todaysLabel = todaysDone ? "Today's challenge ✓" : "Today's challenge";
  const startDaily = () => {
    const puzzle = dailyPuzzle(today) ?? PUZZLES[0];
    game.startPuzzle(puzzle);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit>
            5D Tic-Tac-Toe{entitlements.supporter ? ' ✦' : ''}
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
      <View style={[styles.statusPill, { borderColor: accent }]}>
        <View style={[styles.dot, { backgroundColor: accent }]} />
        <Text style={styles.statusText}>{status}</Text>
      </View>

      <Text style={styles.boardTitle}>{boardTitle}</Text>
      <MarkBoard
        board={board}
        cellSize={cellSize}
        interactive={humanTurn && state.status === 'playing' && focusIsPending}
        selected={holdingHere ? selection.from.cell : null}
        highlight={winCells}
        landed={landed}
        ghostPlayer={humanTurn && state.status === 'playing' && focusIsPending && selection.kind === 'none' ? mover : null}
        onPressCell={game.pressCell}
      />

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
        <Text style={[styles.hint, game.error ? { color: colors.danger } : null]} numberOfLines={3}>
          {game.error ?? hint}
        </Text>
        {puzzle && selection.kind === 'none' && humanTurn && state.status === 'playing' ? (
          <Button label={showHint ? 'Brief' : 'Hint'} small onPress={() => setShowHint((h) => !h)} />
        ) : selection.kind !== 'none' ? (
          <Button label="Cancel" small onPress={game.cancel} />
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
              <Text style={{ color: colors.playerAccent[mover] }}>■</Text> waiting for {colors.playerNames[mover]}
              {totalWaiting > 1 ? null : (
                <>
                  {'   '}
                  <Text style={{ color: colors.playerAccent[otherPlayer(mover)] }}>t</Text> = {colors.playerNames[otherPlayer(mover)]}'s turns
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
          { label: 'Your record', onPress: () => setStatsOpen(true) },
          { label: 'Settings', onPress: () => setSettingsOpen(true) },
          { label: 'Extras', onPress: () => setExtrasOpen(true) },
        ]}
      />
      <NewGameModal
        visible={newGameOpen}
        levelHints={{
          1: 'Marks cells, takes wins, usually blocks. Never travels.',
          2: 'Counts lines and never lets you finish one. Never travels.',
          3: 'Travels through time when a past board looks better. Expect branches.',
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
      <StatsModal visible={statsOpen} onClose={() => setStatsOpen(false)} stats={stats} puzzleCount={PUZZLES.length} />
      <WelcomeModal
        visible={!settings.welcomed}
        pages={welcomePages}
        onClose={() => updateSettings({ welcomed: true })}
        onPuzzles={() => {
          updateSettings({ welcomed: true });
          setPuzzlesOpen(true);
        }}
      />
      <ShareModal
        visible={shareOpen}
        codePrefix="5DTT."
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
        vibrationHint="A tick when you pick up, a thud when you mark."
        skins={SKINS.map((s) => ({ id: s.id, name: s.name, premium: s.premium, swatch: [s.paper, s.grid] as const }))}
        pieceSets={PIECE_SETS.map((p) => ({ id: p.id, name: p.name, premium: p.premium, swatch: p.colors }))}
      >
        <Section title="Variants (apply to new games)">
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
