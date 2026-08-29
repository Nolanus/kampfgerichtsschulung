export type ConsoleRole = 'zeitnehmer' | 'shotclock';

export interface StramatelState {
  gameTimeTenths: number; // 6000 = 10:00.0
  isRunning: boolean;
  scoreHeim: number;
  scoreGast: number;
  foulsHeim: number;
  foulsGast: number;
  period: number;
  timeoutsHeim: number;
  timeoutsGast: number;
}

export interface ShotclockState {
  shotclockTenths: number; // 240 = 24.0s (or 600 = 60.0s during timeoutA, 300 = 30.0s during timeoutB)
  isRunning: boolean;
  mode?: 'shotclock' | 'timeoutA' | 'timeoutB';
  savedShotclockTenths?: number; // Stores previous shotclock tenths when entering timeout mode
  timeoutSecondsLeft?: number | null;
  isTimeoutRunning?: boolean;
  isDisplayOff?: boolean; // true when 24s shotclock display is switched off / blanked
}

export interface Participant {
  id: string; // socket ID
  name: string;
  role: ConsoleRole;
  device?: string;
  joinedAt: number;
  lastAction: string;
  lastActionTime: number;
  stramatelState?: StramatelState;
  shotclockState?: ShotclockState;
}

export interface Tolerances {
  gameClockSeconds: number; // e.g. 1.5
  shotClockSeconds: number; // e.g. 1.0
  score: number;            // e.g. 0
  fouls: number;            // e.g. 0
}

export interface MasterConfig {
  masterZeitnehmerId: string; // 'trainer' | 'consensus' | participantSocketId
  masterShotclockId: string;   // 'trainer' | 'consensus' | participantSocketId
  masterId?: string;           // Backwards compatibility fallback
  tolerances: Tolerances;
}

export interface ActivityLogEntry {
  id: string;
  time: number;
  participantName: string;
  role: ConsoleRole | 'admin';
  action: string;
}

export interface SessionData {
  pin: string;
  createdAt: number;
  lastActivityAt: number;
  allowParticipantRoleChange?: boolean;
  masterConfig: MasterConfig;
  trainerStramatelState?: StramatelState;
  trainerShotclockState?: ShotclockState;
  participants: Record<string, Participant>;
  activityLog: ActivityLogEntry[];
  adminToken?: string;
  adminPin?: string;
}

export interface AdminAuthPayload {
  success: boolean;
  pin: string;
  adminToken?: string;
  adminPin?: string;
  error?: string;
}

export interface RoleSwitchPayload {
  role: ConsoleRole;
  changedBy: 'self' | 'admin';
  stramatelState?: StramatelState;
  shotclockState?: ShotclockState;
  message?: string;
}

export interface SyncToMasterPayload {
  role: ConsoleRole;
  stramatelState?: StramatelState;
  shotclockState?: ShotclockState;
  message?: string;
}

