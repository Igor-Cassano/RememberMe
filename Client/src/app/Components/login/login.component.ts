import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../Services/auth.service';
import { NotificationService } from '../../Services/notification.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent {
  @Input() isOpen: boolean = false;
  @Output() modalClosed = new EventEmitter<void>();

  loginEmail: string = '';
  loginPassword: string = '';
  showForgot: boolean = false;
  forgotEmail: string = '';

  constructor(
    private router: Router,
    private authService: AuthService,
    private notification: NotificationService
  ) {}

  closeModal(): void {
    this.loginEmail = '';
    this.loginPassword = '';
    this.modalClosed.emit();
  }

  openForgotModal(): void {
    this.showForgot = true;
    this.forgotEmail = this.loginEmail || '';
  }

  closeForgot(): void {
    this.showForgot = false;
    this.forgotEmail = '';
  }

  handleForgot(event: Event): void {
    event.preventDefault();
    const email = (this.forgotEmail || '').trim().toLowerCase();
    if (!email) {
      this.notification.show('Inserisci l\'email per ricevere le istruzioni.', 'warning');
      return;
    }

    this.authService.forgotPassword(email).subscribe({
      next: () => {
        this.notification.show('Se l\'email è registrata, hai ricevuto le istruzioni.', 'info');
        this.closeForgot();
      },
      error: () => {
        this.notification.show('Errore nell\'invio. Riprova più tardi.', 'error');
      }
    });
  }

  handleLogin(event: Event): void {
    event.preventDefault();

    if (!this.loginEmail.trim() || !this.loginPassword.trim()) {
      this.notification.show('Per favore, compila email e password.', 'warning');
      return;
    }

    const email = this.loginEmail.trim().toLowerCase();

    this.authService.login(email, this.loginPassword).subscribe({
      next: (account) => {
        this.closeModal();
        this.notification.show(`Benvenuto ${account.fullName || account.username}! Accesso effettuato con successo.`, 'success');
      },
      error: (err) => {
        if (err.status === 403) {
          this.notification.show(err.error?.message || 'Email non verificata. Controlla la tua posta.', 'warning');
        } else {
          this.notification.show('Email o password non valide. Riprova.', 'error');
        }
        this.loginPassword = '';
      }
    });
  }
}
