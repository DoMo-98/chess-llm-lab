import { Component, AfterViewInit, ViewChild, ElementRef, OnDestroy } from '@angular/core'; // <--- Añadido OnDestroy
import { CommonModule } from '@angular/common';
import { Chessground } from 'chessground';
import { Api } from 'chessground/api';
import { Key } from 'chessground/types';
import { Chess } from 'chess.js';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app.html',
})
export class AppComponent implements AfterViewInit, OnDestroy {
  @ViewChild('chessBoard') chessBoard!: ElementRef;

  private chess = new Chess();
  private cg!: Api;
  private resizeObserver!: ResizeObserver;
  private currentOrientation: 'white' | 'black' = 'white';

  ngAfterViewInit(): void {
    // 1. Inicializar Tablero
    this.cg = Chessground(this.chessBoard.nativeElement, {
      orientation: this.currentOrientation,
      coordinates: true,
      movable: {
        color: 'white',
        free: false,
        dests: this.getLegalMoves(),
        showDests: true,
        events: {
          after: (orig, dest) => this.onMove(orig, dest),
        },
      },
    });

    this.updateBoard();

    // 2. MAGIA RESPONSIVE:
    // Chessground necesita saber si su contenedor cambia de tamaño para redibujar las piezas
    this.resizeObserver = new ResizeObserver(() => {
      this.cg.redrawAll();
    });
    this.resizeObserver.observe(this.chessBoard.nativeElement);
  }

  ngOnDestroy() {
    // Limpieza buena educación
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }

  flipBoard() {
    this.currentOrientation = this.currentOrientation === 'white' ? 'black' : 'white';
    this.cg.set({ orientation: this.currentOrientation });
  }

  resetBoard() {
    this.chess.reset();
    this.updateBoard();
  }

  // --- LÓGICA DEL JUEGO (IGUAL QUE ANTES) ---

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
      } else {
        this.cg.set({ fen: this.chess.fen() });
      }
    } catch (e) {
      this.cg.set({ fen: this.chess.fen() });
    }
  }

  private updateBoard() {
    const turn = this.chess.turn() === 'w' ? 'white' : 'black';
    this.cg.set({
      fen: this.chess.fen(),
      turnColor: turn,
      movable: {
        color: turn,
        dests: this.getLegalMoves(),
      },
      check: this.chess.inCheck(),
    });
  }

  private checkGameStatus() {
    if (this.chess.isCheckmate()) alert('¡Jaque Mate!');
    else if (this.chess.isDraw()) alert('Tablas');
  }
}
