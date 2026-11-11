export function startHeartbeatLoop(sendHeartbeat, {
  intervalMs = 15_000,
  onError = (error) => console.error("Worker heartbeat failed:", error.message)
} = {}) {
  let inFlight = false;
  let stopped = false;
  const timer = setInterval(async () => {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      await sendHeartbeat();
    } catch (error) {
      onError(error);
    } finally {
      inFlight = false;
    }
  }, intervalMs);
  timer.unref?.();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
