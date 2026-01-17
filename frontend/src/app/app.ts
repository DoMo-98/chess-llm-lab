import { Component, AfterViewInit, ViewChild, ElementRef, OnDestroy, inject, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chessground } from 'chessground';
import { Api } from 'chessground/api';
import { Key } from 'chessground/types';
import { Chess } from 'chess.js';
import { MoveResponse } from './models/move-response.interface';
import { ChessApiService } from './services/chess-api.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app.html',
})
export class AppComponent implements AfterViewInit, OnDestroy {
  @ViewChild('chessBoard') chessBoard!: ElementRef;

  private chessApi = inject(ChessApiService);
  private zone = inject(NgZone);
  private cdr = inject(ChangeDetectorRef);
  private chess = new Chess();
  private cg!: Api;
  private resizeObserver!: ResizeObserver;
  private currentOrientation: 'white' | 'black' = 'white';
  private moveHistory: string[] = [];
  private historyIndex = 0;

  isAIEnabled = false;
  isLoading = false;
  isLocked = false;
  showApiKeyModal = false;
  tempApiKey = '';
  validationError: string | null = null;
  isValidating = false;

  get playerColor(): 'white' | 'black' {
    return this.currentOrientation;
  }

  get llmColor(): 'white' | 'black' {
    return this.currentOrientation === 'white' ? 'black' : 'white';
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
    this.checkIfLLMTurn();
  }

  ngOnDestroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }

  toggleAI() {
    this.zone.run(() => {
      const nextState = !this.isAIEnabled;

      if (nextState) {
        // Check if API key is configured
        this.chessApi.checkHealth().subscribe({
          next: (response) => {
            if (response.openai_api_key_configured) {
              this.enableAI();
            } else {
              this.showApiKeyModal = true;
              this.cdr.detectChanges();
            }
          },
          error: () => {
            console.error('Failed to check backend health');
            this.showApiKeyModal = true; // Fallback to asking
            this.cdr.detectChanges();
          }
        });
      } else {
        this.isAIEnabled = false;
        console.log('AI Toggle: DISABLED');
        this.updateBoard();
      }
    });
  }

  private enableAI() {
    this.isAIEnabled = true;
    console.log('AI Toggle: ENABLED');
    this.updateBoard();
    setTimeout(() => this.checkIfLLMTurn(), 50);
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
        this.enableAI();
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
    if (this.isLoading) return;
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
    this.updateBoard();
    this.checkIfLLMTurn();
  }

  toggleLock() {
    this.isLocked = !this.isLocked;
  }

  goToFirst() {
    if (this.isLoading) return;
    this.historyIndex = 0;
    this.cg.cancelPremove();
    this.updateBoard();
  }

  goToPrevious() {
    if (this.isLoading || this.historyIndex <= 0) return;
    this.historyIndex--;
    this.cg.cancelPremove();
    this.updateBoard();
  }

  goToNext() {
    if (this.isLoading || this.historyIndex >= this.moveHistory.length - 1) return;
    this.historyIndex++;
    if (this.isAtLastMove) this.cg.cancelPremove(); // Clear if somehow set while going back/forth
    this.updateBoard();
  }

  goToLast() {
    if (this.isLoading) return;
    this.historyIndex = this.moveHistory.length - 1;
    this.cg.cancelPremove();
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
      console.log('checkIfLLMTurn skipped:', {
        isAIEnabled: this.isAIEnabled,
        isGameOver: this.chess.isGameOver(),
        isLoading: this.isLoading
      });
      return;
    }

    const currentTurn = this.chess.turn() === 'w' ? 'white' : 'black';
    console.log('Checking turn:', { currentTurn, llmColor: this.llmColor });

    if (currentTurn === this.llmColor) {
      console.log('Triggering AI move...');
      this.requestLLMMove();
    }
  }

  private requestLLMMove() {
    if (this.isLoading) return;

    this.isLoading = true;
    this.cdr.detectChanges();


    setTimeout(() => {
      this.chessApi.requestMove(this.chess.fen()).subscribe({
        next: (response) => {
          this.zone.run(() => {
            this.isLoading = false;
            this.applyLLMMove(response.move);
            this.cdr.detectChanges();
          });
        },
        error: (err: any) => {
          this.zone.run(() => {
            this.isLoading = false;
            this.updateBoard();
            this.cdr.detectChanges();
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
    const isPlayerTurn = (!this.isAIEnabled || turn === this.playerColor) && this.isAtLastMove;

    this.cg.set({
      fen: fen,
      turnColor: turn,
      movable: {
        color: this.isAtLastMove ? (!this.isAIEnabled ? turn : this.playerColor) : undefined,
        dests: isPlayerTurn ? this.getLegalMoves() : new Map(),
      },
      premovable: {
        enabled: this.isAtLastMove
      },
      check: tempChess.inCheck(),
      lastMove: lastMove ?? (this.isAtLastMove ? this.cg?.state?.lastMove : undefined)
    });
    this.cdr.detectChanges();
  }

  private checkGameStatus() {
    if (this.chess.isCheckmate()) alert('Checkmate!');
    else if (this.chess.isDraw()) alert('Draw');
  }
}
