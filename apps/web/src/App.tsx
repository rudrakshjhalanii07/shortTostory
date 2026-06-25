import { useCallback, useEffect, useRef, useState } from 'react';
import type { CardResult } from '@shortstory/shared';
import { createJob, getJobStatus } from './api';
import { shareCard, type ShareOutcome } from './share';
import { InstallButton } from './InstallButton';
import { TrustSection } from './TrustSection';

type View =
  | { name: 'home' }
  | { name: 'processing'; jobId: string; pollIntervalMs: number }
  | { name: 'result'; card: CardResult };

const STAGE_LABEL: Record<string, string> = {
  fetching_metadata: 'Fetching video details…',
  downloading_thumbnail: 'Downloading thumbnail…',
  rendering_card: 'Rendering your card…',
  uploading_result: 'Finishing up…',
};

export function App() {
  const [view, setView] = useState<View>({ name: 'home' });
  const [error, setError] = useState<string | null>(null);

  const goHome = useCallback(() => {
    setError(null);
    setView({ name: 'home' });
  }, []);

  return (
    <main className="app">
      <header className="brand">
        <h1>ShortStory</h1>
      </header>

      {error && (
        <div className="banner banner--error" role="alert">
          {error}
        </div>
      )}

      {view.name === 'home' && (
        <HomeView
          onSubmitted={(jobId, pollIntervalMs) =>
            setView({ name: 'processing', jobId, pollIntervalMs })
          }
          onError={setError}
        />
      )}

      {view.name === 'processing' && (
        <ProcessingView
          jobId={view.jobId}
          pollIntervalMs={view.pollIntervalMs}
          onDone={(card) => setView({ name: 'result', card })}
          onError={(msg) => {
            setError(msg);
            goHome();
          }}
        />
      )}

      {view.name === 'result' && (
        <ResultView card={view.card} onReset={goHome} />
      )}
    </main>
  );
}

// Extract a YouTube URL from Web Share Target query params (?text=… or ?url=…).
// Android passes the shared content here when the user picks the PWA from the
// share sheet.
function getSharedUrl(): string {
  const p = new URLSearchParams(window.location.search);
  return p.get('text') ?? p.get('url') ?? '';
}

function HomeView({
  onSubmitted,
  onError,
}: {
  onSubmitted: (jobId: string, pollIntervalMs: number) => void;
  onError: (msg: string) => void;
}) {
  const [url, setUrl] = useState(() => getSharedUrl());
  const [loading, setLoading] = useState(false);

  // Auto-submit immediately when the app is opened via share intent.
  useEffect(() => {
    const shared = getSharedUrl();
    if (!shared) return;
    // Clear the query string so a reload doesn't resubmit.
    window.history.replaceState(null, '', '/');
    onError('');
    setLoading(true);
    createJob(shared)
      .then(({ jobId, pollIntervalMs }) => onSubmitted(jobId, pollIntervalMs))
      .catch((err) =>
        onError(err instanceof Error ? err.message : 'Failed to create job.'),
      )
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    onError('');
    try {
      const { jobId, pollIntervalMs } = await createJob(trimmed);
      onSubmitted(jobId, pollIntervalMs);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to create job.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="panel" onSubmit={submit}>
      <label className="label" htmlFor="url">
        Paste a YouTube Shorts URL
      </label>
      <input
        id="url"
        className="input"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://www.youtube.com/shorts/…"
        inputMode="url"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />
      <button className="button" type="submit" disabled={loading || !url.trim()}>
        {loading ? 'Generating…' : 'Generate'}
      </button>
      <InstallButton />
      <TrustSection />
    </form>
  );
}

function ProcessingView({
  jobId,
  pollIntervalMs,
  onDone,
  onError,
}: {
  jobId: string;
  pollIntervalMs: number;
  onDone: (card: CardResult) => void;
  onError: (msg: string) => void;
}) {
  const [stage, setStage] = useState<string>('Starting…');
  // Keep the latest callbacks without restarting the poll loop.
  const doneRef = useRef(onDone);
  const errRef = useRef(onError);
  doneRef.current = onDone;
  errRef.current = onError;

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const status = await getJobStatus(jobId);
        if (!active) return;

        if (status.state === 'completed' && status.result) {
          doneRef.current(status.result);
          return;
        }
        if (status.state === 'failed') {
          errRef.current(status.error?.message ?? 'Rendering failed.');
          return;
        }
        if (status.progress) {
          setStage(STAGE_LABEL[status.progress.stage] ?? 'Working…');
        }
        timer = setTimeout(poll, pollIntervalMs);
      } catch (err) {
        if (!active) return;
        errRef.current(
          err instanceof Error ? err.message : 'Lost connection to the server.',
        );
      }
    };

    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [jobId, pollIntervalMs]);

  return (
    <div className="panel panel--center">
      <div className="spinner" aria-hidden />
      <p className="muted">{stage}</p>
    </div>
  );
}

function ResultView({
  card,
  onReset,
}: {
  card: CardResult;
  onReset: () => void;
}) {
  const [sharing, setSharing] = useState(false);
  const [outcome, setOutcome] = useState<ShareOutcome | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);

  const handleShare = async () => {
    setSharing(true);
    setShareError(null);
    try {
      const result = await shareCard(card.downloadUrl, card.attributionLinkUrl);
      setOutcome(result);
    } catch (err) {
      setShareError(
        err instanceof Error ? err.message : 'Could not share the card.',
      );
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="panel panel--center">
      <img className="card" src={card.downloadUrl} alt="Your attribution card" />

      <button className="button" onClick={handleShare} disabled={sharing}>
        {sharing ? 'Preparing…' : 'Share to Story'}
      </button>

      {outcome === 'shared' && (
        <p className="muted">
          Pick <strong>Instagram</strong> in the share sheet, then add it to your
          Story.
        </p>
      )}
      {outcome === 'downloaded' && (
        <p className="muted">
          Card saved to your device. Open Instagram, start a Story, and select it
          from your gallery.
        </p>
      )}
      {outcome === 'cancelled' && (
        <p className="muted">Share cancelled — tap the button to try again.</p>
      )}
      {shareError && <p className="muted error-text">{shareError}</p>}

      <button className="button button--ghost" onClick={onReset}>
        Make another
      </button>
    </div>
  );
}
