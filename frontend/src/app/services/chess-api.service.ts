import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { MoveResponse } from '../models/move-response';

@Injectable({
    providedIn: 'root'
})
export class ChessApiService {
    private http = inject(HttpClient);
    private apiUrl = 'http://localhost:8000';
    private readonly STORAGE_KEY = 'openai_api_key';

    checkHealth(): Observable<any> {
        return this.http.get<any>(`${this.apiUrl}/health`, { headers: this.getHeaders() });
    }

    saveApiKey(apiKey: string): Observable<any> {
        // Validate key with backend before saving
        return this.http.post(`${this.apiUrl}/config/api-key`, {}, {
            headers: { 'X-OpenAI-Key': apiKey }
        }).pipe(
            tap(() => localStorage.setItem(this.STORAGE_KEY, apiKey))
        );
    }

    getModels(): Observable<string[]> {
        return this.http.get<string[]>(`${this.apiUrl}/config/models`, { headers: this.getHeaders() });
    }

    requestMove(fen: string, model?: string): Observable<MoveResponse> {
        return this.http.post<MoveResponse>(`${this.apiUrl}/move`, { fen, model }, { headers: this.getHeaders() });
    }

    getStoredApiKey(): string | null {
        return localStorage.getItem(this.STORAGE_KEY);
    }

    private getHeaders(): { [header: string]: string } {
        const apiKey = this.getStoredApiKey();
        return apiKey ? { 'X-OpenAI-Key': apiKey } : {};
    }
}
