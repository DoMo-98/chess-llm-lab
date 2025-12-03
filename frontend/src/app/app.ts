import { Component, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chessground } from 'chessground';
import { Config } from 'chessground/config';
import { Api } from 'chessground/api';
import { Key } from 'chessground/types';
import { Chess } from 'chess.js';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app.html',
  styleUrls: ['./app.css'],
})
export class App implements AfterViewInit {
  // Referencia al <div> del HTML donde pintaremos el tablero
  @ViewChild('chessBoard') chessBoard!: ElementRef;

  private chess = new Chess();
  private cg!: Api; // Aquí guardaremos la instancia del tablero visual

  ngAfterViewInit(): void {
    // Inicializamos Chessground directamente en el elemento nativo
    this.cg = Chessground(this.chessBoard.nativeElement, {
      orientation: 'white',
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

    // Sincronizamos la posición inicial
    this.updateBoard();
  }

  // --- LÓGICA DEL JUEGO ---

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
        // Movimiento legal: actualizamos el estado visual
        this.updateBoard();
        this.checkGameStatus();
      } else {
        // Movimiento ilegal (aunque Chessground suele bloquearlo): deshacemos
        this.cg.set({ fen: this.chess.fen() });
      }
    } catch (e) {
      // Si hay error, reseteamos la posición visual a la lógica
      this.cg.set({ fen: this.chess.fen() });
    }
  }

  private updateBoard() {
    const turn = this.chess.turn() === 'w' ? 'white' : 'black';

    // Usamos la API nativa (.set) para actualizar el tablero
    this.cg.set({
      fen: this.chess.fen(),
      turnColor: turn,
      movable: {
        color: turn,
        dests: this.getLegalMoves(),
      },
      check: this.chess.inCheck(), // Ilumina el Rey si está en jaque
    });
  }

  private checkGameStatus() {
    if (this.chess.isCheckmate()) alert('¡Jaque Mate!');
    else if (this.chess.isDraw()) alert('Tablas');
  }
}
