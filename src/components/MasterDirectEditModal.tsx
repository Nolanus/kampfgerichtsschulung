'use client';

import React, { useState, useEffect } from 'react';
import { StramatelState, ShotclockState } from '@/types';
import { Edit3, SlidersHorizontal, Timer, Lock, Check, X } from 'lucide-react';

interface MasterDirectEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  stramatelState?: StramatelState;
  shotclockState?: ShotclockState;
  isStramatelEditable?: boolean;
  isShotclockEditable?: boolean;
  stramatelMasterLabel?: string;
  shotclockMasterLabel?: string;
  initialFocusField?: 'time' | 'score' | 'period' | 'fouls' | 'shotclock';
  onSaveStramatel: (newState: StramatelState) => void;
  onSaveShotclock: (newState: ShotclockState) => void;
}

export default function MasterDirectEditModal({
  isOpen,
  onClose,
  stramatelState,
  shotclockState,
  isStramatelEditable = true,
  isShotclockEditable = true,
  stramatelMasterLabel = 'Schulungsleiter',
  shotclockMasterLabel = 'Schulungsleiter',
  initialFocusField = 'time',
  onSaveStramatel,
  onSaveShotclock,
}: MasterDirectEditModalProps) {
  // Stramatel Fields
  const currentTotalTenths = stramatelState?.gameTimeTenths ?? 6000;
  const currentTotalSec = Math.floor(currentTotalTenths / 10);
  const currentMin = Math.floor(currentTotalSec / 60);
  const currentSec = currentTotalSec % 60;
  const currentTenth = currentTotalTenths % 10;

  const [minutes, setMinutes] = useState(currentMin);
  const [seconds, setSeconds] = useState(currentSec);
  const [tenths, setTenths] = useState(currentTenth);
  const [scoreHeim, setScoreHeim] = useState(stramatelState?.scoreHeim ?? 0);
  const [scoreGast, setScoreGast] = useState(stramatelState?.scoreGast ?? 0);
  const [period, setPeriod] = useState(stramatelState?.period ?? 1);
  const [foulsHeim, setFoulsHeim] = useState(stramatelState?.foulsHeim ?? 0);
  const [foulsGast, setFoulsGast] = useState(stramatelState?.foulsGast ?? 0);
  const [isStramatelRunning, setIsStramatelRunning] = useState(stramatelState?.isRunning ?? false);

  // Shotclock Fields
  const currentShotclockSec = ((shotclockState?.shotclockTenths ?? 240) / 10).toFixed(1);
  const [shotclockSecStr, setShotclockSecStr] = useState(currentShotclockSec);
  const [isShotclockRunning, setIsShotclockRunning] = useState(shotclockState?.isRunning ?? false);
  const [isShotclockDisplayOff, setIsShotclockDisplayOff] = useState(shotclockState?.isDisplayOff ?? false);

  // Reset local state when modal opens or initial states change
  useEffect(() => {
    if (isOpen) {
      if (stramatelState) {
        const totalTenths = stramatelState.gameTimeTenths;
        const totalSec = Math.floor(totalTenths / 10);
        setMinutes(Math.floor(totalSec / 60));
        setSeconds(totalSec % 60);
        setTenths(totalTenths % 10);
        setScoreHeim(stramatelState.scoreHeim);
        setScoreGast(stramatelState.scoreGast);
        setPeriod(stramatelState.period);
        setFoulsHeim(stramatelState.foulsHeim);
        setFoulsGast(stramatelState.foulsGast);
        setIsStramatelRunning(stramatelState.isRunning);
      }
      if (shotclockState) {
        setShotclockSecStr(((shotclockState.shotclockTenths ?? 240) / 10).toFixed(1));
        setIsShotclockRunning(shotclockState.isRunning);
        setIsShotclockDisplayOff(Boolean(shotclockState.isDisplayOff));
      }
    }
  }, [isOpen, stramatelState, shotclockState]);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    if (isStramatelEditable && stramatelState) {
      // Compute stramatel game time in tenths
      const validMin = Math.max(0, minutes);
      const validSec = Math.max(0, Math.min(59, seconds));
      const validTenth = Math.max(0, Math.min(9, tenths));
      const calculatedGameTimeTenths = (validMin * 60 + validSec) * 10 + validTenth;

      onSaveStramatel({
        ...stramatelState,
        gameTimeTenths: calculatedGameTimeTenths,
        scoreHeim: Math.max(0, scoreHeim),
        scoreGast: Math.max(0, scoreGast),
        period: Math.max(1, period),
        foulsHeim: Math.max(0, foulsHeim),
        foulsGast: Math.max(0, foulsGast),
        isRunning: isStramatelRunning,
      });
    }

    if (isShotclockEditable && shotclockState) {
      const parsedSec = parseFloat(shotclockSecStr.replace(',', '.'));
      const validShotclockSec = isNaN(parsedSec) ? 24.0 : Math.max(0, Math.min(24.0, parsedSec));
      const calculatedShotclockTenths = Math.round(validShotclockSec * 10);

      onSaveShotclock({
        ...shotclockState,
        shotclockTenths: calculatedShotclockTenths,
        isRunning: isShotclockDisplayOff ? false : isShotclockRunning,
        isDisplayOff: isShotclockDisplayOff,
      });
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 animate-fadeIn">
      <div className="bg-white rounded-3xl p-5 sm:p-6 max-w-xl w-full shadow-2xl border border-slate-200 text-slate-800 relative max-h-[92vh] overflow-y-auto">
        
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 w-8 h-8 rounded-full flex items-center justify-center transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-100">
          <div className="w-11 h-11 bg-amber-50 border border-amber-200 text-amber-700 rounded-2xl flex items-center justify-center shadow-inner">
            <Edit3 className="w-5 h-5 text-amber-700" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Master-Referenzwerte direkt setzen</h3>
            <p className="text-xs text-slate-500">
              Trage beliebige Spielzeit-, Punktestand- oder Shotclock-Werte für die Schulung ein
            </p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          
          {/* SECTION 1: ZEITNEHMER (STRAMATEL) */}
          <div className={`border rounded-2xl p-4 space-y-3.5 transition ${
            isStramatelEditable
              ? 'bg-emerald-50/50 border-emerald-200/80'
              : 'bg-slate-50 border-slate-200 opacity-80'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-emerald-700" />
                <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Zeitnehmer / Stramatel Hauptanzeige
                </span>
                {!isStramatelEditable && (
                  <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-bold">
                    Gesperrt
                  </span>
                )}
              </div>
              {isStramatelEditable ? (
                <label className="flex items-center gap-1.5 text-xs text-emerald-900 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isStramatelRunning}
                    onChange={(e) => setIsStramatelRunning(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Uhr läuft</span>
                </label>
              ) : (
                <span className="text-xs text-slate-400 font-medium">
                  {isStramatelRunning ? 'Uhr läuft' : 'Uhr gestoppt'}
                </span>
              )}
            </div>

            {!isStramatelEditable && (
              <div className="p-2.5 bg-amber-50/80 border border-amber-200 text-amber-900 rounded-xl text-xs flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                <span>
                  Referenzwert wird aktuell von <b>{stramatelMasterLabel}</b> vorgegeben. Direktes Bearbeiten ist nur im Modus <i>„Schulungsleiter (Referenz-Pult)“</i> möglich.
                </span>
              </div>
            )}

            <div className={!isStramatelEditable ? 'opacity-50 pointer-events-none' : ''}>
              {/* Spielzeit Input (Minuten : Sekunden . Zehntel) */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Spielzeit (Minuten : Sekunden . Zehntel)
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        max="99"
                        disabled={!isStramatelEditable}
                        value={minutes}
                        onChange={(e) => setMinutes(parseInt(e.target.value, 10) || 0)}
                        autoFocus={initialFocusField === 'time' && isStramatelEditable}
                        className="w-full bg-white border border-slate-300 focus:border-emerald-600 rounded-xl px-3 py-2 text-center font-mono text-lg font-bold text-slate-900 focus:outline-none disabled:bg-slate-100"
                      />
                      <span className="absolute right-2.5 top-2.5 text-[10px] text-slate-400 font-bold">MIN</span>
                    </div>
                  </div>
                  <span className="font-mono text-xl font-black text-slate-400">:</span>
                  <div className="flex-1">
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        max="59"
                        disabled={!isStramatelEditable}
                        value={seconds}
                        onChange={(e) => setSeconds(parseInt(e.target.value, 10) || 0)}
                        className="w-full bg-white border border-slate-300 focus:border-emerald-600 rounded-xl px-3 py-2 text-center font-mono text-lg font-bold text-slate-900 focus:outline-none disabled:bg-slate-100"
                      />
                      <span className="absolute right-2.5 top-2.5 text-[10px] text-slate-400 font-bold">SEK</span>
                    </div>
                  </div>
                  <span className="font-mono text-xl font-black text-slate-400">.</span>
                  <div className="w-16">
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        max="9"
                        disabled={!isStramatelEditable}
                        value={tenths}
                        onChange={(e) => setTenths(parseInt(e.target.value, 10) || 0)}
                        className="w-full bg-white border border-slate-300 focus:border-emerald-600 rounded-xl px-2 py-2 text-center font-mono text-lg font-bold text-slate-900 focus:outline-none disabled:bg-slate-100"
                      />
                      <span className="absolute right-1.5 top-2.5 text-[9px] text-slate-400 font-bold">1/10</span>
                    </div>
                  </div>
                </div>

                {/* Time Presets */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <button
                    type="button"
                    disabled={!isStramatelEditable}
                    onClick={() => { setMinutes(10); setSeconds(0); setTenths(0); }}
                    className="px-2 py-1 bg-white hover:bg-emerald-100/60 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-700 transition cursor-pointer disabled:cursor-not-allowed"
                  >
                    10:00 (Start)
                  </button>
                  <button
                    type="button"
                    disabled={!isStramatelEditable}
                    onClick={() => { setMinutes(5); setSeconds(0); setTenths(0); }}
                    className="px-2 py-1 bg-white hover:bg-emerald-100/60 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-700 transition cursor-pointer disabled:cursor-not-allowed"
                  >
                    05:00
                  </button>
                  <button
                    type="button"
                    disabled={!isStramatelEditable}
                    onClick={() => { setMinutes(2); setSeconds(0); setTenths(0); }}
                    className="px-2 py-1 bg-white hover:bg-emerald-100/60 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-700 transition cursor-pointer disabled:cursor-not-allowed"
                  >
                    02:00 (Clutch)
                  </button>
                  <button
                    type="button"
                    disabled={!isStramatelEditable}
                    onClick={() => { setMinutes(0); setSeconds(24); setTenths(0); }}
                    className="px-2 py-1 bg-white hover:bg-emerald-100/60 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-700 transition cursor-pointer disabled:cursor-not-allowed"
                  >
                    00:24
                  </button>
                  <button
                    type="button"
                    disabled={!isStramatelEditable}
                    onClick={() => { setMinutes(0); setSeconds(0); setTenths(0); }}
                    className="px-2 py-1 bg-white hover:bg-emerald-100/60 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-700 transition cursor-pointer disabled:cursor-not-allowed"
                  >
                    00:00 (Ende)
                  </button>
                </div>
              </div>

              {/* Score & Period & Fouls */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-emerald-200/60">
                
                {/* Punkte Heim & Gast */}
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Punkte (Heim : Gast)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        disabled={!isStramatelEditable}
                        value={scoreHeim}
                        onChange={(e) => setScoreHeim(parseInt(e.target.value, 10) || 0)}
                        autoFocus={initialFocusField === 'score' && isStramatelEditable}
                        className="w-full bg-white border border-slate-300 focus:border-emerald-600 rounded-xl px-3 py-2 text-center font-mono text-base font-bold text-slate-900 focus:outline-none disabled:bg-slate-100"
                      />
                      <span className="absolute left-2.5 top-2.5 text-[10px] text-slate-400 font-bold">HEIM</span>
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        disabled={!isStramatelEditable}
                        value={scoreGast}
                        onChange={(e) => setScoreGast(parseInt(e.target.value, 10) || 0)}
                        className="w-full bg-white border border-slate-300 focus:border-emerald-600 rounded-xl px-3 py-2 text-center font-mono text-base font-bold text-slate-900 focus:outline-none disabled:bg-slate-100"
                      />
                      <span className="absolute left-2.5 top-2.5 text-[10px] text-slate-400 font-bold">GAST</span>
                    </div>
                  </div>
                </div>

                {/* Viertel / Periode */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Viertel / Periode
                  </label>
                  <select
                    value={period}
                    disabled={!isStramatelEditable}
                    onChange={(e) => setPeriod(parseInt(e.target.value, 10) || 1)}
                    autoFocus={initialFocusField === 'period' && isStramatelEditable}
                    className="w-full bg-white border border-slate-300 focus:border-emerald-600 rounded-xl px-3 py-2 text-center font-mono text-sm font-bold text-slate-900 focus:outline-none cursor-pointer disabled:bg-slate-100 disabled:cursor-not-allowed"
                  >
                    <option value={1}>1. Viertel (Q1)</option>
                    <option value={2}>2. Viertel (Q2)</option>
                    <option value={3}>3. Viertel (Q3)</option>
                    <option value={4}>4. Viertel (Q4)</option>
                    <option value={5}>1. Verlängerung (OT1)</option>
                    <option value={6}>2. Verlängerung (OT2)</option>
                  </select>
                </div>

                {/* Teamfouls Heim & Gast */}
                <div className="sm:col-span-3">
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Teamfouls (Heim | Gast)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        max="10"
                        disabled={!isStramatelEditable}
                        value={foulsHeim}
                        onChange={(e) => setFoulsHeim(parseInt(e.target.value, 10) || 0)}
                        autoFocus={initialFocusField === 'fouls' && isStramatelEditable}
                        className="w-full bg-white border border-slate-300 focus:border-emerald-600 rounded-xl px-3 py-2 text-center font-mono text-base font-bold text-slate-900 focus:outline-none disabled:bg-slate-100"
                      />
                      <span className="absolute left-2.5 top-2.5 text-[10px] text-slate-400 font-bold">FOULS H</span>
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        max="10"
                        disabled={!isStramatelEditable}
                        value={foulsGast}
                        onChange={(e) => setFoulsGast(parseInt(e.target.value, 10) || 0)}
                        className="w-full bg-white border border-slate-300 focus:border-emerald-600 rounded-xl px-3 py-2 text-center font-mono text-base font-bold text-slate-900 focus:outline-none disabled:bg-slate-100"
                      />
                      <span className="absolute left-2.5 top-2.5 text-[10px] text-slate-400 font-bold">FOULS G</span>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>

          {/* SECTION 2: 24s SHOTCLOCK */}
          <div className={`border rounded-2xl p-4 space-y-3 transition ${
            isShotclockEditable
              ? 'bg-red-50/50 border-red-200/80'
              : 'bg-slate-50 border-slate-200 opacity-80'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Timer className="w-4 h-4 text-red-700" />
                <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  24s Shotclock Angriffsuhr
                </span>
                {!isShotclockEditable && (
                  <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-bold">
                    Gesperrt
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4">
                {isShotclockEditable ? (
                  <>
                    <label className="flex items-center gap-1.5 text-xs text-red-900 font-medium cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isShotclockRunning}
                        disabled={isShotclockDisplayOff}
                        onChange={(e) => setIsShotclockRunning(e.target.checked)}
                        className="rounded text-red-600 focus:ring-red-500 disabled:opacity-50"
                      />
                      <span className={isShotclockDisplayOff ? 'opacity-50 line-through' : ''}>Shotclock läuft</span>
                    </label>

                    <label className="flex items-center gap-1.5 text-xs text-amber-900 font-bold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isShotclockDisplayOff}
                        onChange={(e) => {
                          setIsShotclockDisplayOff(e.target.checked);
                          if (e.target.checked) setIsShotclockRunning(false);
                        }}
                        className="rounded text-amber-600 focus:ring-amber-500"
                      />
                      <span>Display AUS (Blank)</span>
                    </label>
                  </>
                ) : (
                  <span className="text-xs text-slate-400 font-medium">
                    {isShotclockDisplayOff ? 'Display AUS' : isShotclockRunning ? 'Shotclock läuft' : 'Shotclock gestoppt'}
                  </span>
                )}
              </div>
            </div>

            {!isShotclockEditable && (
              <div className="p-2.5 bg-amber-50/80 border border-amber-200 text-amber-900 rounded-xl text-xs flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                <span>
                  Referenzwert wird aktuell von <b>{shotclockMasterLabel}</b> vorgegeben. Direktes Bearbeiten ist nur im Modus <i>„Schulungsleiter (Referenz-Pult)“</i> möglich.
                </span>
              </div>
            )}

            <div className={!isShotclockEditable ? 'opacity-50 pointer-events-none' : ''}>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                Shotclock Zeit in Sekunden (z. B. 24.0, 14.0, 8.5)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  disabled={!isShotclockEditable}
                  value={shotclockSecStr}
                  onChange={(e) => setShotclockSecStr(e.target.value)}
                  autoFocus={initialFocusField === 'shotclock' && isShotclockEditable}
                  placeholder="24.0"
                  className="flex-1 bg-white border border-slate-300 focus:border-red-600 rounded-xl px-4 py-2 text-center font-mono text-lg font-bold text-red-600 focus:outline-none disabled:bg-slate-100"
                />
                <button
                  type="button"
                  disabled={!isShotclockEditable}
                  onClick={() => { setShotclockSecStr('24.0'); setIsShotclockDisplayOff(false); }}
                  className="px-3 py-2 bg-white hover:bg-red-100/60 border border-slate-200 rounded-xl text-xs font-bold text-red-700 transition cursor-pointer disabled:cursor-not-allowed"
                >
                  24.0s
                </button>
                <button
                  type="button"
                  disabled={!isShotclockEditable}
                  onClick={() => { setShotclockSecStr('14.0'); setIsShotclockDisplayOff(false); }}
                  className="px-3 py-2 bg-white hover:bg-red-100/60 border border-slate-200 rounded-xl text-xs font-bold text-red-700 transition cursor-pointer disabled:cursor-not-allowed"
                >
                  14.0s
                </button>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition cursor-pointer"
            >
              Abbrechen
            </button>
            {(isStramatelEditable || isShotclockEditable) && (
              <button
                type="submit"
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-md transition cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Werte übernehmen & Master aktualisieren</span>
              </button>
            )}
          </div>

        </form>

      </div>
    </div>
  );
}
