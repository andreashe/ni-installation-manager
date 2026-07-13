import fs from 'node:fs';

/** Poll interval for tailing a worker's progress file. */
export const PROGRESS_POLL_MS = 250;

/** Silence window before another "still waiting" heartbeat is emitted. */
const HEARTBEAT_SILENCE_MS = 3000;

/**
 * Poll a JSONL progress file written by an elevated worker and hand every
 * NEW line to `onLine` (TODO8, shared by uninstall and restore jobs).
 * While the worker has not produced any output yet (UAC dialog open,
 * elevated Electron instance still booting), `onWaiting` fires every few
 * seconds with the elapsed time so the job visibly does not hang.
 * Returns a stop function.
 */
export function tailJsonlFile(
  filePath: string,
  onLine: (rawLine: string) => void,
  onWaiting: (secondsSinceStart: number) => void,
): () => void {
  let consumedLines = 0;
  let workerSeen = false;
  const startedAt = Date.now();
  let lastHeartbeatAt = startedAt;

  const heartbeatIfSilent = () => {
    if (workerSeen || Date.now() - lastHeartbeatAt < HEARTBEAT_SILENCE_MS) {
      return;
    }
    lastHeartbeatAt = Date.now();
    onWaiting(Math.round((Date.now() - startedAt) / 1000));
  };

  const timer = setInterval(() => {
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      heartbeatIfSilent(); // worker has not created the file yet
      return;
    }
    const lines = content.split('\n').filter((line) => line.trim() !== '');
    if (lines.length > 0) {
      workerSeen = true;
    } else {
      heartbeatIfSilent();
    }
    for (const line of lines.slice(consumedLines)) {
      onLine(line);
    }
    consumedLines = lines.length;
  }, PROGRESS_POLL_MS);
  return () => clearInterval(timer);
}
