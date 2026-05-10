let _registration: ServiceWorkerRegistration | null = null;
let _ignoreNextUpdate = false;

export function setSwRegistration(reg: ServiceWorkerRegistration): void {
  _registration = reg;
}

export function getSwRegistration(): ServiceWorkerRegistration | null {
  return _registration;
}

export function shouldIgnoreUpdate(): boolean {
  if (_ignoreNextUpdate) {
    _ignoreNextUpdate = false;
    return true;
  }
  return false;
}

export function checkForPwaUpdate(): void {
  _ignoreNextUpdate = true;
  _registration?.update();
  setTimeout(() => { _ignoreNextUpdate = false; }, 3000);
}
