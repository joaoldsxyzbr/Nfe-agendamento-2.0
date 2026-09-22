import {
  accessKeySelector,
  consultButtonSelector,
  isCaptchaResponseReady,
  isDownloadLabel,
  isOfficialConsultUrl,
  isOfficialDownloadUrl,
} from './portal-dom';
import { PORTAL_ORIGIN, type PortalExtensionState } from './protocol';

declare const chrome: any;

const READY_ATTEMPTS = 4;
const READY_RETRY_DELAY_MS = 250;
const MESSAGE_ATTEMPTS = 2;
const MESSAGE_RETRY_DELAY_MS = 200;
const FALLBACK_TICK_MS = 1_000;
const RESULT_TIMEOUT_MS = 90_000;
const DOWNLOAD_TIMEOUT_MS = 30_000;

let accessKey = '';
let portalState: PortalExtensionState | '' = '';
let consultTriggered = false;
let downloadTriggered = false;
let submittedAt: number | null = null;
let downloadRequestedAt: number | null = null;
let resultTimeoutReported = false;
let downloadTimeoutReported = false;
let tickRunning = false;
let tickScheduled = false;

void initialize();

async function initialize(): Promise<void> {
  try {
    if (location.origin !== PORTAL_ORIGIN || !location.pathname.toLowerCase().startsWith('/portal/')) {
      return;
    }

    const response = await sendReadyWithRetry();
    if (!response || typeof response.accessKey !== 'string') return;
    accessKey = response.accessKey;
    portalState = isPortalState(response.state) ? response.state : 'waiting_user';
    const stateChangedAt = validTimestampOrNow(response.stateChangedAt);

    if (portalState === 'submitting') {
      submittedAt = stateChangedAt;
    } else if (portalState === 'waiting_result') {
      downloadRequestedAt = stateChangedAt;
      downloadTriggered = true;
    }

    fillAccessKey();
    installDomWatchers();
    scheduleTick();
  } catch {
    // O Portal continua utilizável manualmente se o background não responder após as tentativas limitadas.
  }
}

function installDomWatchers(): void {
  const root = document.documentElement;
  if (root) {
    const observer = new MutationObserver(() => scheduleTick());
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
    });
  }

  document.addEventListener('input', scheduleTick, true);
  document.addEventListener('change', scheduleTick, true);
  window.setInterval(scheduleTick, FALLBACK_TICK_MS);
}

function scheduleTick(): void {
  if (tickScheduled) return;
  tickScheduled = true;

  queueMicrotask(() => {
    tickScheduled = false;
    void runTick();
  });
}

async function runTick(): Promise<void> {
  if (tickRunning) return;
  tickRunning = true;

  try {
    await tick();
  } finally {
    tickRunning = false;
  }
}

async function tick(): Promise<void> {
  if (!accessKey || location.origin !== PORTAL_ORIGIN) return;

  fillAccessKey();

  if (portalState === 'submitting') {
    if (!downloadTriggered) {
      const control = findDownloadControl();
      if (control) {
        try {
          const armed = await sendPortalMessageWithRetry({ source: 'portal', type: 'download_ready' });
          if (!armed?.armed) return;

          downloadTriggered = true;
          portalState = 'waiting_result';
          downloadRequestedAt = Date.now();
          control.click();
          return;
        } catch {
          return;
        }
      }
    }

    if (
      submittedAt !== null &&
      !resultTimeoutReported &&
      Date.now() - submittedAt >= RESULT_TIMEOUT_MS
    ) {
      resultTimeoutReported = true;
      try {
        await sendPortalMessageWithRetry({ source: 'portal', type: 'result_timeout' });
      } catch {
        resultTimeoutReported = false;
      }
    }
    return;
  }

  if (
    portalState === 'waiting_result' &&
    downloadRequestedAt !== null &&
    !downloadTimeoutReported &&
    Date.now() - downloadRequestedAt >= DOWNLOAD_TIMEOUT_MS
  ) {
    downloadTimeoutReported = true;
    try {
      await sendPortalMessageWithRetry({ source: 'portal', type: 'download_timeout' });
    } catch {
      downloadTimeoutReported = false;
    }
    return;
  }

  if (!consultTriggered && portalState === 'waiting_user' && isOfficialConsultUrl(location.href)) {
    const captchaResponse = document.querySelector<HTMLTextAreaElement>('[name="h-captcha-response"]');
    const consultButton = document.querySelector<HTMLElement>(consultButtonSelector);
    if (
      captchaResponse &&
      isCaptchaResponseReady(captchaResponse.value) &&
      consultButton &&
      !isDisabled(consultButton)
    ) {
      try {
        const submitted = await sendPortalMessageWithRetry({ source: 'portal', type: 'submitting' });
        if (!submitted?.ok) return;

        consultTriggered = true;
        portalState = 'submitting';
        submittedAt = Date.now();
        consultButton.click();
      } catch {
        // O próximo evento/fallback periódico pode tentar novamente sem duplicar clique.
      }
    }
  }
}

async function sendReadyWithRetry(): Promise<any> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < READY_ATTEMPTS; attempt += 1) {
    try {
      return await chrome.runtime.sendMessage({ source: 'portal', type: 'ready' });
    } catch (error) {
      lastError = error;
      if (attempt < READY_ATTEMPTS - 1) {
        await delay(READY_RETRY_DELAY_MS);
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('A extensão não conseguiu reconectar ao Portal.');
}

async function sendPortalMessageWithRetry(message: Record<string, unknown>): Promise<any> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < MESSAGE_ATTEMPTS; attempt += 1) {
    try {
      return await chrome.runtime.sendMessage(message);
    } catch (error) {
      lastError = error;
      if (attempt < MESSAGE_ATTEMPTS - 1) {
        await delay(MESSAGE_RETRY_DELAY_MS);
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('A extensão não respondeu ao Portal.');
}

function delay(milliseconds: number): Promise<void> {
  return new Promise<void>((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

function validTimestampOrNow(value: unknown): number {
  const now = Date.now();
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= now + 60_000
    ? value
    : now;
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

function isPortalState(value: unknown): value is PortalExtensionState {
  return typeof value === 'string' && [
    'opening',
    'loading_portal',
    'waiting_user',
    'submitting',
    'waiting_result',
    'fetching_xml',
    'completed',
    'cancelled',
    'failed',
  ].includes(value);
}
