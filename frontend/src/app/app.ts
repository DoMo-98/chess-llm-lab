import { Component, AfterViewInit, ViewChild, ElementRef, OnDestroy, inject, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Chessground } from 'chessground';
import { Api } from 'chessground/api';
import { Key } from 'chessground/types';
import { Chess } from 'chess.js';
import { MoveResponse } from './models/move-response';
import { ChessApiService } from './services/chess-api.service';
import { GameMode } from './models/game-mode';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
})
export class AppComponent implements AfterViewInit, OnDestroy {
  @ViewChild('chessBoard') chessBoard!: ElementRef;
  @ViewChild('apiKeyInput') set apiKeyInput(content: ElementRef) {
    if (content) {
      setTimeout(() => {
        content.nativeElement.focus();
      }, 0);
    }
  }

  private chessApi = inject(ChessApiService);
  private zone = inject(NgZone);
  public cdr = inject(ChangeDetectorRef);
  public chess = new Chess();
  private cg!: Api;
  private resizeObserver!: ResizeObserver;
  private currentOrientation: 'white' | 'black' = 'white';
  private moveHistory: string[] = [];
  private historyIndex = 0;

  isValidating = false;
  isLoading = false;
  isLocked = false;
  showApiKeyModal = false;
  tempApiKey = '';
  validationError: string | null = null;
  gameMode: GameMode = GameMode.HUMAN_VS_HUMAN;
  isAutoPlayPaused = true;
  availableModels: string[] = [];
  whiteModel = 'gpt-4o-mini';
  blackModel = 'gpt-4o-mini';

  GameMode = GameMode; // Make enum available in template

  get playerColor(): 'white' | 'black' {
    return this.currentOrientation;
  }

  get llmColor(): 'white' | 'black' {
    return this.currentOrientation === 'white' ? 'black' : 'white';
  }

  get blackModelLabel(): string {
    return this.currentOrientation === 'white' ? 'Top' : 'Bottom';
  }

  get whiteModelLabel(): string {
    return this.currentOrientation === 'white' ? 'Bottom' : 'Top';
  }

  get isBottomPlayerTurn(): boolean {
    const turn = this.chess.turn() === 'w' ? 'white' : 'black';
    return turn === this.currentOrientation;
  }

  get isTopPlayerTurn(): boolean {
    return !this.isBottomPlayerTurn;
  }

  get isSimulationActive(): boolean {
    return this.gameMode === GameMode.LLM_VS_LLM && !this.isAutoPlayPaused;
  }

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      this.cg = Chessground(this.chessBoard.nativeElement, {
        orientation: this.currentOrientation,
        coordinates: true,
        movable: {
          color: this.playerColor,
          free: false,
          dests: this.getLegalMoves(),
          showDests: true,
          events: {
            after: (orig, dest) => {
              this.zone.run(() => {
                this.onMove(orig, dest);
              });
            },
          },
        },
        premovable: {
          enabled: true,
          showDests: true,
          events: {
            set: (orig: Key, dest: Key, metadata?: any) => {
              console.log('Premove set:', { orig, dest, metadata });
            }
          }
        }
      });

      this.resizeObserver = new ResizeObserver(() => {
        this.zone.run(() => {
          this.cg.redrawAll();
          this.cdr.detectChanges();
        });
      });
      this.resizeObserver.observe(this.chessBoard.nativeElement);
    });

    this.moveHistory = [this.chess.fen()];
    this.historyIndex = 0;
    this.updateBoard();
    this.loadModels();
    this.checkIfLLMTurn();
  }

  private loadModels() {
    this.chessApi.getModels().subscribe({
      next: (models) => {
        console.log(`Loaded ${models.length} models`);
        this.availableModels = models;
        const defaultModel = models.includes('gpt-4o-mini') ? 'gpt-4o-mini' : (models.length > 0 ? models[0] : 'gpt-4o-mini');

        if (!models.includes(this.whiteModel)) this.whiteModel = defaultModel;
        if (!models.includes(this.blackModel)) this.blackModel = defaultModel;

        this.cdr.detectChanges();
      },
      error: (err) => console.error('Failed to load models', err)
    });
  }

  onModelChange(side: 'white' | 'black') {
    const model = side === 'white' ? this.whiteModel : this.blackModel;
    console.log(`[Model Change] Side: ${side}, New Model: ${model}`);
    this.cdr.detectChanges();

    // If we're in Human vs AI mode and there was a failed AI move, retry
    if (this.gameMode === GameMode.HUMAN_VS_LLM && this.hasFailedAIMove) {
      const currentTurn = this.chess.turn() === 'w' ? 'white' : 'black';
      // Only retry if the model change is for the AI player whose turn it is
      if (side === this.llmColor && currentTurn === this.llmColor) {
        console.log('[Model Change] Retrying failed AI move with new model');
        this.hasFailedAIMove = false;
        this.errorMessage = null;
        this.requestLLMMove();
      }
    }
  }

  updateModel(side: 'white' | 'black', model: string) {
    if (side === 'white') {
      this.whiteModel = model;
    } else {
      this.blackModel = model;
    }
    this.onModelChange(side);
  }

  ngOnDestroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }

  toggleAI() {
    this.zone.run(() => {
      const targetMode = this.gameMode === GameMode.HUMAN_VS_HUMAN
        ? GameMode.HUMAN_VS_LLM
        : GameMode.HUMAN_VS_HUMAN;
      this.setGameMode(targetMode);
    });
  }

  setGameMode(mode: GameMode) {
    this.zone.run(() => {
      if (mode === this.gameMode) return;

      if (mode !== GameMode.HUMAN_VS_HUMAN) {
        // Check if API key is configured
        this.chessApi.checkHealth().subscribe({
          next: (response) => {
            if (response.openai_api_key_configured) {
              this.gameMode = mode;
              this.isAutoPlayPaused = mode === GameMode.LLM_VS_LLM; // Start paused for LLM vs LLM
              this.hasFailedAIMove = false; // Reset on game mode change
              this.errorMessage = null; // Clear any error messages
              this.updateBoard();
              this.checkIfLLMTurn();
              this.cdr.detectChanges();
            } else {
              this.showApiKeyModal = true;
              this.cdr.detectChanges();
            }
          },
          error: () => {
            console.error('Failed to check backend health');
            this.showApiKeyModal = true;
            this.cdr.detectChanges();
          }
        });
      } else {
        this.gameMode = mode;
        this.hasFailedAIMove = false; // Reset on game mode change
        this.errorMessage = null; // Clear any error messages
        this.updateBoard();
        this.cdr.detectChanges();
      }
    });
  }

  get isAIEnabled(): boolean {
    return this.gameMode !== GameMode.HUMAN_VS_HUMAN;
  }

  toggleAutoPlay() {
    this.isAutoPlayPaused = !this.isAutoPlayPaused;
    if (!this.isAutoPlayPaused) {
      this.checkIfLLMTurn();
    }
  }

  closeModal() {
    this.showApiKeyModal = false;
    this.tempApiKey = '';
    this.validationError = null;
    this.isValidating = false;
    this.cdr.detectChanges();
  }

  updateTempApiKey(event: any) {
    this.tempApiKey = event.target.value;
    this.validationError = null; // Clear error when user types
  }

  saveApiKey() {
    if (!this.tempApiKey || this.isValidating) return;

    this.isValidating = true;
    this.validationError = null;
    this.cdr.detectChanges();

    this.chessApi.saveApiKey(this.tempApiKey).subscribe({
      next: () => {
        this.isValidating = false;
        this.showApiKeyModal = false;
        this.tempApiKey = '';
        if (this.gameMode === GameMode.HUMAN_VS_HUMAN) {
          this.gameMode = GameMode.HUMAN_VS_LLM;
        }
        this.loadModels();
        this.updateBoard();
        this.checkIfLLMTurn();
      },
      error: (err: any) => {
        this.isValidating = false;
        if (err.status === 401) {
          this.validationError = 'Invalid API key. Please check and try again.';
        } else {
          this.validationError = 'Failed to validate API key. Please try again later.';
        }
        this.cdr.detectChanges();
      }
    });
  }

  flipBoard() {
    this.currentOrientation = this.currentOrientation === 'white' ? 'black' : 'white';
    this.cg.set({ orientation: this.currentOrientation });
    this.updateBoard();
    this.checkIfLLMTurn();
  }

  resetBoard() {
    if (this.isLoading) return;
    this.chess.reset();
    this.currentOrientation = 'white';

    // Reset board visual state (clear highlights and selection)
    this.cg.set({
      orientation: this.currentOrientation,
      lastMove: undefined,
      selected: undefined
    });

    this.moveHistory = [this.chess.fen()];
    this.historyIndex = 0;
    this.isLoading = false;
    this.isLocked = false;
    this.hasFailedAIMove = false; // Reset failed move flag
    this.errorMessage = null; // Clear any error messages
    this.updateBoard();
    this.checkIfLLMTurn();
  }

  toggleLock() {
    this.isLocked = !this.isLocked;
  }

  goToFirst() {
    this.historyIndex = 0;
    this.cg?.cancelPremove();
    this.updateBoard();
  }

  goToPrevious() {
    if (this.historyIndex <= 0) return;
    this.historyIndex--;
    this.cg?.cancelPremove();
    this.updateBoard();
  }

  goToNext() {
    if (this.historyIndex >= this.moveHistory.length - 1) return;
    this.historyIndex++;
    this.cg?.cancelPremove();
    this.updateBoard();
  }

  goToLast() {
    this.historyIndex = this.moveHistory.length - 1;
    this.cg?.cancelPremove();
    this.updateBoard();
  }

  get isAtLastMove(): boolean {
    return this.historyIndex === this.moveHistory.length - 1;
  }

  get isAtFirstMove(): boolean {
    return this.historyIndex === 0;
  }

  private getLegalMoves(): Map<Key, Key[]> {
    const moves = new Map<Key, Key[]>();
    this.chess.moves({ verbose: true }).forEach((m: any) => {
      const from = m.from as Key;
      const to = m.to as Key;
      if (!moves.has(from)) moves.set(from, []);
      moves.get(from)!.push(to);
    });
    return moves;
  }

  onMove(orig: Key, dest: Key) {
    try {
      const move = this.chess.move({ from: orig, to: dest, promotion: 'q' });
      if (move) {
        if (!this.isAIEnabled && !this.isLocked) {
          this.currentOrientation = this.chess.turn() === 'w' ? 'white' : 'black';
          this.cg.set({ orientation: this.currentOrientation });
        }
        this.moveHistory = this.moveHistory.slice(0, this.historyIndex + 1);
        this.moveHistory.push(this.chess.fen());
        this.historyIndex = this.moveHistory.length - 1;
        this.updateBoard();
        this.checkGameStatus();
        this.checkIfLLMTurn();
      } else {
        this.cg.set({ fen: this.chess.fen() });
      }
    } catch (e) {
      this.cg.set({ fen: this.chess.fen() });
    }
  }

  private checkIfLLMTurn() {
    if (!this.isAIEnabled || this.chess.isGameOver() || this.isLoading) {
      return;
    }

    if (this.gameMode === GameMode.LLM_VS_LLM && this.isAutoPlayPaused) {
      return;
    }

    const currentTurn = this.chess.turn() === 'w' ? 'white' : 'black';

    if (this.gameMode === GameMode.LLM_VS_LLM || currentTurn === this.llmColor) {
      console.log('Triggering AI move...');
      this.requestLLMMove();
    }
  }

  // ... inside AppComponent class
  // Add this property to the class
  errorMessage: string | null = null;
  hasFailedAIMove = false; // Track if AI move failed

  // ... (existing code)

  private requestLLMMove() {
    if (this.isLoading) return;

    this.isLoading = true;
    this.errorMessage = null; // Clear previous errors
    this.cdr.detectChanges();


    const currentTurn = this.chess.turn() === 'w' ? 'white' : 'black';
    const model = currentTurn === 'white' ? this.whiteModel : this.blackModel;

    console.log(`[AI Move] Side: ${currentTurn}, Model: ${model}`);

    setTimeout(() => {
      this.chessApi.requestMove(this.chess.fen(), model).subscribe({
        next: (response) => {
          this.zone.run(() => {
            this.isLoading = false;
            this.hasFailedAIMove = false; // Reset on success
            this.applyLLMMove(response.move);
            this.cdr.detectChanges();
          });
        },
        error: (err: any) => {
          this.zone.run(() => {
            this.isLoading = false;
            this.hasFailedAIMove = true; // Mark that AI move failed
            this.isAutoPlayPaused = true; // Pause auto-play on error

            // Map status codes to user-friendly messages
            if (err.status === 429) {
              this.errorMessage = "You've run out of credits or hit the rate limit. Please check your plan.";
            } else if (err.status === 401) {
              this.errorMessage = "Authentication failed. Please check your API key.";
              this.showApiKeyModal = true; // Optionally prompt to fix key
            } else if (err.status === 503) {
              this.errorMessage = "Service unavailable. Check your internet connection.";
            } else {
              this.errorMessage = "An unexpected error occurred. Please try again.";
            }

            this.updateBoard();
            this.cdr.detectChanges();

            // Auto-dismiss after 5 seconds
            setTimeout(() => {
              if (this.errorMessage) {
                this.errorMessage = null;
                this.cdr.detectChanges();
              }
            }, 5000);
          });
        }
      });
    }, 0);
  }

  private applyLLMMove(uciMove: string) {
    try {
      const from = uciMove.slice(0, 2) as Key;
      const to = uciMove.slice(2, 4) as Key;
      const promotion = uciMove.length > 4 ? uciMove[4] : undefined;

      const move = this.chess.move({ from, to, promotion });
      if (move) {
        this.moveHistory.push(this.chess.fen());
        this.historyIndex = this.moveHistory.length - 1;
        this.updateBoard([from, to]);
        this.checkGameStatus();
        // Explicitly trigger premove check after AI move
        this.cg?.playPremove();

        // Trigger next move check regardless of game mode
        // This handles:
        // 1. LLM_VS_LLM mode (continuous play)
        // 2. HUMAN_VS_LLM mode if the user flipped sides during thinking
        setTimeout(() => this.checkIfLLMTurn(), 100);
      } else {
        this.updateBoard();
      }
    } catch (e) {
      this.updateBoard();
    }
  }

  private disableBoard() {
    this.cg.set({
      movable: {
        color: undefined,
        dests: new Map(),
      },
    });
  }

  private updateBoard(lastMove?: [Key, Key]) {
    const fen = this.moveHistory[this.historyIndex];
    const tempChess = new Chess(fen);
    const turn = tempChess.turn() === 'w' ? 'white' : 'black';

    // In HUMAN_VS_LLM, player can move if it's their turn
    // In LLM_VS_LLM, player cannot move (spectator)
    let isPlayerTurn = false;
    if (this.isAtLastMove && !this.isLoading) {
      if (this.gameMode === GameMode.HUMAN_VS_LLM) {
        isPlayerTurn = turn === this.playerColor;
      } else if (this.gameMode === GameMode.HUMAN_VS_HUMAN) {
        isPlayerTurn = true;
      }
    }

    this.cg.set({
      fen: fen,
      turnColor: turn,
      movable: {
        color: this.isAtLastMove ? (this.gameMode === GameMode.HUMAN_VS_HUMAN ? turn : (this.gameMode === GameMode.HUMAN_VS_LLM ? this.playerColor : undefined)) : undefined,
        dests: isPlayerTurn ? this.getLegalMoves() : new Map(),
      },
      premovable: {
        enabled: this.gameMode !== GameMode.LLM_VS_LLM
      },
      check: tempChess.inCheck(),
      lastMove: lastMove ?? (this.isAtLastMove ? this.cg?.state?.lastMove : undefined)
    });
    this.cdr.detectChanges();
  }

  private checkGameStatus() {
    if (this.chess.isGameOver()) {
      this.isAutoPlayPaused = true;
      if (this.chess.isCheckmate()) alert('Checkmate!');
      else if (this.chess.isDraw()) alert('Draw');
    }
  }
}
