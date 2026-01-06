import { Component, AfterViewInit, ViewChild, ElementRef, OnDestroy, inject, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Chessground } from 'chessground';
import { Api } from 'chessground/api';
import { Key } from 'chessground/types';
import { Chess } from 'chess.js';

interface MoveResponse {
  move: string;
  san: string | null;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app.html',
})
export class AppComponent implements AfterViewInit, OnDestroy {
  @ViewChild('chessBoard') chessBoard!: ElementRef;

  private http = inject(HttpClient);
  private zone = inject(NgZone);
  private cdr = inject(ChangeDetectorRef);
  private chess = new Chess();
  private cg!: Api;
  private resizeObserver!: ResizeObserver;
  private currentOrientation: 'white' | 'black' = 'white';
  private apiUrl = 'http://localhost:8000';

  isAIEnabled = false;
  isLoading = false;

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
      });

      this.resizeObserver = new ResizeObserver(() => {
        this.zone.run(() => {
          this.cg.redrawAll();
          this.cdr.detectChanges();
        });
      });
      this.resizeObserver.observe(this.chessBoard.nativeElement);
    });

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
      this.isAIEnabled = !this.isAIEnabled;
      console.log('AI Toggle:', this.isAIEnabled ? 'ENABLED' : 'DISABLED');

      this.updateBoard();

      if (this.isAIEnabled) {
        // Ensure we check if it's LLM's turn immediately after enabling
        setTimeout(() => this.checkIfLLMTurn(), 50);
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
    this.cg.set({ orientation: this.currentOrientation });
    this.isLoading = false;
    this.updateBoard();
    this.checkIfLLMTurn();
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
    this.disableBoard();
    this.cdr.detectChanges();


    setTimeout(() => {
      this.http.post<MoveResponse>(`${this.apiUrl}/move`, {
        fen: this.chess.fen()
      }).subscribe({
        next: (response) => {
          this.zone.run(() => {
            this.isLoading = false;
            this.applyLLMMove(response.move);
            this.cdr.detectChanges();
          });
        },
        error: (err) => {
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
      const from = uciMove.slice(0, 2);
      const to = uciMove.slice(2, 4);
      const promotion = uciMove.length > 4 ? uciMove[4] : undefined;

      const move = this.chess.move({ from, to, promotion });
      if (move) {
        this.updateBoard();
        this.checkGameStatus();
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

  private updateBoard() {
    const turn = this.chess.turn() === 'w' ? 'white' : 'black';
    const isPlayerTurn = !this.isAIEnabled || turn === this.playerColor;

    this.cg.set({
      fen: this.chess.fen(),
      turnColor: turn,
      movable: {
        color: isPlayerTurn ? turn : undefined,
        dests: isPlayerTurn ? this.getLegalMoves() : new Map(),
      },
      check: this.chess.inCheck(),
    });
    this.cdr.detectChanges();
  }

  private checkGameStatus() {
    if (this.chess.isCheckmate()) alert('Checkmate!');
    else if (this.chess.isDraw()) alert('Draw');
  }
}
