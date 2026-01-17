import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { MoveResponse } from '../models/move-response';

@Injectable({
    providedIn: 'root'
})
export class ChessApiService {
    private http = inject(HttpClient);
    private apiUrl = 'http://localhost:8000';

    checkHealth(): Observable<any> {
        return this.http.get<any>(`${this.apiUrl}/health`);
    }

    saveApiKey(apiKey: string): Observable<any> {
        return this.http.post(`${this.apiUrl}/config/api-key`, { api_key: apiKey });
    }

    requestMove(fen: string): Observable<MoveResponse> {
        return this.http.post<MoveResponse>(`${this.apiUrl}/move`, { fen });
    }
}
