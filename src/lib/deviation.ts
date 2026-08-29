import { Participant, StramatelState, ShotclockState, Tolerances } from '@/types';

export type DeviationLevel = 0 | 1 | 2; // 0 = In Toleranz (Grün), 1 = Warnung (Gelb), 2 = Kritisch (Rot)

export interface ParticipantDeviationResult {
  level: DeviationLevel;
  timeLevel: DeviationLevel;
  stateLevel: DeviationLevel;
  scoreLevel: DeviationLevel;
  foulLevel: DeviationLevel;
  timeDiffSec: number | null;
  timeDeltaStr: string;
  isMaster: boolean;
  timeTooltip: string;
  deltaTooltip: string;
  scoreTooltip: string;
  foulTooltip: string;
  stateTooltip: string;
  overallTooltip: string;
  issues: string[];
}

export function getParticipantDeviation(
  participant: Participant,
  masterStramatel: StramatelState | undefined,
  masterShotclock: ShotclockState | undefined,
  tolerances: Tolerances,
  isMaster: boolean
): ParticipantDeviationResult {
  const isShotclock = participant.role === 'shotclock';

  if (isMaster) {
    const roleName = isShotclock ? '24s Shotclock' : 'Zeitnehmer';
    return {
      level: 0,
      timeLevel: 0,
      stateLevel: 0,
      scoreLevel: 0,
      foulLevel: 0,
      timeDiffSec: 0,
      timeDeltaStr: '—',
      isMaster: true,
      timeTooltip: `Master-Referenz (${roleName})`,
      deltaTooltip: `Master-Referenz (keine Abweichung)`,
      scoreTooltip: isShotclock ? 'Keine Punktezählung bei Shotclock' : 'Master-Referenz (Spielstand synchron)',
      foulTooltip: isShotclock ? 'Keine Teamfouls bei Shotclock' : 'Master-Referenz (Teamfouls synchron)',
      stateTooltip: 'Master-Referenz',
      overallTooltip: `Master-Referenz (${roleName})`,
      issues: [],
    };
  }

  let timeLevel: DeviationLevel = 0;
  let stateLevel: DeviationLevel = 0;
  let scoreLevel: DeviationLevel = 0;
  let foulLevel: DeviationLevel = 0;
  let timeDiffSec: number | null = null;
  let timeDeltaStr = '—';

  let timeTooltip = 'Keine Abweichung';
  let deltaTooltip = 'In Zeittoleranz';
  let scoreTooltip = isShotclock ? 'Keine Punktezählung (Shotclock)' : 'Spielstand synchron';
  let foulTooltip = isShotclock ? 'Keine Teamfouls (Shotclock)' : 'Teamfouls synchron';
  let stateTooltip = 'Status synchron';
  const issues: string[] = [];

  // Stramatel / Zeitnehmer
  if (!isShotclock) {
    if (participant.stramatelState && masterStramatel) {
      const pTimeSec = participant.stramatelState.gameTimeTenths / 10;
      const mTimeSec = masterStramatel.gameTimeTenths / 10;
      const rawDiff = pTimeSec - mTimeSec;
      const absDiff = Math.abs(rawDiff);
      timeDiffSec = rawDiff;
      timeDeltaStr = `${rawDiff >= 0 ? '+' : ''}${rawDiff.toFixed(1)}s`;

      const tolTime = Math.max(0.1, tolerances.gameClockSeconds);
      if (absDiff > tolTime * 2) {
        timeLevel = 2; // Stufe 2: Mehr als doppelte Toleranz
      } else if (absDiff > tolTime) {
        timeLevel = 1; // Stufe 1: Bis doppelte Toleranz
      }

      // Time tooltip
      let clockExplanation = '';
      if (absDiff < 0.05) {
        clockExplanation = 'Uhr synchron';
        deltaTooltip = `Uhr synchron (±0.0s, Toleranz: ±${tolTime.toFixed(1)}s)`;
      } else if (rawDiff > 0) {
        clockExplanation = `Uhr ${rawDiff.toFixed(1)}s voraus`;
        deltaTooltip = `Uhr ${rawDiff.toFixed(1)}s voraus (Toleranz: ±${tolTime.toFixed(1)}s)`;
      } else {
        clockExplanation = `Uhr ${Math.abs(rawDiff).toFixed(1)}s hinterher`;
        deltaTooltip = `Uhr ${Math.abs(rawDiff).toFixed(1)}s hinterher (Toleranz: ±${tolTime.toFixed(1)}s)`;
      }

      if (timeLevel > 0) {
        issues.push(`Spieluhr: ${clockExplanation}`);
      }
      timeTooltip = clockExplanation;

      // Uhr-Status Mismatch
      if (participant.stramatelState.isRunning !== masterStramatel.isRunning) {
        stateLevel = 1;
        stateTooltip = participant.stramatelState.isRunning
          ? 'Uhr läuft (Master gestoppt)'
          : 'Uhr gestoppt (Master läuft)';
        issues.push(`Uhr-Status: ${stateTooltip}`);
      } else {
        stateTooltip = participant.stramatelState.isRunning
          ? 'Uhr läuft synchron'
          : 'Uhr gestoppt synchron';
      }

      // Score comparison
      const diffHeim = participant.stramatelState.scoreHeim - masterStramatel.scoreHeim;
      const diffGast = participant.stramatelState.scoreGast - masterStramatel.scoreGast;
      const scoreDiffMax = Math.max(Math.abs(diffHeim), Math.abs(diffGast));
      const tolScore = tolerances.score;
      if (scoreDiffMax > tolScore + 1) {
        scoreLevel = 2;
      } else if (scoreDiffMax > tolScore) {
        scoreLevel = 1;
      }

      const scoreParts: string[] = [];
      if (diffHeim !== 0) {
        const text = `Heim ${diffHeim > 0 ? diffHeim : Math.abs(diffHeim)} Pkt ${diffHeim > 0 ? 'zu viel' : 'zu wenig'}`;
        scoreParts.push(text);
        if (scoreLevel > 0) {
          issues.push(`Punkte: ${text}`);
        }
      }
      if (diffGast !== 0) {
        const text = `Gast ${diffGast > 0 ? diffGast : Math.abs(diffGast)} Pkt ${diffGast > 0 ? 'zu viel' : 'zu wenig'}`;
        scoreParts.push(text);
        if (scoreLevel > 0) {
          issues.push(`Punkte: ${text}`);
        }
      }

      if (scoreParts.length > 0) {
        scoreTooltip = `${scoreParts.join('; ')} (Master: ${masterStramatel.scoreHeim} : ${masterStramatel.scoreGast})`;
      } else {
        scoreTooltip = `Spielstand synchron (${participant.stramatelState.scoreHeim} : ${participant.stramatelState.scoreGast})`;
      }

      // Fouls comparison
      const diffFoulsHeim = participant.stramatelState.foulsHeim - masterStramatel.foulsHeim;
      const diffFoulsGast = participant.stramatelState.foulsGast - masterStramatel.foulsGast;
      const foulDiffMax = Math.max(Math.abs(diffFoulsHeim), Math.abs(diffFoulsGast));
      const tolFouls = tolerances.fouls;
      if (foulDiffMax > tolFouls + 1) {
        foulLevel = 2;
      } else if (foulDiffMax > tolFouls) {
        foulLevel = 1;
      }

      const foulParts: string[] = [];
      if (diffFoulsHeim !== 0) {
        const word = Math.abs(diffFoulsHeim) === 1 ? 'Foul' : 'Fouls';
        const text = `Heim ${diffFoulsHeim > 0 ? diffFoulsHeim : Math.abs(diffFoulsHeim)} ${word} ${diffFoulsHeim > 0 ? 'zu viel' : 'zu wenig'}`;
        foulParts.push(text);
        if (foulLevel > 0) {
          issues.push(`Teamfouls: ${text}`);
        }
      }
      if (diffFoulsGast !== 0) {
        const word = Math.abs(diffFoulsGast) === 1 ? 'Foul' : 'Fouls';
        const text = `Gast ${diffFoulsGast > 0 ? diffFoulsGast : Math.abs(diffFoulsGast)} ${word} ${diffFoulsGast > 0 ? 'zu viel' : 'zu wenig'}`;
        foulParts.push(text);
        if (foulLevel > 0) {
          issues.push(`Teamfouls: ${text}`);
        }
      }

      if (foulParts.length > 0) {
        foulTooltip = `${foulParts.join('; ')} (Master: ${masterStramatel.foulsHeim} : ${masterStramatel.foulsGast})`;
      } else {
        foulTooltip = `Teamfouls synchron (${participant.stramatelState.foulsHeim} : ${participant.stramatelState.foulsGast})`;
      }
    }
  }

  // Shotclock
  if (isShotclock) {
    if (participant.shotclockState && masterShotclock) {
      const pDisplayOff = Boolean(participant.shotclockState.isDisplayOff);
      const mDisplayOff = Boolean(masterShotclock.isDisplayOff);

      if (pDisplayOff && mDisplayOff) {
        // Both displays are switched off
        timeLevel = 0;
        timeDiffSec = 0;
        timeDeltaStr = '—';
        timeTooltip = 'Shotclock ausgeschaltet (Display AUS)';
        deltaTooltip = 'Shotclock Display AUS (keine Zeiterfassung)';
        stateLevel = 0;
        stateTooltip = 'Shotclock Display AUS (Synchron)';
      } else if (pDisplayOff !== mDisplayOff) {
        // One is display off, other is display on
        stateLevel = 1;
        timeDeltaStr = '—';
        if (pDisplayOff) {
          stateTooltip = 'Shotclock Display AUS (Master EIN)';
          issues.push('Shotclock Display: Ausgeschaltet (Master aktiv)');
          timeTooltip = 'Display ausgeschaltet';
          deltaTooltip = 'Display ausgeschaltet (Master läuft/gestoppt)';
        } else {
          stateTooltip = 'Shotclock Display EIN (Master AUS)';
          issues.push('Shotclock Display: Aktiv (Master ausgeschaltet)');
          timeTooltip = 'Display aktiv (Master ausgeschaltet)';
          deltaTooltip = 'Display aktiv (Master ausgeschaltet)';
        }
      } else {
        // Both displays are on: standard time & running comparison
        const pSec = participant.shotclockState.shotclockTenths / 10;
        const mSec = masterShotclock.shotclockTenths / 10;
        const rawDiff = pSec - mSec;
        const absDiff = Math.abs(rawDiff);
        timeDiffSec = rawDiff;
        timeDeltaStr = `${rawDiff >= 0 ? '+' : ''}${rawDiff.toFixed(1)}s`;

        const tolShot = Math.max(0.1, tolerances.shotClockSeconds);
        if (absDiff > tolShot * 2) {
          timeLevel = 2; // Stufe 2: Mehr als doppelte Toleranz
        } else if (absDiff > tolShot) {
          timeLevel = 1; // Stufe 1: Bis doppelte Toleranz
        }

        // Time tooltip
        let shotExplanation = '';
        if (absDiff < 0.05) {
          shotExplanation = 'Shotclock synchron';
          deltaTooltip = `Shotclock synchron (±0.0s, Toleranz: ±${tolShot.toFixed(1)}s)`;
        } else if (rawDiff > 0) {
          shotExplanation = `Uhr ${rawDiff.toFixed(1)}s voraus`;
          deltaTooltip = `Shotclock ${rawDiff.toFixed(1)}s voraus (Toleranz: ±${tolShot.toFixed(1)}s)`;
        } else {
          shotExplanation = `Uhr ${Math.abs(rawDiff).toFixed(1)}s hinterher`;
          deltaTooltip = `Shotclock ${Math.abs(rawDiff).toFixed(1)}s hinterher (Toleranz: ±${tolShot.toFixed(1)}s)`;
        }

        if (timeLevel > 0) {
          issues.push(`Shotclock: ${shotExplanation}`);
        }
        timeTooltip = shotExplanation;

        // Uhr-Status & Modus Mismatch
        const pMode = participant.shotclockState.mode || 'shotclock';
        const mMode = masterShotclock.mode || 'shotclock';
        if (pMode !== mMode) {
          stateLevel = 1;
          const pLabel = pMode === 'timeoutA' ? 'Timeout A (60s)' : pMode === 'timeoutB' ? 'Timeout B (30s)' : 'Shotclock';
          const mLabel = mMode === 'timeoutA' ? 'Timeout A (60s)' : mMode === 'timeoutB' ? 'Timeout B (30s)' : 'Shotclock';
          stateTooltip = `Modus-Abweichung: ${pLabel} (Master: ${mLabel})`;
          issues.push(stateTooltip);
        } else if (participant.shotclockState.isRunning !== masterShotclock.isRunning) {
          stateLevel = 1;
          stateTooltip = participant.shotclockState.isRunning
            ? 'Uhr läuft (Master gestoppt)'
            : 'Uhr gestoppt (Master läuft)';
          issues.push(`Shotclock-Status: ${stateTooltip}`);
        } else {
          stateTooltip = participant.shotclockState.isRunning
            ? 'Uhr läuft synchron'
            : 'Uhr gestoppt synchron';
        }
      }
    }
  }

  const level = Math.max(timeLevel, stateLevel, scoreLevel, foulLevel) as DeviationLevel;

  let overallTooltip = 'In Toleranz (Synchron)';
  if (level === 2) {
    overallTooltip = `Stufe 2 (Kritischer Fehler): ${issues.length > 0 ? issues.join(' • ') : 'Grobe Abweichung'}`;
  } else if (level === 1) {
    overallTooltip = `Stufe 1 (Warnung): ${issues.length > 0 ? issues.join(' • ') : 'Leichte Abweichung'}`;
  }

  return {
    level,
    timeLevel,
    stateLevel,
    scoreLevel,
    foulLevel,
    timeDiffSec,
    timeDeltaStr,
    isMaster: false,
    timeTooltip,
    deltaTooltip,
    scoreTooltip,
    foulTooltip,
    stateTooltip,
    overallTooltip,
    issues,
  };
}
