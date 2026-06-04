import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { tap, catchError, switchMap } from 'rxjs/operators';
import { environment } from '../../Environments/environments'

export interface AuthUser {
  role: 'user' | 'employee';
  email: string;
  fullName?: string;
  username?: string;
  employeeId?: string;
  userId?: string;
  municipalityId?: string | boolean;
  assignedDeceased?: string[];
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly USER_KEY = 'rememberme_currentUser';
  private readonly API_URL = environment.apiUrl + '/api';

  private userSubject = new BehaviorSubject<AuthUser | null>(null);
  user$ = this.userSubject.asObservable();

  constructor(private http: HttpClient) {
    this.loadCurrentUser();
  }

  private loadCurrentUser(): void {
    const stored = localStorage.getItem(this.USER_KEY);
    if (stored) {
      try {
        this.userSubject.next(JSON.parse(stored) as AuthUser);
      } catch {
        this.userSubject.next(null);
      }
    }
  }

  private saveCurrentUser(user: AuthUser | null): void {
    if (user) {
      localStorage.setItem(this.USER_KEY, JSON.stringify(user));
      this.userSubject.next(user);
    } else {
      localStorage.removeItem(this.USER_KEY);
      this.userSubject.next(null);
    }
  }

  login(email: string, password: string): Observable<AuthUser> {
    return this.http.post<AuthUser>(`${this.API_URL}/users`, { email, password })
      .pipe(tap(user => this.saveCurrentUser(user)));
  }

  register(payload: { username: string; fullName: string; email: string; password: string; createdBy?: string }): Observable<any> {
    return this.http.post<any>(`${this.API_URL}/users/register`, payload);
  }

  forgotPassword(email: string): Observable<any> {
    return this.http.post<any>(`${this.API_URL}/users/forgot`, { email });
  }

  logout(): void {
    this.saveCurrentUser(null);
  }

  isLoggedIn(): boolean {
    return !!this.userSubject.value;
  }

  getCurrentUser(): AuthUser | null {
    return this.userSubject.value;
  }

  getUserRole(): 'user' | 'employee' | null {
    return this.userSubject.value?.role ?? null;
  }
}