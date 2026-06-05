import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  getDocFromServer, 
  getDocs, 
  collection, 
  query, 
  where, 
  setDoc, 
  updateDoc, 
  deleteDoc 
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { Device, ActivityLog } from '../types';

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Firestore (utilizing custom database ID if available)
const extendedConfig = firebaseConfig as any;
export const db = extendedConfig.firestoreDatabaseId && extendedConfig.firestoreDatabaseId !== '(default)'
  ? getFirestore(app, extendedConfig.firestoreDatabaseId)
  : getFirestore(app);
export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

// Hardened error handler required by firecheck SDK specification
export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// CRITICAL CONSTRAINT: Test Firestore client-server connectivity on startup
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error: any) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Firestore connection is in offline mode. Client will use local persistence.");
    }
  }
}
testConnection();

// Helper function to recursively remove all keys with undefined values from a payload
function cleanPayload<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return null as any;
  }
  if (typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(cleanPayload) as any;
  }
  const result: any = {};
  for (const key of Object.keys(obj)) {
    const val = (obj as any)[key];
    if (val !== undefined) {
      result[key] = cleanPayload(val);
    }
  }
  return result;
}

// --- Firestore Devices Accessors ---

export async function fetchDevicesFromFirestore(userId: string): Promise<Device[]> {
  const collectionPath = 'devices';
  try {
    const q = query(collection(db, collectionPath), where('userId', '==', userId));
    const snapshot = await getDocs(q);
    const devices: Device[] = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      devices.push({
        ...data,
        id: docSnap.id
      } as Device);
    });
    return devices;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, collectionPath);
  }
}

export async function saveDeviceToFirestore(userId: string, device: Device): Promise<void> {
  const docPath = `devices/${device.id}`;
  try {
    const payload = cleanPayload({
      ...device,
      userId
    });
    await setDoc(doc(db, 'devices', device.id), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, docPath);
  }
}

export async function updateDeviceInFirestore(userId: string, device: Device): Promise<void> {
  const docPath = `devices/${device.id}`;
  try {
    const { id, ...editableData } = device;
    const payload = cleanPayload({
      ...editableData,
      userId
    });
    await setDoc(doc(db, 'devices', device.id), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, docPath);
  }
}

export async function deleteDeviceFromFirestore(userId: string, deviceId: string): Promise<void> {
  const docPath = `devices/${deviceId}`;
  try {
    await deleteDoc(doc(db, 'devices', deviceId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

// --- Firestore ActivityLogs Accessors ---

export async function fetchActivityLogsFromFirestore(userId: string): Promise<ActivityLog[]> {
  const collectionPath = 'activityLogs';
  try {
    const q = query(collection(db, collectionPath), where('userId', '==', userId));
    const snapshot = await getDocs(q);
    const logs: ActivityLog[] = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      logs.push({
        ...data,
        id: docSnap.id
      } as ActivityLog);
    });
    return logs;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, collectionPath);
  }
}

export async function saveActivityLogToFirestore(userId: string, log: ActivityLog): Promise<void> {
  const docPath = `activityLogs/${log.id}`;
  try {
    const payload = cleanPayload({
      ...log,
      userId
    });
    await setDoc(doc(db, 'activityLogs', log.id), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, docPath);
  }
}

export async function deleteActivityLogFromFirestore(userId: string, logId: string): Promise<void> {
  const docPath = `activityLogs/${logId}`;
  try {
    await deleteDoc(doc(db, 'activityLogs', logId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}
