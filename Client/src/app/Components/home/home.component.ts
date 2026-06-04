import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { GeolocationService } from '../../Services/geolocation.service';
import { CemeteryService } from '../../Services/cemetery.service';
import { LeafletMapService } from '../../Services/leaflet-map.service';
import { Cemetery } from '../../Interfaces/Cemetery';
import { NavbarComponent } from '../navbar/navbar.component';
import { CookieBannerComponent } from '../cookie-banner/cookie-banner.component';
import { BottomBarComponent } from '../bottom-bar/bottom-bar.component';
import { FooterComponent } from '../footer/footer.component';
import { NotificationService } from '../../Services/notification.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule, CookieBannerComponent, NavbarComponent, FooterComponent],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit {
  cemeteries: (Cemetery & { distance?: number })[] = [];
  filteredCemeteries: (Cemetery & { distance?: number })[] = [];
  searchTerm = '';
  userPosition: { lat: number; lng: number } | null = null;
  errorMessage = '';
  loginSuccessMessage = '';
  showLoginSuccess = false;

  constructor(
    private geo: GeolocationService,
    private cemeteryService: CemeteryService,
    private mapService: LeafletMapService,
    private router: Router,
    private notification: NotificationService
  ) {}

  ngOnInit() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    this.checkLoginSuccess();
    this.geo.getCurrentPosition().then(pos => {
      this.userPosition = pos;
      if (this.cemeteries.length) {
        this.updateCemeteryDistances();
      }
      this.loadCemeteries();
    }).catch((err) => {
      this.errorMessage = typeof err === 'string'
        ? err
        : 'Impossibile ottenere la posizione. Controlla i permessi nel browser.';
      this.loadCemeteries();
    });
  }

  private loadCemeteries() {
    this.cemeteryService.getAllCemeteries().subscribe({
      next: async (data) => {
        this.cemeteries = data.map(cem => ({
          ...cem,
          distance: this.userPosition ? this.calculateDistance(this.userPosition, cem) : undefined
        }));

        this.filteredCemeteries = [...this.cemeteries];

        if (this.userPosition) {
          await this.updateCemeteryRouteDistances();
        }

        console.log(this.cemeteries);
      },
      error: (err) => {
        console.error('Errore caricamento cimiteri', err);
        this.errorMessage = 'Impossibile caricare i cimiteri. Riprova più tardi.';
      }
    });
  }

  private async updateCemeteryRouteDistances() {
    if (!this.userPosition || !this.cemeteries.length) {
      return;
    }

    try {
      const destinations = this.cemeteries.map(cem => ({ lat: cem.lat, lng: cem.lng }));
      const distances = await this.mapService.getRouteDistances(this.userPosition, destinations);

      this.cemeteries = this.cemeteries.map((cem, index) => ({
        ...cem,
        distance: distances[index] != null ? distances[index] : cem.distance
      }));

      this.filteredCemeteries = this.filteredCemeteries.map(cem => {
        const index = this.cemeteries.findIndex(item => item._id === cem._id);
        return {
          ...cem,
          distance: index >= 0 ? this.cemeteries[index].distance : cem.distance
        };
      });

      this.cemeteries.sort((a, b) => (a.distance || 0) - (b.distance || 0));
      this.filteredCemeteries.sort((a, b) => (a.distance || 0) - (b.distance || 0));
    } catch (error) {
      console.warn('Impossibile calcolare la distanza in base al percorso:', error);
    }
  }

  private calculateDistance(pos: { lat: number; lng: number }, cem: Cemetery): number {
    const [cemLng, cemLat] = cem.location.coordinates;
    const R = 6371; // km
    const dLat = (cemLat - pos.lat) * Math.PI / 180;
    const dLng = (cemLng - pos.lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(pos.lat * Math.PI / 180) * Math.cos(cemLat * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private updateCemeteryDistances() {
    if (!this.userPosition) {
      return;
    }

    this.cemeteries = this.cemeteries.map(cem => ({
      ...cem,
      distance: this.calculateDistance(this.userPosition!, cem)
    }));

    this.filteredCemeteries = this.filteredCemeteries.map(cem => ({
      ...cem,
      distance: this.calculateDistance(this.userPosition!, cem)
    }));

    this.cemeteries.sort((a, b) => (a.distance || 0) - (b.distance || 0));
    this.filteredCemeteries.sort((a, b) => (a.distance || 0) - (b.distance || 0));
  }

  goToDetail(id: string | undefined) {
  if (id) {
    this.router.navigate(['/detail', id]);
  } else {
    console.error('ID cimitero non valido');
  }
}

  getGoogleMapsLink(cem: Cemetery): string {
    const destination = `${cem.lat},${cem.lng}`;
    if (!this.userPosition) {
      return `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
    }
    const origin = `${this.userPosition.lat},${this.userPosition.lng}`;
    return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`;
  }

  goToScan() {
    this.router.navigate(['/scan']);
  }

  goToHome() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  goToSettings() {
    this.notification.show('Impostazioni in arrivo (lingua, tema, privacy...)', 'info');
  }

  searchCemeteries(): void {
    const term = this.searchTerm.trim().toLowerCase();
    if (!term) {
      this.filteredCemeteries = [...this.cemeteries];
      this.errorMessage = '';
      return;
    }

    const filtered = this.cemeteries.filter(cem => {
      const name = cem.name.toLowerCase();
      const city = (cem.city || '').toLowerCase();
      const desc = (cem.description || '').toLowerCase();
      return name.includes(term) || city.includes(term) || desc.includes(term);
    });

    if (filtered.length === 0) {
      this.errorMessage = `Nessun risultato trovato per "${this.searchTerm.trim()}". Verifica la città o il nome del cimitero.`;
      this.filteredCemeteries = [];
      return;
    }

    this.filteredCemeteries = filtered.sort((a, b) => (a.distance || 0) - (b.distance || 0));
    this.errorMessage = '';
  }

  private findCityLocation(cityName: string): { lat: number; lng: number } | null {
    // Cerca tra i cimiteri per trovare una corrispondenza della città
    const matchingCemeteries = this.cemeteries.filter(cem => {
      const city = (cem.city || '').toLowerCase();
      const country = (cem.country || '').toLowerCase();
      const address = (cem.address || '').toLowerCase();
      
      return city.includes(cityName) || country.includes(cityName) || address.includes(cityName);
    });
    
    if (matchingCemeteries.length > 0) {
      // Calcola il baricentro di tutti i cimiteri trovati nella città
      const avgLat = matchingCemeteries.reduce((sum, cem) => sum + cem.location.coordinates[1], 0) / matchingCemeteries.length;
      const avgLng = matchingCemeteries.reduce((sum, cem) => sum + cem.location.coordinates[0], 0) / matchingCemeteries.length;
      return { lat: avgLat, lng: avgLng };
    }
    
    return null;
  }

  private calculateSearchScore(cem: Cemetery, term: string): number {
    const location = String(cem.location ?? '').toLowerCase();
    const name = cem.name.toLowerCase();
    let score = 0;

    if (location === term) score += 100;
    if (location.includes(term)) score += 75;
    if (name.includes(term)) score += 30;
    if (location.split(' ').some(part => part === term)) score += 20;

    return score;
  }

  private checkLoginSuccess(): void {
    const message = sessionStorage.getItem('loginSuccessMessage');
    if (message) {
      this.loginSuccessMessage = message;
      this.showLoginSuccess = true;
      sessionStorage.removeItem('loginSuccessMessage');
      setTimeout(() => this.showLoginSuccess = false, 4000);
    }
  }

  closeError() {
    this.errorMessage = '';
  }
}