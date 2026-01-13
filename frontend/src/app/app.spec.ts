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
});
