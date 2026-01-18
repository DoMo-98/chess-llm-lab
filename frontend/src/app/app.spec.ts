import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ChessApiService } from './services/chess-api.service';
import { of, throwError } from 'rxjs';
import { GameMode } from './models/game-mode';

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

  it('should reset board completely', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    (app as any).cg = { set: vi.fn() };

    // Simulate some changes
    app.isLocked = true;
    (app as any).hasFailedAIMove = true;
    (app as any).errorMessage = 'Some error';
    vi.spyOn(chessApiService, 'checkHealth').mockReturnValue(of({ openai_api_key_configured: true }));
    app.toggleAI();

    app.resetBoard();

    expect(app.isLocked).toBe(false);
    expect(app.playerColor).toBe('white');
    expect((app as any).moveHistory.length).toBe(1);
    expect((app as any).historyIndex).toBe(0);
    expect((app as any).hasFailedAIMove).toBe(false);
    expect((app as any).errorMessage).toBe(null);
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

  describe('Game Modes', () => {
    let fixture: any;
    let app: AppComponent;

    beforeEach(() => {
      fixture = TestBed.createComponent(AppComponent);
      app = fixture.componentInstance;
      (app as any).cg = {
        set: vi.fn(),
        cancelPremove: vi.fn(),
        playPremove: vi.fn(),
        state: { lastMove: undefined }
      };
    });

    it('should initialize in HUMAN_VS_HUMAN mode', () => {
      expect(app.gameMode).toBe(GameMode.HUMAN_VS_HUMAN);
    });

    it('should switch to HUMAN_VS_LLM when setGameMode is called with API key configured', () => {
      vi.spyOn(chessApiService, 'checkHealth').mockReturnValue(of({ openai_api_key_configured: true }));

      app.setGameMode(GameMode.HUMAN_VS_LLM);

      expect(app.gameMode).toBe(GameMode.HUMAN_VS_LLM);
    });

    it('should switch back to HUMAN_VS_HUMAN from HUMAN_VS_LLM', () => {
      vi.spyOn(chessApiService, 'checkHealth').mockReturnValue(of({ openai_api_key_configured: true }));
      app.setGameMode(GameMode.HUMAN_VS_LLM);

      app.setGameMode(GameMode.HUMAN_VS_HUMAN);

      expect(app.gameMode).toBe(GameMode.HUMAN_VS_HUMAN);
    });

    it('should start LLM_VS_LLM mode paused', () => {
      vi.spyOn(chessApiService, 'checkHealth').mockReturnValue(of({ openai_api_key_configured: true }));

      app.setGameMode(GameMode.LLM_VS_LLM);

      expect(app.gameMode).toBe(GameMode.LLM_VS_LLM);
      expect(app.isAutoPlayPaused).toBe(true);
    });

    it('should not change mode if already in the same mode', () => {
      const spy = vi.spyOn(chessApiService, 'checkHealth');

      app.setGameMode(GameMode.HUMAN_VS_HUMAN);

      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    let fixture: any;
    let app: AppComponent;
    let originalResizeObserver: typeof ResizeObserver;

    beforeEach(() => {
      // Stub ResizeObserver before fake timers with a proper class
      originalResizeObserver = globalThis.ResizeObserver;
      globalThis.ResizeObserver = class MockResizeObserver {
        observe() { }
        unobserve() { }
        disconnect() { }
      } as unknown as typeof ResizeObserver;

      vi.useFakeTimers();
      fixture = TestBed.createComponent(AppComponent);
      app = fixture.componentInstance;
      (app as any).cg = {
        set: vi.fn(),
        cancelPremove: vi.fn(),
        playPremove: vi.fn(),
        state: { lastMove: undefined }
      };
      vi.spyOn(chessApiService, 'checkHealth').mockReturnValue(of({ openai_api_key_configured: true }));
      app.setGameMode(GameMode.HUMAN_VS_LLM);
    });

    afterEach(() => {
      vi.useRealTimers();
      globalThis.ResizeObserver = originalResizeObserver;
    });

    it('should set error message on 429 rate limit error', () => {
      vi.spyOn(chessApiService, 'requestMove').mockReturnValue(throwError(() => ({ status: 429 })));

      (app as any).requestLLMMove();
      vi.advanceTimersByTime(1); // Only advance past the setTimeout(0), not the 5s auto-dismiss

      expect((app as any).errorMessage).toContain('rate limit');
    });

    it('should set error message on 401 authentication error', () => {
      vi.spyOn(chessApiService, 'requestMove').mockReturnValue(throwError(() => ({ status: 401 })));

      (app as any).requestLLMMove();
      vi.advanceTimersByTime(1); // Only advance past the setTimeout(0), not the 5s auto-dismiss

      expect((app as any).errorMessage).toContain('Authentication');
    });

    it('should set error message on 503 service unavailable error', () => {
      vi.spyOn(chessApiService, 'requestMove').mockReturnValue(throwError(() => ({ status: 503 })));

      (app as any).requestLLMMove();
      vi.advanceTimersByTime(1); // Only advance past the setTimeout(0), not the 5s auto-dismiss

      expect((app as any).errorMessage).toContain('unavailable');
    });

    it('should show API key modal on 401 error', () => {
      vi.spyOn(chessApiService, 'requestMove').mockReturnValue(throwError(() => ({ status: 401 })));

      (app as any).requestLLMMove();
      vi.runAllTimers();

      expect(app.showApiKeyModal).toBe(true);
    });

    it('should pause auto-play on error', () => {
      app.isAutoPlayPaused = false;
      vi.spyOn(chessApiService, 'requestMove').mockReturnValue(throwError(() => ({ status: 500 })));

      (app as any).requestLLMMove();
      vi.runAllTimers();

      expect(app.isAutoPlayPaused).toBe(true);
    });

    it('should set hasFailedAIMove flag on error', () => {
      vi.spyOn(chessApiService, 'requestMove').mockReturnValue(throwError(() => ({ status: 500 })));

      (app as any).requestLLMMove();
      vi.runAllTimers();

      expect((app as any).hasFailedAIMove).toBe(true);
    });
  });

  describe('Model Selection', () => {
    let fixture: any;
    let app: AppComponent;

    beforeEach(() => {
      fixture = TestBed.createComponent(AppComponent);
      app = fixture.componentInstance;
      (app as any).cg = {
        set: vi.fn(),
        cancelPremove: vi.fn(),
        playPremove: vi.fn(),
        state: { lastMove: undefined }
      };
    });

    it('should load available models on init', () => {
      const mockModels = ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'];
      vi.spyOn(chessApiService, 'getModels').mockReturnValue(of(mockModels));

      (app as any).loadModels();

      expect(app.availableModels).toEqual(mockModels);
    });

    it('should update whiteModel when updateModel is called', () => {
      app.updateModel('white', 'gpt-4o');

      expect(app.whiteModel).toBe('gpt-4o');
    });

    it('should update blackModel when updateModel is called', () => {
      app.updateModel('black', 'gpt-4o');

      expect(app.blackModel).toBe('gpt-4o');
    });

    it('should set default model if current model not in available list', () => {
      app.whiteModel = 'non-existent-model';
      app.blackModel = 'another-non-existent';
      const mockModels = ['gpt-4o', 'gpt-4o-mini'];
      vi.spyOn(chessApiService, 'getModels').mockReturnValue(of(mockModels));

      (app as any).loadModels();

      expect(app.whiteModel).toBe('gpt-4o-mini');
      expect(app.blackModel).toBe('gpt-4o-mini');
    });
  });

  describe('Computed Properties', () => {
    let fixture: any;
    let app: AppComponent;

    beforeEach(() => {
      fixture = TestBed.createComponent(AppComponent);
      app = fixture.componentInstance;
      (app as any).cg = {
        set: vi.fn(),
        cancelPremove: vi.fn(),
        playPremove: vi.fn(),
        state: { lastMove: undefined }
      };
    });

    it('should return correct llmColor (opposite of playerColor)', () => {
      (app as any).currentOrientation = 'white';
      expect(app.llmColor).toBe('black');

      (app as any).currentOrientation = 'black';
      expect(app.llmColor).toBe('white');
    });

    it('should return correct isBottomPlayerTurn based on orientation', () => {
      // White to move, white orientation - bottom player's turn
      app.chess.reset();
      (app as any).currentOrientation = 'white';
      expect(app.isBottomPlayerTurn).toBe(true);

      // White to move, black orientation - NOT bottom player's turn
      (app as any).currentOrientation = 'black';
      expect(app.isBottomPlayerTurn).toBe(false);
    });

    it('should return correct isTopPlayerTurn (inverse of isBottomPlayerTurn)', () => {
      app.chess.reset();
      (app as any).currentOrientation = 'white';
      expect(app.isTopPlayerTurn).toBe(false);

      (app as any).currentOrientation = 'black';
      expect(app.isTopPlayerTurn).toBe(true);
    });

    it('should return correct isSimulationActive', () => {
      app.gameMode = GameMode.LLM_VS_LLM;
      app.isAutoPlayPaused = false;
      expect(app.isSimulationActive).toBe(true);

      app.isAutoPlayPaused = true;
      expect(app.isSimulationActive).toBe(false);

      app.gameMode = GameMode.HUMAN_VS_LLM;
      app.isAutoPlayPaused = false;
      expect(app.isSimulationActive).toBe(false);
    });

    it('should return correct isAIEnabled', () => {
      app.gameMode = GameMode.HUMAN_VS_HUMAN;
      expect(app.isAIEnabled).toBe(false);

      app.gameMode = GameMode.HUMAN_VS_LLM;
      expect(app.isAIEnabled).toBe(true);

      app.gameMode = GameMode.LLM_VS_LLM;
      expect(app.isAIEnabled).toBe(true);
    });

    it('should return correct blackModelLabel based on orientation', () => {
      (app as any).currentOrientation = 'white';
      expect(app.blackModelLabel).toBe('Top');

      (app as any).currentOrientation = 'black';
      expect(app.blackModelLabel).toBe('Bottom');
    });

    it('should return correct whiteModelLabel based on orientation', () => {
      (app as any).currentOrientation = 'white';
      expect(app.whiteModelLabel).toBe('Bottom');

      (app as any).currentOrientation = 'black';
      expect(app.whiteModelLabel).toBe('Top');
    });
  });

  describe('Modal Operations', () => {
    let fixture: any;
    let app: AppComponent;

    beforeEach(() => {
      fixture = TestBed.createComponent(AppComponent);
      app = fixture.componentInstance;
      (app as any).cg = {
        set: vi.fn(),
        cancelPremove: vi.fn(),
        playPremove: vi.fn(),
        state: { lastMove: undefined }
      };
    });

    it('should close modal and reset state', () => {
      app.showApiKeyModal = true;
      app.tempApiKey = 'some-key';
      app.validationError = 'Some error';
      app.isValidating = true;

      app.closeModal();

      expect(app.showApiKeyModal).toBe(false);
      expect(app.tempApiKey).toBe('');
      expect(app.validationError).toBe(null);
      expect(app.isValidating).toBe(false);
    });

    it('should update tempApiKey and clear validation error', () => {
      app.validationError = 'Previous error';

      app.updateTempApiKey({ target: { value: 'new-key' } });

      expect(app.tempApiKey).toBe('new-key');
      expect(app.validationError).toBe(null);
    });

    it('should not save API key if empty', () => {
      const spy = vi.spyOn(chessApiService, 'saveApiKey');
      app.tempApiKey = '';

      app.saveApiKey();

      expect(spy).not.toHaveBeenCalled();
    });

    it('should not save API key if already validating', () => {
      const spy = vi.spyOn(chessApiService, 'saveApiKey');
      app.tempApiKey = 'some-key';
      app.isValidating = true;

      app.saveApiKey();

      expect(spy).not.toHaveBeenCalled();
    });

    it('should handle API key validation error with 401 status', () => {
      vi.spyOn(chessApiService, 'saveApiKey').mockReturnValue(throwError(() => ({ status: 401 })));
      app.tempApiKey = 'invalid-key';

      app.saveApiKey();

      expect(app.validationError).toContain('Invalid API key');
      expect(app.isValidating).toBe(false);
    });

    it('should handle API key validation error with other status', () => {
      vi.spyOn(chessApiService, 'saveApiKey').mockReturnValue(throwError(() => ({ status: 500 })));
      app.tempApiKey = 'some-key';

      app.saveApiKey();

      expect(app.validationError).toContain('Failed to validate');
      expect(app.isValidating).toBe(false);
    });
  });

  describe('Auto Play', () => {
    let fixture: any;
    let app: AppComponent;

    beforeEach(() => {
      fixture = TestBed.createComponent(AppComponent);
      app = fixture.componentInstance;
      (app as any).cg = {
        set: vi.fn(),
        cancelPremove: vi.fn(),
        playPremove: vi.fn(),
        state: { lastMove: undefined }
      };
    });

    it('should toggle auto play state', () => {
      app.isAutoPlayPaused = true;

      app.toggleAutoPlay();
      expect(app.isAutoPlayPaused).toBe(false);

      app.toggleAutoPlay();
      expect(app.isAutoPlayPaused).toBe(true);
    });
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
          enabled: true
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

    it('should not go to previous if already at first move', () => {
      const initialIndex = app.historyIndex;

      app.goToPrevious();

      expect(app.historyIndex).toBe(initialIndex);
    });

    it('should not go to next if already at last move', () => {
      const initialIndex = app.historyIndex;

      app.goToNext();

      expect(app.historyIndex).toBe(initialIndex);
    });
  });
});
