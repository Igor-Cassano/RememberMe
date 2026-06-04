import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { NavbarComponent } from '../navbar/navbar.component';
import { FooterComponent } from '../footer/footer.component';
import { AuthService } from '../../Services/auth.service';
import { NotificationService } from '../../Services/notification.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, NavbarComponent, FooterComponent],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss']
})
export class RegisterComponent {
  registerEmail = '';
  registerPassword = '';
  registerFullName = '';
  registerUsername = '';
  isSubmitting = false;

  constructor(
    private authService: AuthService,
    private notification: NotificationService,
    private router: Router
  ) {}

  handleRegister(event: Event): void {
    event.preventDefault();

    if (!this.registerEmail.trim() || !this.registerPassword.trim() || !this.registerFullName.trim()) {
      this.notification.show('Compila tutti i campi obbligatori prima di procedere.', 'warning');
      return;
    }

    this.isSubmitting = true;
    const payload = {
      username: this.registerUsername.trim() || this.registerFullName.trim(),
      fullName: this.registerFullName.trim(),
      email: this.registerEmail.trim().toLowerCase(),
      password: this.registerPassword,
      createdBy: 'SELF'
    };

    this.authService.register(payload).subscribe({
      next: () => {
        this.isSubmitting = false;
        this.notification.show('Registrazione completata. Controlla la posta per autenticare il tuo account.', 'success');
        this.router.navigate(['/verify-email'], { queryParams: { email: payload.email } });
      },
      error: () => {
        this.isSubmitting = false;
        this.notification.show('Registrazione non riuscita. Riprova tra qualche momento.', 'error');
      }
    });
  }
}