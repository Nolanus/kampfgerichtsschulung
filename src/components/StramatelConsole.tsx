'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { soundManager } from '@/lib/audio';
import { getSocket } from '@/lib/socket';
import { StramatelState, ShotclockState } from '@/types';
import Link from 'next/link';
import { ArrowLeft, Crown, RotateCcw, Maximize2, Minimize2, AlertCircle, Volume2, SlidersHorizontal } from 'lucide-react';

interface StramatelConsoleProps {
  pin: string;
  participantName: string;
  isMaster?: boolean;
  allowRoleSwitch?: boolean;
  onRequestRoleSwitch?: () => void;
  initialState?: StramatelState;
}

export default function StramatelConsole({
  pin,
  participantName,
  isMaster,
  allowRoleSwitch = true,
  onRequestRoleSwitch,
  initialState,
}: StramatelConsoleProps) {
  const [state, setState] = useState<StramatelState>(
    initialState || {
      gameTimeTenths: 10 * 60 * 10, // 10:00.0
      isRunning: false,
      scoreHeim: 0,
      scoreGast: 0,
      foulsHeim: 0,
      foulsGast: 0,
      period: 1,
      timeoutsHeim: 0,
      timeoutsGast: 0,
    }
  );

  const [isHoldingCorrection, setIsHoldingCorrection] = useState(false);
  const [isToggleCorrectionActive, setIsToggleCorrectionActive] = useState(false);
  const [lastAction, setLastAction] = useState('Bereit');
  const [socketConnected, setSocketConnected] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const stateRef = useRef(state);
  stateRef.current = state;

  const isCorrectionMode = isHoldingCorrection || isToggleCorrectionActive;

  // Fullscreen tracking
  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
          setIsFullscreen(true);
        } else if ((document.documentElement as any).webkitRequestFullscreen) {
          await (document.documentElement as any).webkitRequestFullscreen();
          setIsFullscreen(true);
        } else {
          setIsFullscreen((prev) => !prev);
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
          setIsFullscreen(false);
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
          setIsFullscreen(false);
        } else {
          setIsFullscreen(false);
        }
      }
    } catch (err) {
      console.warn('Native fullscreen toggle error, fallback to maximized view:', err);
      setIsFullscreen((prev) => !prev);
    }
  };

  // Keyboard Shortcuts ('5', 'k' or 'Shift' for Korrektur, 'f' for Fullscreen)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === '5' || e.key === 'k' || e.key === 'K' || e.key === 'Shift') {
        setIsHoldingCorrection(true);
      }
      if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        toggleFullscreen();
      }
    }
    function handleKeyUp(e: KeyboardEvent) {
      if (e.key === '5' || e.key === 'k' || e.key === 'K' || e.key === 'Shift') {
        setIsHoldingCorrection(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Socket communication
  useEffect(() => {
    const socket = getSocket();

    function onConnect() {
      setSocketConnected(true);
      setSessionError(null);
      socket.emit(
        'join_session',
        {
          pin,
          name: participantName,
          role: 'zeitnehmer',
          initialState: { stramatelState: stateRef.current },
        },
        (response?: { success: boolean; initialStramatelState?: StramatelState; initialShotclockState?: ShotclockState }) => {
          if (response?.success && response.initialStramatelState) {
            setState(response.initialStramatelState);
          }
        }
      );
    }

    function onInitParticipantState(data: { stramatelState?: StramatelState }) {
      if (data.stramatelState) {
        setState(data.stramatelState);
      }
    }

    function onSessionNotFound(data: { pin: string; message: string }) {
      setSessionError(data.message || `Die Sitzung "${pin}" existiert nicht.`);
      setState((prev) => ({ ...prev, isRunning: false }));
    }

    function onSessionEnded() {
      setSessionError('Die Schulungssitzung wurde vom Schulungsleiter beendet.');
      setState((prev) => ({ ...prev, isRunning: false }));
    }

    if (socket.connected) {
      onConnect();
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', () => setSocketConnected(false));
    socket.on('init_participant_state', onInitParticipantState);
    socket.on('session_not_found', onSessionNotFound);
    socket.on('session_ended', onSessionEnded);

    return () => {
      socket.off('connect', onConnect);
      socket.off('init_participant_state', onInitParticipantState);
      socket.off('session_not_found', onSessionNotFound);
      socket.off('session_ended', onSessionEnded);
    };
  }, [pin, participantName]);

  const logAction = useCallback((action: string) => {
    setLastAction(action);
    if (typeof window !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(20);
    }
  }, []);

  const broadcastState = useCallback((newState: StramatelState, actionName: string) => {
    const socket = getSocket();
    if (socket.connected) {
      socket.emit('update_console_state', {
        pin,
        role: 'zeitnehmer',
        stramatelState: newState,
        lastAction: actionName,
      });
    }
  }, [pin]);

  // Sync state if initialState changes
  useEffect(() => {
    if (initialState) {
      setState(initialState);
    }
  }, [initialState]);

  // Force sync from master event
  useEffect(() => {
    const socket = getSocket();

    function onForceSync(data: { stramatelState?: StramatelState; message?: string }) {
      if (data.stramatelState) {
        setState(data.stramatelState);
        setLastAction('Auf Master synchronisiert');
      }
    }

    socket.on('force_sync_to_master', onForceSync);
    return () => {
      socket.off('force_sync_to_master', onForceSync);
    };
  }, []);

  // Timer Tick (Game Clock & Timeout Countdown)
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (state.isRunning || state.isTimeoutRunning) {
      interval = setInterval(() => {
        setState((prev) => {
          // Timeout Countdown
          if (prev.isTimeoutRunning && (prev.timeoutTenths ?? 0) > 0) {
            const nextTimeoutTenths = (prev.timeoutTenths ?? 600) - 1;
            const nextState: StramatelState = { ...prev, timeoutTenths: nextTimeoutTenths };
            if (nextTimeoutTenths === 100) {
              soundManager.playTimeoutWarning();
              logAction('Auszeit: 50s Signal (10s verbleibend)');
            } else if (nextTimeoutTenths === 0) {
              soundManager.playHorn();
              logAction('AUSZEIT BEENDET (Signal)');
              nextState.isTimeoutRunning = false;
              nextState.timeoutTenths = undefined;
              broadcastState(nextState, 'Auszeit beendet');
            } else if (nextTimeoutTenths % 10 === 0) {
              broadcastState(nextState, `Auszeit (${Math.ceil(nextTimeoutTenths / 10)}s)`);
            }
            return nextState;
          }

          // Game Clock Tick
          if (prev.isRunning) {
            if (prev.isCountUp) {
              const nextTenths = prev.gameTimeTenths + 1;
              const nextState = { ...prev, gameTimeTenths: nextTenths, isCountUp: true };
              if (nextTenths % 10 === 0) {
                broadcastState(nextState, 'Pausenuhr läuft');
              }
              return nextState;
            } else if (prev.gameTimeTenths > 0) {
              const nextTenths = prev.gameTimeTenths - 1;
              const nextState = { ...prev, gameTimeTenths: nextTenths };
              if (nextTenths === 0) {
                soundManager.playHorn();
                logAction('SPIELZEIT ABGELAUFEN (Sirene) – Pausenuhr läuft hoch');
                nextState.isCountUp = true;
                nextState.isRunning = true;
                broadcastState(nextState, 'Sirene abgelaufen – Pausenuhr aktiv');
              } else if (nextTenths % 10 === 0) {
                broadcastState(nextState, 'Uhr läuft');
              }
              return nextState;
            } else {
              const nextTenths = prev.gameTimeTenths + 1;
              const nextState = { ...prev, gameTimeTenths: nextTenths, isCountUp: true };
              return nextState;
            }
          }
          return prev;
        });
      }, 100);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [state.isRunning, state.isTimeoutRunning, broadcastState, logAction]);


  const formatTime = (tenths: number) => {
    const totalSec = Math.floor(tenths / 10);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    const t = tenths % 10;
    return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${t}`;
  };

  // Button Handlers
  const handleChrono = () => {
    if (state.isTimeoutRunning) {
      soundManager.playBeep(350, 0.04);
      logAction('Gesperrt: Auszeit aktiv');
      return;
    }

    if (isCorrectionMode) {
      if (state.isCountUp || state.gameTimeTenths === 0) {
        soundManager.playBeep(350, 0.05);
        logAction('Korrektur nicht möglich: Periode ist bereits abgelaufen');
        return;
      }
      soundManager.playBeep(650, 0.06);
      const isUnderOneMinute = state.gameTimeTenths < 600; // < 1:00.0 (600 tenths)
      const incrementTenths = isUnderOneMinute ? 1 : 10; // +0.1s (< 1 min) or +1.0s (>= 1 min)
      const maxTenths = 10 * 60 * 10; // 10:00.0
      const nextTenths = Math.min(maxTenths, state.gameTimeTenths + incrementTenths);
      const nextState = { ...state, gameTimeTenths: nextTenths, isCountUp: false };
      setState(nextState);
      setIsToggleCorrectionActive(false);
      const addedText = isUnderOneMinute ? '+0.1 Sekunde' : '+1 Sekunde';
      const actionText = `Korrektur: ${addedText} auf Spieluhr (${formatTime(nextTenths)})`;
      logAction(actionText);
      broadcastState(nextState, actionText);
    } else {
      soundManager.playBeep(900, 0.08);
      const nextRunning = !state.isRunning;
      const nextState = { ...state, isRunning: nextRunning };
      const actionText = state.isCountUp
        ? (nextRunning ? 'PAUSENUHR START' : 'PAUSENUHR STOP')
        : (nextRunning ? 'CHRONO START' : 'CHRONO STOP');
      setState(nextState);
      logAction(actionText);
      broadcastState(nextState, actionText);
    }
  };

  const handlePunkteHeim = () => {
    if (state.isTimeoutRunning) {
      soundManager.playBeep(350, 0.04);
      logAction('Gesperrt: Auszeit aktiv');
      return;
    }

    if (isCorrectionMode) {
      soundManager.playBeep(450, 0.08);
      const nextScore = Math.max(0, state.scoreHeim - 1);
      const nextState = { ...state, scoreHeim: nextScore };
      setState(nextState);
      setIsToggleCorrectionActive(false);
      logAction('Korrektur: HEIM -1 Punkt');
      broadcastState(nextState, 'HEIM -1 Punkt');
    } else {
      soundManager.playBeep(1100, 0.05);
      const nextScore = state.scoreHeim + 1;
      const nextState = { ...state, scoreHeim: nextScore };
      setState(nextState);
      logAction('HEIM +1 Punkt');
      broadcastState(nextState, 'HEIM +1 Punkt');
    }
  };

  const handlePunkteGast = () => {
    if (state.isTimeoutRunning) {
      soundManager.playBeep(350, 0.04);
      logAction('Gesperrt: Auszeit aktiv');
      return;
    }

    if (isCorrectionMode) {
      soundManager.playBeep(450, 0.08);
      const nextScore = Math.max(0, state.scoreGast - 1);
      const nextState = { ...state, scoreGast: nextScore };
      setState(nextState);
      setIsToggleCorrectionActive(false);
      logAction('Korrektur: GAST -1 Punkt');
      broadcastState(nextState, 'GAST -1 Punkt');
    } else {
      soundManager.playBeep(1100, 0.05);
      const nextScore = state.scoreGast + 1;
      const nextState = { ...state, scoreGast: nextScore };
      setState(nextState);
      logAction('GAST +1 Punkt');
      broadcastState(nextState, 'GAST +1 Punkt');
    }
  };

  const handleFehlerHeim = () => {
    if (state.isTimeoutRunning) {
      soundManager.playBeep(350, 0.04);
      logAction('Gesperrt: Auszeit aktiv');
      return;
    }

    if (isCorrectionMode) {
      soundManager.playBeep(400, 0.08);
      const nextFouls = Math.max(0, state.foulsHeim - 1);
      const nextState = { ...state, foulsHeim: nextFouls };
      setState(nextState);
      setIsToggleCorrectionActive(false);
      logAction('Korrektur: HEIM -1 Foul');
      broadcastState(nextState, 'HEIM -1 Foul');
    } else {
      if (state.foulsHeim >= 5) {
        soundManager.playBeep(350, 0.04);
        logAction('HEIM Teamfouls bereits auf Maximum (5)');
        return;
      }
      soundManager.playBeep(700, 0.06);
      const nextFouls = state.foulsHeim + 1;
      const nextState = { ...state, foulsHeim: nextFouls };
      setState(nextState);
      logAction(`HEIM +1 Teamfoul (${nextFouls}/5)`);
      broadcastState(nextState, `HEIM +1 Foul (${nextFouls}/5)`);
    }
  };

  const handleFehlerGast = () => {
    if (state.isTimeoutRunning) {
      soundManager.playBeep(350, 0.04);
      logAction('Gesperrt: Auszeit aktiv');
      return;
    }

    if (isCorrectionMode) {
      soundManager.playBeep(400, 0.08);
      const nextFouls = Math.max(0, state.foulsGast - 1);
      const nextState = { ...state, foulsGast: nextFouls };
      setState(nextState);
      setIsToggleCorrectionActive(false);
      logAction('Korrektur: GAST -1 Foul');
      broadcastState(nextState, 'GAST -1 Foul');
    } else {
      if (state.foulsGast >= 5) {
        soundManager.playBeep(350, 0.04);
        logAction('GAST Teamfouls bereits auf Maximum (5)');
        return;
      }
      soundManager.playBeep(700, 0.06);
      const nextFouls = state.foulsGast + 1;
      const nextState = { ...state, foulsGast: nextFouls };
      setState(nextState);
      logAction(`GAST +1 Teamfoul (${nextFouls}/5)`);
      broadcastState(nextState, `GAST +1 Foul (${nextFouls}/5)`);
    }
  };

  const handlePeriod = () => {
    if (state.isTimeoutRunning) {
      soundManager.playBeep(350, 0.04);
      logAction('Gesperrt: Auszeit aktiv');
      return;
    }

    if (isCorrectionMode) {
      soundManager.playBeep(450, 0.08);
      const nextPeriod = Math.max(1, state.period - 1);
      const nextState = { ...state, period: nextPeriod, isCountUp: false };
      setState(nextState);
      setIsToggleCorrectionActive(false);
      logAction(`Korrektur: Periode auf ${nextPeriod}`);
      broadcastState(nextState, `Periode ${nextPeriod}`);
    } else {
      // Period switch is only allowed if current period time is expired (isCountUp or gameTimeTenths === 0)
      if (!state.isCountUp && state.gameTimeTenths > 0) {
        soundManager.playBeep(350, 0.06);
        logAction('Periode kann erst nach Ablauf der Spielzeit gewechselt werden (00:00)');
        return;
      }

      soundManager.playBeep(600, 0.1);
      const nextPeriod = state.period + 1;
      const nextState = {
        ...state,
        period: nextPeriod,
        gameTimeTenths: 10 * 60 * 10, // 10:00.0
        foulsHeim: 0,
        foulsGast: 0,
        isRunning: false,
        isCountUp: false,
      };
      setState(nextState);
      logAction(`Neues Viertel: Periode ${nextPeriod} (Zeit 10:00, Fouls 0)`);
      broadcastState(nextState, `Viertel ${nextPeriod} (10:00, Fouls 0)`);
    }
  };

  const handleHupe = () => {
    soundManager.playHorn();
    logAction('Sirene manuell ausgelöst');
    const socket = getSocket();
    if (socket.connected) {
      socket.emit('participant_action', { pin, action: 'Sirene Signalhorn' });
    }
  };

  const handleNull = () => {
    soundManager.playBeep(400, 0.05);
    setIsHoldingCorrection(false);
    setIsToggleCorrectionActive(false);
    logAction('Korrektur abgebrochen / Reset');
  };

  const handleTaste3 = () => {
    soundManager.playBeep(700, 0.05);
    logAction('Taste 3 (↶)');
  };

  const handleAuszeit = () => {
    if (isCorrectionMode) {
      if (state.isTimeoutRunning) {
        soundManager.playBeep(450, 0.08);
        const nextState = { ...state, isTimeoutRunning: false, timeoutTenths: undefined };
        setState(nextState);
        setIsToggleCorrectionActive(false);
        logAction('Korrektur: Auszeit abgebrochen');
        broadcastState(nextState, 'Auszeit abgebrochen');
      } else {
        soundManager.playBeep(350, 0.05);
        logAction('Keine aktive Auszeit zum Abbrechen');
      }
    } else {
      if (state.isTimeoutRunning) {
        soundManager.playBeep(350, 0.04);
        logAction(`Auszeit läuft bereits (${Math.ceil((state.timeoutTenths ?? 600) / 10)}s)`);
        return;
      }
      soundManager.playBeep(1200, 0.15);
      const nextState = {
        ...state,
        isRunning: false, // Stoppt Spieluhr
        isTimeoutRunning: true,
        timeoutTenths: 60 * 10, // 60.0s (600 Zehntel)
      };
      setState(nextState);
      logAction('Auszeit gestartet (60s Countdown)');
      broadcastState(nextState, 'Auszeit gestartet (60s)');
    }
  };

  if (sessionError) {
    return (
      <div className="flex flex-col items-center justify-center p-4 max-w-md mx-auto min-h-[60vh] text-center">
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm w-full space-y-4">
          <div className="w-14 h-14 bg-red-50 border border-red-200 text-red-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Sitzung nicht gefunden</h2>
          <p className="text-sm text-slate-600">
            Die Schulungssitzung mit der PIN <b className="font-mono font-bold text-slate-800">{pin}</b> existiert nicht oder wurde noch nicht vom Schulungsleiter gestartet.
          </p>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm py-3 rounded-xl shadow-sm transition cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Zurück zur Startseite</span>
          </Link>
        </div>
      </div>
    );
  }

  // Common button class for ALL 15 round buttons to ensure 100% identical dimensions & generous touch targets
  const roundBtnClass = "stramatel-btn rounded-full flex flex-col items-center justify-center cursor-pointer select-none font-bold text-center leading-none shadow-md transition-all active:scale-95 w-13 h-13 sm:w-15 sm:h-15 md:w-18 md:h-18 lg:w-20 lg:h-20 shrink-0 p-1";

  return (
    <div className={`w-full select-none transition-all duration-150 ${
      isFullscreen
        ? 'fixed inset-0 z-50 bg-[#161a1d] text-white p-2 sm:p-3 h-screen w-screen flex flex-col justify-between overflow-hidden'
        : 'flex flex-col items-center justify-center p-2 sm:p-4 max-w-5xl mx-auto'
    }`}>
      
      {/* Top Header Bar */}
      <div className={`w-full flex items-center justify-between mb-1.5 text-xs flex-shrink-0 ${isFullscreen ? 'max-w-7xl mx-auto' : ''}`}>
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className={`px-3 py-1 font-medium rounded-lg border shadow-sm transition flex items-center gap-1.5 ${
              isFullscreen
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
            }`}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Lobby</span>
          </Link>
          <div className={`px-2.5 py-1 rounded-lg font-medium border flex items-center gap-1.5 sm:gap-2 min-w-0 truncate ${
            isFullscreen
              ? 'bg-sky-950/80 text-sky-300 border-sky-800'
              : 'bg-sky-50 text-sky-800 border-sky-300'
          }`}>
            <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Zeitnehmer • {participantName}</span>
            {isMaster && (
              <span className="inline-flex items-center gap-1 font-bold text-[10px] bg-amber-400 text-slate-950 px-1.5 py-0.5 rounded shadow-xs shrink-0 whitespace-nowrap">
                <Crown className="w-3 h-3 fill-current" />
                <span>Master</span>
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap font-mono ${socketConnected ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
            {socketConnected ? `● Live · ${pin}` : '○ Verbinde...'}
          </span>
          {onRequestRoleSwitch && (
            <button
              onClick={onRequestRoleSwitch}
              disabled={allowRoleSwitch === false || isMaster}
              className={`px-2.5 py-1 rounded-lg font-medium border shadow-sm transition flex items-center gap-1.5 whitespace-nowrap ${
                allowRoleSwitch === false || isMaster
                  ? 'opacity-40 cursor-not-allowed bg-slate-100 text-slate-400 border-slate-200'
                  : isFullscreen
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 cursor-pointer'
                  : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300 cursor-pointer'
              }`}
              title={
                isMaster
                  ? 'Als aktiver Master-Referenzgeber kann die Rolle nicht gewechselt werden'
                  : allowRoleSwitch === false
                  ? 'Rollenwechsel vom Schulungsleiter gesperrt'
                  : 'Rolle / Bedienpult wechseln'
              }
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Rolle wechseln</span>
            </button>
          )}
          <button
            onClick={toggleFullscreen}
            className={`px-2.5 py-1 rounded-lg font-medium border shadow-sm transition flex items-center gap-1.5 whitespace-nowrap ${
              isFullscreen
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-400 font-bold'
                : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
            }`}
            title={isFullscreen ? 'Vollbild beenden (Taste F oder Esc)' : 'Vollbild aktivieren (Taste F)'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isFullscreen ? 'Vollbild beenden' : 'Vollbild'}</span>
          </button>
        </div>
      </div>

      {/* Main Enclosure (Stramatel Metallic Case) */}
      <div className={isFullscreen ? 'flex-1 w-full min-h-0 min-w-0 flex items-center justify-center py-1 overflow-hidden' : 'w-full'}>
        <div
          className={`relative w-full bg-gradient-to-b from-slate-200 via-slate-300 to-slate-400 rounded-3xl shadow-2xl border-2 border-slate-300 flex flex-col justify-center overflow-hidden transition-all duration-150 ${
            isFullscreen ? 'p-2 sm:p-4' : 'p-3 sm:p-5 shadow-xl'
          }`}
          style={isFullscreen ? {
            aspectRatio: '16 / 9.5',
            maxHeight: '100%',
            maxWidth: 'min(100%, calc((100vh - 90px) * (16 / 9.5)))',
            height: 'auto',
          } : undefined}
        >
          
          {/* Metal Connectors on Top Edge */}
          <div className="absolute -top-3.5 left-1/2 -translate-x-12 flex gap-10">
            <div className="w-6 h-3.5 bg-gradient-to-b from-slate-100 to-slate-400 rounded-t border border-slate-400 shadow-sm"></div>
            <div className="w-6 h-3.5 bg-gradient-to-b from-slate-100 to-slate-400 rounded-t border border-slate-400 shadow-sm"></div>
          </div>

          {/* Authentic Teal/Emerald Front Panel */}
          <div className={`relative w-full bg-[#129c78] rounded-2xl shadow-inner border-2 border-[#096a50] flex flex-col justify-between overflow-hidden ${
            isFullscreen ? 'p-2 sm:p-3.5 flex-1 min-h-0' : 'p-3 sm:p-5'
          }`}>
            
            {/* TOP SECTION: ON/OFF, PROGR. 14, HEIM/GÄSTE LCD, PERIODE 15 */}
            <div className="flex items-center justify-between gap-2 sm:gap-4 mb-2 sm:mb-4">
              
              {/* Top Left: ON/OFF pill & PROGR 14 below */}
              <div className="flex flex-col items-start gap-1.5 sm:gap-2.5">
                <button 
                  onClick={() => soundManager.playBeep(1000, 0.05)}
                  className="stramatel-pill-btn rounded-xl flex flex-col items-center justify-center cursor-pointer select-none font-bold text-center leading-none shadow-md transition-all active:scale-95 w-12 h-7 sm:w-14 sm:h-8 md:w-16 md:h-9 lg:w-18 lg:h-10"
                  title="ON / OFF Schalter"
                >
                  <span className="text-[9px] sm:text-[10px] md:text-xs font-black">ON</span>
                  <div className="w-6 sm:w-8 border-t border-black/70 my-0.5"></div>
                  <span className="text-[8px] sm:text-[9px] md:text-[10px] font-black">OFF</span>
                </button>
                
                <button 
                  onClick={() => soundManager.playBeep(800, 0.05)}
                  className={roundBtnClass}
                  title="Programm auswählen (14)"
                >
                  <span className="text-[9px] sm:text-[10px] md:text-xs lg:text-[13px] font-black tracking-tight">PROGR.</span>
                  <span className="text-xs sm:text-sm md:text-base lg:text-lg font-black mt-0.5 sm:mt-1">14</span>
                </button>
              </div>

              {/* Center: HEIM & GÄSTE Labels + Yellow-Framed LCD Display */}
              <div className="flex-1 flex flex-col items-center max-w-lg sm:max-w-xl md:max-w-2xl px-1 sm:px-4">
                <div className="w-full flex justify-between px-3 sm:px-6 mb-0.5 text-[#034c52] font-black tracking-widest text-lg sm:text-2xl md:text-3xl">
                  <span>HEIM</span>
                  <span>GÄSTE</span>
                </div>

                {/* LCD Display */}
                <div className="lcd-screen w-full rounded-md flex flex-col justify-between border-2 border-[#d97706] p-2 sm:p-2.5 md:p-3 shadow-inner min-h-[68px] sm:min-h-[82px] md:min-h-[96px] gap-1.5 sm:gap-2">
                  {/* Top LCD Row: Scores and Game Clock / Timeout Countdown */}
                  <div className="flex justify-between items-center font-bold tracking-wider px-1 sm:px-2">
                    <span className="font-black text-lg sm:text-2xl md:text-3xl leading-none">{String(state.scoreHeim).padStart(3, '0')}</span>
                    <span className={`font-black tracking-widest text-[#0a1805] text-xl sm:text-3xl md:text-4xl leading-none ${state.isTimeoutRunning ? 'text-amber-950 animate-pulse' : ''}`}>
                      {state.isTimeoutRunning ? formatTime(state.timeoutTenths ?? 600) : formatTime(state.gameTimeTenths)}
                    </span>
                    <span className="font-black text-lg sm:text-2xl md:text-3xl leading-none">{String(state.scoreGast).padStart(3, '0')}</span>
                  </div>
                  {/* Bottom LCD Row: Fouls and Quarter / Timeout Badge */}
                  <div className="flex justify-between items-center font-semibold border-t border-black/25 pt-1 sm:pt-1.5 text-[10px] sm:text-xs md:text-sm px-1 sm:px-2 leading-none">
                    <span>FOULS: <b className="text-xs sm:text-sm md:text-base">{state.foulsHeim}</b></span>
                    <span className={`px-2 py-0.5 rounded font-black text-[9px] sm:text-xs md:text-sm ${
                      state.isTimeoutRunning ? 'bg-amber-400 text-amber-950 animate-pulse' : 'bg-[#788e31] text-[#0a1805]'
                    }`}>
                      {isCorrectionMode ? 'KORR ↶' : (state.isTimeoutRunning ? `AUSZEIT ${Math.ceil((state.timeoutTenths ?? 600) / 10)}s` : (state.isCountUp ? 'PAUSE' : 'PERIODE'))} {!state.isTimeoutRunning && (state.period > 4 ? `OT${state.period - 4}` : state.period)}
                    </span>
                    <span>FOULS: <b className="text-xs sm:text-sm md:text-base">{state.foulsGast}</b></span>
                  </div>
                </div>
              </div>

              {/* Top Right: PERIODE / EXTRAZEIT 15 */}
              <div className="flex flex-col items-end justify-end">
                <button 
                  onClick={handlePeriod}
                  className={roundBtnClass}
                  title={isCorrectionMode ? "Korrektur: Vorherige Periode" : (state.isCountUp || state.gameTimeTenths === 0 ? "Nächstes Viertel (setzt Zeit auf 10:00 & Fouls auf 0)" : "Periode / Extrazeit (erst nach Ablauf der Spielzeit 00:00 aktiv)")}
                >
                  <span className="text-[8px] sm:text-[9px] md:text-[10px] lg:text-[11px] font-black leading-none">PERIODE</span>
                  <span className="text-[7px] sm:text-[8px] md:text-[9px] lg:text-[10px] font-bold leading-none mt-0.5">EXTRAZEIT</span>
                  <span className="text-[10px] sm:text-xs md:text-sm lg:text-base font-black mt-0.5 sm:mt-1">15</span>
                </button>
              </div>

            </div>

            {/* BOTTOM SECTION: ALL BUTTONS IN GRID ALIGNED WITH AUTHENTIC STRAMATEL 252MS LAYOUT */}
            <div className="flex items-stretch justify-between gap-1 sm:gap-2 md:gap-3 w-full mt-1">
              
              {/* 1. HEIM CAPSULE: Fehler 2 (top) & Punkte 1 (bottom) */}
              <div className="flex flex-col items-center justify-between">
                <div className="border-2 border-[#f97316] rounded-[32px] sm:rounded-[40px] p-1 sm:p-1.5 flex flex-col items-center gap-1.5 sm:gap-2.5 bg-black/5">
                  {/* FEHLER 2 */}
                  <button 
                    onClick={handleFehlerHeim}
                    className={roundBtnClass}
                    title="HEIM Teamfoul (max 5)"
                  >
                    <span className="text-[9px] sm:text-[10px] md:text-xs lg:text-[13px] font-black tracking-tight">FEHLER</span>
                    <span className="text-xs sm:text-sm md:text-base lg:text-lg font-black mt-0.5 sm:mt-1">2</span>
                  </button>
                  {/* PUNKTE 1 */}
                  <button 
                    onClick={handlePunkteHeim}
                    className={roundBtnClass}
                    title="HEIM +1 Punkt (oder -1 bei Korrektur)"
                  >
                    <span className="text-[9px] sm:text-[10px] md:text-xs lg:text-[13px] font-black tracking-tight">PUNKTE</span>
                    <span className="text-xs sm:text-sm md:text-base lg:text-lg font-black mt-0.5 sm:mt-1">1</span>
                  </button>
                </div>
                <span className="text-[#034c52] font-black text-xs sm:text-sm md:text-base tracking-wider mt-0.5">HEIM</span>
              </div>

              {/* 2. COLUMN: NULL 4 (top) & ↶ 3 (bottom) */}
              <div className="flex flex-col items-center justify-between py-1">
                {/* NULL 4 */}
                <button 
                  onClick={handleNull}
                  className={roundBtnClass}
                  title="Null / Reset / Korrektur abbrechen (4)"
                >
                  <span className="text-[9px] sm:text-[10px] md:text-xs lg:text-[13px] font-black tracking-tight">NULL</span>
                  <span className="text-xs sm:text-sm md:text-base lg:text-lg font-black mt-0.5 sm:mt-1">4</span>
                </button>
                {/* ↶ 3 */}
                <button 
                  id="btnTaste3"
                  onClick={handleTaste3}
                  className={roundBtnClass}
                  title="Taste 3 (↶)"
                >
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 stroke-current fill-none stroke-[2.5]" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                  </svg>
                  <span className="text-xs sm:text-sm md:text-base lg:text-lg font-black mt-0.5">3</span>
                </button>
              </div>

              {/* 3. COLUMN: Empty spacer (top) & KORR. 5 (bottom) */}
              <div className="flex flex-col items-center justify-between py-1">
                <div className="w-13 h-13 sm:w-15 sm:h-15 md:w-18 md:h-18 lg:w-20 lg:h-20 opacity-0 pointer-events-none" />
                {/* KORR. 5 (Multi-Touch Pointer Event + Desktop Toggle) */}
                <button 
                  id="btnKorr5"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    soundManager.playBeep(600, 0.05);
                    setIsHoldingCorrection(true);
                    logAction('Taste 5 (KORR.) gedrückt gehalten: Korrekturmodus');
                  }}
                  onPointerUp={() => setIsHoldingCorrection(false)}
                  onPointerCancel={() => setIsHoldingCorrection(false)}
                  onClick={(e) => {
                    const nativeEv = e.nativeEvent as unknown as { pointerType?: string };
                    if (!nativeEv.pointerType || nativeEv.pointerType === 'mouse') {
                      setIsToggleCorrectionActive((prev) => !prev);
                      logAction(!isToggleCorrectionActive ? 'Korrekturmodus (Toggle) AKTIV' : 'Korrekturmodus INAKTIV');
                    }
                  }}
                  className={`${roundBtnClass} ${isCorrectionMode ? 'active-held ring-2 ring-amber-400' : ''}`}
                  title="Korrektur / Rücknahme (5 - KORR.) - Gedrückt halten oder anklicken"
                >
                  <span className="text-[9px] sm:text-[10px] md:text-xs lg:text-[13px] font-black tracking-tight">KORR.</span>
                  <span className="text-xs sm:text-sm md:text-base lg:text-lg font-black mt-0.5 sm:mt-1">5</span>
                </button>
              </div>

              {/* 4. CENTER TRAPEZOID ZONE: START / STOPP (Auszeit 6, Horn 8, Chrono 7) */}
              <div className="border-2 border-[#f97316] rounded-2xl sm:rounded-3xl p-1.5 sm:p-2 md:p-2.5 flex flex-col items-center justify-between bg-black/5 flex-shrink-0">
                {/* Top of Trapezoid: PROGRAMMIEREN */}
                <div className="text-[8px] sm:text-[10px] md:text-xs font-bold text-[#034c52] flex items-center justify-between w-full px-1 mb-0.5 sm:mb-1">
                  <span>◄</span>
                  <span className="tracking-wider">PROGRAMMIEREN</span>
                  <span>►</span>
                </div>

                {/* Top Row inside Trapezoid: AUSZEIT 6 & HUPE 8 */}
                <div className="flex items-center justify-between gap-3 sm:gap-5 md:gap-8 w-full px-1">
                  {/* AUSZEIT 6 */}
                  <button 
                    onClick={handleAuszeit}
                    className={`${roundBtnClass} ${state.isTimeoutRunning ? 'ring-2 ring-amber-400 bg-amber-400/20 text-amber-900 animate-pulse' : ''}`}
                    title={state.isTimeoutRunning ? "Auszeit läuft (Taste 5 KORR. + Klick zum Abbrechen)" : "Auszeit starten (60s Countdown)"}
                  >
                    <span className="text-[8px] sm:text-[9px] md:text-[10px] lg:text-xs font-black tracking-tight">AUSZEIT</span>
                    <span className="text-xs sm:text-sm md:text-base lg:text-lg font-black mt-0.5 sm:mt-1">6</span>
                  </button>

                  {/* HUPE 8 */}
                  <button 
                    onClick={handleHupe}
                    className={roundBtnClass}
                    title="Sirene / Signalhorn (8)"
                  >
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 fill-current" viewBox="0 0 24 24">
                      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                    </svg>
                    <span className="text-xs sm:text-sm md:text-base lg:text-lg font-black mt-0.5">8</span>
                  </button>
                </div>

                {/* Middle Label: START/STOPP */}
                <div className="text-[#034c52] font-black text-[10px] sm:text-xs md:text-sm lg:text-base tracking-wider my-1 sm:my-1.5">
                  START/STOPP
                </div>

                {/* Bottom of Trapezoid: CHRONO. 7 */}
                <button 
                  onClick={handleChrono}
                  className={roundBtnClass}
                  title="Spielzeit Start / Stopp (7) oder +1s / +0.1s bei Taste 5 (KORR.)"
                >
                  <span className="text-[8px] sm:text-[9px] md:text-[10px] lg:text-xs font-black tracking-tight">CHRONO.</span>
                  <span className="text-xs sm:text-sm md:text-base lg:text-lg font-black mt-0.5 sm:mt-1">7</span>
                </button>

                {/* Bottom tip text: VALID. */}
                <div className="text-[#034c52] font-black text-[8px] sm:text-[9px] md:text-[10px] lg:text-xs mt-0.5">
                  VALID.
                </div>
              </div>

              {/* 5. COLUMN: VALID. SATZ 10 (top) & ◄► ANZEIGE 9 (bottom) */}
              <div className="flex flex-col items-center justify-between py-1">
                {/* VALID. SATZ 10 */}
                <button 
                  onClick={() => soundManager.playBeep(700, 0.05)}
                  className={roundBtnClass}
                  title="Valid Satz (10)"
                >
                  <span className="text-[8px] sm:text-[9px] md:text-[10px] lg:text-[11px] font-black leading-none">VALID.</span>
                  <span className="text-[7px] sm:text-[8px] md:text-[9px] lg:text-[10px] font-bold leading-none mt-0.5">SATZ</span>
                  <span className="text-[10px] sm:text-xs md:text-sm lg:text-base font-black mt-0.5 sm:mt-1">10</span>
                </button>
                {/* ◄► ANZEIGE 9 */}
                <button 
                  onClick={() => soundManager.playBeep(700, 0.05)}
                  className={roundBtnClass}
                  title="Anzeige umschalten (9)"
                >
                  <div className="flex items-center justify-center gap-0.5 text-[8px] sm:text-[9px] md:text-[10px] font-black leading-none">
                    <span>◄</span>
                    <span>►</span>
                  </div>
                  <span className="text-[7px] sm:text-[8px] md:text-[9px] lg:text-[10px] font-bold leading-none mt-0.5">ANZEIGE</span>
                  <span className="text-[10px] sm:text-xs md:text-sm lg:text-base font-black mt-0.5 sm:mt-1">9</span>
                </button>
              </div>

              {/* 6. COLUMN: Empty spacer (top) & ◄► AUFSCHLAG 11 (bottom) */}
              <div className="flex flex-col items-center justify-between py-1">
                <div className="w-13 h-13 sm:w-15 sm:h-15 md:w-18 md:h-18 lg:w-20 lg:h-20 opacity-0 pointer-events-none" />
                <button 
                  onClick={() => soundManager.playBeep(700, 0.05)}
                  className={roundBtnClass}
                  title="Aufschlag / Pfeilwechsel (11)"
                >
                  <div className="flex items-center justify-center gap-0.5 text-[8px] sm:text-[9px] md:text-[10px] font-black leading-none">
                    <span>◄</span>
                    <span>►</span>
                  </div>
                  <span className="text-[7px] sm:text-[8px] md:text-[9px] lg:text-[10px] font-bold leading-none mt-0.5">AUFSCHLAG</span>
                  <span className="text-[10px] sm:text-xs md:text-sm lg:text-base font-black mt-0.5 sm:mt-1">11</span>
                </button>
              </div>

              {/* 7. GÄSTE CAPSULE: Fehler 12 (top) & Punkte 13 (bottom) */}
              <div className="flex flex-col items-center justify-between">
                <div className="border-2 border-[#f97316] rounded-[32px] sm:rounded-[40px] p-1 sm:p-1.5 flex flex-col items-center gap-1.5 sm:gap-2.5 bg-black/5">
                  {/* FEHLER 12 */}
                  <button 
                    onClick={handleFehlerGast}
                    className={roundBtnClass}
                    title="GAST Teamfoul (max 5)"
                  >
                    <span className="text-[9px] sm:text-[10px] md:text-xs lg:text-[13px] font-black tracking-tight">FEHLER</span>
                    <span className="text-xs sm:text-sm md:text-base lg:text-lg font-black mt-0.5 sm:mt-1">12</span>
                  </button>
                  {/* PUNKTE 13 */}
                  <button 
                    onClick={handlePunkteGast}
                    className={roundBtnClass}
                    title="GAST +1 Punkt (oder -1 bei Korrektur)"
                  >
                    <span className="text-[9px] sm:text-[10px] md:text-xs lg:text-[13px] font-black tracking-tight">PUNKTE</span>
                    <span className="text-xs sm:text-sm md:text-base lg:text-lg font-black mt-0.5 sm:mt-1">13</span>
                  </button>
                </div>
                <span className="text-[#034c52] font-black text-xs sm:text-sm md:text-base tracking-wider mt-0.5">GÄSTE</span>
              </div>

            </div>

          </div>
        </div>
      </div>

      {/* Status & Action Helper Footer */}
      <div className={`w-full mt-1.5 rounded-xl p-2 sm:p-2.5 shadow-sm flex items-center justify-between text-xs flex-shrink-0 ${
        isFullscreen
          ? 'bg-slate-800/90 border border-slate-700 text-slate-300 max-w-7xl mx-auto'
          : 'bg-white border border-slate-200 text-slate-600'
      }`}>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isCorrectionMode ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`}></span>
          <span className={`font-medium ${isFullscreen ? 'text-slate-200' : 'text-slate-700'}`}>Aktion: {lastAction}</span>
        </div>
        
        {isCorrectionMode ? (
          <span className="text-xs font-bold text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded border border-amber-300 animate-pulse">
            ↶ KORREKTUR AKTIV (Punkte/Fouls abziehen • Chrono: +1s bzw. +0.1s)
          </span>
        ) : (
          <span className="text-slate-400 font-mono text-[11px]">
            Tipp: Taste 5 (KORR.) gedrückt halten + Punkte/Fouls tippen (Abziehen) oder Chrono (Zeit wieder aufbuchen)
          </span>
        )}
      </div>

    </div>
  );
}

