'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { soundManager } from '@/lib/audio';
import { getSocket } from '@/lib/socket';
import { ShotclockState } from '@/types';
import Link from 'next/link';
import { ArrowLeft, Crown, RotateCcw, Maximize2, Minimize2, AlertCircle, Volume2, Timer } from 'lucide-react';

interface ShotclockConsoleProps {
  pin: string;
  participantName: string;
  isMaster?: boolean;
  allowRoleSwitch?: boolean;
  onRequestRoleSwitch?: () => void;
  initialState?: ShotclockState;
}

export default function ShotclockConsole({
  pin,
  participantName,
  isMaster,
  allowRoleSwitch = true,
  onRequestRoleSwitch,
  initialState,
}: ShotclockConsoleProps) {
  const [state, setState] = useState<ShotclockState>(
    initialState || {
      shotclockTenths: 240, // 24.0s
      isRunning: false,
      mode: 'shotclock',
      savedShotclockTenths: undefined,
      isDisplayOff: false,
    }
  );

  const [lastAction, setLastAction] = useState('Bereit (24.0s)');
  const [socketConnected, setSocketConnected] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const stateRef = useRef(state);
  stateRef.current = state;

  // Fullscreen tracking & keyboard shortcut
  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        toggleFullscreen();
      }
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      window.removeEventListener('keydown', handleKeyDown);
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

  // Socket communication
  useEffect(() => {
    const socket = getSocket();

    function onConnect() {
      setSocketConnected(true);
      setSessionError(null);
      socket.emit('join_session', {
        pin,
        name: participantName,
        role: 'shotclock',
        initialState: { shotclockState: stateRef.current },
      });
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
    socket.on('session_not_found', onSessionNotFound);
    socket.on('session_ended', onSessionEnded);

    return () => {
      socket.off('connect', onConnect);
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

  const broadcastState = useCallback((newState: ShotclockState, actionName: string) => {
    const socket = getSocket();
    if (socket.connected) {
      socket.emit('update_console_state', {
        pin,
        role: 'shotclock',
        shotclockState: newState,
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

    function onForceSync(data: { shotclockState?: ShotclockState; message?: string }) {
      if (data.shotclockState) {
        setState(data.shotclockState);
        logAction('Auf Master synchronisiert');
      }
    }

    socket.on('force_sync_to_master', onForceSync);
    return () => {
      socket.off('force_sync_to_master', onForceSync);
    };
  }, [logAction]);

  // Unified Timer Tick for Shotclock & Timeouts
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (state.isRunning && !state.isDisplayOff) {
      interval = setInterval(() => {
        setState((prev) => {
          if (prev.isDisplayOff) return prev;
          if (prev.shotclockTenths > 0) {
            const nextTenths = prev.shotclockTenths - 1;
            const nextState = { ...prev, shotclockTenths: nextTenths };

            // 50s Warning on 60s timeout (10s remaining)
            if (prev.mode === 'timeoutA' && nextTenths === 100) {
              soundManager.playTimeoutWarning();
              logAction('Auszeit: 50s Signal (10s Rest)');
            }

            if (nextTenths === 0) {
              soundManager.playBuzzer();
              if (prev.mode === 'timeoutA' || prev.mode === 'timeoutB') {
                // Timeout finished: restore saved shotclock time automatically
                const restoredTenths = prev.savedShotclockTenths !== undefined ? prev.savedShotclockTenths : 240;
                nextState.mode = 'shotclock';
                nextState.shotclockTenths = restoredTenths;
                nextState.savedShotclockTenths = undefined;
                nextState.isRunning = false;
                logAction(`Auszeit abgelaufen -> Shotclock bei ${(restoredTenths / 10).toFixed(1)}s`);
                broadcastState(nextState, 'Auszeit beendet');
              } else {
                logAction('24s ABGELAUFEN (Buzzer ertönt)');
                nextState.isRunning = false;
                broadcastState(nextState, '24s Abgelaufen');
              }
            } else if (nextTenths % 10 === 0) {
              const label = prev.mode === 'timeoutA' ? 'Timeout 60s läuft' : prev.mode === 'timeoutB' ? 'Timeout 30s läuft' : '24s läuft';
              broadcastState(nextState, label);
            }
            return nextState;
          }
          return prev;
        });
      }, 100);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [state.isRunning, state.isDisplayOff, broadcastState, logAction]);

  const formatShotclock = (tenths: number) => {
    const sec = Math.floor(tenths / 10);
    const t = tenths % 10;
    return `${sec}.${t}`;
  };

  // Button Handlers
  const handleStartStop = () => {
    soundManager.playClick();
    if (state.isDisplayOff) {
      // If display is OFF, pressing START turns display ON and starts timer
      const nextTenths = state.shotclockTenths === 0 ? 240 : state.shotclockTenths;
      const nextState: ShotclockState = {
        ...state,
        isDisplayOff: false,
        isRunning: true,
        shotclockTenths: nextTenths,
      };
      setState(nextState);
      logAction('START (Display EIN)');
      broadcastState(nextState, 'START (24s läuft)');
      return;
    }

    const nextRunning = !state.isRunning;
    let nextTenths = state.shotclockTenths;
    if (nextRunning && state.shotclockTenths === 0) {
      if (state.mode === 'timeoutA') nextTenths = 600;
      else if (state.mode === 'timeoutB') nextTenths = 300;
      else nextTenths = 240;
    }
    const nextState: ShotclockState = { ...state, isRunning: nextRunning, shotclockTenths: nextTenths };
    const prefix = state.mode === 'timeoutA' ? 'Timeout A ' : state.mode === 'timeoutB' ? 'Timeout B ' : '';
    const actionText = `${prefix}${nextRunning ? 'START' : 'STOP'}`;
    setState(nextState);
    logAction(actionText);
    broadcastState(nextState, actionText);
  };

  const handleToggleDisplay = () => {
    soundManager.playClick();
    const nextDisplayOff = !state.isDisplayOff;
    const nextState: ShotclockState = {
      ...state,
      isDisplayOff: nextDisplayOff,
      isRunning: nextDisplayOff ? false : state.isRunning,
    };
    setState(nextState);
    const actionText = nextDisplayOff ? 'Display AUS (Blank)' : 'Display EIN';
    logAction(actionText);
    broadcastState(nextState, actionText);
  };

  const handleLoad24 = () => {
    soundManager.playClick();
    const keepRunning = state.mode === 'timeoutA' || state.mode === 'timeoutB' || state.isDisplayOff ? false : state.isRunning;
    const nextState: ShotclockState = {
      ...state,
      mode: 'shotclock' as const,
      shotclockTenths: 240,
      savedShotclockTenths: undefined,
      isDisplayOff: false,
      isRunning: keepRunning,
    };
    setState(nextState);
    logAction(keepRunning ? 'LOAD 24s (läuft weiter)' : 'LOAD 24s');
    broadcastState(nextState, 'LOAD 24s');
  };

  const handleLoad14 = () => {
    soundManager.playClick();
    const keepRunning = state.mode === 'timeoutA' || state.mode === 'timeoutB' || state.isDisplayOff ? false : state.isRunning;
    const nextState: ShotclockState = {
      ...state,
      mode: 'shotclock' as const,
      shotclockTenths: 140,
      savedShotclockTenths: undefined,
      isDisplayOff: false,
      isRunning: keepRunning,
    };
    setState(nextState);
    logAction(keepRunning ? 'LOAD 14s (läuft weiter)' : 'LOAD 14s');
    broadcastState(nextState, 'LOAD 14s');
  };

  const handleSoundTest = () => {
    soundManager.playBuzzer();
    logAction('Soundtest Buzzer');
    const socket = getSocket();
    if (socket.connected) {
      socket.emit('participant_action', { pin, action: 'Soundtest Buzzer' });
    }
  };

  const handleTimeoutA = () => {
    soundManager.playClick();
    // Preserve current shotclock time if entering from shotclock mode
    const savedTenths =
      state.mode === 'timeoutA' || state.mode === 'timeoutB'
        ? state.savedShotclockTenths
        : state.shotclockTenths;

    const nextState: ShotclockState = {
      ...state,
      mode: 'timeoutA',
      shotclockTenths: 600, // 60.0s
      savedShotclockTenths: savedTenths,
      isDisplayOff: false,
      isRunning: false,
    };
    setState(nextState);
    logAction(`Timeout A (60s) geladen (${(savedTenths ? savedTenths / 10 : 24.0).toFixed(1)}s gemerkt)`);
    broadcastState(nextState, 'Timeout A (60s) geladen');
  };

  const handleTimeoutB = () => {
    soundManager.playClick();
    // Preserve current shotclock time if entering from shotclock mode
    const savedTenths =
      state.mode === 'timeoutA' || state.mode === 'timeoutB'
        ? state.savedShotclockTenths
        : state.shotclockTenths;

    const nextState: ShotclockState = {
      ...state,
      mode: 'timeoutB',
      shotclockTenths: 300, // 30.0s
      savedShotclockTenths: savedTenths,
      isDisplayOff: false,
      isRunning: false,
    };
    setState(nextState);
    logAction(`Timeout B (30s) geladen (${(savedTenths ? savedTenths / 10 : 24.0).toFixed(1)}s gemerkt)`);
    broadcastState(nextState, 'Timeout B (30s) geladen');
  };

  const handleClearTimeouts = () => {
    soundManager.playClick();
    const restoredTenths = state.savedShotclockTenths !== undefined ? state.savedShotclockTenths : 240;
    const nextState: ShotclockState = {
      ...state,
      mode: 'shotclock',
      shotclockTenths: restoredTenths,
      savedShotclockTenths: undefined,
      isDisplayOff: false,
      isRunning: false,
    };
    setState(nextState);
    logAction(`Timeouts gelöscht -> Shotclock bei ${(restoredTenths / 10).toFixed(1)}s`);
    broadcastState(nextState, 'Timeouts gelöscht');
  };

  const handleEdit = () => {
    soundManager.playClick();
    const isTimeout = state.mode === 'timeoutA' || state.mode === 'timeoutB';
    const maxVal = state.mode === 'timeoutA' ? 60 : state.mode === 'timeoutB' ? 30 : 24;
    const currentVal = (state.shotclockTenths / 10).toFixed(1);
    const label = isTimeout ? (state.mode === 'timeoutA' ? 'Timeout A (max 60s)' : 'Timeout B (max 30s)') : '24s Shotclock';
    const val = prompt(`Neue Zeit für ${label} in Sekunden eingeben (z. B. ${currentVal}):`, currentVal);
    if (val !== null) {
      const parsed = parseFloat(val);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= maxVal) {
        const nextState = { ...state, shotclockTenths: Math.round(parsed * 10), isDisplayOff: false };
        setState(nextState);
        logAction(`Manuell auf ${parsed.toFixed(1)}s`);
        broadcastState(nextState, `Manuell ${parsed.toFixed(1)}s`);
      }
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

  return (
    <div className={`w-full select-none transition-all duration-150 ${
      isFullscreen
        ? 'fixed inset-0 z-50 bg-[#161a1d] text-white p-2 sm:p-3 h-screen w-screen flex flex-col justify-between overflow-hidden'
        : 'flex flex-col items-center justify-center p-2 sm:p-4 max-w-4xl mx-auto'
    }`}>
      
      {/* Top Header */}
      <div className={`w-full flex items-center justify-between mb-2 text-xs flex-shrink-0 gap-2 overflow-hidden ${isFullscreen ? 'max-w-7xl mx-auto' : ''}`}>
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
          <Link
            href="/"
            className={`px-2.5 py-1 font-medium rounded-lg border shadow-sm transition flex items-center gap-1.5 shrink-0 ${
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
              ? 'bg-indigo-950/80 text-indigo-300 border-indigo-800'
              : 'bg-indigo-50 text-indigo-800 border-indigo-200'
          }`}>
            <Timer className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">24s Shotclock • {participantName}</span>
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

      {/* Main Stage Wrapper (Centers and preserves aspect ratio) */}
      <div className={isFullscreen ? 'flex-1 w-full min-h-0 min-w-0 flex items-center justify-center py-1 overflow-hidden' : 'w-full'}>
        <div
          className={`relative w-full bg-[#2b3036] rounded-[2rem] border-[6px] border-[#1a1d20] shadow-2xl flex flex-col justify-between overflow-hidden transition-all duration-150 ${
            isFullscreen ? 'p-3 sm:p-5' : 'p-4 sm:p-7 shadow-xl'
          }`}
          style={isFullscreen ? {
            aspectRatio: '16 / 10',
            maxHeight: '100%',
            maxWidth: 'min(100%, calc((100vh - 110px) * 1.6))',
            height: 'auto',
          } : undefined}
        >
          {/* Touchscreen Glass */}
          <div className={`bg-[#f1f5f9] text-slate-900 rounded-xl p-3 sm:p-5 flex flex-col justify-between relative overflow-hidden shadow-inner min-h-0 ${
            isFullscreen ? 'flex-1 h-full' : 'h-[430px] sm:h-[460px]'
          }`}>
            
            {/* Main Grid */}
            <div className="grid grid-cols-12 gap-2.5 sm:gap-3.5 h-full pb-10">
              
              {/* Left Column: Shot Clock Display & Big START/STOP */}
              <div className="col-span-5 flex flex-col justify-between gap-2.5 sm:gap-3.5 h-full">
                {/* Display Box */}
                <div className={`w-full bg-white border-2 rounded-xl p-2 sm:p-3 flex flex-col items-center justify-center shadow-sm flex-1 min-h-0 transition-colors ${
                  state.isDisplayOff ? 'border-slate-200 bg-slate-100/60' : 'border-red-100'
                }`}>
                  <span className={`text-xs sm:text-sm font-semibold tracking-wider uppercase ${
                    state.isDisplayOff ? 'text-slate-400 font-bold' : 'text-slate-500'
                  }`}>
                    {state.isDisplayOff
                      ? 'Shot clock • AUS'
                      : state.mode === 'timeoutA'
                      ? 'Timeout A (60s)'
                      : state.mode === 'timeoutB'
                      ? 'Timeout B (30s)'
                      : 'Shot clock'}
                  </span>
                  
                  <div className={`digital-shotclock tabular-nums font-black tracking-tighter my-auto text-center select-none text-5xl sm:text-7xl md:text-8xl leading-none ${
                    state.isDisplayOff ? 'off' : state.isRunning ? '' : 'stopped'
                  }`}>
                    {state.isDisplayOff ? '--.-' : formatShotclock(state.shotclockTenths)}
                  </div>
                </div>

                {/* Big Start/Stop Button */}
                <button 
                  onClick={handleStartStop}
                  className={`btn-touch w-full h-16 sm:h-20 md:h-24 rounded-xl flex items-center justify-center text-xl sm:text-2xl md:text-3xl font-black tracking-wider text-white shadow-md transition shrink-0 ${
                    state.isDisplayOff
                      ? 'bg-[#800014] border-2 border-red-950'
                      : state.isRunning
                      ? 'bg-[#99001a] border-2 border-red-950'
                      : 'bg-[#800014] border-2 border-red-950'
                  }`}
                >
                  {state.isDisplayOff ? 'START' : state.isRunning ? 'STOP' : 'START'}
                </button>
              </div>

              {/* Middle Column: Timeout A, Timeout B, Clear Timeouts, Display Aus/Ein */}
              <div className="col-span-3 flex flex-col justify-between gap-2 sm:gap-2.5 h-full">
                <button 
                  onClick={handleTimeoutA}
                  className="btn-touch bg-[#002280] text-white flex-1 rounded-lg sm:rounded-xl flex flex-col items-center justify-center font-bold text-xs sm:text-sm md:text-base border border-blue-900 leading-tight"
                >
                  <span>TIMEOUT A</span>
                  <span className="text-[11px] sm:text-xs font-normal opacity-90">60s</span>
                </button>
                
                <button 
                  onClick={handleTimeoutB}
                  className="btn-touch bg-[#002280] text-white flex-1 rounded-lg sm:rounded-xl flex flex-col items-center justify-center font-bold text-xs sm:text-sm md:text-base border border-blue-900 leading-tight"
                >
                  <span>TIMEOUT B</span>
                  <span className="text-[11px] sm:text-xs font-normal opacity-90">30s</span>
                </button>

                <button 
                  onClick={handleClearTimeouts}
                  className="btn-touch bg-[#002280] text-white flex-1 rounded-lg sm:rounded-xl flex flex-col items-center justify-center font-bold text-[10px] sm:text-xs md:text-sm border border-blue-900 leading-tight"
                >
                  <span>CLEAR</span>
                  <span>TIMEOUTS</span>
                </button>

                {/* DISPLAY AUS / EIN Toggle Button */}
                <button 
                  onClick={handleToggleDisplay}
                  className={`btn-touch flex-1 rounded-lg sm:rounded-xl flex flex-col items-center justify-center font-bold text-xs sm:text-sm md:text-base border transition leading-tight ${
                    state.isDisplayOff
                      ? 'bg-amber-600 hover:bg-amber-500 text-white border-amber-800 ring-2 ring-amber-400/50'
                      : 'bg-[#2b3036] hover:bg-[#383e45] text-slate-200 border-slate-700'
                  }`}
                  title={state.isDisplayOff ? 'Shotclock-Display wieder einschalten' : 'Shotclock-Display ausschalten (z. B. wenn weniger Spielzeit im Viertel)'}
                >
                  <span>{state.isDisplayOff ? 'DISPLAY EIN' : 'DISPLAY AUS'}</span>
                  <span className="text-[10px] sm:text-[11px] font-normal opacity-85">
                    {state.isDisplayOff ? 'Ausgeschaltet' : 'Blanking'}
                  </span>
                </button>
              </div>

              {/* Right Column: LOAD 24s (top), LOAD 14s (middle), EDIT... (bottom) */}
              <div className="col-span-4 flex flex-col justify-between gap-2.5 sm:gap-3.5 h-full">
                <button 
                  onClick={handleLoad24}
                  className="btn-touch bg-[#800014] text-white flex-1 rounded-lg sm:rounded-xl flex flex-col items-center justify-center font-bold text-sm sm:text-base md:text-xl border border-red-950 leading-tight"
                >
                  <span>LOAD</span>
                  <span className="text-base sm:text-lg md:text-2xl font-black">24s</span>
                </button>

                <button 
                  onClick={handleLoad14}
                  className="btn-touch bg-[#800014] text-white flex-1 rounded-lg sm:rounded-xl flex flex-col items-center justify-center font-bold text-sm sm:text-base md:text-xl border border-red-950 leading-tight"
                >
                  <span>LOAD</span>
                  <span className="text-base sm:text-lg md:text-2xl font-black">14s</span>
                </button>

                <button 
                  onClick={handleEdit}
                  className="btn-touch bg-[#731373] text-white flex-1 rounded-lg sm:rounded-xl flex items-center justify-center font-bold text-xs sm:text-sm md:text-base border border-purple-950"
                >
                  <span>EDIT...</span>
                </button>
              </div>

            </div>

            {/* Bottom Bar */}
            <div className="absolute bottom-0 left-0 right-0 h-8 sm:h-10 bg-slate-200 border-t border-slate-300 px-3 sm:px-4 flex items-center justify-between text-xs text-slate-700 font-mono">
              <div className="flex gap-2 font-medium">
                <span>SHOTCLOCK</span>
              </div>

              <div className="flex items-center gap-3">
                <span className="font-medium">100%</span>
                <button 
                  onClick={handleSoundTest}
                  className="btn-touch bg-[#00802b] px-2.5 py-1 rounded text-white font-bold text-xs flex items-center gap-1 shadow-sm cursor-pointer"
                  title="Buzzer Soundtest"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline text-[10px]">Test</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Status Bar */}
      <div className={`w-full mt-1.5 rounded-xl p-2 sm:p-2.5 shadow-sm flex items-center justify-between text-xs flex-shrink-0 ${
        isFullscreen
          ? 'bg-slate-800/90 border border-slate-700 text-slate-300 max-w-7xl mx-auto'
          : 'bg-white border border-slate-200 text-slate-600'
      }`}>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${
            state.isDisplayOff ? 'bg-slate-400' : state.isRunning ? 'bg-emerald-500' : 'bg-amber-500'
          }`}></span>
          <span className={`font-medium ${isFullscreen ? 'text-slate-200' : 'text-slate-700'}`}>Aktion: {lastAction}</span>
        </div>
        <div className="font-mono text-[11px] opacity-80">
          Status: {
            state.isDisplayOff
              ? '24s Ausgeschaltet (Display Aus)'
              : state.mode === 'timeoutA'
              ? (state.isRunning ? 'Timeout A (60s) Läuft' : 'Timeout A Gestoppt')
              : state.mode === 'timeoutB'
              ? (state.isRunning ? 'Timeout B (30s) Läuft' : 'Timeout B Gestoppt')
              : (state.isRunning ? '24s Läuft' : '24s Gestoppt')
          }
        </div>
      </div>

    </div>
  );
}
