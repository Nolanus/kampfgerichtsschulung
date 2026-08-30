'use client';

import React, { useState, useEffect, use, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import StramatelConsole from '@/components/StramatelConsole';
import ShotclockConsole from '@/components/ShotclockConsole';
import RoleSwitchModal from '@/components/RoleSwitchModal';
import RoleChangedModal from '@/components/RoleChangedModal';
import { getSocket } from '@/lib/socket';
import { ConsoleRole, StramatelState, ShotclockState, RoleSwitchPayload, SyncToMasterPayload, SessionData } from '@/types';
import { RotateCcw, Crown } from 'lucide-react';

interface ConsolePageProps {
  params: Promise<{ pin: string }>;
}

function ConsoleContent({ pin }: { pin: string }) {
  const searchParams = useSearchParams();
  const name = searchParams.get('name') || 'Teilnehmer';
  const initialRoleParam = (searchParams.get('role') || 'shotclock').toLowerCase();
  const initialRole: ConsoleRole = initialRoleParam === 'zeitnehmer' || initialRoleParam === 'stramatel' ? 'zeitnehmer' : 'shotclock';

  const [currentRole, setCurrentRole] = useState<ConsoleRole>(initialRole);
  const [allowRoleSwitch, setAllowRoleSwitch] = useState<boolean>(true);
  const [isSwitchModalOpen, setIsSwitchModalOpen] = useState(false);
  const [isChangingRole, setIsChangingRole] = useState(false);

  // Success / Info Modal state
  const [roleChangedInfo, setRoleChangedInfo] = useState<{
    isOpen: boolean;
    newRole: ConsoleRole;
    changedBy: 'self' | 'admin';
    message?: string;
  }>({
    isOpen: false,
    newRole: initialRole,
    changedBy: 'self',
  });

  // State sync from master
  const [latestStramatelState, setLatestStramatelState] = useState<StramatelState | undefined>(undefined);
  const [latestShotclockState, setLatestShotclockState] = useState<ShotclockState | undefined>(undefined);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  
  // Track if this participant is the active master
  const [isMaster, setIsMaster] = useState(false);

  // Track if the session was closed by the admin
  const [sessionEnded, setSessionEnded] = useState(false);

  // Socket communication for role changes and sync
  useEffect(() => {
    const socket = getSocket();

    function onSessionUpdate(data: SessionData) {
      setSessionData(data);
      if (data.allowParticipantRoleChange !== undefined) {
        setAllowRoleSwitch(data.allowParticipantRoleChange);
      }

      // Determine if current user is master for their active role
      const myId = socket.id;
      if (myId) {
        const masterZeitnehmerId = data.masterConfig?.masterZeitnehmerId || data.masterConfig?.masterId;
        const masterShotclockId = data.masterConfig?.masterShotclockId || data.masterConfig?.masterId;
        const amMaster = currentRole === 'zeitnehmer'
          ? masterZeitnehmerId === myId
          : masterShotclockId === myId;
        
        setIsMaster((prev) => {
          if (!prev && amMaster) {
            setToastMessage('👑 Du wurdest als Master-Referenz für die Gruppe ausgewählt!');
            setTimeout(() => setToastMessage(null), 4000);
          }
          return amMaster;
        });
      }
    }

    function onRoleSwitched(payload: RoleSwitchPayload) {
      setIsChangingRole(false);
      setIsSwitchModalOpen(false);
      setCurrentRole(payload.role);

      if (payload.stramatelState) {
        setLatestStramatelState(payload.stramatelState);
      }
      if (payload.shotclockState) {
        setLatestShotclockState(payload.shotclockState);
      }

      setRoleChangedInfo({
        isOpen: true,
        newRole: payload.role,
        changedBy: payload.changedBy,
        message: payload.message,
      });
    }

    function onForceSync(payload: SyncToMasterPayload) {
      if (payload.stramatelState) {
        setLatestStramatelState(payload.stramatelState);
      }
      if (payload.shotclockState) {
        setLatestShotclockState(payload.shotclockState);
      }
      if (payload.message) {
        setToastMessage(payload.message);
        setTimeout(() => setToastMessage(null), 4000);
      }
    }

    function onSessionEnded() {
      if (typeof document !== 'undefined') {
        try {
          if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
          } else if ((document as any).webkitFullscreenElement) {
            (document as any).webkitExitFullscreen?.();
          }
        } catch {
          // ignore
        }
      }
      setSessionEnded(true);
    }

    function onInitParticipantState(payload: { stramatelState?: StramatelState; shotclockState?: ShotclockState }) {
      if (payload.stramatelState) {
        setLatestStramatelState(payload.stramatelState);
      }
      if (payload.shotclockState) {
        setLatestShotclockState(payload.shotclockState);
      }
    }

    socket.on('session_state', onSessionUpdate);
    socket.on('session_updated', onSessionUpdate);
    socket.on('role_switched', onRoleSwitched);
    socket.on('force_sync_to_master', onForceSync);
    socket.on('init_participant_state', onInitParticipantState);
    socket.on('session_ended', onSessionEnded);
    socket.on('session_not_found', onSessionEnded);

    return () => {
      socket.off('session_state', onSessionUpdate);
      socket.off('session_updated', onSessionUpdate);
      socket.off('role_switched', onRoleSwitched);
      socket.off('force_sync_to_master', onForceSync);
      socket.off('init_participant_state', onInitParticipantState);
      socket.off('session_ended', onSessionEnded);
      socket.off('session_not_found', onSessionEnded);
    };
  }, [currentRole]);

  const handleSelectRole = (role: ConsoleRole) => {
    if (role === currentRole) {
      setIsSwitchModalOpen(false);
      return;
    }

    if (isMaster) {
      alert('Du bist aktuell als Master-Referenz gesetzt und kannst deine Rolle nicht wechseln. Bitte deinen Schulungsleiter, zuerst einen anderen Master einzustellen.');
      setIsSwitchModalOpen(false);
      return;
    }

    setIsChangingRole(true);
    const socket = getSocket();
    if (socket.connected) {
      socket.emit('request_change_role', { pin, role }, (res: { success: boolean; error?: string }) => {
        setIsChangingRole(false);
        if (!res.success) {
          alert(
            res.error === 'MASTER_CANNOT_CHANGE_ROLE'
              ? 'Du bist aktuell als Master-Referenz gesetzt und kannst deine Rolle nicht wechseln.'
              : res.error === 'ROLE_CHANGE_DISABLED'
              ? 'Der Schulungsleiter hat den selbstständigen Rollenwechsel aktuell gesperrt.'
              : 'Fehler beim Rollenwechsel.'
          );
          setIsSwitchModalOpen(false);
        }
      });
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col justify-center py-2 relative">

      {/* Session Ended Screen */}
      {sessionEnded ? (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-md flex items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl border border-slate-200 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center mx-auto">
              <span className="text-sm font-black text-slate-600">END</span>
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Schulungssitzung beendet</h2>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Der Schulungsleiter hat die Sitzung beendet.
              </p>
            </div>
            <a
              href="/"
              className="block bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-2.5 px-4 rounded-xl transition text-center cursor-pointer shadow-sm"
            >
              Zurück zur Lobby
            </a>
          </div>
        </div>
      ) : (
        <>
          {/* Toast Notification for Sync & Master status */}
          {toastMessage && (
            <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 backdrop-blur-md text-white text-xs font-bold px-4 py-2.5 rounded-2xl shadow-xl border border-slate-700 flex items-center gap-2 animate-fadeIn">
              <Crown className="w-3.5 h-3.5 text-amber-400" />
              <span>{toastMessage}</span>
            </div>
          )}

          {/* Main Console view */}
          {currentRole === 'zeitnehmer' ? (
            <StramatelConsole
              key="console-zeitnehmer"
              pin={pin}
              participantName={name}
              isMaster={isMaster}
              allowRoleSwitch={allowRoleSwitch}
              onRequestRoleSwitch={() => setIsSwitchModalOpen(true)}
              initialState={latestStramatelState}
            />
          ) : (
            <ShotclockConsole
              key="console-shotclock"
              pin={pin}
              participantName={name}
              isMaster={isMaster}
              allowRoleSwitch={allowRoleSwitch}
              onRequestRoleSwitch={() => setIsSwitchModalOpen(true)}
              initialState={latestShotclockState}
            />
          )}

          {/* Role Selection Modal */}
          <RoleSwitchModal
            isOpen={isSwitchModalOpen}
            currentRole={currentRole}
            isLoading={isChangingRole}
            onSelectRole={handleSelectRole}
            onClose={() => setIsSwitchModalOpen(false)}
          />

          {/* Role Changed Success / Info Modal */}
          <RoleChangedModal
            isOpen={roleChangedInfo.isOpen}
            newRole={roleChangedInfo.newRole}
            changedBy={roleChangedInfo.changedBy}
            message={roleChangedInfo.message}
            onClose={() => setRoleChangedInfo((prev) => ({ ...prev, isOpen: false }))}
          />
        </>
      )}

    </main>
  );
}

export default function ConsolePage({ params }: ConsolePageProps) {
  const resolvedParams = use(params);
  const pin = resolvedParams.pin.toUpperCase();

  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-800">
        <div className="text-sm text-slate-400">Lade Konsole...</div>
      </main>
    }>
      <ConsoleContent pin={pin} />
    </Suspense>
  );
}
