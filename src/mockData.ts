import { Device } from './types';

export const MOCK_DEVICES: Device[] = [
  {
    id: '1',
    name: 'Máy X-quang kỹ thuật số (DR)',
    model: 'Titan 2000',
    serialNumber: 'SN-DR-2022-001',
    manufacturer: 'Siemens',
    origin: 'Đức',
    yearOfProduction: 2022,
    expiryGCP: '2026-12-31',
    expiryGKD: '2026-05-20',
    lastMaintenance: '2025-12-01',
    maintenancePeriod: 6,
    notes: 'Thiết bị hoạt động ổn định, chú ý định kỳ kiểm tra dòng dò bức xạ và tấm cảm nhận kỹ thuật số định kỳ.',
    noteDate: '2026-05-15',
    notesList: [
      {
        id: '1-note-1',
        date: '2026-05-15',
        content: 'Thiết bị hoạt động ổn định, chú ý định kỳ kiểm tra dòng dò bức xạ và tấm cảm nhận kỹ thuật số định kỳ.'
      },
      {
        id: '1-note-2',
        date: '2026-05-28',
        content: 'Các kỹ sư hãng Siemens thực hiện hiệu chỉnh bù sai lệch và kiểm tra các tính năng hệ thống phát tia X.'
      }
    ]
  },
  {
    id: '2',
    name: 'Máy CT Scanner 128 lát cắt',
    model: 'Somatom Go',
    serialNumber: 'SN-CT-2021-99',
    manufacturer: 'GE Healthcare',
    origin: 'Mỹ',
    yearOfProduction: 2021,
    expiryGCP: '2026-05-25',
    expiryGKD: '2026-04-10',
    lastMaintenance: '2026-02-15',
    maintenancePeriod: 3,
    notes: 'Phòng máy lạnh cần duy trì nhiệt độ 20-22 độ C ổn định để tránh lỗi quá nhiệt đầu thu CT. Định kỳ hút bụi các khe tản nhiệt.',
    noteDate: '2026-06-01',
    notesList: [
      {
        id: '2-note-1',
        date: '2026-05-20',
        content: 'Phòng máy lạnh cần duy trì nhiệt độ 20-22 độ C ổn định để tránh lỗi quá nhiệt đầu thu CT.'
      },
      {
        id: '2-note-2',
        date: '2026-06-01',
        content: 'Định kỳ hút bụi các khe tản nhiệt.'
      }
    ]
  },
  {
    id: '3',
    name: 'Máy in phim khô',
    model: 'DryPix 6000',
    serialNumber: 'SN-PR-1122',
    manufacturer: 'Fujifilm',
    origin: 'Nhật Bản',
    yearOfProduction: 2023,
    expiryGCP: '2027-01-01',
    expiryGKD: '2026-06-10',
    lastMaintenance: '2026-01-10',
    maintenancePeriod: 12
  },
  {
    id: '4',
    name: 'Máy bơm thuốc cản quang',
    model: 'Medrad Stellant',
    serialNumber: 'SN-PUMP-4455',
    manufacturer: 'Bayer',
    origin: 'Mỹ',
    yearOfProduction: 2020,
    expiryGCP: '2025-05-01', // Expired
    expiryGKD: '2026-05-05', // Expiring soon
    lastMaintenance: '2025-11-20',
    maintenancePeriod: 6
  },
  {
    id: '5',
    name: 'Máy X-quang Răng',
    model: 'Panoramic X-Ray',
    serialNumber: 'SN-DENT-88',
    manufacturer: 'Planmeca',
    origin: 'Phần Lan',
    yearOfProduction: 2019,
    expiryGCP: '', // Invalid date test
    expiryGKD: '2026-08-15',
    lastMaintenance: '2025-08-15',
    maintenancePeriod: 12
  }
];
