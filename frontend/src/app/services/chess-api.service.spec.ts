import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
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
        expect(req.request.body).toEqual({ api_key: apiKey });
        req.flush({});
    });

    it('should request move', () => {
        const fen = 'startpos';
        const mockResponse = { move: 'e2e4' };

        service.requestMove(fen).subscribe((response) => {
            expect(response).toEqual(mockResponse);
        });

        const req = httpMock.expectOne('http://localhost:8000/move');
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual({ fen });
        req.flush(mockResponse);
    });
});
