import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { ChessApiService } from './chess-api.service';

describe('ChessApiService', () => {
    let service: ChessApiService;
    let httpMock: HttpTestingController;

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [
                ChessApiService,
                provideHttpClient(),
                provideHttpClientTesting(),
            ],
        });
        service = TestBed.inject(ChessApiService);
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
        httpMock.verify();
    });

    it('should be created', () => {
        expect(service).toBeTruthy();
    });

    it('should check health', () => {
        const mockResponse = { status: 'ok', openai_api_key_configured: true };

        service.checkHealth().subscribe((response) => {
            expect(response).toEqual(mockResponse);
        });

        const req = httpMock.expectOne('http://localhost:8000/health');
        expect(req.request.method).toBe('GET');
        req.flush(mockResponse);
    });

    it('should save API key', () => {
        const apiKey = 'test-key';

        service.saveApiKey(apiKey).subscribe((response) => {
            expect(response).toBeTruthy();
        });

        const req = httpMock.expectOne('http://localhost:8000/config/api-key');
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual({});
        expect(req.request.headers.get('X-OpenAI-Key')).toBe(apiKey);
        req.flush({});
    });

    it('should request move without model', () => {
        const fen = 'startpos';
        const mockResponse = { move: 'e2e4', san: 'e4' };

        service.requestMove(fen).subscribe((response) => {
            expect(response).toEqual(mockResponse);
        });

        const req = httpMock.expectOne('http://localhost:8000/move');
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual({ fen, model: undefined });
        req.flush(mockResponse);
    });

    it('should request move with model parameter', () => {
        const fen = 'startpos';
        const model = 'gpt-4o';
        const mockResponse = { move: 'e2e4', san: 'e4' };

        service.requestMove(fen, model).subscribe((response) => {
            expect(response).toEqual(mockResponse);
        });

        const req = httpMock.expectOne('http://localhost:8000/move');
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual({ fen, model });
        req.flush(mockResponse);
    });

    it('should get available models', () => {
        const mockModels = ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'];

        service.getModels().subscribe((response) => {
            expect(response).toEqual(mockModels);
        });

        const req = httpMock.expectOne('http://localhost:8000/config/models');
        expect(req.request.method).toBe('GET');
        req.flush(mockModels);
    });


    it('should include API key in headers if stored', () => {
        const apiKey = 'stored-api-key';
        vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(apiKey);

        service.getModels().subscribe();

        const req = httpMock.expectOne('http://localhost:8000/config/models');
        expect(req.request.headers.get('X-OpenAI-Key')).toBe(apiKey);
        req.flush([]);
    });
});
