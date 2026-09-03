const activeStreams = new Set<MediaStream>();

/**
 * Register an active MediaStream for global tracking and safe cleanup.
 */
export function registerMediaStream(stream: MediaStream): MediaStream {
  activeStreams.add(stream);
  const checkEnded = () => {
    const allEnded = stream.getTracks().every((t) => t.readyState === 'ended');
    if (allEnded) {
      activeStreams.delete(stream);
    }
  };
  stream.getTracks().forEach((t) => {
    t.addEventListener('ended', checkEnded, { once: true });
  });
  return stream;
}

/**
 * Forcibly stop every audio and video track on all tracked MediaStreams in the application.
 */
export function stopAllHardwareStreams(): void {
  activeStreams.forEach((stream) => {
    try {
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
          track.enabled = false;
        } catch (e) {
          // ignore
        }
      });
    } catch (e) {
      // ignore
    }
  });
  activeStreams.clear();
}

/**
 * Checks whether the browser document is currently in full-screen mode.
 */
export function isCurrentlyFullscreen(): boolean {
  if (typeof document === 'undefined') return false;
  const doc = document as any;
  return Boolean(
    document.fullscreenElement ||
    doc.webkitFullscreenElement ||
    doc.mozFullScreenElement ||
    doc.msFullscreenElement
  );
}

/**
 * Safely requests browser full-screen mode on the root document element.
 * Must be initiated from a user gesture (click/keypress) to succeed.
 */
export async function requestFullscreenSafe(): Promise<boolean> {
  try {
    if (typeof document === 'undefined') return false;
    const elem = document.documentElement as any;
    if (elem.requestFullscreen) {
      await elem.requestFullscreen();
    } else if (elem.webkitRequestFullscreen) {
      await elem.webkitRequestFullscreen();
    } else if (elem.mozRequestFullScreen) {
      await elem.mozRequestFullScreen();
    } else if (elem.msRequestFullscreen) {
      await elem.msRequestFullscreen();
    }
    return true;
  } catch (err) {
    console.warn('requestFullscreenSafe failed or was blocked by browser', err);
    return false;
  }
}

/**
 * Safely exits browser full-screen mode if active.
 */
export async function exitFullscreenSafe(): Promise<void> {
  try {
    const doc = document as any;
    if (
      document.fullscreenElement ||
      doc.webkitFullscreenElement ||
      doc.mozFullScreenElement ||
      doc.msFullscreenElement
    ) {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (doc.webkitExitFullscreen) {
        await doc.webkitExitFullscreen();
      } else if (doc.mozCancelFullScreen) {
        await doc.mozCancelFullScreen();
      } else if (doc.msExitFullscreen) {
        await doc.msExitFullscreen();
      }
    }
  } catch (err) {
    console.warn('exitFullscreenSafe failed or was blocked by browser', err);
  }
}

