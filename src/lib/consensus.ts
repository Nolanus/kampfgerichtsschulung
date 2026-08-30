import { Participant, StramatelState, ShotclockState } from '@/types';

/**
 * Berechnet den statistischen Median einer Zahlenreihe.
 * Unempfindlich gegenüber extremen Ausreißern.
 */
export function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return sorted[mid];
  }
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Berechnet den Modus (den am häufigsten vorkommenden Wert / Mehrheitswert).
 */
export function calculateMode<T>(values: T[], fallback: T): T {
  if (values.length === 0) return fallback;
  const counts = new Map<T, number>();
  let maxCount = 0;
  let mostFrequent: T = values[0];

  for (const val of values) {
    const count = (counts.get(val) || 0) + 1;
    counts.set(val, count);
    if (count > maxCount) {
      maxCount = count;
      mostFrequent = val;
    }
  }

  return mostFrequent;
}

/**
 * Berechnet den Schwarm-Konsens für Zeitnehmer (Stramatel)
 */
export function computeConsensusStramatel(
  participants: Participant[],
  fallbackState?: StramatelState
): StramatelState {
  const defaultFallback: StramatelState = fallbackState || {
    gameTimeTenths: 10 * 60 * 10,
    isRunning: false,
    scoreHeim: 0,
    scoreGast: 0,
    foulsHeim: 0,
    foulsGast: 0,
    period: 1,
    timeoutsHeim: 0,
    timeoutsGast: 0,
  };

  const stramatelParticipants = participants.filter(
    (p) => (p.role === 'zeitnehmer' || (p.role as string) === 'stramatel') && p.stramatelState
  );

  if (stramatelParticipants.length === 0) {
    return defaultFallback;
  }

  const times = stramatelParticipants.map((p) => p.stramatelState!.gameTimeTenths);
  const runnings = stramatelParticipants.map((p) => p.stramatelState!.isRunning);
  const scoresHeim = stramatelParticipants.map((p) => p.stramatelState!.scoreHeim);
  const scoresGast = stramatelParticipants.map((p) => p.stramatelState!.scoreGast);
  const foulsHeim = stramatelParticipants.map((p) => p.stramatelState!.foulsHeim);
  const foulsGast = stramatelParticipants.map((p) => p.stramatelState!.foulsGast);
  const periods = stramatelParticipants.map((p) => p.stramatelState!.period);
  const timeoutsHeim = stramatelParticipants.map((p) => p.stramatelState!.timeoutsHeim);
  const timeoutsGast = stramatelParticipants.map((p) => p.stramatelState!.timeoutsGast);
  const countUps = stramatelParticipants.map((p) => Boolean(p.stramatelState?.isCountUp));

  return {
    gameTimeTenths: calculateMedian(times),
    isRunning: calculateMode(runnings, defaultFallback.isRunning),
    scoreHeim: calculateMode(scoresHeim, defaultFallback.scoreHeim),
    scoreGast: calculateMode(scoresGast, defaultFallback.scoreGast),
    foulsHeim: calculateMode(foulsHeim, defaultFallback.foulsHeim),
    foulsGast: calculateMode(foulsGast, defaultFallback.foulsGast),
    period: calculateMode(periods, defaultFallback.period),
    timeoutsHeim: calculateMode(timeoutsHeim, defaultFallback.timeoutsHeim),
    timeoutsGast: calculateMode(timeoutsGast, defaultFallback.timeoutsGast),
    isCountUp: calculateMode(countUps, Boolean(defaultFallback.isCountUp)),
    timeoutTenths: calculateMode(stramatelParticipants.map((p) => p.stramatelState?.timeoutTenths), defaultFallback.timeoutTenths),
    isTimeoutRunning: calculateMode(stramatelParticipants.map((p) => Boolean(p.stramatelState?.isTimeoutRunning)), Boolean(defaultFallback.isTimeoutRunning)),
  };
}

/**
 * Berechnet den Schwarm-Konsens für 24s Shotclock
 */
export function computeConsensusShotclock(
  participants: Participant[],
  fallbackState?: ShotclockState
): ShotclockState {
  const defaultFallback: ShotclockState = fallbackState || {
    shotclockTenths: 240,
    isRunning: false,
    mode: 'shotclock',
    savedShotclockTenths: undefined,
    isDisplayOff: false,
  };

  const shotclockParticipants = participants.filter(
    (p) => p.role === 'shotclock' && p.shotclockState
  );

  if (shotclockParticipants.length === 0) {
    return defaultFallback;
  }

  const times = shotclockParticipants.map((p) => p.shotclockState!.shotclockTenths);
  const runnings = shotclockParticipants.map((p) => p.shotclockState!.isRunning);
  const modes = shotclockParticipants.map((p) => p.shotclockState!.mode || 'shotclock');
  const displayOffs = shotclockParticipants.map((p) => Boolean(p.shotclockState!.isDisplayOff));

  return {
    shotclockTenths: calculateMedian(times),
    isRunning: calculateMode(runnings, defaultFallback.isRunning),
    mode: calculateMode(modes, defaultFallback.mode || 'shotclock'),
    isDisplayOff: calculateMode(displayOffs, Boolean(defaultFallback.isDisplayOff)),
    savedShotclockTenths: defaultFallback.savedShotclockTenths,
  };
}
