'use client';

import React from 'react';
import { ConsoleRole } from '@/types';
import { SlidersHorizontal, Timer, RotateCcw, X, Check, ArrowRight, Info } from 'lucide-react';

interface RoleSwitchModalProps {
  isOpen: boolean;
  currentRole: ConsoleRole;
  onSelectRole: (role: ConsoleRole) => void;
  onClose: () => void;
  isLoading?: boolean;
}

export default function RoleSwitchModal({
  isOpen,
  currentRole,
  onSelectRole,
  onClose,
  isLoading = false,
}: RoleSwitchModalProps) {
  if (!isOpen) return null;

  const isZeitnehmer = currentRole === 'zeitnehmer';
  const isShotclock = currentRole === 'shotclock';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
      <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-200 text-slate-800 relative">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={isLoading}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 w-8 h-8 rounded-full flex items-center justify-center transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="text-center mb-5">
          <div className="w-12 h-12 bg-amber-50 border border-amber-200 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-2 shadow-inner">
            <RotateCcw className="w-6 h-6 text-amber-600" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Rolle / Aufgabe wechseln</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Wähle dein gewünschtes Bedienpult für die Schulung
          </p>
        </div>

        {/* Roles Options Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          
          {/* Card 1: Zeitnehmer */}
          <button
            type="button"
            disabled={isZeitnehmer || isLoading}
            onClick={() => onSelectRole('zeitnehmer')}
            className={`flex flex-col p-4 rounded-2xl border-2 text-left transition relative ${
              isZeitnehmer
                ? 'border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-500/20 cursor-default'
                : 'border-slate-200 bg-slate-50 hover:border-emerald-500 hover:bg-emerald-50/20 hover:shadow-md cursor-pointer'
            }`}
          >
            {isZeitnehmer && (
              <span className="absolute top-3 right-3 bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                Aktuell aktiv
              </span>
            )}
            <SlidersHorizontal className="w-7 h-7 text-emerald-600 mb-2" />
            <div className="font-bold text-sm text-slate-900 mb-1">Zeitnehmer</div>
            <div className="text-[11px] text-slate-600 leading-snug mb-3">
              Stramatel Hauptanzeige (Spielzeit, Spielstand, Teamfouls, Viertel & Signalhorn)
            </div>
            
            <div className="mt-auto pt-2 border-t border-slate-200/80">
              <span className={`text-xs font-bold inline-flex items-center gap-1 ${
                isZeitnehmer ? 'text-emerald-700' : 'text-slate-800'
              }`}>
                {isZeitnehmer ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Ausgewählt</span>
                  </>
                ) : (
                  <>
                    <span>Zu Zeitnehmer wechseln</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </span>
            </div>
          </button>

          {/* Card 2: 24s Shotclock */}
          <button
            type="button"
            disabled={isShotclock || isLoading}
            onClick={() => onSelectRole('shotclock')}
            className={`flex flex-col p-4 rounded-2xl border-2 text-left transition relative ${
              isShotclock
                ? 'border-red-500 bg-red-50/50 ring-2 ring-red-500/20 cursor-default'
                : 'border-slate-200 bg-slate-50 hover:border-red-500 hover:bg-red-50/20 hover:shadow-md cursor-pointer'
            }`}
          >
            {isShotclock && (
              <span className="absolute top-3 right-3 bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                Aktuell aktiv
              </span>
            )}
            <Timer className="w-7 h-7 text-red-600 mb-2" />
            <div className="font-bold text-sm text-slate-900 mb-1">24s Shotclock</div>
            <div className="text-[11px] text-slate-600 leading-snug mb-3">
              Touchscreen Angriffsuhr (24s / 14s Reset, Start/Stopp, Auszeit-Stoppuhr)
            </div>

            <div className="mt-auto pt-2 border-t border-slate-200/80">
              <span className={`text-xs font-bold inline-flex items-center gap-1 ${
                isShotclock ? 'text-red-700' : 'text-slate-800'
              }`}>
                {isShotclock ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Ausgewählt</span>
                  </>
                ) : (
                  <>
                    <span>Zu 24s Shotclock wechseln</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </span>
            </div>
          </button>

        </div>

        {/* Info Note */}
        <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 mb-4 flex items-start gap-2">
          <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <b>Automatische Synchronisation:</b> Beim Wechseln werden deine Werte automatisch an die <b>aktuellen Master-Referenzwerte</b> angepasst. So startest du sofort synchron und ohne Abweichungen!
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition cursor-pointer"
          >
            Abbrechen
          </button>
        </div>

      </div>
    </div>
  );
}
