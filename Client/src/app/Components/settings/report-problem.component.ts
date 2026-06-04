import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { NotificationService } from '../../Services/notification.service';
import { NavbarComponent } from '../navbar/navbar.component';
import { FooterComponent } from '../footer/footer.component';

@Component({
  selector: 'app-report-problem',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule, NavbarComponent, FooterComponent],
  templateUrl: './report-problem.component.html',
  styleUrls: ['./report-problem.component.scss']
})
export class ReportProblemComponent {
  subject = '';
  message = '';
  email = '';
  submitting = false;

  private api = 'http://localhost:3000/api';

  constructor(private http: HttpClient, private notification: NotificationService) {}

  submit() {
    if (!this.subject.trim() || !this.message.trim()) {
      this.notification.show('Compila oggetto e descrizione.', 'warning');
      return;
    }
    this.submitting = true;
    this.http.post<any>(`${this.api}/report`, { subject: this.subject.trim(), message: this.message.trim(), from: this.email.trim() })
      .subscribe({
        next: () => {
          this.notification.show('Segnalazione inviata. Grazie.', 'success');
          this.subject = '';
          this.message = '';
          this.email = '';
        },
        error: () => this.notification.show('Errore invio segnalazione.', 'error')
      }).add(() => this.submitting = false);
  }
}
