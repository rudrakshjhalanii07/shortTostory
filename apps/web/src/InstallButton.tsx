import { useEffect, useState } from 'react';

// Chrome/Android fire `beforeinstallprompt`; we stash the event and trigger it
// on a user click. iOS Safari never fires it, so there we show how to add the
// app from the Share menu. The button stays visible until the app is installed.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export function InstallButton() {
  const [promptEvent, setPromptEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => isStandalone());
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  // Already running as an installed app — confirm it instead of offering install.
  if (installed) {
    return (
      <p className="muted install__done">You already have our app installed :)</p>
    );
  }

  const handleClick = async () => {
    if (promptEvent) {
      await promptEvent.prompt();
      await promptEvent.userChoice;
      // The event can only be consumed once.
      setPromptEvent(null);
      return;
    }
    // No native prompt: reveal manual instructions.
    setShowHelp((v) => !v);
  };

  return (
    <div className="install">
      <button className="button button--install" onClick={handleClick}>
        Install app
      </button>
      {showHelp && !promptEvent && (
        <p className="muted">
          {isIos() ? (
            <>
              Tap the <strong>Share</strong> button in Safari, then choose{' '}
              <strong>Add to Home Screen</strong>.
            </>
          ) : (
            <>
              Open your browser menu (<strong>⋮</strong>) and choose{' '}
              <strong>Install app</strong> or <strong>Add to Home screen</strong>.
            </>
          )}
        </p>
      )}
    </div>
  );
}
