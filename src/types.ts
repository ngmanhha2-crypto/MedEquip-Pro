import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export enum DeviceStatus {
  NORMAL = 'Bình thường',
  EXPIRING_SOON = 'Sắp hết hạn',
  EXPIRED = 'Quá hạn',
}

export interface DeviceNote {
  id: string;
  date: string;
  content: string;
}

export interface Device {
  id: string;
  name: string;
  model: string;
  serialNumber: string;
  manufacturer: string;
  origin: string;
  yearOfProduction: number;
  expiryGCP: string; // Giấy phép
  expiryGKD: string; // Kiểm định
  lastMaintenance: string;
  maintenancePeriod: number; // Months
  notes?: string;
  noteDate?: string;
  notesList?: DeviceNote[];
}

export interface MaintenanceLog {
  id: string;
  deviceId: string;
  date: string;
  type: 'GCP' | 'GKD' | 'BD';
  note: string;
}
