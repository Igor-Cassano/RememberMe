import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { NavbarComponent } from '../navbar/navbar.component';
import { FooterComponent } from '../footer/footer.component';
import { NotificationService } from '../../Services/notification.service';

@Component({
  selector: 'app-verify-email',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, HttpClientModule, NavbarComponent, FooterComponent],
  templateUrl: './verify-email.component.html',
  styleUrls: ['./verify-email.component.scss']
})
export class VerifyEmailComponent implements OnInit {
  email = '';
  status: 'pending' | 'success' | 'error' | 'info' = 'pending';
  message = 'Stiamo elaborando la verifica dell\'account...';
  private api = 'http://localhost:3000/api';

  constructor(
    private route: ActivatedRoute,
    private http: HttpClient,
    private router: Router,
    private notification: NotificationService
  ) {}

  ngOnInit(): void {
    const token = this.route.snapshot.paramMap.get('token');
    const queryEmail = this.route.snapshot.queryParamMap.get('email');
    if (queryEmail) {
      this.email = queryEmail;
    }

    if (token) {
      this.verifyToken(token);
    } else {
      this.status = 'info';
      this.message = this.email
        ? `È stata inviata una email di autenticazione a ${this.email}. Controlla la posta e clicca sul link per attivare il tuo account.`
        : 'È stata inviata una email di autenticazione. Controlla la tua casella di posta e clicca il link per attivare il tuo account.';
    }
  }

  private verifyToken(token: string): void {
    this.status = 'pending';
    this.message = 'Verifica in corso...';

    this.http.get<any>(`${this.api}/users/verify/${token}`).subscribe({
      next: (res) => {
        this.status = 'success';
        this.message = res.message || 'Email verificata correttamente. Ora puoi effettuare il login.';
      },
      error: (err) => {
        this.status = 'error';
        this.message = err.error?.message || 'Impossibile verificare il link. Prova a richiedere nuovamente la verifica.';
        console.error('Errore verifica token:', err);
      }
    });
  }

  resendVerificationEmail(): void {
    const email = this.email.trim();
    if (!email) {
      this.notification.show('Inserisci l\'email per reinviare il link di verifica.', 'warning');
      return;
    }

    this.status = 'pending';
    this.message = 'Invio del link di verifica in corso...';

    this.http.post<any>(`${this.api}/users/resend-verification`, { email }).subscribe({
      next: (res) => {
        this.status = 'info';
        this.message = res.message || 'Link di verifica inviato. Controlla la tua casella di posta.';
        this.notification.show('Link di verifica reinviato.', 'success');
      },
      error: (err) => {
        this.status = 'error';
        this.message = err.error?.message || 'Errore durante il reinvio. Riprova più tardi.';
        console.error('Errore reinvio verifica:', err);
      }
    });
  }

  goHome(): void {
    this.router.navigate(['/']);
  }

  openLogin(): void {
    this.router.navigate(['/settings'], { queryParams: { login: '1' } });
  }
}
