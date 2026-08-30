import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { SessionData, ConsoleRole, StramatelState, ShotclockState, MasterConfig, AdminAuthPayload } from './src/types/index.js';
import { computeConsensusStramatel, computeConsensusShotclock } from './src/lib/consensus.js';

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// ─── Single In-Memory Session Store ─────────────────────────────────────────
// All session state lives here in the server.ts process.
// Next.js API routes MUST NOT be used for session logic – they run in a
// separate module scope and cannot share this object.

const sessions: Record<string, SessionData> = {};

function generateAdminPin(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function generateAdminToken(): string {
  return 'adm_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

const BASKETBALL_WORDS = [
  'DUNK', 'PASS', 'SHOT', 'BALL', 'HOOP', 'SWISH', 'STEAL', 'BLOCK',
  'ZONE', 'PIVOT', 'COURT', 'BOARD', 'HOOK', 'NET', 'SLAM', 'JUMP', 'FAST', 'TEAM',
];

function generateUniqueSessionPin(): string {
  for (let i = 0; i < 100; i++) {
    const word = BASKETBALL_WORDS[Math.floor(Math.random() * BASKETBALL_WORDS.length)];
    const num = Math.floor(10 + Math.random() * 90);
    const pin = `${word}${num}`;
    if (!sessions[pin]) return pin;
  }
  return `GAME${Math.floor(1000 + Math.random() * 9000)}`;
}

function getOrCreateSession(pin: string, initialAdminToken?: string): SessionData {
  const cleanPin = pin.toUpperCase().trim();
  if (!sessions[cleanPin]) {
    sessions[cleanPin] = {
      pin: cleanPin,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      allowParticipantRoleChange: true,
      adminPin: generateAdminPin(),
      adminToken: initialAdminToken || generateAdminToken(),
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
        isDisplayOff: false,
        timeoutSecondsLeft: null,
        isTimeoutRunning: false,
      },
      participants: {},
      activityLog: [],
    };
  }
  return sessions[cleanPin];
}

function getSanitizedSession(session: SessionData, forAdmin = false): SessionData {
  if (forAdmin) return session;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { adminToken: _t, adminPin: _p, ...publicSession } = session;
  return publicSession as SessionData;
}

function getActiveMasterStates(session: SessionData): { activeStramatel: StramatelState; activeShotclock: ShotclockState } {
  const defaultStramatel: StramatelState = session.trainerStramatelState || {
    gameTimeTenths: 10 * 60 * 10,
    isRunning: false,
    scoreHeim: 0,
    scoreGast: 0,
    foulsHeim: 0,
    foulsGast: 0,
    period: 1,
    timeoutsHeim: 0,
    timeoutsGast: 0,
  };

  const defaultShotclock: ShotclockState = session.trainerShotclockState || {
    shotclockTenths: 240,
    isRunning: false,
    isDisplayOff: false,
    timeoutSecondsLeft: null,
    isTimeoutRunning: false,
  };

  const pList = Object.values(session.participants || {});

  // Zeitnehmer Master
  const zId = session.masterConfig.masterZeitnehmerId || session.masterConfig.masterId || 'trainer';
  let activeStramatel: StramatelState;
  if (zId === 'trainer') {
    activeStramatel = defaultStramatel;
  } else if (zId === 'consensus') {
    activeStramatel = computeConsensusStramatel(pList, defaultStramatel);
  } else {
    activeStramatel = session.participants[zId]?.stramatelState || defaultStramatel;
  }

  // Shotclock Master
  const sId = session.masterConfig.masterShotclockId || session.masterConfig.masterId || 'trainer';
  let activeShotclock: ShotclockState;
  if (sId === 'trainer') {
    activeShotclock = defaultShotclock;
  } else if (sId === 'consensus') {
    activeShotclock = computeConsensusShotclock(pList, defaultShotclock);
  } else {
    activeShotclock = session.participants[sId]?.shotclockState || defaultShotclock;
  }

  return { activeStramatel, activeShotclock };
}

function parseJsonBody(req: any): Promise<any> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk: any) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => {
      resolve({});
    });
  });
}

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    const parsedUrl = parse(req.url || '', true);

    // Check session existence
    if (parsedUrl.pathname?.startsWith('/api/session/check/')) {
      const pin = decodeURIComponent(parsedUrl.pathname.replace('/api/session/check/', '')).toUpperCase().trim();
      const exists = !!sessions[pin];
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({ exists, pin }));
      return;
    }

    // Create session via HTTP
    if (parsedUrl.pathname === '/api/session/create' && (req.method === 'POST' || req.method === 'GET')) {
      const body = req.method === 'POST' ? await parseJsonBody(req) : {};
      const requestedPin = body.pin ? body.pin.toUpperCase().trim() : generateUniqueSessionPin();
      const token = body.adminToken || generateAdminToken();

      delete sessions[requestedPin];
      const session = getOrCreateSession(requestedPin, token);

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({
        success: true,
        pin: requestedPin,
        adminToken: session.adminToken,
        adminPin: session.adminPin,
      }));
      return;
    }

    // Fast Admin Authentication via HTTP
    if (parsedUrl.pathname === '/api/session/admin-auth' && (req.method === 'POST' || req.method === 'GET')) {
      const body = req.method === 'POST' ? await parseJsonBody(req) : parsedUrl.query;
      const pin = (body.pin ? String(body.pin) : '').toUpperCase().trim();
      const token = body.token ? String(body.token).trim() : (body.adminToken ? String(body.adminToken).trim() : undefined);
      const adminPin = body.adminPin ? String(body.adminPin).trim() : undefined;

      let session = sessions[pin];
      if (!session && token) {
        session = getOrCreateSession(pin, token);
      }

      if (session) {
        const isTokenMatch = Boolean(token && session.adminToken && token === session.adminToken);
        const isPinMatch = Boolean(adminPin && session.adminPin && adminPin === session.adminPin);

        if (isTokenMatch || isPinMatch) {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify({
            success: true,
            pin,
            adminToken: session.adminToken,
            adminPin: session.adminPin,
            session: getSanitizedSession(session, true),
          }));
          return;
        }
      }

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({
        success: false,
        pin,
        error: 'INVALID_ADMIN_CREDENTIALS',
      }));
      return;
    }

    // Delete / End session via HTTP
    if (parsedUrl.pathname === '/api/session/delete' && (req.method === 'POST' || req.method === 'DELETE')) {
      const body = await parseJsonBody(req);
      const pin = (body.pin ? String(body.pin) : '').toUpperCase().trim();
      const token = body.token ? String(body.token).trim() : (body.adminToken ? String(body.adminToken).trim() : undefined);
      const adminPin = body.adminPin ? String(body.adminPin).trim() : undefined;

      const session = sessions[pin];
      if (session) {
        const isTokenMatch = Boolean(token && session.adminToken && token === session.adminToken);
        const isPinMatch = Boolean(adminPin && session.adminPin && adminPin === session.adminPin);

        if (isTokenMatch || isPinMatch) {
          console.log(`[admin] Session ${pin} deleted via HTTP endpoint`);
          io.to(`session:${pin}`).emit('session_ended', { pin, reason: 'admin_closed' });
          io.to(`admin:${pin}`).emit('session_ended', { pin, reason: 'admin_closed' });
          delete sessions[pin];

          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify({ success: true, pin }));
          return;
        }
      }

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({ success: false, pin, error: 'INVALID_ADMIN_CREDENTIALS' }));
      return;
    }

    handle(req, res, parsedUrl);
  });

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  function broadcastSession(pin: string) {
    const session = sessions[pin];
    if (!session) return;
    session.lastActivityAt = Date.now();
    io.to(`session:${pin}`).emit('session_updated', getSanitizedSession(session, false));
    io.to(`admin:${pin}`).emit('session_updated', getSanitizedSession(session, true));
  }

  // ─── 24h Idle Session Cleanup ─────────────────────────────────────────────
  const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
  setInterval(() => {
    const cutoff = Date.now() - SESSION_TTL_MS;
    for (const pin of Object.keys(sessions)) {
      const session = sessions[pin];
      if ((session.lastActivityAt ?? session.createdAt) < cutoff) {
        console.log(`[cleanup] Deleting stale session ${pin} (last activity: ${new Date(session.lastActivityAt ?? session.createdAt).toISOString()})`);
        // Notify any lingering clients before deletion
        io.to(`session:${pin}`).emit('session_ended', { pin, reason: 'idle_timeout' });
        io.to(`admin:${pin}`).emit('session_ended', { pin, reason: 'idle_timeout' });
        delete sessions[pin];
      }
    }
  }, 30 * 60 * 1000); // check every 30 minutes

  function isSocketAdmin(sock: Socket, targetPin: string): boolean {
    return (
      sock.data.isAdmin === true &&
      sock.data.sessionPin === targetPin.toUpperCase()
    );
  }

  io.on('connection', (socket: Socket) => {
    let currentPin: string | null = null;
    let currentParticipantId: string | null = null;

    // Check session existence via Socket
    socket.on('check_session', (data: { pin: string }, callback?: (response: { exists: boolean; pin: string }) => void) => {
      const pin = data?.pin ? data.pin.toUpperCase().trim() : '';
      const exists = !!sessions[pin];
      if (typeof callback === 'function') {
        callback({ exists, pin });
      } else {
        socket.emit('session_check_result', { exists, pin });
      }
    });

    // Participant joins session
    socket.on(
      'join_session',
      (
        data: {
          pin: string;
          name: string;
          role: ConsoleRole;
          initialState?: { stramatelState?: StramatelState; shotclockState?: ShotclockState };
        },
        callback?: (response: {
          success: boolean;
          error?: string;
          initialStramatelState?: StramatelState;
          initialShotclockState?: ShotclockState;
        }) => void
      ) => {
        const pin = data.pin ? data.pin.toUpperCase().trim() : '';
        const session = sessions[pin];

        if (!session) {
          socket.emit('session_not_found', {
            pin,
            message: `Die Sitzung "${pin}" existiert nicht. Bitte frage deinen Schulungsleiter.`,
          });
          if (typeof callback === 'function') {
            callback({ success: false, error: 'SESSION_NOT_FOUND' });
          }
          return;
        }

        currentPin = pin;
        currentParticipantId = socket.id;

        socket.join(`session:${pin}`);

        const { activeStramatel, activeShotclock } = getActiveMasterStates(session);

        session.participants[socket.id] = {
          id: socket.id,
          name: data.name,
          role: data.role,
          joinedAt: Date.now(),
          lastAction: 'Beigetreten',
          lastActionTime: Date.now(),
          stramatelState: { ...activeStramatel },
          shotclockState: { ...activeShotclock },
        };

        if (typeof callback === 'function') {
          callback({
            success: true,
            initialStramatelState: activeStramatel,
            initialShotclockState: activeShotclock,
          });
        }

        socket.emit('init_participant_state', {
          stramatelState: activeStramatel,
          shotclockState: activeShotclock,
        });

        broadcastSession(pin);
      }
    );

    // Admin joins session (requires valid token or PIN)
    socket.on(
      'admin_join',
      (
        data: { pin: string; adminToken?: string; adminPin?: string; createNew?: boolean },
        callback?: (response: AdminAuthPayload) => void
      ) => {
        const pin = data?.pin ? data.pin.toUpperCase().trim() : '';
        if (!pin) {
          const response: AdminAuthPayload = {
            success: false,
            pin: '',
            error: 'INVALID_PIN',
          };
          if (typeof callback === 'function') callback(response);
          socket.emit('admin_auth_failed', response);
          return;
        }

        let session = sessions[pin];

        // If session doesn't exist yet, or createNew is specified and no participants exist, initialize it
        if (!session || (data.createNew && Object.keys(session.participants || {}).length === 0)) {
          session = getOrCreateSession(pin, data.adminToken);
          if (data.adminToken) {
            session.adminToken = data.adminToken;
          }
        }

        const isTokenMatch = Boolean(data.adminToken && session.adminToken && data.adminToken === session.adminToken);
        const isPinMatch = Boolean(data.adminPin && session.adminPin && data.adminPin === session.adminPin);

        if (isTokenMatch || isPinMatch) {
          socket.data.isAdmin = true;
          socket.data.sessionPin = pin;
          currentPin = pin;

          socket.join(`session:${pin}`);
          socket.join(`admin:${pin}`);

          const response: AdminAuthPayload = {
            success: true,
            pin,
            adminToken: session.adminToken,
            adminPin: session.adminPin,
          };

          if (typeof callback === 'function') callback(response);
          socket.emit('admin_auth_success', response);
          socket.emit('session_state', getSanitizedSession(session, true));
        } else {
          const response: AdminAuthPayload = {
            success: false,
            pin,
            error: 'INVALID_ADMIN_CREDENTIALS',
          };
          if (typeof callback === 'function') callback(response);
          socket.emit('admin_auth_failed', response);
        }
      }
    );

    // Console state update from participant
    socket.on(
      'update_console_state',
      (data: {
        pin: string;
        role: ConsoleRole;
        stramatelState?: StramatelState;
        shotclockState?: ShotclockState;
        lastAction?: string;
      }) => {
        const pin = data.pin.toUpperCase();
        const session = sessions[pin];
        if (!session) return;

        const participant = session.participants[socket.id];
        if (participant) {
          if (data.stramatelState) participant.stramatelState = data.stramatelState;
          if (data.shotclockState) participant.shotclockState = data.shotclockState;
          if (data.lastAction) {
            participant.lastAction = data.lastAction;
            participant.lastActionTime = Date.now();
          }
          broadcastSession(pin);
        }
      }
    );

    // Master Config Update (Admin only)
    socket.on(
      'update_master_config',
      (data: { pin: string; masterConfig: MasterConfig }) => {
        const pin = data.pin.toUpperCase();
        if (!isSocketAdmin(socket, pin)) return;

        const session = sessions[pin];
        if (!session) return;

        session.masterConfig = {
          ...session.masterConfig,
          ...data.masterConfig,
          masterZeitnehmerId: data.masterConfig.masterZeitnehmerId || session.masterConfig.masterZeitnehmerId || 'trainer',
          masterShotclockId: data.masterConfig.masterShotclockId || session.masterConfig.masterShotclockId || 'trainer',
        };
        broadcastSession(pin);
      }
    );

    // Trainer Master State Update (Admin only)
    socket.on(
      'update_trainer_state',
      (data: {
        pin: string;
        stramatelState?: StramatelState;
        shotclockState?: ShotclockState;
      }) => {
        const pin = data.pin.toUpperCase();
        if (!isSocketAdmin(socket, pin)) return;

        const session = sessions[pin];
        if (!session) return;

        if (data.stramatelState) session.trainerStramatelState = data.stramatelState;
        if (data.shotclockState) session.trainerShotclockState = data.shotclockState;
        broadcastSession(pin);
      }
    );

    // Update Session Settings (Admin only)
    socket.on(
      'update_session_settings',
      (data: { pin: string; allowParticipantRoleChange: boolean }) => {
        const pin = data.pin.toUpperCase();
        if (!isSocketAdmin(socket, pin)) return;

        const session = sessions[pin];
        if (!session) return;

        session.allowParticipantRoleChange = data.allowParticipantRoleChange;
        broadcastSession(pin);
      }
    );

    // Participant requests self-service role change
    socket.on(
      'request_change_role',
      (
        data: { pin: string; role: ConsoleRole },
        callback?: (response: { success: boolean; error?: string }) => void
      ) => {
        const pin = data.pin.toUpperCase();
        const session = sessions[pin];
        if (!session) {
          if (typeof callback === 'function') callback({ success: false, error: 'SESSION_NOT_FOUND' });
          return;
        }

        if (session.allowParticipantRoleChange === false) {
          if (typeof callback === 'function') callback({ success: false, error: 'ROLE_CHANGE_DISABLED' });
          return;
        }

        const participant = session.participants[socket.id];
        if (!participant) {
          if (typeof callback === 'function') callback({ success: false, error: 'PARTICIPANT_NOT_FOUND' });
          return;
        }

        // Active masters are locked from changing roles
        const isMasterZ = session.masterConfig.masterZeitnehmerId === socket.id;
        const isMasterS = session.masterConfig.masterShotclockId === socket.id;
        if (isMasterZ || isMasterS) {
          if (typeof callback === 'function') {
            callback({ success: false, error: 'MASTER_CANNOT_CHANGE_ROLE' });
          }
          return;
        }

        const newRole = data.role;
        const { activeStramatel, activeShotclock } = getActiveMasterStates(session);

        participant.role = newRole;
        if (newRole === 'zeitnehmer') {
          participant.stramatelState = JSON.parse(JSON.stringify(activeStramatel));
        } else {
          participant.shotclockState = JSON.parse(JSON.stringify(activeShotclock));
        }
        participant.lastAction = `Rolle gewechselt: ${newRole === 'zeitnehmer' ? 'Zeitnehmer' : '24s Shotclock'}`;
        participant.lastActionTime = Date.now();

        broadcastSession(pin);

        socket.emit('role_switched', {
          role: newRole,
          changedBy: 'self',
          stramatelState: participant.stramatelState,
          shotclockState: participant.shotclockState,
          message: `Rolle gewechselt zu ${newRole === 'zeitnehmer' ? 'Zeitnehmer (Hauptanzeige)' : '24s Shotclock'}. Werte wurden auf die Master-Referenzwerte synchronisiert.`,
        });

        if (typeof callback === 'function') {
          callback({ success: true });
        }
      }
    );

    // Admin forces role change for a participant (Admin only)
    socket.on(
      'admin_change_participant_role',
      (data: { pin: string; participantId: string; role: ConsoleRole }) => {
        const pin = data.pin.toUpperCase();
        if (!isSocketAdmin(socket, pin)) return;

        const session = sessions[pin];
        if (!session) return;

        const participant = session.participants[data.participantId];
        if (!participant) return;

        // Active masters cannot have their role changed
        const isMasterZ = session.masterConfig.masterZeitnehmerId === data.participantId;
        const isMasterS = session.masterConfig.masterShotclockId === data.participantId;
        if (isMasterZ || isMasterS) return;

        const newRole = data.role;
        const { activeStramatel, activeShotclock } = getActiveMasterStates(session);

        participant.role = newRole;
        if (newRole === 'zeitnehmer') {
          participant.stramatelState = JSON.parse(JSON.stringify(activeStramatel));
        } else {
          participant.shotclockState = JSON.parse(JSON.stringify(activeShotclock));
        }
        participant.lastAction = `Rolle vom Leiter geändert: ${newRole === 'zeitnehmer' ? 'Zeitnehmer' : '24s Shotclock'}`;
        participant.lastActionTime = Date.now();

        broadcastSession(pin);

        io.to(data.participantId).emit('role_switched', {
          role: newRole,
          changedBy: 'admin',
          stramatelState: participant.stramatelState,
          shotclockState: participant.shotclockState,
          message: `Dein Schulungsleiter hat deine Rolle zu "${newRole === 'zeitnehmer' ? 'Zeitnehmer (Hauptanzeige)' : '24s Shotclock'}" geändert. Deine Werte wurden an die Master-Referenzwerte angepasst.`,
        });
      }
    );

    // Admin resets single participant to current master values (Admin only)
    socket.on(
      'reset_participant_to_master',
      (data: { pin: string; participantId: string }) => {
        const pin = data.pin.toUpperCase();
        if (!isSocketAdmin(socket, pin)) return;

        const session = sessions[pin];
        if (!session) return;

        const participant = session.participants[data.participantId];
        if (!participant) return;

        const { activeStramatel, activeShotclock } = getActiveMasterStates(session);

        if (participant.role === 'zeitnehmer') {
          participant.stramatelState = JSON.parse(JSON.stringify(activeStramatel));
        } else {
          participant.shotclockState = JSON.parse(JSON.stringify(activeShotclock));
        }
        participant.lastAction = 'Auf Master synchronisiert';
        participant.lastActionTime = Date.now();

        broadcastSession(pin);

        io.to(data.participantId).emit('force_sync_to_master', {
          role: participant.role,
          stramatelState: participant.stramatelState,
          shotclockState: participant.shotclockState,
          message: 'Deine Werte wurden vom Schulungsleiter auf den Master-Referenzwert zurückgesetzt.',
        });
      }
    );

    // Admin resets ALL participants to current master values (Admin only)
    socket.on(
      'reset_all_to_master',
      (data: { pin: string; roles?: ('zeitnehmer' | 'shotclock')[] }) => {
        const pin = data.pin.toUpperCase();
        if (!isSocketAdmin(socket, pin)) return;

        const session = sessions[pin];
        if (!session) return;

        const targetRoles = data.roles && data.roles.length > 0 ? data.roles : ['zeitnehmer', 'shotclock'];
        const { activeStramatel, activeShotclock } = getActiveMasterStates(session);
        const masterZId = session.masterConfig.masterZeitnehmerId || session.masterConfig.masterId || 'trainer';
        const masterSId = session.masterConfig.masterShotclockId || session.masterConfig.masterId || 'trainer';

        Object.values(session.participants).forEach((participant) => {
          if (!targetRoles.includes(participant.role)) return;

          if (participant.role === 'zeitnehmer') {
            if (participant.id === masterZId) return;
            participant.stramatelState = JSON.parse(JSON.stringify(activeStramatel));
          } else {
            if (participant.id === masterSId) return;
            participant.shotclockState = JSON.parse(JSON.stringify(activeShotclock));
          }
          participant.lastAction = 'Auf Master synchronisiert';
          participant.lastActionTime = Date.now();

          io.to(participant.id).emit('force_sync_to_master', {
            role: participant.role,
            stramatelState: participant.stramatelState,
            shotclockState: participant.shotclockState,
            message: 'Deine Werte wurden vom Schulungsleiter auf den Master-Referenzwert zurückgesetzt.',
          });
        });

        broadcastSession(pin);
      }
    );

    // Admin ends session explicitly (Admin only)
    socket.on('delete_session', (data: { pin: string; token?: string; adminPin?: string }, callback?: (response: { success: boolean }) => void) => {
      const pin = data?.pin ? data.pin.toUpperCase().trim() : '';
      const session = sessions[pin];
      if (!session) {
        if (typeof callback === 'function') callback({ success: true });
        return;
      }

      const isTokenMatch = Boolean(data.token && session.adminToken && data.token === session.adminToken);
      const isPinMatch = Boolean(data.adminPin && session.adminPin && data.adminPin === session.adminPin);
      const isAdmin = isSocketAdmin(socket, pin) || isTokenMatch || isPinMatch;

      if (!isAdmin) {
        if (typeof callback === 'function') callback({ success: false });
        return;
      }

      console.log(`[admin] Session ${pin} deleted by admin via socket`);
      io.to(`session:${pin}`).emit('session_ended', { pin, reason: 'admin_closed' });
      io.to(`admin:${pin}`).emit('session_ended', { pin, reason: 'admin_closed' });
      delete sessions[pin];
      if (typeof callback === 'function') callback({ success: true });
    });

    // Disconnect
    socket.on('disconnect', () => {
      if (currentPin && currentParticipantId && sessions[currentPin]) {
        delete sessions[currentPin].participants[currentParticipantId];
        // If master left, fallback to trainer
        if (sessions[currentPin].masterConfig.masterZeitnehmerId === currentParticipantId) {
          sessions[currentPin].masterConfig.masterZeitnehmerId = 'trainer';
        }
        if (sessions[currentPin].masterConfig.masterShotclockId === currentParticipantId) {
          sessions[currentPin].masterConfig.masterShotclockId = 'trainer';
        }
        if (sessions[currentPin].masterConfig.masterId === currentParticipantId) {
          sessions[currentPin].masterConfig.masterId = 'trainer';
        }
        broadcastSession(currentPin);
      }
    });
  });

  httpServer.listen(port, () => {
    console.log(`> Kampfgericht Server läuft auf http://${hostname}:${port}`);
  });
});

