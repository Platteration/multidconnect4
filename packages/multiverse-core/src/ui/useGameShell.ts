/**
 * Everything the screen around a board has to do, in one hook: replay, the
 * deep link that carries a shared game, saving, the puzzle's verdict, the
 * bot's pacing, the sheets that can be open, and how big a cell may be.
 *
 * None of it looks at a board, so none of it is a game's own. What is left
 * in a game's GameScreen is the board, the words, and the sheets' contents.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, ScrollView, View, useWindowDimensions } from 'react-native';
import { codeFromUrl, keys, removeKey, saveJson, setHapticsEnabled, setSoundEnabled, useProgress, useSettings } from '../app';
import type { Bot, BotLevel } from '../bot';
import type { GameSetup } from '../setup';
import type { BoardRef } from '../types';
import type { GameSpec, GameState } from '../engine';
import type { PuzzleStart } from './useMultiverseGame';
import { spacing } from './theme';

/** The bits of a game's controller the shell touches. */
export interface ShellGame<G extends GameSpec> {
  state: GameState<G>;
  history: GameState<G>[];
  setup: GameSetup;
  humanTurn: boolean;
  movesUsed: number;
  focus: BoardRef;
  play: (action: G['action']) => void;
  load: (history: GameState<G>[], setup: GameSetup) => void;
}

/** How the board wants to be sized, in cells and in fractions of the screen. */
export interface BoardSizing {
  /** Cells across, which is also cells down. */
  cells: number;
  /** Share of the screen height the board may take, upright and on its side. */
  portrait: number;
  landscape: number;
  min: number;
  max: number;
}

export interface GameShellOptions<G extends GameSpec, P extends PuzzleStart<GameState<G>>> {
  game: ShellGame<G>;
  puzzles: P[];
  puzzleById: (id: string) => P | undefined;
  /** A puzzle whose goal is to survive, not to win, is solved by lasting. */
  isSurvival: (puzzle: P) => boolean;
  decodeGame: (code: string) => { history: GameState<G>[]; setup: GameSetup };
  encodeGame: (history: GameState<G>[], setup: GameSetup) => string;
  chooseAction: (state: GameState<G>, level: BotLevel) => G['action'] | null;
  /** Folds a finished game into the player's record. */
  recordGame: (history: GameState<G>[], setup: GameSetup) => void;
  board: BoardSizing;
  /** True while the board is mid-animation: the bot waits, taps do nothing. */
  busy?: boolean;
  /**
   * Lets a game animate before the bot's action lands. Call `commit` when the
   * animation is done. The default plays it straight away.
   */
  playBotAction?: (action: G['action'], commit: () => void) => void;
}

export function useGameShell<G extends GameSpec, P extends PuzzleStart<GameState<G>>>(
  options: GameShellOptions<G, P>,
) {
  const {
    game,
    puzzles,
    puzzleById,
    isSurvival,
    decodeGame,
    encodeGame,
    chooseAction,
    recordGame,
    board: sizing,
    busy = false,
    playBotAction,
  } = options;
  const { settings } = useSettings();
  const { markSolved } = useProgress();

  // Replay: look at any earlier state read-only, without touching the live game.
  const [replayIndex, setReplayIndex] = useState<number | null>(null);
  const replaying = replayIndex !== null && replayIndex < game.history.length;
  const state = replaying ? game.history[replayIndex] : game.state;
  const focus = replaying ? (state.lastCreated[0] ?? { timeline: 0, turn: 0 }) : game.focus;
  const humanTurn = game.humanTurn && !replaying;

  const [menuOpen, setMenuOpen] = useState(false);
  const [newGameOpen, setNewGameOpen] = useState(false);
  const [puzzlesOpen, setPuzzlesOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [resultDismissed, setResultDismissed] = useState(false);
  const [gameOverDismissed, setGameOverDismissed] = useState(false);

  // Fold each finished game (not puzzles) into the record, once.
  const recordedRef = useRef<GameState<G> | null>(null);
  useEffect(() => {
    const live = game.state;
    if (live.status === 'playing' || game.setup.mode === 'puzzle' || recordedRef.current === live) return;
    recordedRef.current = live;
    recordGame(game.history, game.setup);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.state.status]);

  // A game code arriving by link (cold start or while running) loads the game.
  const loadCode = (code: string): string | null => {
    try {
      const loaded = decodeGame(code);
      game.load(loaded.history, loaded.setup);
      setReplayIndex(null);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  };
  const loadCodeRef = useRef(loadCode);
  loadCodeRef.current = loadCode;
  useEffect(() => {
    Linking.getInitialURL()
      .then((url) => {
        const code = codeFromUrl(url);
        if (code) loadCodeRef.current(code);
      })
      .catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => {
      const code = codeFromUrl(url);
      if (code) loadCodeRef.current(code);
    });
    return () => sub.remove();
  }, []);

  const shareCode = useMemo(
    () => (game.history.length > 1 && game.setup.mode !== 'puzzle' ? encodeGame(game.history, game.setup) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game.history, game.setup],
  );

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

  // Wide screens (tablets, phones on their side) put the map beside the board.
  const { width, height } = useWindowDimensions();
  const landscape = width > height * 1.15;
  // On a short wide screen the board column scrolls so the hint stays reachable.
  const Left = landscape ? ScrollView : View;
  const cellSize = useMemo(() => {
    const usable = landscape ? width * 0.5 - spacing.lg * 2 : width - spacing.lg * 2;
    const byWidth = Math.floor(usable / sizing.cells);
    const byHeight = Math.floor((height * (landscape ? sizing.landscape : sizing.portrait)) / sizing.cells);
    return Math.max(sizing.min, Math.min(sizing.max, byWidth, byHeight));
  }, [width, height, landscape, sizing]);

  const bot: Bot | undefined = game.setup.bot;
  const puzzle = game.setup.mode === 'puzzle' && game.setup.puzzleId ? puzzleById(game.setup.puzzleId) : undefined;
  const puzzleIndex = puzzle ? puzzles.findIndex((p) => p.id === puzzle.id) : -1;
  const survive = !!puzzle && isSurvival(puzzle);
  const puzzleSolved =
    !!puzzle &&
    (survive
      ? state.status === 'playing' && humanTurn && game.movesUsed >= puzzle.within
      : state.status === 'won' && state.win?.player === puzzle.player);
  const puzzleFailed =
    !!puzzle &&
    !puzzleSolved &&
    (state.status !== 'playing' || (!survive && humanTurn && game.movesUsed >= puzzle.within));
  useEffect(() => {
    if (puzzleSolved && puzzle) markSolved(puzzle.id);
  }, [puzzleSolved, puzzle, markSolved]);
  useEffect(() => {
    setResultDismissed(false);
    setShowHint(false);
  }, [game.setup.puzzleId, game.history.length === 1]);

  // The bot's turn: one action at a time, with a beat between them so the
  // person can follow what is happening across the boards.
  useEffect(() => {
    if (!bot || humanTurn || busy || state.status !== 'playing') return;
    const timer = setTimeout(() => {
      const action = chooseAction(state, bot.level);
      if (!action) return;
      if (playBotAction) playBotAction(action, () => game.play(action));
      else game.play(action);
    }, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, bot, humanTurn, busy]);

  return {
    /** The state on screen, which during a replay is an old one. */
    state,
    focus,
    humanTurn,
    replayIndex,
    setReplayIndex,
    replaying,
    shareCode,
    loadCode,
    landscape,
    Left,
    cellSize,
    bot,
    puzzle,
    puzzleIndex,
    survive,
    puzzleSolved,
    puzzleFailed,
    showHint,
    setShowHint,
    resultDismissed,
    setResultDismissed,
    gameOverDismissed,
    setGameOverDismissed,
    menuOpen,
    setMenuOpen,
    newGameOpen,
    setNewGameOpen,
    puzzlesOpen,
    setPuzzlesOpen,
    rulesOpen,
    setRulesOpen,
    settingsOpen,
    setSettingsOpen,
    statsOpen,
    setStatsOpen,
    shareOpen,
    setShareOpen,
    extrasOpen,
    setExtrasOpen,
  };
}
