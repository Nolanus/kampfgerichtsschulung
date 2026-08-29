'use client';

import React from 'react';
import { Participant, StramatelState, ShotclockState, Tolerances, ConsoleRole } from '@/types';
import { getParticipantDeviation } from '@/lib/deviation';
import InstantTooltip from '@/components/InstantTooltip';
import { Crown, AlertTriangle, AlertCircle, CheckCircle2, RotateCcw } from 'lucide-react';

interface CompactParticipantRowProps {
  participant: Participant;
  isMaster: boolean;
  masterStramatel?: StramatelState;
  masterShotclock?: ShotclockState;
  tolerances: Tolerances;
  onSetMaster: (id: string) => void;
  onChangeRole?: (participantId: string, role: ConsoleRole) => void;
  onResetToMaster?: (participantId: string) => void;
}

export default function CompactParticipantRow({
  participant,
  isMaster,
  masterStramatel,
  masterShotclock,
  tolerances,
  onSetMaster,
  onChangeRole,
  onResetToMaster,
}: CompactParticipantRowProps) {
  const isShotclock = participant.role === 'shotclock';
  const deviation = getParticipantDeviation(participant, masterStramatel, masterShotclock, tolerances, isMaster);

  const formatGameTime = (tenths?: number) => {
    if (tenths === undefined) return '10:00.0';
    const totalSec = Math.floor(tenths / 10);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    const t = tenths % 10;
    return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${t}`;
  };

  const formatShotclockTime = (tenths?: number) => {
    if (tenths === undefined) return '24.0s';
    const sec = Math.floor(tenths / 10);
    const t = tenths % 10;
    return `${sec}.${t}s`;
  };

  return (
    <tr
      className={`h-[52px] transition border-l-4 text-xs font-medium ${
        isMaster
          ? isShotclock
            ? 'bg-indigo-50/70 border-indigo-500 hover:bg-indigo-100/60'
            : 'bg-sky-50/70 border-sky-500 hover:bg-sky-100/60'
          : deviation.level === 2
          ? 'bg-red-50/70 border-red-500 hover:bg-red-50'
          : deviation.level === 1
          ? 'bg-amber-50/50 border-amber-400 hover:bg-amber-50/80'
          : 'border-emerald-500 hover:bg-slate-50'
      }`}
    >
      {/* Status Badge (Fixed size & leading-none to prevent height jumps) */}
      <td className="py-1 px-3 whitespace-nowrap text-center align-middle">
        <InstantTooltip
          content={
            <div className="space-y-1.5 text-left min-w-[210px] max-w-[320px]">
              <div className="font-bold border-b border-slate-700/80 pb-1 text-[11px] flex items-center justify-between text-slate-200">
                <span className="flex items-center gap-1.5">
                  {isMaster ? (
                    <>
                      <Crown className={`w-3.5 h-3.5 ${isShotclock ? 'text-indigo-400' : 'text-sky-400'}`} />
                      <span>Master-Referenz</span>
                    </>
                  ) : deviation.level === 2 ? (
                    <>
                      <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                      <span>Stufe 2 (Kritischer Fehler)</span>
                    </>
                  ) : deviation.level === 1 ? (
                    <>
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                      <span>Stufe 1 (Warnung)</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Synchron</span>
                    </>
                  )}
                </span>
                <span className="text-[10px] font-mono text-slate-400 font-normal">
                  {isShotclock ? '24s' : 'Zeit'}
                </span>
              </div>
              {deviation.issues && deviation.issues.length > 0 ? (
                <ul className="space-y-1 text-[11px] pt-0.5">
                  {deviation.issues.map((issue, idx) => (
                    <li key={idx} className="flex items-start gap-1.5 leading-tight">
                      <span className={`font-bold mt-0.5 ${deviation.level === 2 ? 'text-red-400' : 'text-amber-400'}`}>•</span>
                      <span>{issue}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-[11px] text-slate-300">
                  {isMaster
                    ? `Aktiver Referenzwert (${isShotclock ? '24s Shotclock' : 'Zeitnehmer'})`
                    : 'Alle Werte liegen innerhalb der Toleranz'}
                </div>
              )}
            </div>
          }
        >
          {isMaster ? (
            <div
              className={`w-7 h-7 rounded-lg border font-bold text-sm shadow-xs flex items-center justify-center mx-auto leading-none select-none cursor-help ${
                isShotclock
                  ? 'bg-indigo-100 border-indigo-300 text-indigo-900'
                  : 'bg-sky-100 border-sky-300 text-sky-900'
              }`}
            >
              <Crown className={`w-4 h-4 ${isShotclock ? 'text-indigo-800' : 'text-sky-800'}`} />
            </div>
          ) : deviation.level === 2 ? (
            <div className="w-7 h-7 rounded-lg bg-red-100 border border-red-300 text-red-700 font-bold text-sm shadow-xs flex items-center justify-center mx-auto leading-none select-none animate-pulse cursor-help">
              <AlertCircle className="w-4 h-4 text-red-600" />
            </div>
          ) : deviation.level === 1 ? (
            <div className="w-7 h-7 rounded-lg bg-amber-100 border border-amber-300 text-amber-800 font-bold text-sm shadow-xs flex items-center justify-center mx-auto leading-none select-none cursor-help">
              <AlertTriangle className="w-4 h-4 text-amber-700" />
            </div>
          ) : (
            <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold text-sm shadow-xs flex items-center justify-center mx-auto leading-none select-none cursor-help">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
          )}
        </InstantTooltip>
      </td>

      {/* Participant Name */}
      <td className="py-1 px-3 whitespace-nowrap align-middle">
        <div className="font-bold text-slate-900 leading-tight">
          <span className="truncate max-w-[140px] sm:max-w-[180px] block">{participant.name}</span>
        </div>
        <div className="text-[10px] text-slate-400 font-mono leading-tight">
          ID: {participant.id.slice(0, 5)}
        </div>
      </td>

      {/* Role */}
      <td className="py-1 px-3 whitespace-nowrap align-middle">
        <InstantTooltip
          content={
            <div className="space-y-1 text-left min-w-[200px] max-w-[290px]">
              <div className="font-bold border-b border-slate-700/80 pb-1 text-[11px] flex items-center justify-between text-slate-200">
                <span className="flex items-center gap-1.5">
                  {isMaster ? (
                    <>
                      <span className="text-amber-400">🔒</span>
                      <span>Master-Rolle gesperrt</span>
                    </>
                  ) : (
                    <>
                      <span>🔄</span>
                      <span>Bedienpult wechseln</span>
                    </>
                  )}
                </span>
                <span className="text-[10px] font-mono text-slate-400 font-normal">
                  {isShotclock ? 'Shotclock' : 'Hauptanzeige'}
                </span>
              </div>
              <div className="text-[11px] text-slate-300 pt-0.5 leading-tight">
                {isMaster
                  ? `Aktiver Master für ${isShotclock ? '24s Shotclock' : 'Zeitnehmer'}. Die Rolle kann nicht gewechselt werden, solange dieser Teilnehmer Referenzgeber ist.`
                  : `Klicke hier, um ${participant.name} ein anderes Bedienpult zuzuweisen.`}
              </div>
            </div>
          }
        >
          {onChangeRole && !isMaster ? (
            <select
              value={participant.role}
              onChange={(e) => onChangeRole(participant.id, e.target.value as ConsoleRole)}
              className={`text-[11px] font-bold px-2 py-1 rounded-lg border focus:outline-none cursor-pointer transition shadow-xs ${
                isShotclock
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100/80 focus:border-indigo-400'
                  : 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100/80 focus:border-sky-400'
              }`}
            >
              <option value="shotclock">24s Shotclock</option>
              <option value="zeitnehmer">Zeitnehmer</option>
            </select>
          ) : (
            <span
              className={`text-[10px] px-2 py-0.5 rounded font-semibold border inline-flex items-center gap-1 ${
                isShotclock
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                  : 'bg-sky-50 text-sky-700 border-sky-200'
              } ${isMaster ? 'cursor-help opacity-95' : ''}`}
            >
              <span>{isShotclock ? '24s Shotclock' : 'Zeitnehmer'}</span>
              {isMaster && <span className="text-[10px] select-none">🔒</span>}
            </span>
          )}
        </InstantTooltip>
      </td>

      {/* Current Live Value (Fixed height container) */}
      <td className="py-1 px-3 text-center whitespace-nowrap align-middle">
        {isShotclock ? (
          <div className="flex flex-col items-center justify-center">
            <InstantTooltip content={deviation.timeTooltip}>
              {participant.shotclockState?.isDisplayOff ? (
                <span className="font-mono text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 leading-tight inline-block cursor-help">
                  DISPLAY AUS
                </span>
              ) : (
                <span className="font-mono tabular-nums text-sm font-bold text-slate-900 leading-tight inline-block cursor-help hover:text-indigo-900">
                  {formatShotclockTime(participant.shotclockState?.shotclockTenths)}
                </span>
              )}
            </InstantTooltip>
            <div className="h-4 flex items-center justify-center mt-0.5">
              <InstantTooltip content={deviation.stateTooltip}>
                {deviation.stateLevel === 1 ? (
                  <span className="text-[10px] font-bold text-amber-900 bg-amber-100 px-1.5 rounded border border-amber-300 leading-none cursor-help">
                    {participant.shotclockState?.isDisplayOff
                      ? 'AUS (Abw.)'
                      : participant.shotclockState?.isRunning
                      ? 'Läuft (Abw.)'
                      : 'Gestoppt (Abw.)'}
                  </span>
                ) : (
                  <span
                    className={`text-[10px] font-medium leading-none cursor-help ${
                      participant.shotclockState?.isDisplayOff
                        ? 'text-slate-500'
                        : participant.shotclockState?.isRunning
                        ? 'text-emerald-600'
                        : 'text-slate-400'
                    }`}
                  >
                    {participant.shotclockState?.isDisplayOff
                      ? 'Ausgeschaltet'
                      : participant.shotclockState?.isRunning
                      ? 'Läuft'
                      : 'Gestoppt'}
                  </span>
                )}
              </InstantTooltip>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center">
            <InstantTooltip content={deviation.timeTooltip}>
              <span className="font-mono tabular-nums text-sm font-bold text-slate-900 leading-tight inline-block cursor-help hover:text-sky-900">
                {formatGameTime(participant.stramatelState?.gameTimeTenths)}
              </span>
            </InstantTooltip>
            <div className="h-4 flex items-center justify-center mt-0.5">
              <InstantTooltip content={deviation.stateTooltip}>
                {deviation.stateLevel === 1 ? (
                  <span className="text-[10px] font-bold text-amber-900 bg-amber-100 px-1.5 rounded border border-amber-300 leading-none cursor-help">
                    {participant.stramatelState?.isRunning ? 'Läuft (Abw.)' : 'Gestoppt (Abw.)'}
                  </span>
                ) : (
                  <span
                    className={`text-[10px] font-medium leading-none cursor-help ${
                      participant.stramatelState?.isRunning ? 'text-emerald-600' : 'text-slate-400'
                    }`}
                  >
                    {participant.stramatelState?.isRunning ? 'Läuft' : 'Gestoppt'}
                  </span>
                )}
              </InstantTooltip>
            </div>
          </div>
        )}
      </td>

      {/* Delta to Master */}
      <td className="py-1 px-3 text-center whitespace-nowrap align-middle">
        <InstantTooltip content={deviation.deltaTooltip}>
          {isMaster ? (
            <span className="text-slate-400 text-xs font-mono font-bold cursor-help">—</span>
          ) : (
            <span
              className={`font-mono tabular-nums px-2 py-0.5 rounded text-xs font-bold inline-block min-w-[70px] cursor-help ${
                deviation.timeLevel === 2
                  ? 'bg-red-600 text-white shadow-sm'
                  : deviation.timeLevel === 1
                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}
            >
              Δ {deviation.timeDeltaStr}
            </span>
          )}
        </InstantTooltip>
      </td>

      {/* Points (Heim : Gast) */}
      <td className="py-1 px-3 text-center whitespace-nowrap align-middle">
        <InstantTooltip content={deviation.scoreTooltip}>
          {!isShotclock && participant.stramatelState ? (
            <span
              className={`font-mono tabular-nums px-2 py-0.5 rounded text-xs font-bold inline-block cursor-help ${
                deviation.scoreLevel === 2
                  ? 'bg-red-600 text-white shadow-sm'
                  : deviation.scoreLevel === 1
                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                  : 'text-slate-900 hover:bg-slate-100'
              }`}
            >
              {participant.stramatelState.scoreHeim} : {participant.stramatelState.scoreGast}
            </span>
          ) : (
            <span className="text-slate-400 cursor-help">—</span>
          )}
        </InstantTooltip>
      </td>

      {/* Fouls (Heim : Gast) */}
      <td className="py-1 px-3 text-center whitespace-nowrap align-middle">
        <InstantTooltip content={deviation.foulTooltip}>
          {!isShotclock && participant.stramatelState ? (
            <span
              className={`font-mono tabular-nums px-2 py-0.5 rounded text-xs inline-block cursor-help ${
                deviation.foulLevel === 2
                  ? 'bg-red-600 text-white font-bold shadow-sm'
                  : deviation.foulLevel === 1
                  ? 'bg-amber-100 text-amber-900 border border-amber-300 font-bold'
                  : 'text-slate-700 font-semibold hover:bg-slate-100'
              }`}
            >
              {participant.stramatelState.foulsHeim} : {participant.stramatelState.foulsGast}
            </span>
          ) : (
            <span className="text-slate-400 cursor-help">—</span>
          )}
        </InstantTooltip>
      </td>

      {/* Last Action */}
      <td className="py-1 px-3 text-slate-600 font-mono text-[11px] whitespace-nowrap max-w-[160px] truncate align-middle">
        {participant.lastAction || 'Bereit'}
      </td>

      {/* Action (Sync & Set Master) */}
      <td className="py-1 px-3 text-right whitespace-nowrap align-middle">
        <div className="flex items-center justify-end gap-1.5">
          {!isMaster && onResetToMaster && (
            <button
              onClick={() => onResetToMaster(participant.id)}
              className={`text-[11px] font-semibold border px-2 py-1 rounded-lg shadow-sm transition flex items-center gap-1.5 cursor-pointer ${
                deviation.level === 2
                  ? 'bg-red-50 hover:bg-red-100 text-red-700 border-red-200'
                  : deviation.level === 1
                  ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
              }`}
              title="Werte dieses Teilnehmers auf den aktuellen Master-Referenzwert zurücksetzen"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Auf Master sync</span>
            </button>
          )}

          {!isMaster ? (
            <button
              onClick={() => onSetMaster(participant.id)}
              className={`text-[11px] text-slate-600 font-semibold border border-slate-200 px-2 py-1 rounded-lg bg-white shadow-sm transition cursor-pointer flex items-center gap-1 ${
                isShotclock
                  ? 'hover:text-indigo-800 hover:border-indigo-300'
                  : 'hover:text-sky-800 hover:border-sky-300'
              }`}
              title={isShotclock ? 'Diesen Teilnehmer als Shotclock-Master setzen' : 'Diesen Teilnehmer als Zeitnehmer-Master setzen'}
            >
              <Crown className="w-3.5 h-3.5 text-amber-600" />
              <span className="hidden lg:inline">{isShotclock ? 'Shotclock-Master' : 'Zeitnehmer-Master'}</span>
            </button>
          ) : (
            <span
              className={`text-[10px] font-bold border px-2 py-0.5 rounded ${
                isShotclock
                  ? 'text-indigo-800 bg-indigo-100 border-indigo-300'
                  : 'text-sky-800 bg-sky-100 border-sky-300'
              }`}
            >
              Aktiv
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}
