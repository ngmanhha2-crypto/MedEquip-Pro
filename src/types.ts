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
  expiryGCP: string; // Giấy phép (Ngày hết hạn)
  expiryGKD: string; // Kiểm định (Ngày hết hạn)
  expiryGKX?: string; // Kiểm xạ (Ngày hết hạn)
  noGCP?: boolean; // Tắt / Không áp dụng Giấy phép GCP
  noGKD?: boolean; // Tắt / Không áp dụng Kiểm định GKĐ
  noGKX?: boolean; // Tắt / Không áp dụng Đo kiểm xạ GKX
  department?: string; // Khoa / Phòng đặt máy
  gcpIssueDate?: string; // Ngày cấp / gia hạn giấy phép gần nhất
  gcpPeriod?: number; // Thời hạn giấy phép (tháng)
  gkdIssueDate?: string; // Ngày kiểm định gần nhất
  gkdPeriod?: number; // Thời hạn kiểm định (tháng)
  gkxIssueDate?: string; // Ngày kiểm xạ gần nhất
  gkxPeriod?: number; // Thời hạn kiểm xạ (tháng)
  lastMaintenance: string;
  maintenancePeriod: number; // Months
  notes?: string;
  noteDate?: string;
  notesList?: DeviceNote[];
  manager?: string; // Người quản lý thiết bị
}

export interface MaintenanceLog {
  id: string;
  deviceId: string;
  date: string;
  type: 'GCP' | 'GKD' | 'GKX' | 'BD';
  note: string;
}

export interface ActivityLog {
  id: string;
  deviceId: string;
  date: string;
  user: string;
  type: 'CONFIRM' | 'UPLOAD' | 'EDIT' | 'CREATE' | 'MANUAL' | 'DELETE';
  categoryLabel: string;
  description: string;
  notes?: string;
}
