'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ConsoleRole } from '@/types';

import { Timer, SlidersHorizontal, Crown, AlertCircle, ArrowRight, KeyRound } from 'lucide-react';

const BASKETBALL_WORDS = [
  'DUNK',
  'PASS',
  'SHOT',
  'BALL',
  'HOOP',
  'SWISH',
  'STEAL',
  'BLOCK',
  'ZONE',
  'PIVOT',
  'COURT',
  'BOARD',
  'HOOK',
  'NET',
  'SLAM',
  'JUMP',
  'FAST',
  'TEAM',
];

function BasketballIcon({ className = 'w-7 h-7' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M4.93 4.93c4.2 4.2 5.07 10.07 2 14.14" />
      <path d="M19.07 4.93c-4.2 4.2-5.07 10.07-2 14.14" />
      <path d="M2 12h20" />
      <path d="M12 2v20" />
    </svg>
  );
}

function LobbyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pin, setPin] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<ConsoleRole>('shotclock');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  useEffect(() => {
    const queryPin = searchParams.get('pin');
    if (queryPin) {
      setPin(queryPin.toUpperCase());
    }
  }, [searchParams]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin.trim() || !name.trim() || isValidating) return;

    const cleanPin = pin.trim().toUpperCase();
    setErrorMessage(null);
    setIsValidating(true);

    try {
      const res = await fetch(`/api/session/check/${encodeURIComponent(cleanPin)}`);
      if (!res.ok) {
        throw new Error('Netzwerkfehler');
      }
      const data = await res.json();

      if (!data.exists) {
        setErrorMessage(`Die Sitzung "${cleanPin}" existiert nicht. Bitte überprüfe die PIN oder frage deinen Schulungsleiter, ob die Sitzung bereits gestartet wurde.`);
        setIsValidating(false);
        return;
      }

      router.push(`/session/${cleanPin}/console?name=${encodeURIComponent(name.trim())}&role=${role}`);
    } catch {
      setErrorMessage('Verbindung zum Server fehlgeschlagen. Bitte versuche es erneut.');
      setIsValidating(false);
    }
  };

  const [isCreatingSession, setIsCreatingSession] = useState(false);

  const handleCreateSession = async () => {
    if (isCreatingSession) return;
    setIsCreatingSession(true);

    try {
      const res = await fetch('/api/session/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.pin && data.adminToken) {
          try {
            localStorage.setItem(`kampfgericht_admin_token_${data.pin}`, data.adminToken);
          } catch {
            // ignore
          }
          router.push(`/session/${data.pin}/admin?token=${encodeURIComponent(data.adminToken)}`);
          return;
        }
      }
    } catch {
      // fallback to client-side generation
    }

    // Fallback if HTTP endpoint fails
    const randomWord = BASKETBALL_WORDS[Math.floor(Math.random() * BASKETBALL_WORDS.length)];
    const randomNum = Math.floor(10 + Math.random() * 90);
    const randomPin = `${randomWord}-${randomNum}`;
    const token = 'adm_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    try {
      localStorage.setItem(`kampfgericht_admin_token_${randomPin}`, token);
    } catch {
      // ignore
    }
    router.push(`/session/${randomPin}/admin?token=${encodeURIComponent(token)}&new=1`);
    setIsCreatingSession(false);
  };

  const [showAdminJoinModal, setShowAdminJoinModal] = useState(false);
  const [adminJoinPin, setAdminJoinPin] = useState('');
  const [adminJoinError, setAdminJoinError] = useState<string | null>(null);
  const [isAdminJoinValidating, setIsAdminJoinValidating] = useState(false);

  const handleOpenAdminJoin = () => {
    setAdminJoinPin(pin.trim() ? pin.trim().toUpperCase() : '');
    setAdminJoinError(null);
    setShowAdminJoinModal(true);
  };

  const handleAdminJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPin = adminJoinPin.trim().toUpperCase();
    if (!cleanPin || isAdminJoinValidating) return;

    setAdminJoinError(null);
    setIsAdminJoinValidating(true);

    try {
      const res = await fetch(`/api/session/check/${encodeURIComponent(cleanPin)}`);
      if (!res.ok) {
        throw new Error('Netzwerkfehler');
      }
      const data = await res.json();
      if (!data.exists) {
        setAdminJoinError(`Die Sitzung "${cleanPin}" existiert nicht. Bitte überprüfe die PIN.`);
        setIsAdminJoinValidating(false);
        return;
      }

      setShowAdminJoinModal(false);
      router.push(`/session/${cleanPin}/admin`);
    } catch {
      setAdminJoinError('Verbindung zum Server fehlgeschlagen. Bitte versuche es erneut.');
      setIsAdminJoinValidating(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-50 text-slate-800">
      
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm">
        
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-amber-50 border border-amber-200 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-inner">
            <BasketballIcon className="w-7 h-7 text-amber-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Kampfgericht Schulung</h1>
          <p className="text-xs text-slate-500 mt-1">
            Parallele Schulung für Zeitnehmer & 24s-Bediener
          </p>
        </div>

        {/* Error Notification */}
        {errorMessage && (
          <div
            role="alert"
            className="mb-4 p-3.5 bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl flex items-start gap-2.5 animate-fadeIn"
          >
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">{errorMessage}</div>
          </div>
        )}

        {/* Join Form */}
        <form onSubmit={handleJoin} className="space-y-4">
          
          {/* PIN */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Sitzungs-PIN
            </label>
            <input
              type="text"
              required
              placeholder="z. B. DUNK-42"
              value={pin}
              onChange={(e) => {
                setPin(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
              className="w-full bg-slate-50 border border-slate-300 focus:border-slate-800 rounded-xl px-4 py-3 text-lg font-mono font-bold text-center tracking-widest text-slate-900 focus:outline-none transition uppercase"
            />
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Name
            </label>
            <input
              type="text"
              required
              placeholder="z. B. Max Mustermann"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
              className="w-full bg-slate-50 border border-slate-300 focus:border-slate-800 rounded-xl px-4 py-3 text-sm font-medium text-slate-900 focus:outline-none transition"
            />
          </div>

          {/* Role Choice */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              Wähle dein Bedienpult
            </label>

            <div className="grid grid-cols-2 gap-3">
              {/* Option 24s Shotclock */}
              <label className={`relative flex flex-col items-center text-center p-3.5 rounded-2xl cursor-pointer border-2 transition select-none ${
                role === 'shotclock'
                  ? 'border-indigo-600 bg-indigo-50/50 text-indigo-950 font-bold shadow-sm'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300'
              }`}>
                <input
                  type="radio"
                  name="role"
                  value="shotclock"
                  checked={role === 'shotclock'}
                  onChange={() => setRole('shotclock')}
                  className="sr-only"
                />
                <Timer className={`w-7 h-7 mb-1 ${role === 'shotclock' ? 'text-indigo-600' : 'text-slate-500'}`} />
                <span className="text-xs font-bold">24s Shotclock</span>
                <span className="text-[10px] text-slate-500 mt-0.5">Touchscreen Pult</span>
              </label>

              {/* Option Zeitnehmer */}
              <label className={`relative flex flex-col items-center text-center p-3.5 rounded-2xl cursor-pointer border-2 transition select-none ${
                role === 'zeitnehmer'
                  ? 'border-sky-600 bg-sky-50/50 text-sky-950 font-bold shadow-sm'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300'
              }`}>
                <input
                  type="radio"
                  name="role"
                  value="zeitnehmer"
                  checked={role === 'zeitnehmer'}
                  onChange={() => setRole('zeitnehmer')}
                  className="sr-only"
                />
                <SlidersHorizontal className={`w-7 h-7 mb-1 ${role === 'zeitnehmer' ? 'text-sky-600' : 'text-slate-500'}`} />
                <span className="text-xs font-bold">Zeitnehmer</span>
                <span className="text-[10px] text-slate-500 mt-0.5">Hauptanzeige</span>
              </label>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isValidating}
            className={`w-full text-white font-bold text-sm py-3.5 rounded-xl shadow-sm transition flex items-center justify-center gap-2 mt-4 cursor-pointer ${
              isValidating ? 'bg-slate-700 cursor-not-allowed opacity-90' : 'bg-slate-900 hover:bg-slate-800 active:scale-98'
            }`}
          >
            {isValidating ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                <span>Prüfe Sitzung...</span>
              </>
            ) : (
              <>
                <span>Als Teilnehmer beitreten</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Divider for Admin / Trainer */}
        <div className="mt-8 pt-5 border-t border-slate-200">
          <span className="text-xs text-slate-400 block mb-2.5 font-medium text-center">
            Du leitest die Schulung?
          </span>

          <div className="space-y-2">
            <button
              type="button"
              onClick={handleCreateSession}
              disabled={isCreatingSession}
              className="w-full bg-amber-50 hover:bg-amber-100 disabled:opacity-75 text-amber-900 border border-amber-300 font-bold text-xs py-2.5 rounded-xl shadow-sm transition flex items-center justify-center gap-2 cursor-pointer"
            >
              {isCreatingSession ? (
                <>
                  <span className="w-4 h-4 border-2 border-amber-700/30 border-t-amber-700 rounded-full animate-spin"></span>
                  <span>Erstelle Sitzung...</span>
                </>
              ) : (
                <>
                  <Crown className="w-4 h-4 text-amber-700" />
                  <span>Neue Schulungssitzung starten</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleOpenAdminJoin}
              className="w-full bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 hover:border-slate-300 font-semibold text-xs py-2.5 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <KeyRound className="w-4 h-4 text-slate-500" />
              <span>Bestehender Sitzung als Leiter beitreten</span>
            </button>
          </div>
        </div>

      </div>

      {/* Modal: Admin Join Existing Session */}
      {showAdminJoinModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-xl relative animate-scaleUp">
            
            <div className="text-center mb-5">
              <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-amber-200 shadow-inner">
                <KeyRound className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">Schulungsleiter-Zugang</h2>
              <p className="text-xs text-slate-500 mt-1">
                Gib die PIN der bestehenden Schulung ein. Im nächsten Schritt wird deine 4-stellige Admin-PIN abgefragt.
              </p>
            </div>

            {adminJoinError && (
              <div
                role="alert"
                className="mb-4 p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl flex items-start gap-2"
              >
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span className="flex-1">{adminJoinError}</span>
              </div>
            )}

            <form onSubmit={handleAdminJoinSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 text-center">
                  Sitzungs-PIN
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="z. B. DUNK-42"
                  value={adminJoinPin}
                  onChange={(e) => {
                    setAdminJoinPin(e.target.value);
                    if (adminJoinError) setAdminJoinError(null);
                  }}
                  className="w-full bg-slate-50 border border-slate-300 focus:border-amber-600 focus:ring-2 focus:ring-amber-500/20 rounded-xl px-4 py-3 text-lg font-mono font-bold text-center tracking-widest text-slate-900 focus:outline-none transition uppercase"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdminJoinModal(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-3 rounded-xl transition cursor-pointer"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={isAdminJoinValidating || !adminJoinPin.trim()}
                  className="flex-1 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold text-xs py-3 rounded-xl shadow-sm transition flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                >
                  {isAdminJoinValidating ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                      <span>Prüfe...</span>
                    </>
                  ) : (
                    <>
                      <span>Weiter</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </main>
  );
}

export default function LobbyPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-800">
        <div className="text-sm text-slate-400">Lade...</div>
      </main>
    }>
      <LobbyContent />
    </Suspense>
  );
}
