import React, { useMemo } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Action,
  BOT_NAMES,
  GameState,
  applyAction,
  index,
  newGame,
  SIZE,
  chooseAction,
  getBoard,
  getTimeline,
  isPending,
  latestRef,
  mandatoryTimelines,
  optionalTimelines,
  moveTarget,
  otherPlayer,
  pendingTimelines,
  playerToMoveAt,
  sameRef,
  timelineLabel,
} from '../engine';
import { useEntitlements, useSettings, webLinkFor } from '@5d/core/app';
import { GameSetup } from '@5d/core';
import { narrate } from '../app/narrate';
import { useStats } from '../app/stats';
import { decodeGame, encodeGame } from '../app/share';
import { PUZZLES, puzzleById } from '../puzzles';
import { CheckerBoard, Destination } from './CheckerBoard';
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
  const { entitlements } = useEntitlements();
  const rules = useMemo(
    () => ({
      flyingKings: !!settings.variants.flyingKings,
      backCapture: !!settings.variants.backCapture,
      strictPresent: !!settings.variants.strictPresent,
    }),
    [settings.variants.flyingKings, settings.variants.backCapture, settings.variants.strictPresent],
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
    board: { cells: SIZE, portrait: 0.42, landscape: 0.7, min: 24, max: 52 },
  });
  const { state, focus, humanTurn, replayIndex, setReplayIndex, replaying, shareCode, loadCode } = shell;
  const { bot, puzzle, puzzleIndex, survive, puzzleSolved, puzzleFailed } = shell;
  const { Left, landscape, cellSize } = shell;
  const { showHint, setShowHint, resultDismissed, setResultDismissed, gameOverDismissed, setGameOverDismissed } = shell;
  const { menuOpen, setMenuOpen, newGameOpen, setNewGameOpen, puzzlesOpen, setPuzzlesOpen } = shell;
  const { rulesOpen, setRulesOpen, settingsOpen, setSettingsOpen, statsOpen, setStatsOpen } = shell;
  const { shareOpen, setShareOpen, extrasOpen, setExtrasOpen } = shell;

  // A tiny multiverse for the welcome pages: four moves, then a travel.
  const welcomeDemo = useMemo(() => {
    const step = (from: number, to: number): Action => ({ type: 'move', timeline: 0, move: { from, path: [to], captures: [] } });
    const steps: Action[] = [
      step(index(2, 1), index(3, 0)),
      step(index(5, 6), index(4, 7)),
      step(index(2, 3), index(3, 2)),
      step(index(5, 4), index(4, 5)),
      { type: 'travel', from: { timeline: 0, square: index(3, 2) }, to: { timeline: 0, turn: 2 } },
    ];
    return steps.reduce((st, a) => applyAction(st, a), newGame());
  }, []);
  const welcomePages = useMemo(
    () => [
      {
        title: "It's checkers. Every move is remembered.",
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
        title: 'Send a piece into the past.',
        body: 'Tap one of your pieces, then a glowing past board where its square is free. History branches: a new timeline starts there with your extra piece, and your opponent must answer on it too.',
        art: (
          <View style={{ alignItems: 'center', gap: 6 }}>
            <MiniBoard board={welcomeDemo.timelines[0].boards[2]} ring={colors.travel} badge="GO" />
            <Text style={{ color: colors.travel, fontWeight: '800' }}>↓</Text>
            <MiniBoard board={welcomeDemo.timelines[1].boards[0]} ring={colors.playerAccent[1]} badge="play" />
          </View>
        ),
      },
      {
        title: 'Wipe them off any board to win.',
        body: 'Play every board marked "play" before your turn ends. Jumps are mandatory. Time travel is the one way out of a forced jump, but leaving your last piece behind loses that board.',
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
  const accent = state.win ? colors.playerAccent[state.win.player] : colors.playerAccent[mover];

  const origin = selection.kind === 'none' ? null : latestRef(getTimeline(state, selection.from.timeline));
  const holdingHere = selection.kind === 'piece' && selection.from.timeline === focus.timeline && focusIsPending;
  const destinations: Destination[] = holdingHere
    ? selection.moves.map((m) => ({ square: moveTarget(m), capture: m.captures.length > 0 }))
    : [];

  // Tint the squares touched by the action that produced the focused board.
  const marks = useMemo(() => {
    const a = state.lastAction;
    if (!a || !state.lastCreated.some((r) => sameRef(r, focus))) return [];
    if (a.type === 'move') return focus.timeline === a.timeline ? [a.move.from, ...a.move.path] : [];
    if (a.type === 'travel') return [a.from.square];
    return [];
  }, [state.lastAction, state.lastCreated, focus]);

  const status =
    state.status === 'won' && state.win
      ? `${colors.playerNames[state.win.player]} wins!`
      : state.status === 'draw'
        ? 'Draw - forty quiet moves each'
        : !humanTurn && bot
          ? `${BOT_NAMES[bot.level]} is thinking…`
          : `${colors.playerNames[mover]} to move · ${totalWaiting} board${totalWaiting === 1 ? '' : 's'} waiting${optionalCount ? ` · ${optionalCount} optional` : ''}`;

  const subtitle = puzzle
    ? `Puzzle ${puzzleIndex + 1}: ${puzzle.title} · ${Math.max(0, puzzle.within - game.movesUsed)} move${puzzle.within - game.movesUsed === 1 ? '' : 's'} left`
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
  } else if (selection.kind === 'piece') {
    if (!holdingHere) {
      hint = 'Piece picked up on another board. Tap a glowing board to send it there, or cancel.';
    } else if (selection.moves.length === 0 && game.mustCapture) {
      hint = 'Jumps are mandatory. This piece cannot jump: pick one that can, or send this one into the past.';
    } else if (targets.length > 0) {
      hint = 'Tap a highlighted square to move, or a glowing board on the map to send this piece into the past.';
    } else {
      hint = selection.moves.length > 0 ? 'Tap a highlighted square to move.' : 'This piece has no moves and its square is taken on every past board.';
    }
  } else if (!humanTurn) {
    hint = 'The bot is taking its turn.';
  } else if (game.canEndTurn) {
    hint = 'Every board at the present is played. Play the boards ahead of it too, or end your turn.';
  } else if (focusIsPending) {
    hint = game.mustCapture ? 'You have a jump available, and jumps are mandatory. Tap a piece.' : 'Tap one of your pieces to move it, or to send it into the past.';
  } else {
    hint = 'This board is history. Only time travel can change it.';
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit>
            5D Checkers{entitlements.supporter ? ' ✦' : ''}
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
      <CheckerBoard
        board={board}
        cellSize={cellSize}
        interactive={humanTurn && state.status === 'playing' && focusIsPending}
        selected={holdingHere ? selection.from.square : null}
        destinations={destinations}
        marks={marks}
        landed={marks.length > 1 ? marks[marks.length - 1] : marks[0] ?? null}
        patterns={settings.patterns}
        onPressSquare={game.pressSquare}
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
          1: 'Takes what it must, loves a crown, otherwise wanders. Never travels.',
          2: 'Counts material after your best reply and keeps pushing forward.',
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
        codePrefix="5DCK."
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
        vibrationHint="A tick when you pick up, a thud when you capture."
        skins={SKINS.map((s) => ({ id: s.id, name: s.name, premium: s.premium, swatch: [s.squareLight, s.squareDark] as const }))}
        pieceSets={PIECE_SETS.map((p) => ({ id: p.id, name: p.name, premium: p.premium, swatch: p.colors }))}
      >
        <Section title="Variants (apply to new games)">
          <Row label="Flying kings" hint="Kings slide any distance and land anywhere beyond a capture.">
            <Switch value={!!settings.variants.flyingKings} onValueChange={(v) => setVariant('flyingKings', v)} />
          </Row>
          <Row label="Backward captures" hint="Men may jump backwards as well as forwards.">
            <Switch value={!!settings.variants.backCapture} onValueChange={(v) => setVariant('backCapture', v)} />
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
