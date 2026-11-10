// Chrome's install prompt, as an explicit state so the home page can offer
// an Install button only when pressing it will actually do something.
//
//   unavailable ──beforeinstallprompt──▶ ready ──promptInstall()──▶ prompting
//        ▲                                                   │
//        └──────────── dismissed ◀───────────────────────────┤
//                                     installed ◀── accepted ┘ (or appinstalled)
//
// Chrome can fire beforeinstallprompt again later, which moves back to ready.

let state = 'unavailable';
let deferred = null;
const listeners = new Set();

function set(next) {
  state = next;
  listeners.forEach((fn) => fn(state));
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  if (state === 'installed') return;
  deferred = e;
  set('ready');
});

window.addEventListener('appinstalled', () => {
  deferred = null;
  set('installed');
});

export const installState = () => state;

export function onInstallChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Shows the prompt once; a second press while it's open does nothing.
export async function promptInstall() {
  if (state !== 'ready' || !deferred) return false;
  const event = deferred;
  deferred = null; // a prompt event can only be used once
  set('prompting');
  try {
    event.prompt();
    const { outcome } = await event.userChoice;
    set(outcome === 'accepted' ? 'installed' : 'unavailable');
    return outcome === 'accepted';
  } catch {
    set('unavailable');
    return false;
  }
}

export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches;
