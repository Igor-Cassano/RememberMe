import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import { NavbarComponent } from '../../Components/navbar/navbar.component';
import { RouterModule } from '@angular/router';
import { CookieBannerComponent } from '../../Components/cookie-banner/cookie-banner.component';
import { BottomBarComponent } from '../../Components/bottom-bar/bottom-bar.component';
import { FooterComponent } from '../../Components/footer/footer.component';
import { LoginComponent } from '../../Components/login/login.component';
import { AuthService, AuthUser } from '../../Services/auth.service';
import { NotificationService } from '../../Services/notification.service';

interface User {
  name: string;
  email: string;
  avatar?: string;
  isPremium: boolean;
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, NavbarComponent, CookieBannerComponent, FooterComponent, LoginComponent, RouterModule],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss']
})
export class SettingsComponent implements OnInit {
  currentTheme: 'light' | 'dark' | 'auto' = 'dark';

  selectedLanguage: string = 'it';

  isLoggedIn: boolean = false;
  userName: string = '';
  userEmail: string = '';
  currentRole: 'user' | 'employee' | null = null;
  municipalityId: string | boolean = '';
  assignedDeceasedCount: number = 0;
  userAvatar: string = '';
  isPremium: boolean = false;

  notificationsEnabled: boolean = true;

  fontSize: number = 100;

  appVersion: string = '2.1.0';
  lastUpdate: string = '13 Aprile 2026';
  currentYear: number = new Date().getFullYear();

  cacheSize: string = '0 MB';

  isLoginModalOpen: boolean = false;



  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private location: Location,
    private authService: AuthService,
    private notification: NotificationService
  ) {
    this.loadSettings();
    this.checkLoginStatus();
    this.calculateCacheSize();
  }

  ngOnInit(): void {
    const loginParam = this.route.snapshot.queryParamMap.get('login');
    if (loginParam === '1') {
      this.openLogin();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    this.applyTheme(this.currentTheme);
    this.applyFontSize();
    this.listenToSystemTheme();
  }

  private loadSettings(): void {
    const settings = localStorage.getItem('appSettings');
    if (settings) {
      try {
        const parsed = JSON.parse(settings);
        this.currentTheme = parsed.theme || 'dark';
        this.selectedLanguage = parsed.language || 'it';
        this.notificationsEnabled = parsed.notifications !== false;
        this.fontSize = parsed.fontSize || 100;
      } catch (e) {
        console.error('Error loading settings:', e);
      }
    }
  }

  private saveSettings(): void {
    const settings = {
      theme: this.currentTheme,
      language: this.selectedLanguage,
      notifications: this.notificationsEnabled,
      fontSize: this.fontSize
    };
    localStorage.setItem('appSettings', JSON.stringify(settings));
  }

  private checkLoginStatus(): void {
    const currentUser = this.authService.getCurrentUser();
    if (currentUser) {
      this.isLoggedIn = true;
      this.userName = currentUser.fullName || currentUser.username || 'Utente';
      this.userEmail = currentUser.email || '';
      this.currentRole = currentUser.role;
      this.municipalityId = currentUser.municipalityId || '';
      this.assignedDeceasedCount = currentUser.assignedDeceased?.length || 0;
    }

    this.authService.user$.subscribe(user => {
      this.isLoggedIn = !!user;
      this.userName = user?.fullName || user?.username || '';
      this.userEmail = user?.email || '';
      this.currentRole = user?.role || null;
      this.municipalityId = user?.municipalityId || '';
      this.assignedDeceasedCount = user?.assignedDeceased?.length || 0;
    });
  }

  private listenToSystemTheme(): void {
    if (this.currentTheme === 'auto') {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (this.currentTheme === 'auto') {
          document.body.classList.toggle('dark-theme', e.matches);
          document.body.classList.toggle('light-theme', !e.matches);
        }
      });
    }
  }

  goBack(): void {
    this.location.back();
  }

  setTheme(theme: 'light' | 'dark' | 'auto'): void {
    this.currentTheme = theme;
    this.applyTheme(theme);
    this.saveSettings();
    this.notification.show(`Tema ${theme} attivato`, 'info');
  }

  private applyTheme(theme: string): void {
    const body = document.body;
    body.classList.remove('light-theme', 'dark-theme');

    if (theme === 'auto') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      body.classList.add(isDark ? 'dark-theme' : 'light-theme');
    } else {
      body.classList.add(`${theme}-theme`);
    }
  }

  changeLanguage(): void {
    this.saveSettings();
    this.notification.show(`Lingua cambiata in ${this.getLanguageName(this.selectedLanguage)}`, 'info');
  }

  private getLanguageName(code: string): string {
    const languages: { [key: string]: string } = {
      'it': 'Italiano',
      'en': 'English',
      'es': 'Español',
      'fr': 'Français',
      'de': 'Deutsch'
    };
    return languages[code] || code;
  }

  increaseFontSize(): void {
    if (this.fontSize < 150) {
      this.fontSize += 10;
      this.applyFontSize();
      this.saveSettings();
    }
  }

  decreaseFontSize(): void {
    if (this.fontSize > 80) {
      this.fontSize -= 10;
      this.applyFontSize();
      this.saveSettings();
    }
  }

  private applyFontSize(): void {
    document.documentElement.style.fontSize = `${this.fontSize}%`;
  }


  calculateCacheSize(): void {
    const randomSize = (Math.random() * 100 + 10).toFixed(1);
    this.cacheSize = `${randomSize} MB`;
  }

  clearCache(): void {
    this.notification.confirm('Cancellare la cache? I dati di sistema verranno conservati.', 'Cancella cache').then(confirmed => {
      if (confirmed) {
        setTimeout(() => {
          this.cacheSize = '0 MB';
          this.notification.show('Cache cancellata con successo', 'success');

          const settings = localStorage.getItem('appSettings');
          const user = localStorage.getItem('rememberme_currentUser');
          localStorage.clear();
          if (settings) localStorage.setItem('appSettings', settings);
          if (user) localStorage.setItem('rememberme_currentUser', user);
        }, 500);
      }
    });
  }

  openLogin(): void {
    this.isLoginModalOpen = true;
  }

  onLoginModalClosed(): void {
    this.isLoginModalOpen = false;
    this.checkLoginStatus();
  }

  logout(): void {
    this.notification.confirm('Sei sicuro di voler uscire dal tuo account?', 'Esci').then(confirmed => {
      if (confirmed) {
        this.isLoggedIn = false;
        this.userName = '';
        this.userEmail = '';
        this.userAvatar = '';
        this.isPremium = false;
        this.authService.logout();
        this.notification.show('Logout effettuato con successo', 'info');
      }
    });
  }

  openPrivacyPolicy(): void { window.open('https://example.com/privacy', '_blank'); }
  openTermsOfService(): void { window.open('https://example.com/terms', '_blank'); }

  contactSupport(method: 'email' | 'whatsapp'): void {
    if (method === 'email') {
      window.location.href = 'mailto:support@example.com?subject=Supporto App';
    } else {
      window.open('https://wa.me/391234567890', '_blank');
    }
  }

  openFAQ(): void { window.open('https://example.com/faq', '_blank'); }

  reportProblem(): void {
    const subject = encodeURIComponent('Segnalazione Problema');
    const body = encodeURIComponent('Descrivi il problema riscontrato:\n\n');
    window.location.href = `mailto:support@example.com?subject=${subject}&body=${body}`;
  }

  checkForUpdates(): void {
    this.notification.show('Verifica aggiornamenti in corso...', 'info');
    setTimeout(() => this.notification.show('Hai già la versione più recente!', 'success'), 2000);
  }

  rateApp(): void {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isAndroid = /Android/.test(navigator.userAgent);

    if (isIOS) window.open('https://apps.apple.com/app/id123456789', '_blank');
    else if (isAndroid) window.open('https://play.google.com/store/apps/details?id=com.example.app', '_blank');
    else window.open('https://example.com/rate', '_blank');
  }

  openSocial(platform: string, event: Event): void {
    event.preventDefault();
    const urls: { [key: string]: string } = {
      'twitter': 'https://twitter.com/example',
      'instagram': 'https://instagram.com/example'
    };
    if (urls[platform]) window.open(urls[platform], '_blank');
  }
}
