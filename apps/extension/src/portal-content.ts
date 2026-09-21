import {
  accessKeySelector,
  consultButtonSelector,
  isCaptchaResponseReady,
  isDownloadLabel,
  isOfficialDownloadUrl,
} from './portal-dom';
import { PORTAL_ORIGIN } from './protocol';

declare const chrome: any;

let accessKey = '';
let consultTriggered = false;
let downloadTriggered = false;

void initialize();

async function initialize(): Promise<void> {
  try {
    if (location.origin !== PORTAL_ORIGIN || !location.pathname.toLowerCase().startsWith('/portal/')) {
      return;
    }

    const response = await chrome.runtime.sendMessage({ source: 'portal', type: 'ready' });
    if (!response || typeof response.accessKey !== 'string') return;
    accessKey = response.accessKey;

    fillAccessKey();
    window.setInterval(() => void tick(), 250);
  } catch {
    // O background pode estar reiniciando; uma nova navegação reinstala o content script.
  }
}

async function tick(): Promise<void> {
  if (!accessKey || location.origin !== PORTAL_ORIGIN) return;

  fillAccessKey();

  if (!consultTriggered) {
    const captchaResponse = document.querySelector<HTMLTextAreaElement>('[name="h-captcha-response"]');
    const consultButton = document.querySelector<HTMLElement>(consultButtonSelector);
    if (
      captchaResponse &&
      isCaptchaResponseReady(captchaResponse.value) &&
      consultButton &&
      !isDisabled(consultButton)
    ) {
      consultTriggered = true;
      await chrome.runtime.sendMessage({ source: 'portal', type: 'submitting' });
      consultButton.click();
      return;
    }
  }

  if (!downloadTriggered) {
    const control = findDownloadControl();
    if (!control) return;

    const armed = await chrome.runtime.sendMessage({ source: 'portal', type: 'download_ready' });
    if (!armed?.armed) return;

    downloadTriggered = true;
    control.click();
  }
}

function fillAccessKey(): void {
  const input = document.querySelector<HTMLInputElement>(accessKeySelector);
  if (!input || input.value === accessKey) return;
  input.value = accessKey;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.focus();
}

function findDownloadControl(): HTMLElement | null {
  const controls = Array.from(
    document.querySelectorAll<HTMLElement>('a[href], button, input[type="button"], input[type="submit"]'),
  );

  for (const control of controls) {
    if (control instanceof HTMLAnchorElement && control.href && isOfficialDownloadUrl(control.href)) {
      return control;
    }
  }

  return controls.find((control) => {
    const candidate = control instanceof HTMLInputElement ? control.value : control.textContent;
    return isDownloadLabel(candidate);
  }) ?? null;
}

function isDisabled(element: HTMLElement): boolean {
  return element instanceof HTMLButtonElement || element instanceof HTMLInputElement
    ? element.disabled
    : element.getAttribute('aria-disabled') === 'true';
}
