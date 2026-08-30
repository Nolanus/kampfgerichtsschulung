import { SessionData } from '@/types';

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

interface GlobalSessionStore {
  sessions: Record<string, SessionData>;
}

const globalStore = globalThis as unknown as {
  __KAMPFGERICHT_STORE__?: GlobalSessionStore;
};

if (!globalStore.__KAMPFGERICHT_STORE__) {
  globalStore.__KAMPFGERICHT_STORE__ = {
    sessions: {},
  };
}

export const sessions = globalStore.__KAMPFGERICHT_STORE__.sessions;

export function generateAdminPin(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

export function generateAdminToken(): string {
  return 'adm_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

export function generateUniqueSessionPin(): string {
  for (let i = 0; i < 100; i++) {
    const word = BASKETBALL_WORDS[Math.floor(Math.random() * BASKETBALL_WORDS.length)];
    const num = Math.floor(10 + Math.random() * 90);
    const pin = `${word}${num}`;
    if (!sessions[pin]) {
      return pin;
    }
  }
  return `GAME${Math.floor(1000 + Math.random() * 9000)}`;
}

export function getOrCreateSession(pin: string, initialAdminToken?: string): SessionData {
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

export function getSanitizedSession(session: SessionData, forAdmin = false): SessionData {
  if (forAdmin) {
    return session;
  }
  // Strip secret admin credentials for participants
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { adminToken: _t, adminPin: _p, ...publicSession } = session;
  return publicSession as SessionData;
}
