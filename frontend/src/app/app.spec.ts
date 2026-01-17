import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ChessApiService } from './services/chess-api.service';
import { of } from 'rxjs';

describe('AppComponent', () => {
  let chessApiService: ChessApiService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ChessApiService
      ]
    }).compileComponents();

    chessApiService = TestBed.inject(ChessApiService);
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should initialize with AI disabled', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app.isAIEnabled).toBe(false);
  });

  it('should toggle lock state', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app.isLocked).toBe(false);
    app.toggleLock();
    expect(app.isLocked).toBe(true);
  });

  it('should flip board orientation', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    (app as any).cg = { set: vi.fn() };
    const initialColor = app.playerColor;

    app.flipBoard();
    expect(app.playerColor).not.toBe(initialColor);

    app.flipBoard();
    expect(app.playerColor).toBe(initialColor);
  });

  it('should reset board', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    (app as any).cg = { set: vi.fn() };

    // Simulate some changes
    app.isLocked = true;
    vi.spyOn(chessApiService, 'checkHealth').mockReturnValue(of({ openai_api_key_configured: true }));
    app.toggleAI();

    app.resetBoard();
    expect(app.isLocked).toBe(false);
    expect(app.playerColor).toBe('white');
  });

  it('should show API key modal if AI is toggled and key is not configured', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    (app as any).cg = { set: vi.fn() };

    vi.spyOn(chessApiService, 'checkHealth').mockReturnValue(of({ openai_api_key_configured: false }));

    app.toggleAI();

    expect(app.showApiKeyModal).toBe(true);
  });

  it('should enable AI directly if key is configured', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    (app as any).cg = { set: vi.fn() };

    vi.spyOn(chessApiService, 'checkHealth').mockReturnValue(of({ openai_api_key_configured: true }));

    app.toggleAI();

    expect(app.isAIEnabled).toBe(true);
    expect(app.showApiKeyModal).toBe(false);
  });

  describe('Move Navigation', () => {
    let fixture: any;
    let app: any;

    beforeEach(() => {
      fixture = TestBed.createComponent(AppComponent);
      app = fixture.componentInstance;
      app.cg = {
        set: vi.fn(),
        cancelPremove: vi.fn(),
        playPremove: vi.fn(),
        state: { lastMove: undefined }
      };
      // Initialize with starting position
      app.resetBoard();
    });

    it('should initialize with starting position in history', () => {
      expect(app.moveHistory.length).toBe(1);
      expect(app.historyIndex).toBe(0);
      expect(app.isAtFirstMove).toBe(true);
      expect(app.isAtLastMove).toBe(true);
    });

    it('should update history when a move is made', () => {
      // Simulate a move (e.g., e4)
      app.onMove('e2', 'e4');
      expect(app.moveHistory.length).toBe(2);
      expect(app.historyIndex).toBe(1);
      expect(app.isAtFirstMove).toBe(false);
      expect(app.isAtLastMove).toBe(true);
    });

    it('should navigate through history', () => {
      app.onMove('e2', 'e4'); // move 1
      app.onMove('e7', 'e5'); // move 2
      expect(app.historyIndex).toBe(2);

      app.goToPrevious();
      expect(app.historyIndex).toBe(1);
      expect(app.isAtLastMove).toBe(false);

      app.goToFirst();
      expect(app.historyIndex).toBe(0);
      expect(app.isAtFirstMove).toBe(true);

      app.goToNext();
      expect(app.historyIndex).toBe(1);

      app.goToLast();
      expect(app.historyIndex).toBe(2);
      expect(app.isAtLastMove).toBe(true);
    });

    it('should disable board interactivity when not at the last move', () => {
      app.onMove('e2', 'e4');
      app.goToFirst();

      expect(app.cg.set).toHaveBeenLastCalledWith(expect.objectContaining({
        movable: expect.objectContaining({
          color: undefined
        }),
        premovable: expect.objectContaining({
          enabled: false
        })
      }));
    });

    it('should enable board interactivity when at the last move', () => {
      app.onMove('e2', 'e4');
      app.goToLast();

      expect(app.cg.set).toHaveBeenLastCalledWith(expect.objectContaining({
        movable: expect.objectContaining({
          color: 'black' // It's black's turn after e4
        }),
        premovable: expect.objectContaining({
          enabled: true
        })
      }));
    });

    it('should cancel premoves when navigating', () => {
      app.onMove('e2', 'e4');
      app.goToPrevious();
      expect(app.cg.cancelPremove).toHaveBeenCalled();
    });

    it('should truncate history if a move is made from a previous state', () => {
      app.onMove('e2', 'e4');
      app.onMove('e7', 'e5');
      app.goToPrevious(); // back to e4

      // Make a different move (d4 instead of e5)
      app.onMove('d2', 'd4');

      expect(app.moveHistory.length).toBe(3); // start, e4, d4
      expect(app.historyIndex).toBe(2);
    });
  });
});
