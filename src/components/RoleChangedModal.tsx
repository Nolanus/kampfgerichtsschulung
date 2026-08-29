'use client';

import React from 'react';
import { ConsoleRole } from '@/types';
import { SlidersHorizontal, Timer, CheckCircle2, ArrowRight } from 'lucide-react';

interface RoleChangedModalProps {
  isOpen: boolean;
  newRole: ConsoleRole;
  changedBy: 'self' | 'admin';
  message?: string;
  onClose: () => void;
}

export default function RoleChangedModal({
  isOpen,
  newRole,
  changedBy,
  message,
  onClose,
}: RoleChangedModalProps) {
  if (!isOpen) return null;

  const isZeitnehmer = newRole === 'zeitnehmer';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
      <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 text-slate-800 text-center relative">
        
        {/* Icon */}
        <div className={`w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-3 shadow-inner border ${
          isZeitnehmer
            ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
            : 'bg-red-50 border-red-200 text-red-600'
        }`}>
          {isZeitnehmer ? (
            <SlidersHorizontal className="w-8 h-8 text-emerald-600" />
          ) : (
            <Timer className="w-8 h-8 text-red-600" />
          )}
        </div>

        {/* Title */}
        <h3 className="text-xl font-black text-slate-900 mb-1">
          {changedBy === 'admin' ? 'Rolle vom Schulungsleiter geändert' : 'Rolle erfolgreich gewechselt!'}
        </h3>
        
        <p className="text-xs text-slate-500 mb-4">
          Du bedienst jetzt: <b className="text-slate-900">{isZeitnehmer ? 'Zeitnehmer (Hauptanzeige)' : '24s Shotclock'}</b>
        </p>

        {/* Notification details */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-700 mb-5 text-left space-y-2">
          <div className="flex items-center gap-2 font-bold text-emerald-700">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Master-Referenzwerte synchronisiert</span>
          </div>
          <p className="text-slate-600 text-[11px] leading-relaxed">
            {message || 'Deine Konsole wurde automatisch auf die aktuellen Master-Referenzwerte eingestellt, sodass du direkt ohne Zeit- oder Punkteabweichung starten kannst.'}
          </p>
        </div>

        {/* Action Button */}
        <button
          type="button"
          onClick={onClose}
          className="w-full bg-slate-900 hover:bg-slate-800 active:scale-98 text-white font-bold text-sm py-3.5 rounded-xl shadow-md transition cursor-pointer flex items-center justify-center gap-2"
        >
          <span>Verstanden & Loslegen</span>
          <ArrowRight className="w-4 h-4" />
        </button>

      </div>
    </div>
  );
}
