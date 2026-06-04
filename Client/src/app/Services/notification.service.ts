import { Injectable } from '@angular/core';

export type NotificationType = 'success' | 'warning' | 'info' | 'error';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  show(message: string, type: NotificationType = 'info'): void {
    const toast = document.createElement('div');
    toast.className = `global-toast toast-${type}`;
    toast.textContent = message;

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-exit');
      toast.addEventListener('animationend', () => {
        if (toast.parentElement) {
          toast.parentElement.removeChild(toast);
        }
      });
    }, 3200);
  }

  confirm(message: string, title: string = 'Conferma'): Promise<boolean> {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'notification-modal-overlay';
      modal.innerHTML = `
        <div class="notification-modal">
          <h3>${title}</h3>
          <p>${message}</p>
          <div class="modal-buttons">
            <button class="btn-cancel">Annulla</button>
            <button class="btn-confirm">Continua</button>
          </div>
        </div>
      `;

      const cancelBtn = modal.querySelector('.btn-cancel') as HTMLButtonElement;
      const confirmBtn = modal.querySelector('.btn-confirm') as HTMLButtonElement;

      const closeModal = (result: boolean) => {
        modal.remove();
        document.body.classList.remove('modal-open');
        resolve(result);
      };

      cancelBtn.addEventListener('click', () => closeModal(false));

      confirmBtn.addEventListener('click', () => closeModal(true));

      modal.addEventListener('click', (e: MouseEvent) => {
        if (e.target === modal) {
          closeModal(false);
        }
      });

      document.body.appendChild(modal);
      document.body.classList.add('modal-open');
    });
  }
}
