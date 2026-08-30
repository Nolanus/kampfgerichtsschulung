'use client';

import React, { useState, useEffect, use, useCallback, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { getSocket } from '@/lib/socket';
import { soundManager } from '@/lib/audio';
import { computeConsensusStramatel, computeConsensusShotclock } from '@/lib/consensus';
import { SessionData, Participant, Tolerances, StramatelState, ShotclockState, ConsoleRole, AdminAuthPayload } from '@/types';
import { getParticipantDeviation } from '@/lib/deviation';
import CompactParticipantRow from '@/components/CompactParticipantRow';
import MasterDirectEditModal from '@/components/MasterDirectEditModal';
import InstantTooltip from '@/components/InstantTooltip';
import Link from 'next/link';
import {
  ArrowLeft,
  Crown,
  Users,
  User,
  Timer,
  SlidersHorizontal,
  QrCode,
  Copy,
  Check,
  RotateCcw,
  Edit3,
  Lock,
  Unlock,
  Volume2,
  Play,
  Square,
  Settings,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Smartphone,
  Info,
  Eye,
  EyeOff,
  KeyRound,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';

interface AdminPageProps {
  params: Promise<{ pin: string }>;
}

export default function AdminPage({ params }: AdminPageProps) {
  const resolvedParams = use(params);
  const pin = resolvedParams.pin.toUpperCase();

  const [session, setSession] = useState<SessionData>({
    pin,
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    allowParticipantRoleChange: true,
    masterConfig: {
      masterZeitnehmerId: 'trainer',
      masterShotclockId: 'trainer',
      masterId: 'trainer',
      tolerances: {
        gameClockSeconds: 1.5,
        shotClockSeconds: 1.0,
        score: 0,
        fouls: 0,
      },
    },
    trainerStramatelState: {
      gameTimeTenths: 10 * 60 * 10,
      isRunning: false,
      scoreHeim: 0,
      scoreGast: 0,
      foulsHeim: 0,
      foulsGast: 0,
      period: 1,
      timeoutsHeim: 0,
      timeoutsGast: 0,
    },
    trainerShotclockState: {
      shotclockTenths: 240,
      isRunning: false,
      timeoutSecondsLeft: null,
      isTimeoutRunning: false,
    },
    participants: {},
    activityLog: [],
  });

  const [authStatus, setAuthStatus] = useState<'checking' | 'authorized' | 'unauthorized'>('checking');
  const [adminPinInput, setAdminPinInput] = useState('');
  const [authErrorMessage, setAuthErrorMessage] = useState<string | null>(null);
  const [isSubmittingPin, setIsSubmittingPin] = useState(false);
  const [authTimeoutReached, setAuthTimeoutReached] = useState(false);
  const [showAdminPin, setShowAdminPin] = useState(false);
  const [copiedAdminPin, setCopiedAdminPin] = useState(false);

  const [filterRole, setFilterRole] = useState<'all' | 'zeitnehmer' | 'shotclock'>('all');
  const [sortBy, setSortBy] = useState<'errorsFirst' | 'name'>('errorsFirst');
  const [copiedLink, setCopiedLink] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [directEditModal, setDirectEditModal] = useState<{
    isOpen: boolean;
    focusField: 'time' | 'score' | 'period' | 'fouls' | 'shotclock';
  }>({
    isOpen: false,
    focusField: 'time',
  });
  const [resetModal, setResetModal] = useState<{
    isOpen: boolean;
    resetZeitnehmer: boolean;
    resetShotclock: boolean;
  }>({
    isOpen: false,
    resetZeitnehmer: true,
    resetShotclock: true,
  });
  const [showEndSessionModal, setShowEndSessionModal] = useState(false);

  const sessionRef = useRef(session);
  sessionRef.current = session;

  // Instant HTTP & Socket communication with Admin Authentication
  useEffect(() => {
    const socket = getSocket();

    const handleAuthSuccess = (data: AdminAuthPayload) => {
      if (data.adminToken && typeof window !== 'undefined') {
        try {
          localStorage.setItem(`kampfgericht_admin_token_${pin}`, data.adminToken);
        } catch {
          // ignore
        }
      }
      setAuthStatus('authorized');
      setAuthErrorMessage(null);
      setIsSubmittingPin(false);
      setAuthTimeoutReached(false);
    };

    const handleAuthFailed = (data: AdminAuthPayload) => {
      setAuthStatus('unauthorized');
      setIsSubmittingPin(false);
      if (data.error === 'INVALID_ADMIN_CREDENTIALS') {
        setAuthErrorMessage('Die eingegebene Admin-PIN ist nicht korrekt.');
      }
    };

    const onSessionUpdate = (data: SessionData) => {
      setSession(data);
    };

    function attemptAuth() {
      if (typeof window === 'undefined') return;
      const urlParams = new URLSearchParams(window.location.search);
      const urlToken = urlParams.get('token');
      const isNew = urlParams.get('new') === '1';
      const localToken = localStorage.getItem(`kampfgericht_admin_token_${pin}`);
      const token = urlToken || localToken || undefined;

      // 1. Fast HTTP Auth Check (< 20ms)
      fetch('/api/session/admin-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, token }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data && data.success) {
            if (data.session) {
              setSession(data.session);
            }
            handleAuthSuccess(data);
          } else if (data && data.error === 'INVALID_ADMIN_CREDENTIALS') {
            handleAuthFailed(data);
          }
        })
        .catch(() => {
          // Socket fallback will handle it
        });

      // 2. Socket Auth & Live Room Subscription
      socket.emit(
        'admin_join',
        { pin, adminToken: token, createNew: isNew },
        (response: AdminAuthPayload) => {
          if (response) {
            if (response.success) {
              handleAuthSuccess(response);
            } else {
              handleAuthFailed(response);
            }
          }
        }
      );
    }

    // Attach listeners BEFORE attempting authentication
    socket.on('connect', attemptAuth);
    socket.on('admin_auth_success', handleAuthSuccess);
    socket.on('admin_auth_failed', handleAuthFailed);
    socket.on('session_state', onSessionUpdate);
    socket.on('session_updated', onSessionUpdate);

    // Initial auth attempt
    attemptAuth();

    if (!socket.connected) {
      socket.connect();
    }

    // Fallback timer if authorization takes unusually long
    const timeoutTimer = setTimeout(() => {
      setAuthTimeoutReached(true);
    }, 4000);

    return () => {
      clearTimeout(timeoutTimer);
      socket.off('connect', attemptAuth);
      socket.off('admin_auth_success', handleAuthSuccess);
      socket.off('admin_auth_failed', handleAuthFailed);
      socket.off('session_state', onSessionUpdate);
      socket.off('session_updated', onSessionUpdate);
    };
  }, [pin]);

  // Master IDs
  const masterZeitnehmerId = session.masterConfig.masterZeitnehmerId || session.masterConfig.masterId || 'trainer';
  const masterShotclockId = session.masterConfig.masterShotclockId || session.masterConfig.masterId || 'trainer';

  const participantList: Participant[] = Object.values(session.participants || {});
  const zeitnehmerParticipants = participantList.filter(
    (p) => p.role === 'zeitnehmer' || (p.role as string) === 'stramatel'
  );
  const shotclockParticipants = participantList.filter((p) => p.role === 'shotclock');

  // Compute Consensus values
  const consensusStramatel = computeConsensusStramatel(participantList, session.trainerStramatelState);
  const consensusShotclock = computeConsensusShotclock(participantList, session.trainerShotclockState);

  // Active Master values for comparison
  const activeMasterStramatel: StramatelState | undefined =
    masterZeitnehmerId === 'trainer'
      ? session.trainerStramatelState
      : masterZeitnehmerId === 'consensus'
      ? consensusStramatel
      : session.participants[masterZeitnehmerId]?.stramatelState || session.trainerStramatelState;

  const activeMasterShotclock: ShotclockState | undefined =
    masterShotclockId === 'trainer'
      ? session.trainerShotclockState
      : masterShotclockId === 'consensus'
      ? consensusShotclock
      : session.participants[masterShotclockId]?.shotclockState || session.trainerShotclockState;

  // Local Trainer Chrono Tick on Admin
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if ((session.trainerStramatelState?.isRunning || session.trainerStramatelState?.isTimeoutRunning) && masterZeitnehmerId === 'trainer') {
      interval = setInterval(() => {
        setSession((prev) => {
          if (!prev.trainerStramatelState) return prev;
          // Timeout Countdown
          if (prev.trainerStramatelState.isTimeoutRunning && (prev.trainerStramatelState.timeoutTenths ?? 0) > 0) {
            const nextTimeoutTenths = (prev.trainerStramatelState.timeoutTenths ?? 600) - 1;
            const nextState: StramatelState = { ...prev.trainerStramatelState, timeoutTenths: nextTimeoutTenths };
            if (nextTimeoutTenths === 100) {
              soundManager.playTimeoutWarning();
            } else if (nextTimeoutTenths === 0) {
              soundManager.playHorn();
              nextState.isTimeoutRunning = false;
              nextState.timeoutTenths = undefined;
            }
            if (nextTimeoutTenths % 10 === 0 || nextTimeoutTenths === 0) {
              const socket = getSocket();
              if (socket.connected) {
                socket.emit('update_trainer_state', { pin, stramatelState: nextState });
              }
            }
            return { ...prev, trainerStramatelState: nextState };
          }

          if (prev.trainerStramatelState.isRunning) {
            if (prev.trainerStramatelState.isCountUp) {
              const nextTenths = prev.trainerStramatelState.gameTimeTenths + 1;
              const nextState = { ...prev.trainerStramatelState, gameTimeTenths: nextTenths, isCountUp: true };
              if (nextTenths % 10 === 0) {
                const socket = getSocket();
                if (socket.connected) {
                  socket.emit('update_trainer_state', { pin, stramatelState: nextState });
                }
              }
              return { ...prev, trainerStramatelState: nextState };
            } else if (prev.trainerStramatelState.gameTimeTenths > 0) {
              const nextTenths = prev.trainerStramatelState.gameTimeTenths - 1;
              const nextState = { ...prev.trainerStramatelState, gameTimeTenths: nextTenths };
              if (nextTenths === 0) {
                soundManager.playHorn();
                nextState.isCountUp = true;
                nextState.isRunning = true;
              }
              if (nextTenths % 10 === 0 || nextTenths === 0) {
                const socket = getSocket();
                if (socket.connected) {
                  socket.emit('update_trainer_state', { pin, stramatelState: nextState });
                }
              }
              return { ...prev, trainerStramatelState: nextState };
            } else {
              const nextTenths = prev.trainerStramatelState.gameTimeTenths + 1;
              const nextState = { ...prev.trainerStramatelState, gameTimeTenths: nextTenths, isCountUp: true };
              return { ...prev, trainerStramatelState: nextState };
            }
          }
          return prev;
        });
      }, 100);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [session.trainerStramatelState?.isRunning, session.trainerStramatelState?.isTimeoutRunning, masterZeitnehmerId, pin]);

  // Local Trainer Shotclock Tick on Admin
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (session.trainerShotclockState?.isRunning && !session.trainerShotclockState?.isDisplayOff && masterShotclockId === 'trainer') {
      interval = setInterval(() => {
        setSession((prev) => {
          if (!prev.trainerShotclockState || !prev.trainerShotclockState.isRunning || prev.trainerShotclockState.isDisplayOff) return prev;
          if (prev.trainerShotclockState.shotclockTenths > 0) {
            const nextTenths = prev.trainerShotclockState.shotclockTenths - 1;
            const nextState = { ...prev.trainerShotclockState, shotclockTenths: nextTenths };

            if (prev.trainerShotclockState.mode === 'timeoutA' && nextTenths === 100) {
              soundManager.playTimeoutWarning();
            }

            if (nextTenths === 0) {
              soundManager.playBuzzer();
              if (prev.trainerShotclockState.mode === 'timeoutA' || prev.trainerShotclockState.mode === 'timeoutB') {
                const restoredTenths = prev.trainerShotclockState.savedShotclockTenths !== undefined ? prev.trainerShotclockState.savedShotclockTenths : 240;
                nextState.mode = 'shotclock';
                nextState.shotclockTenths = restoredTenths;
                nextState.savedShotclockTenths = undefined;
                nextState.isRunning = false;
              } else {
                nextState.isRunning = false;
              }
            }
            if (nextTenths % 10 === 0 || nextTenths === 0) {
              const socket = getSocket();
              if (socket.connected) {
                socket.emit('update_trainer_state', { pin, shotclockState: nextState });
              }
            }
            return { ...prev, trainerShotclockState: nextState };
          }
          return prev;
        });
      }, 100);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [session.trainerShotclockState?.isRunning, session.trainerShotclockState?.isDisplayOff, masterShotclockId, pin]);

  const updateTrainerShotclock = (updater: (prev: ShotclockState) => ShotclockState) => {
    if (!session.trainerShotclockState) return;
    const nextState = updater(session.trainerShotclockState);
    setSession((prev) => ({ ...prev, trainerShotclockState: nextState }));
    const socket = getSocket();
    if (socket.connected) {
      socket.emit('update_trainer_state', { pin, shotclockState: nextState });
    }
  };

  const toggleTrainerShotclock = () => {
    soundManager.playClick();
    updateTrainerShotclock((prev) => {
      if (prev.isDisplayOff) {
        return {
          ...prev,
          isDisplayOff: false,
          isRunning: true,
          shotclockTenths: prev.shotclockTenths === 0 ? 240 : prev.shotclockTenths,
        };
      }
      const nextRunning = !prev.isRunning;
      const nextTenths = nextRunning && prev.shotclockTenths === 0 ? 240 : prev.shotclockTenths;
      return { ...prev, isRunning: nextRunning, shotclockTenths: nextTenths };
    });
  };

  const toggleTrainerShotclockDisplay = () => {
    soundManager.playClick();
    updateTrainerShotclock((prev) => {
      const nextOff = !prev.isDisplayOff;
      return {
        ...prev,
        isDisplayOff: nextOff,
        isRunning: nextOff ? false : prev.isRunning,
      };
    });
  };

  const setTrainerShotclockTenths = (tenths: number) => {
    soundManager.playClick();
    updateTrainerShotclock((prev) => ({ ...prev, shotclockTenths: tenths, isDisplayOff: false }));
  };

  const adjustTrainerShotclock = (deltaSeconds: number) => {
    soundManager.playClick();
    updateTrainerShotclock((prev) => ({
      ...prev,
      isDisplayOff: false,
      shotclockTenths: Math.max(0, Math.min(240, prev.shotclockTenths + deltaSeconds * 10)),
    }));
  };

  // Tolerance config update
  const updateTolerances = (updates: Partial<Tolerances>) => {
    const newTolerances = { ...session.masterConfig.tolerances, ...updates };
    const socket = getSocket();
    if (socket.connected) {
      socket.emit('update_master_config', {
        pin,
        masterConfig: {
          ...session.masterConfig,
          tolerances: newTolerances,
        },
      });
    }
  };

  // Master Selection Handlers
  const handleSetMasterForRole = useCallback(
    (role: ConsoleRole, id: string) => {
      const socket = getSocket();
      if (!socket.connected) return;

      const newConfig = {
        ...session.masterConfig,
        masterZeitnehmerId: role === 'zeitnehmer' ? id : masterZeitnehmerId,
        masterShotclockId: role === 'shotclock' ? id : masterShotclockId,
      };

      socket.emit('update_master_config', {
        pin,
        masterConfig: newConfig,
      });
    },
    [pin, session.masterConfig, masterZeitnehmerId, masterShotclockId]
  );

  // Trainer Stramatel Actions
  const updateTrainerStramatel = (updater: (prev: StramatelState) => StramatelState) => {
    if (!session.trainerStramatelState) return;
    const nextState = updater(session.trainerStramatelState);
    setSession((prev) => ({ ...prev, trainerStramatelState: nextState }));
    const socket = getSocket();
    if (socket.connected) {
      socket.emit('update_trainer_state', { pin, stramatelState: nextState });
    }
  };

  const toggleTrainerChrono = () => {
    soundManager.playBeep(900, 0.08);
    updateTrainerStramatel((prev) => ({ ...prev, isRunning: !prev.isRunning }));
  };

  const adjustTrainerScore = (team: 'Heim' | 'Gast', delta: number) => {
    soundManager.playBeep(1100, 0.05);
    updateTrainerStramatel((prev) => ({
      ...prev,
      scoreHeim: team === 'Heim' ? Math.max(0, prev.scoreHeim + delta) : prev.scoreHeim,
      scoreGast: team === 'Gast' ? Math.max(0, prev.scoreGast + delta) : prev.scoreGast,
    }));
  };

  const adjustTrainerFouls = (team: 'Heim' | 'Gast', delta: number) => {
    soundManager.playBeep(700, 0.06);
    updateTrainerStramatel((prev) => ({
      ...prev,
      foulsHeim: team === 'Heim' ? Math.max(0, prev.foulsHeim + delta) : prev.foulsHeim,
      foulsGast: team === 'Gast' ? Math.max(0, prev.foulsGast + delta) : prev.foulsGast,
    }));
  };

  const adjustTrainerPeriod = (delta: number) => {
    soundManager.playBeep(600, 0.1);
    updateTrainerStramatel((prev) => ({
      ...prev,
      period: Math.max(1, prev.period + delta),
      foulsHeim: delta > 0 ? 0 : prev.foulsHeim,
      foulsGast: delta > 0 ? 0 : prev.foulsGast,
      gameTimeTenths: delta > 0 ? 10 * 60 * 10 : prev.gameTimeTenths,
      isCountUp: false,
      isRunning: false,
    }));
  };

  const adjustTrainerGameTime = (deltaSeconds: number) => {
    soundManager.playBeep(800, 0.05);
    updateTrainerStramatel((prev) => ({
      ...prev,
      gameTimeTenths: Math.max(0, prev.gameTimeTenths + deltaSeconds * 10),
      isCountUp: false,
    }));
  };

  const resetTrainerGameTime = (minutes: number = 10) => {
    soundManager.playBeep(800, 0.05);
    updateTrainerStramatel((prev) => ({
      ...prev,
      gameTimeTenths: minutes * 60 * 10,
      isRunning: false,
      isCountUp: false,
    }));
  };

  const playTrainerHorn = () => {
    soundManager.playHorn();
  };

  const playTrainerBuzzer = () => {
    soundManager.playBuzzer();
  };

  const handleSaveStramatelDirect = (newState: StramatelState) => {
    soundManager.playBeep(800, 0.05);
    setSession((prev) => ({ ...prev, trainerStramatelState: newState }));
    const socket = getSocket();
    if (socket.connected) {
      socket.emit('update_trainer_state', { pin, stramatelState: newState });
    }
  };

  const handleSaveShotclockDirect = (newState: ShotclockState) => {
    soundManager.playClick();
    setSession((prev) => ({ ...prev, trainerShotclockState: newState }));
    const socket = getSocket();
    if (socket.connected) {
      socket.emit('update_trainer_state', { pin, shotclockState: newState });
    }
  };

  // Session settings
  const toggleRoleSwitchAllowed = () => {
    const socket = getSocket();
    if (socket.connected) {
      socket.emit('update_session_settings', {
        pin,
        allowParticipantRoleChange: !(session.allowParticipantRoleChange ?? true),
      });
    }
  };

  const handleChangeParticipantRole = (participantId: string, role: ConsoleRole) => {
    const socket = getSocket();
    if (socket.connected) {
      socket.emit('admin_change_participant_role', {
        pin,
        participantId,
        role,
      });
    }
  };

  const handleResetParticipantToMaster = (participantId: string) => {
    const socket = getSocket();
    if (socket.connected) {
      socket.emit('reset_participant_to_master', {
        pin,
        participantId,
      });
    }
  };

  const handleOpenResetModal = () => {
    setResetModal({
      isOpen: true,
      resetZeitnehmer: true,
      resetShotclock: true,
    });
  };

  const handleConfirmResetAllToMaster = () => {
    const roles: ('zeitnehmer' | 'shotclock')[] = [];
    if (resetModal.resetZeitnehmer) roles.push('zeitnehmer');
    if (resetModal.resetShotclock) roles.push('shotclock');

    if (roles.length === 0) return;

    const socket = getSocket();
    if (socket.connected) {
      socket.emit('reset_all_to_master', { pin, roles });
    }
    setResetModal((prev) => ({ ...prev, isOpen: false }));
  };

  const handleEndSession = async () => {
    let localToken: string | null = null;
    if (typeof window !== 'undefined') {
      try {
        localToken = localStorage.getItem(`kampfgericht_admin_token_${pin}`);
      } catch {
        // ignore
      }
    }
    const token = localToken || session.adminToken;
    const adminPin = session.adminPin;

    setShowEndSessionModal(false);

    // 1. Delete via HTTP API
    try {
      await fetch('/api/session/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, token, adminPin }),
      });
    } catch (err) {
      console.warn('HTTP session delete error:', err);
    }

    // 2. Also send via Socket if connected
    const socket = getSocket();
    if (socket.connected) {
      socket.emit('delete_session', { pin, token, adminPin });
    }

    // 3. Clear local storage token
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(`kampfgericht_admin_token_${pin}`);
      } catch {
        // ignore
      }
    }

    // 4. Navigate back to lobby after network flush
    setTimeout(() => {
      window.location.href = '/';
    }, 150);
  };

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminPinInput.trim() || isSubmittingPin) return;
    setIsSubmittingPin(true);
    setAuthErrorMessage(null);
    const pinToVerify = adminPinInput.trim();

    try {
      const res = await fetch('/api/session/admin-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, adminPin: pinToVerify }),
      });
      const data = await res.json();
      if (data && data.success) {
        if (data.adminToken && typeof window !== 'undefined') {
          try {
            localStorage.setItem(`kampfgericht_admin_token_${pin}`, data.adminToken);
          } catch {
            // ignore
          }
        }
        if (data.session) {
          setSession(data.session);
        }
        setAuthStatus('authorized');
        setAuthErrorMessage(null);
        setIsSubmittingPin(false);

        const socket = getSocket();
        socket.emit('admin_join', { pin, adminPin: pinToVerify });
        return;
      }
    } catch {
      // fallback to socket
    }

    const socket = getSocket();
    const doSubmit = () => {
      socket.emit(
        'admin_join',
        { pin, adminPin: pinToVerify },
        (response: AdminAuthPayload) => {
          setIsSubmittingPin(false);
          if (response) {
            if (response.success) {
              if (response.adminToken && typeof window !== 'undefined') {
                try {
                  localStorage.setItem(`kampfgericht_admin_token_${pin}`, response.adminToken);
                } catch {
                  // ignore
                }
              }
              setAuthStatus('authorized');
              setAuthErrorMessage(null);
            } else {
              setAuthStatus('unauthorized');
              setAuthErrorMessage('Die eingegebene Admin-PIN ist nicht korrekt.');
            }
          }
        }
      );
    };

    if (!socket.connected) {
      socket.connect();
      socket.once('connect', doSubmit);
    } else {
      doSubmit();
    }
  };

  const copyAdminPin = () => {
    if (!session.adminPin || typeof window === 'undefined') return;
    navigator.clipboard?.writeText(session.adminPin);
    setCopiedAdminPin(true);
    setTimeout(() => setCopiedAdminPin(false), 2500);
  };

  const copyJoinLink = () => {
    if (typeof window === 'undefined') return;
    const url = `${window.location.origin}/?pin=${pin}`;
    navigator.clipboard?.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // Participant filtering & sorting
  const filteredParticipants = participantList.filter((p) => {
    if (filterRole === 'all') return true;
    return p.role === filterRole || (filterRole === 'zeitnehmer' && (p.role as string) === 'stramatel');
  });

  // Calculate deviations for all participants using 2-stage system
  const participantDeviations = new Map(
    participantList.map((p) => {
      const isShotclock = p.role === 'shotclock';
      const isMaster = isShotclock ? p.id === masterShotclockId : p.id === masterZeitnehmerId;
      const dev = getParticipantDeviation(
        p,
        activeMasterStramatel,
        activeMasterShotclock,
        session.masterConfig.tolerances,
        isMaster
      );
      return [p.id, dev];
    })
  );

  // Calculate error status for sorting (Stufe 2 Rot > Stufe 1 Gelb > In Toleranz)
  const sortedParticipants = [...filteredParticipants].sort((a, b) => {
    if (sortBy === 'name') {
      return a.name.localeCompare(b.name);
    }
    const aIsMaster = (a.role === 'zeitnehmer' && a.id === masterZeitnehmerId) || (a.role === 'shotclock' && a.id === masterShotclockId);
    const bIsMaster = (b.role === 'zeitnehmer' && b.id === masterZeitnehmerId) || (b.role === 'shotclock' && b.id === masterShotclockId);
    if (aIsMaster) return -1;
    if (bIsMaster) return 1;

    const aDev = participantDeviations.get(a.id);
    const bDev = participantDeviations.get(b.id);
    const aLevel = aDev?.level ?? 0;
    const bLevel = bDev?.level ?? 0;

    if (aLevel !== bLevel) {
      return bLevel - aLevel; // Stufe 2 vor Stufe 1 vor Stufe 0
    }

    const aDiff = Math.abs(aDev?.timeDiffSec ?? 0);
    const bDiff = Math.abs(bDev?.timeDiffSec ?? 0);
    if (aDiff !== bDiff) {
      return bDiff - aDiff;
    }

    return a.name.localeCompare(b.name);
  });

  const critErrorsCount = participantList.filter((p) => {
    const dev = participantDeviations.get(p.id);
    return !dev?.isMaster && dev?.level === 2;
  }).length;

  const warnErrorsCount = participantList.filter((p) => {
    const dev = participantDeviations.get(p.id);
    return !dev?.isMaster && dev?.level === 1;
  }).length;

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

  // Screen 1: Checking Authentication
  if (authStatus === 'checking') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white border border-slate-200 rounded-3xl p-8 max-w-sm w-full text-center shadow-sm space-y-4">
          <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto border border-amber-200 shadow-inner">
            <KeyRound className="w-7 h-7 animate-pulse" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Schulungsleiter-Zugang</h2>
            <p className="text-xs text-slate-500 mt-1">Prüfe Autorisierung für Sitzung <span className="font-mono font-bold text-slate-700">{pin}</span>...</p>
          </div>
          <div className="flex justify-center pt-2">
            <span className="w-6 h-6 border-2 border-amber-600/20 border-t-amber-600 rounded-full animate-spin"></span>
          </div>

          {authTimeoutReached && (
            <div className="pt-3 border-t border-slate-100 space-y-2.5">
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-2.5">
                Verbindung dauert länger als gewöhnlich.
              </p>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const socket = getSocket();
                    if (!socket.connected) socket.connect();
                    const urlParams = new URLSearchParams(window.location.search);
                    const urlToken = urlParams.get('token');
                    const localToken = localStorage.getItem(`kampfgericht_admin_token_${pin}`);
                    const token = urlToken || localToken || undefined;
                    socket.emit('admin_join', { pin, adminToken: token });
                  }}
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs py-2 px-3 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Erneut prüfen</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAuthStatus('unauthorized')}
                  className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-2 px-3 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>PIN manuell eingeben</span>
                </button>
                <Link
                  href="/"
                  className="text-xs text-slate-500 hover:text-slate-800 font-medium inline-flex items-center justify-center gap-1 mt-1 transition"
                >
                  <ArrowLeft className="w-3 h-3" />
                  <span>Zurück zur Startseite</span>
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Screen 2: Unauthorized (Admin-PIN challenge)
  if (authStatus === 'unauthorized') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-sm">
          <div className="text-center mb-6">
            <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-amber-200 shadow-inner">
              <Lock className="w-7 h-7 text-amber-600" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Schulungsleiter-Zugang</h1>
            <div className="mt-1 flex items-center justify-center gap-1.5 text-xs text-slate-500">
              <span>Sitzung:</span>
              <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                {pin}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-3 leading-relaxed">
              Dieses Panel ist für Schulungsleiter geschützt. Bitte gib die 4-stellige Admin-PIN ein, um das Panel freizuschalten.
            </p>
          </div>

          {authErrorMessage && (
            <div
              role="alert"
              className="mb-4 p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{authErrorMessage}</span>
            </div>
          )}

          <form onSubmit={handlePinSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 text-center">
                4-stellige Admin-PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={8}
                required
                autoFocus
                placeholder="••••"
                value={adminPinInput}
                onChange={(e) => {
                  setAdminPinInput(e.target.value);
                  if (authErrorMessage) setAuthErrorMessage(null);
                }}
                className="w-full bg-slate-50 border border-slate-300 focus:border-amber-600 focus:ring-2 focus:ring-amber-500/20 rounded-xl px-4 py-3 text-2xl font-mono font-bold text-center tracking-widest text-slate-900 focus:outline-none transition"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmittingPin || !adminPinInput.trim()}
              className="w-full bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold text-xs py-3.5 rounded-xl shadow-sm transition flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              {isSubmittingPin ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  <span>Prüfe PIN...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Panel freischalten</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-200 text-center">
            <Link
              href="/"
              className="text-xs text-slate-500 hover:text-slate-800 font-medium inline-flex items-center gap-1.5 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Zurück zur Teilnehmer-Lobby</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Screen 3: Authorized Admin Dashboard
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans p-3 sm:p-6 max-w-[1600px] mx-auto space-y-3.5">
      
      {/* Top Navigation & Session Management Header */}
      <header className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/" className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg text-xs transition flex items-center gap-1.5 cursor-pointer">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Lobby</span>
          </Link>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <h1 className="text-base sm:text-lg font-bold text-slate-900">
              Kampfgericht Schulungsleiter
            </h1>
            <span className="bg-slate-100 text-slate-700 border border-slate-200 text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap">
              {participantList.length} {participantList.length === 1 ? 'Teilnehmer aktiv' : 'Teilnehmer aktiv'} ({zeitnehmerParticipants.length} Zeitnehmer • {shotclockParticipants.length} Shotclock)
            </span>
          </div>
        </div>

        {/* Controls — two rows */}
        <div className="flex flex-col gap-1.5">
          {/* Row 1: Role controls */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={toggleRoleSwitchAllowed}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition flex items-center gap-1.5 cursor-pointer ${
                (session.allowParticipantRoleChange ?? true)
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                  : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
              }`}
              title="Teilnehmern erlauben, ihr Bedienpult selbstständig zu wechseln"
            >
              {(session.allowParticipantRoleChange ?? true) ? (
                <>
                  <Unlock className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Rollenwechsel frei</span>
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5 text-amber-700" />
                  <span>Rollen gesperrt</span>
                </>
              )}
            </button>

            <button
              onClick={handleOpenResetModal}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
              title="Teilnehmerwerte auf den aktuellen Master zurücksetzen"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Alle auf Master synchronisieren</span>
            </button>
          </div>

          {/* Row 2: Close session + Admin PIN */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowEndSessionModal(true)}
              className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
              title="Schulungssitzung beenden und alle Teilnehmer trennen"
            >
              <span>Schulungssitzung beenden</span>
            </button>

            {/* SCREEN-SHARING SAFE ADMIN PIN WIDGET (Masked by default) */}
            <div className="bg-white border border-amber-300 px-3 py-1.5 rounded-xl flex items-center gap-2">
              <div className="flex items-center gap-1 text-[10px] text-amber-600 font-bold uppercase tracking-wider">
                <Lock className="w-3 h-3 text-amber-500" />
                <span>Admin-PIN:</span>
              </div>
              <span className="font-mono font-bold text-amber-700 text-xs sm:text-sm tracking-widest select-all min-w-[3.5rem] text-center">
                {showAdminPin ? (session.adminPin || '----') : '••••'}
              </span>
              <button
                type="button"
                onClick={() => setShowAdminPin(!showAdminPin)}
                className="text-[10px] bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 font-medium px-2 py-0.5 rounded-md transition cursor-pointer flex items-center gap-1"
                title={showAdminPin ? "Admin-PIN verbergen (für Screensharing/Beamer)" : "Admin-PIN aufdecken"}
              >
                {showAdminPin ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                <span>{showAdminPin ? 'Verbergen' : 'Zeigen'}</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* DEDICATED PARTICIPANT JOIN & SCREEN-SHARING SAFE ADMIN SECTION */}
      <section className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white rounded-2xl p-3 sm:p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3 border border-slate-700/60">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center flex-shrink-0">
            <Smartphone className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
              <span>Beitritt für Teilnehmer</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Teilnehmer öffnen die Webseite und treten mit der Teilnehmer-PIN bei
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Public Participant PIN */}
          <div className="bg-white/10 border border-white/20 px-3.5 py-1.5 rounded-xl flex items-center gap-2.5 shadow-inner">
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">PIN:</span>
            <span className="font-mono font-black text-white text-base sm:text-lg tracking-widest select-all">{pin}</span>
            <button
              onClick={copyJoinLink}
              className="text-[11px] bg-white text-slate-900 hover:bg-slate-100 font-bold px-2.5 py-1 rounded-lg shadow-sm transition cursor-pointer ml-1 flex items-center gap-1"
              title="Direktlink mit PIN in die Zwischenablage kopieren"
            >
              {copiedLink ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Kopiert</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-700" />
                  <span>Link kopieren</span>
                </>
              )}
            </button>
          </div>

          {/* QR-Code Button */}
          <button
            onClick={() => setShowQrModal(true)}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer"
            title="QR-Code für Tablets auf dem Beamer / Bildschirm groß anzeigen"
          >
            <QrCode className="w-4 h-4" />
            <span>QR-Code</span>
          </button>

        </div>
      </section>

      {/* DUAL MASTER BENCHMARK PANELS */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        
        {/* PANEL 1: ZEITNEHMER MASTER */}
        <div className="bg-white border-2 border-sky-500/70 rounded-2xl p-4 shadow-sm flex flex-col justify-between space-y-3">
          <div>
            {/* Header & Selector */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-sky-100 border border-sky-300 text-sky-800 flex items-center justify-center font-bold">
                  <SlidersHorizontal className="w-4 h-4 text-sky-800" />
                </div>
                <div>
                  <div className="text-[10px] font-bold text-sky-900 uppercase tracking-wider">
                    Master Referenz: Zeitnehmer (Hauptuhr)
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <select
                      value={masterZeitnehmerId}
                      onChange={(e) => handleSetMasterForRole('zeitnehmer', e.target.value)}
                      className="font-bold text-slate-900 bg-sky-50/70 border border-sky-300 rounded-lg px-2 py-1 text-xs focus:outline-none cursor-pointer"
                    >
                      <option value="trainer">Schulungsleiter (Referenz-Pult)</option>
                      <option value="consensus">Schwarm-Konsens (Median & Mehrheit)</option>
                      <optgroup label="Teilnehmer (Zeitnehmer)">
                        {zeitnehmerParticipants.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>
                </div>
              </div>

              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border self-start sm:self-center flex items-center gap-1 ${
                masterZeitnehmerId === 'trainer'
                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                  : masterZeitnehmerId === 'consensus'
                  ? 'bg-blue-100 text-blue-900 border-blue-300'
                  : 'bg-sky-100 text-sky-900 border-sky-300'
              }`}>
                {masterZeitnehmerId === 'trainer' && (
                  <>
                    <Crown className="w-3 h-3 text-amber-700" />
                    <span>Trainer-Pult</span>
                  </>
                )}
                {masterZeitnehmerId === 'consensus' && (
                  <>
                    <Users className="w-3 h-3 text-blue-700" />
                    <span>Gruppen-Konsens</span>
                  </>
                )}
                {masterZeitnehmerId !== 'trainer' && masterZeitnehmerId !== 'consensus' && (
                  <>
                    <User className="w-3 h-3 text-sky-700" />
                    <span>Teilnehmer-Master</span>
                  </>
                )}
              </span>
            </div>

            {/* Live Indicator Values */}
            <div className="grid grid-cols-4 gap-2 bg-slate-50 border border-slate-200 rounded-xl p-2.5 mt-2 text-center">
              {/* Spielzeit */}
              <div
                onClick={masterZeitnehmerId === 'trainer' ? () => setDirectEditModal({ isOpen: true, focusField: 'time' }) : undefined}
                className={`p-1 rounded-lg select-none relative transition ${
                  masterZeitnehmerId === 'trainer'
                    ? 'group hover:bg-emerald-100/60 hover:shadow-xs cursor-pointer'
                    : 'cursor-default'
                }`}
                title={masterZeitnehmerId === 'trainer' ? 'Antippen/Klicken zum direkten Setzen der Spielzeit' : `Referenzwert wird von ${masterZeitnehmerId === 'consensus' ? 'Schwarm-Konsens' : (session.participants[masterZeitnehmerId]?.name || 'Teilnehmer')} vorgegeben`}
              >
                <div className="flex items-center justify-center gap-1">
                  <span className={`text-[10px] uppercase font-bold text-slate-400 block ${masterZeitnehmerId === 'trainer' ? 'group-hover:text-emerald-800' : ''}`}>Spielzeit</span>
                  {masterZeitnehmerId === 'trainer' && <Edit3 className="w-3 h-3 text-slate-400 group-hover:text-emerald-800 opacity-0 group-hover:opacity-100 transition" />}
                </div>
                <span className={`font-mono text-base sm:text-lg font-bold text-slate-900 ${masterZeitnehmerId === 'trainer' ? 'group-hover:text-emerald-950' : ''}`}>
                  {formatGameTime(activeMasterStramatel?.gameTimeTenths)}
                </span>
                <span className={`text-[10px] font-semibold block ${activeMasterStramatel?.isRunning ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {activeMasterStramatel?.isRunning ? '● Läuft' : '○ Gestoppt'}
                </span>
              </div>

              {/* Punkte */}
              <div
                onClick={masterZeitnehmerId === 'trainer' ? () => setDirectEditModal({ isOpen: true, focusField: 'score' }) : undefined}
                className={`border-l border-slate-200 p-1 rounded-lg select-none relative transition ${
                  masterZeitnehmerId === 'trainer'
                    ? 'group hover:bg-emerald-100/60 hover:shadow-xs cursor-pointer'
                    : 'cursor-default'
                }`}
                title={masterZeitnehmerId === 'trainer' ? 'Antippen/Klicken zum direkten Setzen der Punkte' : `Referenzwert wird von ${masterZeitnehmerId === 'consensus' ? 'Schwarm-Konsens' : (session.participants[masterZeitnehmerId]?.name || 'Teilnehmer')} vorgegeben`}
              >
                <div className="flex items-center justify-center gap-1">
                  <span className={`text-[10px] uppercase font-bold text-slate-400 block ${masterZeitnehmerId === 'trainer' ? 'group-hover:text-emerald-800' : ''}`}>Punkte (H:G)</span>
                  {masterZeitnehmerId === 'trainer' && <Edit3 className="w-3 h-3 text-slate-400 group-hover:text-emerald-800 opacity-0 group-hover:opacity-100 transition" />}
                </div>
                <span className={`font-mono text-sm sm:text-base font-bold text-slate-900 ${masterZeitnehmerId === 'trainer' ? 'group-hover:text-emerald-950' : ''}`}>
                  {activeMasterStramatel?.scoreHeim ?? 0} : {activeMasterStramatel?.scoreGast ?? 0}
                </span>
                <span className="text-[10px] text-slate-500 font-medium block">Spielstand</span>
              </div>

              {/* Periode */}
              <div
                onClick={masterZeitnehmerId === 'trainer' ? () => setDirectEditModal({ isOpen: true, focusField: 'period' }) : undefined}
                className={`border-l border-slate-200 p-1 rounded-lg select-none relative transition ${
                  masterZeitnehmerId === 'trainer'
                    ? 'group hover:bg-emerald-100/60 hover:shadow-xs cursor-pointer'
                    : 'cursor-default'
                }`}
                title={masterZeitnehmerId === 'trainer' ? 'Antippen/Klicken zum direkten Setzen des Viertels' : `Referenzwert wird von ${masterZeitnehmerId === 'consensus' ? 'Schwarm-Konsens' : (session.participants[masterZeitnehmerId]?.name || 'Teilnehmer')} vorgegeben`}
              >
                <div className="flex items-center justify-center gap-1">
                  <span className={`text-[10px] uppercase font-bold text-slate-400 block ${masterZeitnehmerId === 'trainer' ? 'group-hover:text-emerald-800' : ''}`}>Periode</span>
                  {masterZeitnehmerId === 'trainer' && <Edit3 className="w-3 h-3 text-slate-400 group-hover:text-emerald-800 opacity-0 group-hover:opacity-100 transition" />}
                </div>
                <span className={`font-mono text-sm sm:text-base font-bold text-slate-900 ${masterZeitnehmerId === 'trainer' ? 'group-hover:text-emerald-950' : ''}`}>
                  {activeMasterStramatel?.period ? (activeMasterStramatel.period > 4 ? `OT${activeMasterStramatel.period - 4}` : `Q${activeMasterStramatel.period}`) : 'Q1'}
                </span>
                <span className="text-[10px] text-slate-500 font-medium block">Viertel</span>
              </div>

              {/* Teamfouls */}
              <div
                onClick={masterZeitnehmerId === 'trainer' ? () => setDirectEditModal({ isOpen: true, focusField: 'fouls' }) : undefined}
                className={`border-l border-slate-200 p-1 rounded-lg select-none relative transition ${
                  masterZeitnehmerId === 'trainer'
                    ? 'group hover:bg-emerald-100/60 hover:shadow-xs cursor-pointer'
                    : 'cursor-default'
                }`}
                title={masterZeitnehmerId === 'trainer' ? 'Antippen/Klicken zum direkten Setzen der Teamfouls' : `Referenzwert wird von ${masterZeitnehmerId === 'consensus' ? 'Schwarm-Konsens' : (session.participants[masterZeitnehmerId]?.name || 'Teilnehmer')} vorgegeben`}
              >
                <div className="flex items-center justify-center gap-1">
                  <span className={`text-[10px] uppercase font-bold text-slate-400 block ${masterZeitnehmerId === 'trainer' ? 'group-hover:text-emerald-800' : ''}`}>Teamfouls</span>
                  {masterZeitnehmerId === 'trainer' && <Edit3 className="w-3 h-3 text-slate-400 group-hover:text-emerald-800 opacity-0 group-hover:opacity-100 transition" />}
                </div>
                <span className={`font-mono text-sm sm:text-base font-bold text-slate-900 ${masterZeitnehmerId === 'trainer' ? 'group-hover:text-emerald-950' : ''}`}>
                  {activeMasterStramatel?.foulsHeim ?? 0} | {activeMasterStramatel?.foulsGast ?? 0}
                </span>
                <span className="text-[10px] text-slate-500 font-medium block">H | G</span>
              </div>
            </div>
          </div>

          {/* Interactive Trainer Controls */}
          {masterZeitnehmerId === 'trainer' ? (
            <div className="bg-sky-50/60 border border-sky-200 rounded-xl p-2.5 space-y-2">
              <div className="text-[10px] font-bold text-sky-900 uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Crown className="w-3.5 h-3.5 text-amber-600" />
                  <span>Schulungsleiter Schnellsteuerung (Hauptuhr)</span>
                </span>
                <span className="text-slate-500 font-normal">Antippen / Klick steuert den Referenzwert</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                {/* Chrono Start / Stop */}
                <button
                  onClick={toggleTrainerChrono}
                  className={`py-2 px-3 rounded-lg font-bold text-xs shadow-sm transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    session.trainerStramatelState?.isRunning
                      ? 'bg-slate-800 hover:bg-slate-900 text-white'
                      : 'bg-sky-600 hover:bg-sky-700 text-white'
                  }`}
                >
                  {session.trainerStramatelState?.isRunning ? (
                    <>
                      <Square className="w-3.5 h-3.5" />
                      <span>CHRONO STOPP</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" />
                      <span>CHRONO START</span>
                    </>
                  )}
                </button>

                {/* Time adjustments */}
                <div className="flex gap-1">
                  <button
                    onClick={() => adjustTrainerGameTime(10)}
                    className="flex-1 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-[11px] font-bold py-1.5 rounded-lg transition cursor-pointer"
                    title="+10 Sekunden"
                  >
                    +10s
                  </button>
                  <button
                    onClick={() => adjustTrainerGameTime(-10)}
                    className="flex-1 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-[11px] font-bold py-1.5 rounded-lg transition cursor-pointer"
                    title="-10 Sekunden"
                  >
                    -10s
                  </button>
                </div>

                {/* Period -1 and +1 & Horn */}
                <div className="flex gap-1">
                  <button
                    onClick={() => adjustTrainerPeriod(-1)}
                    disabled={(session.trainerStramatelState?.period ?? 1) <= 1}
                    className="flex-1 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white border border-slate-300 text-slate-700 text-[11px] font-bold py-1.5 rounded-lg transition cursor-pointer"
                    title="1 Viertel zurückgehen"
                  >
                    -1 Q
                  </button>
                  <button
                    onClick={() => adjustTrainerPeriod(1)}
                    className="flex-1 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-[11px] font-bold py-1.5 rounded-lg transition cursor-pointer"
                    title="Nächstes Viertel (+1)"
                  >
                    +1 Q
                  </button>
                  <button
                    onClick={playTrainerHorn}
                    className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs px-2.5 py-1.5 rounded-lg transition cursor-pointer flex items-center justify-center"
                    title="Sirene abspielen"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Direct Set Button */}
                <button
                  onClick={() => setDirectEditModal({ isOpen: true, focusField: 'time' })}
                  className="bg-white hover:bg-sky-100/70 border border-sky-300 text-sky-950 font-bold text-xs py-1.5 px-2.5 rounded-lg shadow-sm transition flex items-center justify-center gap-1.5 cursor-pointer"
                  title="Werte direkt eingeben / ändern"
                >
                  <Edit3 className="w-3.5 h-3.5 text-sky-800" />
                  <span>Direkt setzen</span>
                </button>
              </div>

              {/* Quick Score & Fouls Controls */}
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-sky-200/60 text-xs">
                {/* Heim */}
                <div className="bg-white border border-slate-200 rounded-lg p-1.5 flex items-center justify-between">
                  <span className="font-bold text-slate-700 text-[11px]">HEIM:</span>
                  <div className="flex gap-1">
                    <button onClick={() => adjustTrainerScore('Heim', 1)} className="bg-sky-100 hover:bg-sky-200 text-sky-900 font-bold px-1.5 py-0.5 rounded text-[11px] cursor-pointer">+1</button>
                    <button onClick={() => adjustTrainerScore('Heim', 2)} className="bg-sky-100 hover:bg-sky-200 text-sky-900 font-bold px-1.5 py-0.5 rounded text-[11px] cursor-pointer">+2</button>
                    <button onClick={() => adjustTrainerScore('Heim', 3)} className="bg-sky-100 hover:bg-sky-200 text-sky-900 font-bold px-1.5 py-0.5 rounded text-[11px] cursor-pointer">+3</button>
                    <button onClick={() => adjustTrainerScore('Heim', -1)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-1.5 py-0.5 rounded text-[11px] cursor-pointer">-1</button>
                    <button onClick={() => adjustTrainerFouls('Heim', 1)} className="bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold px-1.5 py-0.5 rounded text-[11px] cursor-pointer" title="+1 Teamfoul">F+</button>
                  </div>
                </div>

                {/* Gast */}
                <div className="bg-white border border-slate-200 rounded-lg p-1.5 flex items-center justify-between">
                  <span className="font-bold text-slate-700 text-[11px]">GAST:</span>
                  <div className="flex gap-1">
                    <button onClick={() => adjustTrainerScore('Gast', 1)} className="bg-sky-100 hover:bg-sky-200 text-sky-900 font-bold px-1.5 py-0.5 rounded text-[11px] cursor-pointer">+1</button>
                    <button onClick={() => adjustTrainerScore('Gast', 2)} className="bg-sky-100 hover:bg-sky-200 text-sky-900 font-bold px-1.5 py-0.5 rounded text-[11px] cursor-pointer">+2</button>
                    <button onClick={() => adjustTrainerScore('Gast', 3)} className="bg-sky-100 hover:bg-sky-200 text-sky-900 font-bold px-1.5 py-0.5 rounded text-[11px] cursor-pointer">+3</button>
                    <button onClick={() => adjustTrainerScore('Gast', -1)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-1.5 py-0.5 rounded text-[11px] cursor-pointer">-1</button>
                    <button onClick={() => adjustTrainerFouls('Gast', 1)} className="bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold px-1.5 py-0.5 rounded text-[11px] cursor-pointer" title="+1 Teamfoul">F+</button>
                  </div>
                </div>
              </div>

            </div>
          ) : (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-500 text-xs flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                {masterZeitnehmerId === 'consensus' ? (
                  <>
                    <Users className="w-3.5 h-3.5 text-blue-600" />
                    <span>Der Referenzwert wird automatisch als Median & Mehrheit aller Zeitnehmer berechnet.</span>
                  </>
                ) : (
                  <>
                    <User className="w-3.5 h-3.5 text-sky-600" />
                    <span>Als Referenz dient der Teilnehmer „{session.participants[masterZeitnehmerId]?.name || masterZeitnehmerId}“.</span>
                  </>
                )}
              </span>
            </div>
          )}
        </div>

        {/* PANEL 2: SHOTCLOCK MASTER */}
        <div className="bg-white border-2 border-indigo-500/70 rounded-2xl p-4 shadow-sm flex flex-col justify-between space-y-3">
          <div>
            {/* Header & Selector */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 border border-indigo-300 text-indigo-800 flex items-center justify-center font-bold">
                  <Timer className="w-4 h-4 text-indigo-800" />
                </div>
                <div>
                  <div className="text-[10px] font-bold text-indigo-900 uppercase tracking-wider">
                    Master Referenz: 24s Shotclock
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <select
                      value={masterShotclockId}
                      onChange={(e) => handleSetMasterForRole('shotclock', e.target.value)}
                      className="font-bold text-slate-900 bg-indigo-50/70 border border-indigo-300 rounded-lg px-2 py-1 text-xs focus:outline-none cursor-pointer"
                    >
                      <option value="trainer">Schulungsleiter (Referenz-Pult)</option>
                      <option value="consensus">Schwarm-Konsens (Median & Mehrheit)</option>
                      <optgroup label="Teilnehmer (Shotclock)">
                        {shotclockParticipants.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>
                </div>
              </div>

              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border self-start sm:self-center flex items-center gap-1 ${
                masterShotclockId === 'trainer'
                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                  : masterShotclockId === 'consensus'
                  ? 'bg-blue-100 text-blue-900 border-blue-300'
                  : 'bg-indigo-100 text-indigo-900 border-indigo-300'
              }`}>
                {masterShotclockId === 'trainer' && (
                  <>
                    <Crown className="w-3 h-3 text-amber-700" />
                    <span>Trainer-Pult</span>
                  </>
                )}
                {masterShotclockId === 'consensus' && (
                  <>
                    <Users className="w-3 h-3 text-blue-700" />
                    <span>Gruppen-Konsens</span>
                  </>
                )}
                {masterShotclockId !== 'trainer' && masterShotclockId !== 'consensus' && (
                  <>
                    <User className="w-3 h-3 text-indigo-700" />
                    <span>Teilnehmer-Master</span>
                  </>
                )}
              </span>
            </div>

            {/* Live Indicator Values */}
            <div className="grid grid-cols-2 gap-2 bg-slate-50 border border-slate-200 rounded-xl p-2.5 mt-2 text-center">
              <div
                onClick={masterShotclockId === 'trainer' ? () => setDirectEditModal({ isOpen: true, focusField: 'shotclock' }) : undefined}
                className={`p-1 rounded-lg select-none relative transition ${
                  masterShotclockId === 'trainer'
                    ? 'group hover:bg-indigo-100/60 hover:shadow-xs cursor-pointer'
                    : 'cursor-default'
                }`}
                title={masterShotclockId === 'trainer' ? 'Antippen/Klicken zum direkten Setzen der 24s-Zeit' : `Referenzwert wird von ${masterShotclockId === 'consensus' ? 'Schwarm-Konsens' : (session.participants[masterShotclockId]?.name || 'Teilnehmer')} vorgegeben`}
              >
                <div className="flex items-center justify-center gap-1">
                  <span className={`text-[10px] uppercase font-bold text-slate-400 block ${masterShotclockId === 'trainer' ? 'group-hover:text-indigo-800' : ''}`}>
                    {activeMasterShotclock?.isDisplayOff
                      ? 'Shotclock (Aus)'
                      : activeMasterShotclock?.mode === 'timeoutA'
                      ? 'Timeout A'
                      : activeMasterShotclock?.mode === 'timeoutB'
                      ? 'Timeout B'
                      : 'Shotclock Zeit'}
                  </span>
                  {masterShotclockId === 'trainer' && <Edit3 className="w-3 h-3 text-slate-400 group-hover:text-indigo-800 opacity-0 group-hover:opacity-100 transition" />}
                </div>
                <span className={`font-mono text-xl sm:text-2xl font-black text-slate-900 ${masterShotclockId === 'trainer' ? 'group-hover:text-indigo-900' : ''}`}>
                  {activeMasterShotclock?.isDisplayOff ? 'AUS' : formatShotclockTime(activeMasterShotclock?.shotclockTenths)}
                </span>
                <span className={`text-[10px] font-semibold block ${
                  activeMasterShotclock?.isDisplayOff
                    ? 'text-slate-500'
                    : activeMasterShotclock?.isRunning
                    ? 'text-emerald-600'
                    : 'text-slate-400'
                }`}>
                  {activeMasterShotclock?.isDisplayOff ? '○ Ausgeschaltet' : activeMasterShotclock?.isRunning ? '● Läuft' : '○ Gestoppt'}
                </span>
              </div>

              <div className="border-l border-slate-200 flex flex-col justify-center items-center">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Modus</span>
                <span className="font-mono text-sm sm:text-base font-bold text-slate-900">
                  {activeMasterShotclock?.isDisplayOff
                    ? 'Display AUS'
                    : activeMasterShotclock?.mode === 'timeoutA'
                    ? 'Timeout A (60s)'
                    : activeMasterShotclock?.mode === 'timeoutB'
                    ? 'Timeout B (30s)'
                    : 'Normal (24s)'}
                </span>
                <span className="text-[10px] text-slate-500 font-medium block">
                  {activeMasterShotclock?.isDisplayOff
                    ? 'Ausgeschaltet'
                    : activeMasterShotclock?.isRunning
                    ? 'Uhr Aktiv'
                    : 'Gestoppt'}
                </span>
              </div>
            </div>
          </div>

          {/* Interactive Trainer Controls */}
          {masterShotclockId === 'trainer' ? (
            <div className="bg-indigo-50/60 border border-indigo-200 rounded-xl p-2.5 space-y-2">
              <div className="text-[10px] font-bold text-indigo-900 uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Crown className="w-3.5 h-3.5 text-amber-600" />
                  <span>Schulungsleiter Schnellsteuerung (24s Shotclock)</span>
                </span>
                <span className="text-slate-500 font-normal">Antippen / Klick steuert den Referenzwert</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                {/* Start / Stop */}
                <button
                  onClick={toggleTrainerShotclock}
                  className={`py-2 px-3 rounded-lg font-bold text-xs shadow-sm transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    session.trainerShotclockState?.isRunning
                      ? 'bg-slate-800 hover:bg-slate-900 text-white'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  }`}
                >
                  {session.trainerShotclockState?.isRunning ? (
                    <>
                      <Square className="w-3.5 h-3.5" />
                      <span>STOPP</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" />
                      <span>START</span>
                    </>
                  )}
                </button>

                {/* LOAD 24s */}
                <button
                  onClick={() => updateTrainerShotclock((prev) => ({ ...prev, mode: 'shotclock', shotclockTenths: 240, savedShotclockTenths: undefined, isDisplayOff: false, isRunning: prev.isRunning }))}
                  className="bg-indigo-800 hover:bg-indigo-900 text-white font-black text-xs py-2 px-3 rounded-lg shadow-sm transition cursor-pointer"
                >
                  LOAD 24s
                </button>

                {/* LOAD 14s */}
                <button
                  onClick={() => updateTrainerShotclock((prev) => ({ ...prev, mode: 'shotclock', shotclockTenths: 140, savedShotclockTenths: undefined, isDisplayOff: false, isRunning: prev.isRunning }))}
                  className="bg-indigo-800 hover:bg-indigo-900 text-white font-black text-xs py-2 px-3 rounded-lg shadow-sm transition cursor-pointer"
                >
                  LOAD 14s
                </button>

                {/* DISPLAY AUS / EIN */}
                <button
                  onClick={toggleTrainerShotclockDisplay}
                  className={`font-black text-xs py-2 px-3 rounded-lg shadow-sm transition cursor-pointer border ${
                    session.trainerShotclockState?.isDisplayOff
                      ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-600 ring-1 ring-amber-400 font-black'
                      : 'bg-slate-700 hover:bg-slate-800 text-slate-200 border-slate-600'
                  }`}
                  title={session.trainerShotclockState?.isDisplayOff ? 'Display wieder einschalten' : 'Shotclock-Display ausschalten (Display AUS)'}
                >
                  {session.trainerShotclockState?.isDisplayOff ? 'DISPLAY EIN' : 'DISPLAY AUS'}
                </button>

                {/* Fine adjustments & Buzzer */}
                <div className="flex gap-1">
                  <button
                    onClick={() => adjustTrainerShotclock(1.0)}
                    className="flex-1 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-[11px] font-bold py-1.5 rounded-lg transition cursor-pointer"
                    title="+1 Sekunde"
                  >
                    +1s
                  </button>
                  <button
                    onClick={() => adjustTrainerShotclock(-1.0)}
                    className="flex-1 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-[11px] font-bold py-1.5 rounded-lg transition cursor-pointer"
                    title="-1 Sekunde"
                  >
                    -1s
                  </button>
                  <button
                    onClick={playTrainerBuzzer}
                    className="bg-slate-700 hover:bg-slate-800 text-white font-bold text-xs px-2 py-1.5 rounded-lg transition cursor-pointer flex items-center justify-center"
                    title="Buzzer Soundtest"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Direct Set Button */}
                <button
                  onClick={() => setDirectEditModal({ isOpen: true, focusField: 'shotclock' })}
                  className="bg-white hover:bg-indigo-100/70 border border-indigo-300 text-indigo-950 font-bold text-xs py-1.5 px-2.5 rounded-lg shadow-sm transition flex items-center justify-center gap-1.5 cursor-pointer col-span-2 sm:col-span-1"
                  title="Shotclock-Zeit direkt eingeben"
                >
                  <Edit3 className="w-3.5 h-3.5 text-indigo-800" />
                  <span>Direkt setzen</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-500 text-xs flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                {masterShotclockId === 'consensus' ? (
                  <>
                    <Users className="w-3.5 h-3.5 text-blue-600" />
                    <span>Der Referenzwert wird automatisch als Median aller 24s-Bediener berechnet.</span>
                  </>
                ) : (
                  <>
                    <User className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Als Referenz dient der Teilnehmer „{session.participants[masterShotclockId]?.name || masterShotclockId}“.</span>
                  </>
                )}
              </span>
            </div>
          )}
        </div>

      </section>

      {/* COMPACT PARTICIPANT TABLE */}
      <main className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        
        {/* Integrated Table Toolbar: Minimal Tolerances on Left + Filters/Sort on Right */}
        <div className="p-3 sm:px-4 sm:py-2.5 bg-slate-50/70 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 text-xs">
          
          {/* Left: Minimal Inline Tolerances */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-slate-700">
            <InstantTooltip
              content={
                <div className="space-y-1.5 text-left min-w-[240px] max-w-[340px]">
                  <div className="font-bold border-b border-slate-700/80 pb-1 text-[11px] text-slate-200 flex items-center gap-1.5">
                    <Settings className="w-3.5 h-3.5 text-slate-300" />
                    <span>Bewertung der Abweichungen</span>
                  </div>
                  <ul className="space-y-1 text-[11px] pt-0.5">
                    <li className="flex items-start gap-1.5 leading-snug">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <span><b className="text-emerald-300">Synchron:</b> Alle Werte innerhalb der eingestellten Toleranz</span>
                    </li>
                    <li className="flex items-start gap-1.5 leading-snug">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <span><b className="text-amber-300">Stufe 1 (Warnung):</b> Leichte Abweichung (bis 2× Toleranz oder abweichender Uhr-Status)</span>
                    </li>
                    <li className="flex items-start gap-1.5 leading-snug">
                      <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                      <span><b className="text-red-300">Stufe 2 (Fehler):</b> Kritische Abweichung (&gt; 2× Toleranz)</span>
                    </li>
                  </ul>
                </div>
              }
            >
              <div className="flex items-center gap-1 font-bold text-slate-800 text-[11px] cursor-help select-none">
                <Settings className="w-3.5 h-3.5 text-slate-600" />
                <span>Toleranzen:</span>
                <Info className="w-3 h-3 text-slate-400" />
              </div>
            </InstantTooltip>

            {/* Clean inline inputs without heavy nested boxes */}
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px]">
              <label className="flex items-center gap-1 cursor-pointer" title="Zulässige Zeittoleranz der Hauptuhr">
                <span className="text-slate-500 font-medium">Spieluhr:</span>
                <span className="text-slate-400">±</span>
                <input
                  type="number"
                  value={session.masterConfig.tolerances.gameClockSeconds}
                  onChange={(e) => updateTolerances({ gameClockSeconds: parseFloat(e.target.value) || 0 })}
                  step="0.1"
                  min="0"
                  className="w-14 sm:w-16 text-center font-mono font-bold bg-white border border-slate-300 hover:border-slate-400 focus:border-sky-500 rounded px-1.5 py-0.5 text-xs text-slate-900 focus:outline-none transition shadow-2xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="text-slate-500 text-[10px]">s</span>
              </label>

              <span className="text-slate-300">•</span>

              <label className="flex items-center gap-1 cursor-pointer" title="Zulässige Zeittoleranz der 24s-Shotclock">
                <span className="text-slate-500 font-medium">Shotclock:</span>
                <span className="text-slate-400">±</span>
                <input
                  type="number"
                  value={session.masterConfig.tolerances.shotClockSeconds}
                  onChange={(e) => updateTolerances({ shotClockSeconds: parseFloat(e.target.value) || 0 })}
                  step="0.1"
                  min="0"
                  className="w-14 sm:w-16 text-center font-mono font-bold bg-white border border-slate-300 hover:border-slate-400 focus:border-sky-500 rounded px-1.5 py-0.5 text-xs text-slate-900 focus:outline-none transition shadow-2xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="text-slate-500 text-[10px]">s</span>
              </label>

              <span className="text-slate-300">•</span>

              <label className="flex items-center gap-1 cursor-pointer" title="Zulässige Punktedifferenz">
                <span className="text-slate-500 font-medium">Punkte:</span>
                <span className="text-slate-400">±</span>
                <input
                  type="number"
                  value={session.masterConfig.tolerances.score}
                  onChange={(e) => updateTolerances({ score: parseInt(e.target.value, 10) || 0 })}
                  step="1"
                  min="0"
                  className="w-12 sm:w-14 text-center font-mono font-bold bg-white border border-slate-300 hover:border-slate-400 focus:border-sky-500 rounded px-1.5 py-0.5 text-xs text-slate-900 focus:outline-none transition shadow-2xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </label>

              <span className="text-slate-300">•</span>

              <label className="flex items-center gap-1 cursor-pointer" title="Zulässige Teamfoul-Differenz">
                <span className="text-slate-500 font-medium">Fouls:</span>
                <span className="text-slate-400">±</span>
                <input
                  type="number"
                  value={session.masterConfig.tolerances.fouls}
                  onChange={(e) => updateTolerances({ fouls: parseInt(e.target.value, 10) || 0 })}
                  step="1"
                  min="0"
                  className="w-12 sm:w-14 text-center font-mono font-bold bg-white border border-slate-300 hover:border-slate-400 focus:border-sky-500 rounded px-1.5 py-0.5 text-xs text-slate-900 focus:outline-none transition shadow-2xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </label>
            </div>
          </div>

          {/* Right: Table Role Filter & Sort Options */}
          <div className="flex items-center gap-2 self-end lg:self-auto">
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value as 'all' | 'zeitnehmer' | 'shotclock')}
              className="bg-white border border-slate-300 hover:border-slate-400 text-slate-700 text-xs font-medium rounded-lg px-2.5 py-1 focus:outline-none focus:border-sky-500 cursor-pointer shadow-2xs transition"
            >
              <option value="all">Alle Rollen ({participantList.length})</option>
              <option value="shotclock">24s Shotclock ({shotclockParticipants.length})</option>
              <option value="zeitnehmer">Zeitnehmer ({zeitnehmerParticipants.length})</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'errorsFirst' | 'name')}
              className="bg-white border border-slate-300 hover:border-slate-400 text-slate-700 text-xs font-medium rounded-lg px-2.5 py-1 focus:outline-none focus:border-sky-500 cursor-pointer shadow-2xs transition"
            >
              <option value="errorsFirst">Abweichler zuerst</option>
              <option value="name">Name (A-Z)</option>
            </select>
          </div>

        </div>
        {sortedParticipants.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs">
            Noch keine Teilnehmer beigetreten. Teile die PIN <b className="font-mono text-slate-700">{pin}</b> mit den Schulungsteilnehmern.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200 text-[10px]">
                <tr>
                  <th className="w-14 py-2.5 px-3 text-center">
                    <InstantTooltip content="Status der Synchronität zum Master (Grün: OK, Gelb: Warnung, Rot: Kritischer Fehler)">
                      <span className="cursor-help">Status</span>
                    </InstantTooltip>
                  </th>
                  <th className="w-44 py-2.5 px-3">
                    <InstantTooltip content="Name und ID des Teilnehmers">
                      <span className="cursor-help">Teilnehmer</span>
                    </InstantTooltip>
                  </th>
                  <th className="w-40 py-2.5 px-3">
                    <InstantTooltip content="Aktive Bedienpult-Rolle (Zeitnehmer oder 24s Shotclock)">
                      <span className="cursor-help">Rolle</span>
                    </InstantTooltip>
                  </th>
                  <th className="w-32 py-2.5 px-3 text-center">
                    <InstantTooltip content="Aktuelle Zeit und Laufstatus auf dem Pult des Teilnehmers">
                      <span className="cursor-help">Aktueller Wert</span>
                    </InstantTooltip>
                  </th>
                  <th className="w-36 py-2.5 px-3 text-center">
                    <InstantTooltip content="Zeitdifferenz zum Master (positiv = voraus, negativ = hinterher)">
                      <span className="cursor-help">Abweichung (Δ)</span>
                    </InstantTooltip>
                  </th>
                  <th className="w-24 py-2.5 px-3 text-center">
                    <InstantTooltip content="Punktestand (Heim : Gast) des Teilnehmers">
                      <span className="cursor-help">Punkte</span>
                    </InstantTooltip>
                  </th>
                  <th className="w-24 py-2.5 px-3 text-center">
                    <InstantTooltip content="Teamfouls (Heim : Gast) des Teilnehmers">
                      <span className="cursor-help">Fouls</span>
                    </InstantTooltip>
                  </th>
                  <th className="py-2.5 px-3">
                    <InstantTooltip content="Zuletzt ausgeführte Aktion auf dem Teilnehmer-Pult">
                      <span className="cursor-help">Letzte Aktion</span>
                    </InstantTooltip>
                  </th>
                  <th className="w-44 py-2.5 px-3 text-right">
                    <InstantTooltip content="Synchronisieren oder zum Master ernennen">
                      <span className="cursor-help">Aktionen</span>
                    </InstantTooltip>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {sortedParticipants.map((p) => {
                  const isShotclock = p.role === 'shotclock';
                  const isMaster = isShotclock ? p.id === masterShotclockId : p.id === masterZeitnehmerId;
                  return (
                    <CompactParticipantRow
                      key={p.id}
                      participant={p}
                      isMaster={isMaster}
                      masterStramatel={activeMasterStramatel}
                      masterShotclock={activeMasterShotclock}
                      tolerances={session.masterConfig.tolerances}
                      onSetMaster={(id) => handleSetMasterForRole(isShotclock ? 'shotclock' : 'zeitnehmer', id)}
                      onChangeRole={handleChangeParticipantRole}
                      onResetToMaster={handleResetParticipantToMaster}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* QR Code Modal */}
      {showQrModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-xl w-full text-center shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-1">Teilnehmer: Schulungssitzung beitreten</h3>
            <p className="text-xs text-slate-500 mb-4">Scanne den QR-Code mit der Tablet‑Kamera, um als Teilnehmer beizutreten.</p>
            
            <div className="p-4 bg-slate-50 rounded-2xl inline-block border border-slate-200 mb-4">
              <QRCodeSVG
                value={typeof window !== 'undefined' ? `${window.location.origin}/?pin=${pin}` : pin}
                size={400}
                level="M"
              />
            </div>

            <div className="font-mono text-2xl font-black text-slate-900 tracking-widest mb-4">
              {pin}
            </div>
            <div className="text-xl text-slate-800 font-medium mb-2">
              {typeof window !== 'undefined' ? window.location.host : ''}
            </div>
            <button
              onClick={() => setShowQrModal(false)}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-2.5 rounded-xl transition cursor-pointer"
            >
              Schließen
            </button>
          </div>
        </div>
      )}

      {/* Master Direct Edit Modal */}
      <MasterDirectEditModal
        isOpen={directEditModal.isOpen}
        onClose={() => setDirectEditModal((prev) => ({ ...prev, isOpen: false }))}
        stramatelState={session.trainerStramatelState}
        shotclockState={session.trainerShotclockState}
        isStramatelEditable={masterZeitnehmerId === 'trainer'}
        isShotclockEditable={masterShotclockId === 'trainer'}
        stramatelMasterLabel={masterZeitnehmerId === 'trainer' ? 'Schulungsleiter' : masterZeitnehmerId === 'consensus' ? 'Schwarm-Konsens' : (session.participants[masterZeitnehmerId]?.name || 'Teilnehmer')}
        shotclockMasterLabel={masterShotclockId === 'trainer' ? 'Schulungsleiter' : masterShotclockId === 'consensus' ? 'Schwarm-Konsens' : (session.participants[masterShotclockId]?.name || 'Teilnehmer')}
        initialFocusField={directEditModal.focusField}
        onSaveStramatel={handleSaveStramatelDirect}
        onSaveShotclock={handleSaveShotclockDirect}
      />

      {/* Reset Confirmation Modal with Role Checkboxes */}
      {resetModal.isOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            
            {/* Header */}
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-slate-100 border border-slate-200 text-slate-800 flex items-center justify-center text-xl flex-shrink-0">
                <RotateCcw className="w-5 h-5 text-slate-700" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Teilnehmer auf Master synchronisieren
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  Wähle aus, welche Teilnehmergruppen auf die aktuellen Master-Referenzwerte zurückgesetzt werden sollen:
                </p>
              </div>
            </div>

            {/* Checkbox Options */}
            <div className="space-y-2.5 pt-1">
              
              {/* Zeitnehmer */}
              <label
                className={`flex items-center justify-between p-3 rounded-2xl border-2 transition cursor-pointer select-none ${
                  resetModal.resetZeitnehmer
                    ? 'border-sky-500 bg-sky-50/60 shadow-xs'
                    : 'border-slate-200 bg-slate-50/60 text-slate-500 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={resetModal.resetZeitnehmer}
                    onChange={(e) =>
                      setResetModal((prev) => ({ ...prev, resetZeitnehmer: e.target.checked }))
                    }
                    className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500 cursor-pointer"
                  />
                  <div>
                    <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-sky-600" />
                      <span>Zeitnehmer (Hauptuhr)</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Spielzeit, Spielstand, Periode & Teamfouls
                    </div>
                  </div>
                </div>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-700">
                  {zeitnehmerParticipants.length} aktiv
                </span>
              </label>

              {/* Shotclock */}
              <label
                className={`flex items-center justify-between p-3 rounded-2xl border-2 transition cursor-pointer select-none ${
                  resetModal.resetShotclock
                    ? 'border-indigo-500 bg-indigo-50/60 shadow-xs'
                    : 'border-slate-200 bg-slate-50/60 text-slate-500 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={resetModal.resetShotclock}
                    onChange={(e) =>
                      setResetModal((prev) => ({ ...prev, resetShotclock: e.target.checked }))
                    }
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <div>
                    <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Timer className="w-3.5 h-3.5 text-indigo-600" />
                      <span>24s Shotclock</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      24s/14s-Angriffszeit & Auszeit-Status
                    </div>
                  </div>
                </div>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-700">
                  {shotclockParticipants.length} aktiv
                </span>
              </label>

            </div>

            {/* Hint Notice */}
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <span className="leading-tight">
                Die aktuellen Pultwerte der gewählten Teilnehmer werden sofort mit den Master-Referenzwerten überschrieben.
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setResetModal((prev) => ({ ...prev, isOpen: false }))}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-2 px-3.5 rounded-xl transition cursor-pointer"
              >
                Abbrechen
              </button>
              <button
                onClick={handleConfirmResetAllToMaster}
                disabled={!resetModal.resetZeitnehmer && !resetModal.resetShotclock}
                className="bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-xs py-2 px-4 rounded-xl transition cursor-pointer shadow-sm flex items-center gap-1.5"
                title={
                  !resetModal.resetZeitnehmer && !resetModal.resetShotclock
                    ? 'Wähle mindestens eine Rolle aus'
                    : 'Jetzt ausgewählte Teilnehmer synchronisieren'
                }
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Jetzt synchronisieren</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* END SESSION CONFIRMATION MODAL */}
      {showEndSessionModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-red-100 border border-red-200 flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-black text-red-600">END</span>
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Schulungssitzung beenden?</h3>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  Alle Teilnehmer werden getrennt und die Sitzung wird gelöscht.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowEndSessionModal(false)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-2 px-3.5 rounded-xl transition cursor-pointer"
              >
                Abbrechen
              </button>
              <button
                onClick={handleEndSession}
                className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs py-2 px-4 rounded-xl transition cursor-pointer shadow-sm"
              >
                Sitzung beenden
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
