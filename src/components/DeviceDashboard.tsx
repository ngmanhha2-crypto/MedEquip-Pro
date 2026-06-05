import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Download, 
  Plus, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Filter,
  MoreVertical,
  Calendar,
  Settings,
  History,
  LayoutDashboard,
  FileText,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Pencil,
  X,
  Trash2,
  Edit3,
  Folder,
  File,
  Upload,
  ArrowLeft,
  ExternalLink,
  Lock,
  Cloud,
  Loader2
} from 'lucide-react';
import { MOCK_DEVICES } from '../mockData';
import { Device, DeviceNote, ActivityLog } from '../types';
import { getDaysRemaining, getStatusColor, formatDisplayDate, checkReminders } from '../utils/dateUtils';
import {
  googleSignIn,
  logout,
  initAuth,
  getAccessToken,
  getDeviceFolderId,
  listFolderFiles,
  uploadFileToFolder,
  deleteDriveFile,
  formatBytes,
  DriveFile
} from '../utils/googleDrive';
import {
  auth,
  fetchDevicesFromFirestore,
  saveDeviceToFirestore,
  updateDeviceInFirestore,
  deleteDeviceFromFirestore,
  fetchActivityLogsFromFirestore,
  saveActivityLogToFirestore,
  deleteActivityLogFromFirestore
} from '../utils/firebaseService';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import { parseISO, addMonths, differenceInDays, format } from 'date-fns';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut as firebaseSignOut,
  User as FirebaseUser
} from 'firebase/auth';


const DeviceDashboard: React.FC = () => {
  const [devices, setDevices] = useState<Device[]>(MOCK_DEVICES);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'expired' | 'warning' | 'ok'>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [selectedHistoryDevice, setSelectedHistoryDevice] = useState<Device | null>(null);
  const [selectedNoteDevice, setSelectedNoteDevice] = useState<Device | null>(null);
  const [activeTab, setActiveTab] = useState<'inventory' | 'maintenance' | 'legal' | 'settings'>('inventory');

  // Custom warning thresholds configuration days (Giấy phép GCP, Kiểm định GKĐ, Bảo dưỡng BD)
  const [warningDaysGCP, setWarningDaysGCP] = useState<number>(() => {
    const val = localStorage.getItem('medequip_warning_days_gcp');
    return val ? parseInt(val) : 30;
  });
  const [warningDaysGKD, setWarningDaysGKD] = useState<number>(() => {
    const val = localStorage.getItem('medequip_warning_days_gkd');
    return val ? parseInt(val) : 30;
  });
  const [warningDaysBD, setWarningDaysBD] = useState<number>(() => {
    const val = localStorage.getItem('medequip_warning_days_bd');
    return val ? parseInt(val) : 30;
  });

  // Shared Google Drive Integration States
  const [isDriveConnected, setIsDriveConnected] = useState(() => {
    return localStorage.getItem('medequip_google_connected') === 'true';
  });
  const [driveUserEmail, setDriveUserEmail] = useState<string | null>(() => {
    return localStorage.getItem('medequip_google_email');
  });
  const [authLoading, setAuthLoading] = useState(false);
  
  // Primary Email/Password Auth States
  const [appUser, setAppUser] = useState<FirebaseUser | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isRegisterScreen, setIsRegisterScreen] = useState(false);
  const [driveFiles, setDriveFiles] = useState<Record<string, DriveFile[]>>({});
  const [driveFolderIds, setDriveFolderIds] = useState<Record<string, string>>({});
  const [showAuthDomainError, setShowAuthDomainError] = useState(false);
  const [failedDomain, setFailedDomain] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    variant?: 'danger' | 'warning' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const askConfirmation = (title: string, message: string, onConfirm: () => void, variant: 'danger' | 'warning' | 'info' = 'danger', confirmText?: string) => {
    setConfirmDialog({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        onConfirm();
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
      },
      variant,
      confirmText
    });
  };

  // Initialize Auth state listener globally
  React.useEffect(() => {
    // 1. Google Drive auth listener
    const unsubscribeDrive = initAuth(
      (user, token) => {
        setIsDriveConnected(true);
        const storedEmail = localStorage.getItem('medequip_google_email') || user.email || 'Người dùng Google';
        setDriveUserEmail(storedEmail);
      },
      () => {
        // If not in localstorage, set offline
        if (localStorage.getItem('medequip_google_connected') !== 'true') {
          setIsDriveConnected(false);
          setDriveUserEmail(null);
        }
      }
    );

    // 2. Primary Email/Password auth listener
    const unsubscribePrimary = onAuthStateChanged(auth, (user) => {
      setAppUser(user);
      setIsAuthChecking(false);
    });

    return () => {
      unsubscribeDrive();
      unsubscribePrimary();
    };
  }, []);

  const handleConnectDrive = async () => {
    setAuthLoading(true);
    try {
      const res = await googleSignIn();
      if (res) {
        setIsDriveConnected(true);
        setDriveUserEmail(res.email || 'Người dùng Google');
        setDriveFolderIds({});
        alert('Kênh lưu trữ Google Drive đã được kết nối thành công!');
      }
    } catch (err: any) {
      console.error('Lỗi khi đăng nhập Google:', err);
      if (err.message && (err.message.includes("auth/unauthorized-domain") || err.code === "auth/unauthorized-domain" || String(err).includes("unauthorized-domain"))) {
        setFailedDomain(window.location.hostname);
        setShowAuthDomainError(true);
      } else {
        alert(`Đăng nhập Google Drive thất bại: ${err.message || err}`);
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleDisconnectDrive = async () => {
    askConfirmation(
      'Ngắt kết nối Google Drive',
      'Bạn có chắc chắn muốn ngắt kết nối Google Drive? Các tệp tài học lý sẽ tạm thời hiển thị ở trạng thái ngoại tuyến.',
      async () => {
        setAuthLoading(true);
        try {
          await logout();
          setIsDriveConnected(false);
          setDriveUserEmail(null);
        } catch (err: any) {
          alert(`Lỗi khi đăng xuất: ${err.message || err}`);
        } finally {
          setAuthLoading(false);
        }
      },
      'warning',
      'Ngắt kết nối'
    );
  };

  const handleSignOutSystem = async () => {
    askConfirmation(
      'Đăng xuất hệ thống',
      'Bạn muốn đăng xuất khỏi tài khoản quản trị thiết bị?',
      async () => {
        try {
          setIsAuthChecking(true);
          await firebaseSignOut(auth);
          setDevices([]);
        } catch (err: any) {
          alert(`Đăng xuất thất bại: ${err.message}`);
        } finally {
          setIsAuthChecking(false);
        }
      },
      'warning',
      'Đăng xuất'
    );
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail || !authPassword) {
      alert('Vui lòng điền đầy đủ tài khoản và mật khẩu!');
      return;
    }
    setAuthLoading(true);
    try {
      if (isRegisterScreen) {
        await createUserWithEmailAndPassword(auth, authEmail, authPassword);
        alert('Tạo tài khoản quản trị thành công!');
      } else {
        await signInWithEmailAndPassword(auth, authEmail, authPassword);
      }
    } catch (err: any) {
      console.error(err);
      let errorMsg = err.message || String(err);
      if (errorMsg.includes("auth/invalid-credential")) {
        errorMsg = "Sai email hoặc mật khẩu. Vui lòng kiểm tra lại!";
      } else if (errorMsg.includes("auth/weak-password")) {
        errorMsg = "Mật khẩu quá yếu (tối thiểu 6 ký tự).";
      } else if (errorMsg.includes("auth/email-already-in-use")) {
        errorMsg = "Email này đã được sử dụng bởi một tài khoản khác.";
      }
      alert(`Lỗi xác thực: ${errorMsg}`);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSaveNote = async (id: string, notesList: DeviceNote[]) => {
    const sortedNotesList = [...notesList].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const latestNote = sortedNotesList[0];
    const notesValue = latestNote ? latestNote.content : '';
    const noteDateValue = latestNote ? latestNote.date : '';

    setDevices(prev => prev.map(d => d.id === id ? { ...d, notes: notesValue, noteDate: noteDateValue, notesList } : d));
    
    if (selectedNoteDevice && selectedNoteDevice.id === id) {
      setSelectedNoteDevice(prev => prev ? { ...prev, notes: notesValue, noteDate: noteDateValue, notesList } : null);
    }

    const deviceObj = devices.find(d => d.id === id);
    if (deviceObj && auth.currentUser) {
      const updatedDevice = { ...deviceObj, notes: notesValue, noteDate: noteDateValue, notesList };
      await updateDeviceInFirestore(auth.currentUser.uid, updatedDevice);
    }

    const deviceName = deviceObj?.name || 'Thiết bị';
    const newAutoLog: ActivityLog = {
      id: `note-log-${Math.random().toString(36).substring(2, 9)}`,
      deviceId: id,
      date: new Date().toISOString().split('T')[0],
      user: 'Người quản lý',
      type: 'EDIT',
      categoryLabel: 'Ghi chú',
      description: `Cập nhật ghi chú quản lý cho thiết bị "${deviceName}".`,
      notes: notesList.length > 0
        ? `Tổng số ghi chú: ${notesList.length}. Ghi chú mới nhất (${formatDisplayDate(noteDateValue || new Date().toISOString().split('T')[0])}): "${notesValue.length > 50 ? notesValue.substring(0, 50) + '...' : notesValue}"`
        : 'Đã xóa toàn bộ ghi chú.'
    };
    setActivityLogs(prev => [newAutoLog, ...prev]);
    if (auth.currentUser) {
      await saveActivityLogToFirestore(auth.currentUser.uid, newAutoLog);
    }
  };

  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>(() => [
    // Device 1
    {
      id: 'log-1',
      deviceId: '1',
      date: '2025-12-01',
      user: 'Nguyễn Mạnh Hà',
      type: 'CONFIRM',
      categoryLabel: 'Bảo trì',
      description: 'Hoàn thành bảo dưỡng định kỳ nâng cao.',
      notes: 'Hãng Siemens thực hiện, vệ sinh bóng phát tia X và cân chỉnh liều lượng phát xạ.'
    },
    {
      id: 'log-2',
      deviceId: '1',
      date: '2025-05-20',
      user: 'Admin',
      type: 'CONFIRM',
      categoryLabel: 'Kiểm định',
      description: 'Kiểm định an toàn bức xạ phòng máy DR (GKĐ).',
      notes: 'Thực hiện bởi Trung tâm Kiểm định thiết bị Bức xạ.'
    },
    {
      id: 'log-3',
      deviceId: '1',
      date: '2024-01-20',
      user: 'Hệ thống',
      type: 'CREATE',
      categoryLabel: 'Nhập máy',
      description: 'Khởi tạo hồ sơ thiết bị ban đầu trên hệ thống.',
      notes: ''
    },
    // Device 2
    {
      id: 'log-4',
      deviceId: '2',
      date: '2026-02-15',
      user: 'Trần Văn Tú (Kỹ sư)',
      type: 'CONFIRM',
      categoryLabel: 'Bảo trì',
      description: 'Bảo dưỡng định kỳ 3 tháng.',
      notes: 'GE Healthcare cung cấp phụ tùng, kiểm tra hệ thống làm mát đầu thu Gantry.'
    },
    {
      id: 'log-5',
      deviceId: '2',
      date: '2025-04-10',
      user: 'Hệ thống',
      type: 'CONFIRM',
      categoryLabel: 'Kiểm định',
      description: 'Đạt kiểm chuẩn chất lượng hình ảnh & đo liều cắt lớp vi tính.',
      notes: 'Hồ sơ lưu trữ tại ngăn số 2 tủ pháp lý.'
    },
    // Device 3
    {
      id: 'log-6',
      deviceId: '3',
      date: '2026-01-10',
      user: 'Lê Hồng Minh',
      type: 'CONFIRM',
      categoryLabel: 'Bảo trì',
      description: 'Bảo dưỡng định kỳ & Thay trục cao su kéo phim.',
      notes: 'Cải thiện tốc độ in phim đáng kể.'
    },
    // Device 4
    {
      id: 'log-7',
      deviceId: '4',
      date: '2025-11-20',
      user: 'Admin',
      type: 'CONFIRM',
      categoryLabel: 'Bảo trì',
      description: 'Bảo dưỡng định kỳ hệ thống piston áp lực.',
      notes: 'Bơm hoạt động êm ái, kiểm thử áp suất nén đạt tiêu chuẩn.'
    }
  ]);

  const [loadingData, setLoadingData] = useState(false);

  React.useEffect(() => {
    let active = true;
    const syncData = async () => {
      const currentUser = auth.currentUser;
      if (currentUser) {
        setLoadingData(true);
        try {
          const firestoreDevices = await fetchDevicesFromFirestore(currentUser.uid);
          if (!active) return;

          if (firestoreDevices && firestoreDevices.length > 0) {
            setDevices(firestoreDevices);
            const firestoreLogs = await fetchActivityLogsFromFirestore(currentUser.uid);
            if (active) {
              setActivityLogs(firestoreLogs || []);
            }
          } else {
            const seedDevices = MOCK_DEVICES.map(d => ({
              ...d,
              userId: currentUser.uid
            }));
            
            for (const d of seedDevices) {
              await saveDeviceToFirestore(currentUser.uid, d);
            }

            const initialLogsSeed: ActivityLog[] = [
              {
                id: 'log-1',
                deviceId: '1',
                date: '2025-12-01',
                user: 'Nguyễn Mạnh Hà',
                type: 'CONFIRM',
                categoryLabel: 'Bảo trì',
                description: 'Hoàn thành bảo dưỡng định kỳ nâng cao.',
                notes: 'Hãng Siemens thực hiện, vệ sinh bóng phát tia X và cân chỉnh liều lượng phát xạ.'
              },
              {
                id: 'log-2',
                deviceId: '1',
                date: '2025-05-20',
                user: 'Admin',
                type: 'CONFIRM',
                categoryLabel: 'Kiểm định',
                description: 'Kiểm định an toàn bức xạ phòng máy DR (GKĐ).',
                notes: 'Thực hiện bởi Trung tâm Kiểm định thiết bị Bức xạ.'
              },
              {
                id: 'log-3',
                deviceId: '1',
                date: '2024-01-20',
                user: 'Hệ thống',
                type: 'CREATE',
                categoryLabel: 'Nhập máy',
                description: 'Khởi tạo thông tin hệ thống máy X-quang DR.'
              }
            ].map(log => ({
              ...log,
              userId: currentUser.uid
            } as any as ActivityLog));

            for (const log of initialLogsSeed) {
              await saveActivityLogToFirestore(currentUser.uid, log);
            }

            if (active) {
              setDevices(seedDevices);
              setActivityLogs(initialLogsSeed);
            }
          }
        } catch (err: any) {
          console.error("Lỗi khi đồng bộ dữ liệu Firestore:", err);
        } finally {
          if (active) setLoadingData(false);
        }
      } else {
        setDevices(MOCK_DEVICES);
        setActivityLogs([
          {
            id: 'log-1',
            deviceId: '1',
            date: '2025-12-01',
            user: 'Nguyễn Mạnh Hà',
            type: 'CONFIRM',
            categoryLabel: 'Bảo trì',
            description: 'Hoàn thành bảo dưỡng định kỳ nâng cao.',
            notes: 'Hãng Siemens thực hiện, vệ sinh bóng phát tia X và cân chỉnh liều lượng phát xạ.'
          },
          {
            id: 'log-2',
            deviceId: '1',
            date: '2025-05-20',
            user: 'Admin',
            type: 'CONFIRM',
            categoryLabel: 'Kiểm định',
            description: 'Kiểm định an toàn bức xạ phòng máy DR (GKĐ).',
            notes: 'Thực hiện bởi Trung tâm Kiểm định thiết bị Bức xạ.'
          },
          {
            id: 'log-3',
            deviceId: '1',
            date: '2024-01-20',
            user: 'Hệ thống',
            type: 'CREATE',
            categoryLabel: 'Nhập máy',
            description: 'Khởi tạo hồ sơ thiết bị ban đầu trên hệ thống.',
            notes: ''
          }
        ]);
      }
    };

    syncData();
    return () => {
      active = false;
    };
  }, [appUser]);

  const filteredDevices = useMemo(() => {
    return devices.filter(d => {
      const gkdDays = getDaysRemaining(d.expiryGKD);
      const gcpDays = getDaysRemaining(d.expiryGCP);
      const isSearchMatch = d.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           d.serialNumber.toLowerCase().includes(searchTerm.toLowerCase());
      
      if (filterStatus === 'all') return isSearchMatch;
      
      const isExpired = (gkdDays !== null && gkdDays < 0) || (gcpDays !== null && gcpDays < 0);
      const isWarning = (gkdDays !== null && gkdDays >= 0 && gkdDays <= warningDaysGKD) || 
                       (gcpDays !== null && gcpDays >= 0 && gcpDays <= warningDaysGCP);
      
      if (filterStatus === 'expired') return isSearchMatch && isExpired;
      if (filterStatus === 'warning') return isSearchMatch && isWarning;
      if (filterStatus === 'ok') return isSearchMatch && !isExpired && !isWarning;
      
      return isSearchMatch;
    });
  }, [devices, searchTerm, filterStatus, warningDaysGKD, warningDaysGCP]);

  const handleExportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(devices.map(d => ({
      'Tên thiết bị': d.name,
      'Model': d.model,
      'Số Serial': d.serialNumber,
      'Hãng/Xuất xứ': `${d.manufacturer} / ${d.origin}`,
      'Năm SX': d.yearOfProduction,
      'Hạn GCP': formatDisplayDate(d.expiryGCP),
      'Hạn GKĐ': formatDisplayDate(d.expiryGKD),
      'Bảo dưỡng lần cuối': formatDisplayDate(d.lastMaintenance)
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Devices");
    XLSX.writeFile(wb, "Danh_muc_thiet_bi_yte.xlsx");
  };

  const handleConfirmDone = async (id: string, type: 'GCP' | 'GKD' | 'BD', manualDate?: string) => {
    let logDescription = '';
    let category = '';
    const targetDeviceName = devices.find(d => d.id === id)?.name || 'Thiết bị';
    
    if (type === 'GKD') {
      logDescription = `Xác nhận hoàn thành kiểm định (GKĐ) định kỳ cho ${targetDeviceName}.`;
      category = 'Kiểm định';
    } else if (type === 'GCP') {
      logDescription = `Xác nhận gia hạn thành công Giấy phép sử dụng (GCP) cho ${targetDeviceName}.`;
      category = 'Giấy phép';
    } else if (type === 'BD') {
      logDescription = `Xác nhận bảo trì định kỳ cho ${targetDeviceName}.`;
      category = 'Bảo trì';
    }

    setDevices(prev => prev.map(d => {
      if (d.id === id) {
        const targetDate = manualDate || new Date().toISOString().split('T')[0];
        if (type === 'GKD') return { ...d, expiryGKD: targetDate }; 
        if (type === 'GCP') return { ...d, expiryGCP: targetDate };
        if (type === 'BD') return { ...d, lastMaintenance: targetDate };
      }
      return d;
    }));

    const targetDevice = devices.find(d => d.id === id);
    if (targetDevice && auth.currentUser) {
      const targetDate = manualDate || new Date().toISOString().split('T')[0];
      const updatedD = { ...targetDevice };
      if (type === 'GKD') updatedD.expiryGKD = targetDate;
      if (type === 'GCP') updatedD.expiryGCP = targetDate;
      if (type === 'BD') updatedD.lastMaintenance = targetDate;
      await updateDeviceInFirestore(auth.currentUser.uid, updatedD);
    }

    // Auto-append to activityLogs
    const newAutoLog: ActivityLog = {
      id: `auto-log-${Math.random().toString(36).substr(2, 9)}`,
      deviceId: id,
      date: manualDate || new Date().toISOString().split('T')[0],
      user: 'Người dùng',
      type: 'CONFIRM',
      categoryLabel: category,
      description: logDescription,
      notes: manualDate ? `Ngày cập nhật thủ công: ${formatDisplayDate(manualDate)}` : 'Hệ thống tự động ghi nhận ngày hiện tại.'
    };
    setActivityLogs(prev => [newAutoLog, ...prev]);
    if (auth.currentUser) {
      await saveActivityLogToFirestore(auth.currentUser.uid, newAutoLog);
    }

    if (!manualDate) {
      alert('Đã xác nhận hoàn tất và cập nhật ngày hiện tại!');
    }
  };

  const handleDeleteDevice = async (id: string) => {
    askConfirmation(
      'Xóa thiết bị khỏi hệ thống',
      'Bạn có chắc chắn muốn xóa thiết bị này khỏi danh sách? Thao tác này sẽ xóa toàn bộ nhật ký liên quan ngoại tuyến và trực tuyến.',
      async () => {
        const originalDevices = [...devices];
        const originalLogs = [...activityLogs];

        // Thao tác xóa nhanh (optimistic update) trên giao diện
        setDevices(prev => prev.filter(d => d.id !== id));
        setActivityLogs(prev => prev.filter(log => log.deviceId !== id));

        if (auth.currentUser) {
          try {
            await deleteDeviceFromFirestore(auth.currentUser.uid, id);
            
            // Tìm danh sách nhật ký liên quan từ bản sao cũ để xóa trên Firestore
            const logsToDelete = originalLogs.filter(log => log.deviceId === id);
            for (const log of logsToDelete) {
              await deleteActivityLogFromFirestore(auth.currentUser.uid, log.id);
            }
          } catch (error: any) {
            console.error("Lỗi khi xóa thiết bị trong cơ sở dữ liệu:", error);
            
            // Hoàn tác lại trạng thái cũ nếu xảy ra lỗi
            setDevices(originalDevices);
            setActivityLogs(originalLogs);

            let msg = "Không thể xóa dữ liệu từ xa.";
            if (error instanceof Error) {
              try {
                const parsed = JSON.parse(error.message);
                if (parsed.error && parsed.error.includes("permission-denied")) {
                  msg = "Lỗi phân quyền Firestore (Permission Denied). Rule bảo mật hiện tại không cho phép xóa bản ghi này.";
                } else {
                  msg = `Lỗi từ hệ thống cơ sở dữ liệu: ${parsed.error || error.message}`;
                }
              } catch {
                if (error.message.includes("permission-denied")) {
                  msg = "Lỗi phân quyền (Permission Denied). Bạn không có quyền xóa thiết bị này.";
                } else {
                  msg = `Lỗi xảy ra: ${error.message}`;
                }
              }
            }
            alert(`Không thể xóa thiết bị!\n\nChi tiết: ${msg}`);
          }
        }
      },
      'danger',
      'Xóa thiết bị'
    );
  };

  const handleSaveDevice = async (deviceData: Partial<Device>) => {
    const todayStr = new Date().toISOString().split('T')[0];
    if (editingDevice) {
      const notesChanged = deviceData.notes !== editingDevice.notes;
      const updatedNoteDate = notesChanged ? (deviceData.notes ? todayStr : undefined) : editingDevice.noteDate;
      
      let updatedNotesList = editingDevice.notesList || [];
      if (notesChanged) {
        if (deviceData.notes) {
          if (updatedNotesList.length === 0) {
            updatedNotesList = [{
              id: `note-${Math.random().toString(36).substring(2, 9)}`,
              date: todayStr,
              content: deviceData.notes
            }];
          } else {
            updatedNotesList = [...updatedNotesList];
            // Update the top/latest note, or just replace/update
            updatedNotesList[0] = {
              ...updatedNotesList[0],
              content: deviceData.notes,
              date: todayStr
            };
          }
        } else {
          updatedNotesList = [];
        }
      }

      const updatedDevice = { ...editingDevice, ...deviceData, noteDate: updatedNoteDate, notesList: updatedNotesList } as Device;
      setDevices(prev => prev.map(d => d.id === editingDevice.id ? updatedDevice : d));
      
      if (auth.currentUser) {
        await updateDeviceInFirestore(auth.currentUser.uid, updatedDevice);
      }
      
      const newAutoLog: ActivityLog = {
        id: `auto-${Math.random().toString(36).substr(2, 9)}`,
        deviceId: editingDevice.id,
        date: todayStr,
        user: 'Người dùng',
        type: 'EDIT',
        categoryLabel: 'Cập nhật',
        description: `Chỉnh sửa thông tin hồ sơ thiết bị "${deviceData.name || editingDevice.name}".`,
        notes: `Năm sản xuất: ${deviceData.yearOfProduction || editingDevice.yearOfProduction}, Chu kỳ bảo trì: ${deviceData.maintenancePeriod || editingDevice.maintenancePeriod} tháng.`
      };
      setActivityLogs(prev => [newAutoLog, ...prev]);
      if (auth.currentUser) {
        await saveActivityLogToFirestore(auth.currentUser.uid, newAutoLog);
      }
    } else {
      const generatedId = Math.random().toString(36).substr(2, 9);
      const initialNotesList = deviceData.notes ? [{
        id: `note-${Math.random().toString(36).substring(2, 9)}`,
        date: todayStr,
        content: deviceData.notes
      }] : [];
      
      const newDevice: Device = {
        ...deviceData,
        id: generatedId,
        noteDate: deviceData.notes ? todayStr : undefined,
        notesList: initialNotesList
      } as Device;
      setDevices(prev => [newDevice, ...prev]);

      if (auth.currentUser) {
        await saveDeviceToFirestore(auth.currentUser.uid, newDevice);
      }

      const newAutoLog: ActivityLog = {
        id: `auto-${Math.random().toString(36).substr(2, 9)}`,
        deviceId: generatedId,
        date: todayStr,
        user: 'Người dùng',
        type: 'CREATE',
        categoryLabel: 'Nhập máy',
        description: `Khởi tạo thiết bị mới "${newDevice.name}" trên hệ thống.`,
        notes: `Model: ${newDevice.model} | Số serial: ${newDevice.serialNumber} | Xuất xứ: ${newDevice.origin}`
      };
      setActivityLogs(prev => [newAutoLog, ...prev]);
      if (auth.currentUser) {
        await saveActivityLogToFirestore(auth.currentUser.uid, newAutoLog);
      }
    }
    setIsModalOpen(false);
    setEditingDevice(null);
  };

  const stats = useMemo(() => {
    const expired = devices.filter(d => {
      const gkd = getDaysRemaining(d.expiryGKD);
      const gcp = getDaysRemaining(d.expiryGCP);
      return (gkd !== null && gkd < 0) || (gcp !== null && gcp < 0);
    }).length;
    
    const warning = devices.filter(d => {
      const gkd = getDaysRemaining(d.expiryGKD);
      const gcp = getDaysRemaining(d.expiryGCP);
      return (gkd !== null && gkd >= 0 && gkd <= warningDaysGKD) || (gcp !== null && gcp >= 0 && gcp <= warningDaysGCP);
    }).length;

    return { total: devices.length, expired, warning, ok: devices.length - expired - warning };
  }, [devices, warningDaysGKD, warningDaysGCP]);

  // Handle mock notifications
  React.useEffect(() => {
    devices.forEach(d => {
      const gkdDays = getDaysRemaining(d.expiryGKD);
      const gcpDays = getDaysRemaining(d.expiryGCP);
      
      const gkdReminder = checkReminders(gkdDays, warningDaysGKD);
      const gcpReminder = checkReminders(gcpDays, warningDaysGCP);
      
      if (gkdReminder) console.log(`[NOTIF] ${d.name} (GKĐ): ${gkdReminder}`);
      if (gcpReminder) console.log(`[NOTIF] ${d.name} (GCP): ${gcpReminder}`);
    });
  }, [devices, warningDaysGKD, warningDaysGCP]);

  // Sync warning thresholds to localStorage automatically
  React.useEffect(() => {
    localStorage.setItem('medequip_warning_days_gcp', warningDaysGCP.toString());
  }, [warningDaysGCP]);

  React.useEffect(() => {
    localStorage.setItem('medequip_warning_days_gkd', warningDaysGKD.toString());
  }, [warningDaysGKD]);

  React.useEffect(() => {
    localStorage.setItem('medequip_warning_days_bd', warningDaysBD.toString());
  }, [warningDaysBD]);

  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <Loader2 className="animate-spin text-blue-600 mb-4" size={48} />
        <p className="text-sm font-semibold text-slate-500 font-mono tracking-wide">ĐANG TẢI HỆ THỐNG...</p>
      </div>
    );
  }

  if (!appUser) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 font-sans relative overflow-hidden">
        {/* Abstract background graphics to elevate craft */}
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl"></div>

        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-md bg-white border border-slate-100 rounded-3xl shadow-xl overflow-hidden p-8 z-10"
        >
          <div className="text-center mb-8">
            <div className="mx-auto w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center text-xl font-black mb-4 shadow-md shadow-blue-500/20">
              M
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-tight">MedEquip Pro</h1>
            <p className="text-sm text-slate-500 mt-1.5">Hệ thống Quản lý & Giám sát Thiết bị Y tế</p>
          </div>

          <div className="flex border-b border-slate-100 mb-6 font-semibold">
            <button
              onClick={() => setIsRegisterScreen(false)}
              className={`flex-1 pb-3 text-sm text-center border-b-2 transition-all cursor-pointer ${!isRegisterScreen ? 'text-blue-600 border-blue-600 font-bold' : 'text-slate-400 border-transparent hover:text-slate-600'}`}
              type="button"
            >
              Đăng nhập
            </button>
            <button
              onClick={() => setIsRegisterScreen(true)}
              className={`flex-1 pb-3 text-sm text-center border-b-2 transition-all cursor-pointer ${isRegisterScreen ? 'text-blue-600 border-blue-600 font-bold' : 'text-slate-400 border-transparent hover:text-slate-600'}`}
              type="button"
            >
              Đăng ký tài khoản
            </button>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Địa chỉ Email</label>
              <input
                type="email"
                required
                placeholder="bacsi@benhvien.vn"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm transition-all bg-slate-50 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Mật khẩu</label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm transition-all bg-slate-50 focus:bg-white"
              />
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-3 bg-slate-900 border border-transparent text-white font-semibold rounded-xl text-sm transition-all hover:bg-slate-800 flex items-center justify-center gap-2 shadow-md shadow-slate-900/10 hover:shadow-slate-900/20 cursor-pointer disabled:opacity-50"
            >
              {authLoading ? (
                <Loader2 className="animate-spin" size={16} />
              ) : null}
              <span>{isRegisterScreen ? 'Tạo tài khoản' : 'Vào hệ thống'}</span>
            </button>
          </form>

          <div className="mt-6 flex flex-col items-center gap-2 border-t border-slate-100 pt-6">
            <p className="text-[11px] text-slate-400 text-center leading-relaxed">
              Dữ liệu của bạn được đồng bộ đám mây và bảo vệ bằng mật khẩu. Thư mục Google Drive lưu trữ hồ sơ tài liệu pháp lý được kết nối riêng độc lập.
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0">
        <div className="p-6 border-b border-slate-100 flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">X</div>
          <h1 className="text-lg font-bold tracking-tight">MedEquip <span className="text-blue-600 font-medium">Pro</span></h1>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 px-2">Phòng X-Quang</div>
          <SidebarLink active={activeTab === 'inventory'} onClick={() => setActiveTab('inventory')} icon={<LayoutDashboard size={20} />} label="Danh mục thiết bị" />
          <SidebarLink active={activeTab === 'maintenance'} onClick={() => setActiveTab('maintenance')} icon={<Calendar size={20} />} label="Lịch bảo trì" />
          <SidebarLink active={activeTab === 'legal'} onClick={() => setActiveTab('legal')} icon={<ShieldCheck size={20} />} label="Hồ sơ pháp lý" />
          <SidebarLink active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={<Settings size={20} />} label="Cài đặt hệ thống" />
        </nav>
        <div className="p-4 mt-auto border-t border-slate-100">
          <div className="bg-slate-900 text-white rounded-xl p-4">
            <div className="text-xs opacity-60 mb-1 italic">Hệ thống nhắc nhở tự động</div>
            <div className="text-sm font-medium">{stats.expired} Thiết bị quá hạn</div>
            <div className="mt-3 h-1 bg-white/20 rounded-full overflow-hidden">
              <div 
                className="bg-red-500 h-full transition-all duration-500" 
                style={{ width: `${(stats.expired / stats.total) * 100}%` }}
              ></div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <Search size={16} />
              </span>
              <input 
                type="text" 
                placeholder="Tìm kiếm thiết bị..." 
                className="pl-10 pr-4 py-2 bg-slate-100 border-none rounded-lg text-sm w-80 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* 1. Primary System Account Profile */}
            <div className="flex items-center gap-2.5 bg-slate-50 border border-slate-200 pl-3 pr-2 py-1.5 rounded-2xl">
              <div className="w-7 h-7 bg-blue-600 text-white rounded-xl flex items-center justify-center font-bold text-xs uppercase shadow-sm">
                {appUser?.email?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="text-left hidden md:block">
                <div className="text-xs font-bold text-slate-800 line-clamp-1 max-w-[120px] leading-tight">
                  Quản trị viên
                </div>
                <div className="text-[10px] text-slate-400 font-mono line-clamp-1 max-w-[125px] leading-none mt-0.5">
                  {appUser?.email}
                </div>
              </div>
              <button
                onClick={handleSignOutSystem}
                className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                title="Đăng xuất khỏi hệ thống"
              >
                <X size={15} />
              </button>
            </div>

            {/* 2. Separate Google Drive Document Storage Indicator */}
            {isDriveConnected ? (
              <div className="flex items-center gap-2.5 bg-green-50 border border-green-200 pl-3 pr-2 py-1.5 rounded-2xl">
                <Cloud className="text-green-600 animate-pulse" size={17} />
                <div className="text-left hidden md:block">
                  <div className="text-xs font-bold text-green-800 leading-tight">
                    Đã lưu Drive
                  </div>
                  <div className="text-[10px] text-green-600 font-mono line-clamp-1 max-w-[130px] leading-none mt-0.5">
                    {driveUserEmail}
                  </div>
                </div>
                <button
                  onClick={handleDisconnectDrive}
                  disabled={authLoading}
                  className="p-1.5 text-green-400 hover:text-red-500 rounded-lg hover:bg-green-100 transition-colors cursor-pointer"
                  title="Ngắt kết nối lưu trữ"
                >
                  <X size={15} />
                </button>
              </div>
            ) : (
              <button
                onClick={handleConnectDrive}
                disabled={authLoading}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-sm font-semibold rounded-2xl transition-all shadow-xs cursor-pointer disabled:opacity-50"
              >
                {authLoading ? (
                  <Loader2 className="animate-spin text-slate-400" size={15} />
                ) : (
                  <Cloud className="text-slate-400" size={15} />
                )}
                <span>Liên kết Google Drive</span>
              </button>
            )}

            <button 
              onClick={handleExportExcel}
              className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <Download size={16} />
              Xuất Excel
            </button>
            <button 
              onClick={() => {
                setEditingDevice(null);
                setIsModalOpen(true);
              }}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all font-sans"
            >
              + Thêm thiết bị
            </button>
          </div>
        </header>

        {/* Content Body */}
        <div className="flex-1 p-8 overflow-hidden flex flex-col gap-6">
          {activeTab === 'inventory' ? (
            <>
              {/* Statistics Grid */}
              <div className="grid grid-cols-4 gap-6 shrink-0">
                <StatCardV2 label="Tổng thiết bị" value={stats.total} />
                <StatCardV2 
                  label="Quá hạn kiểm định" 
                  value={stats.expired} 
                  highlightColor="text-red-600" 
                  ringColor="ring-red-100" 
                />
                <StatCardV2 
                  label="Sắp cận hạn" 
                  value={stats.warning} 
                  highlightColor="text-orange-600" 
                  ringColor="ring-orange-100" 
                />
                <StatCardV2 
                  label="Vận hành tốt" 
                  value={stats.ok} 
                  highlightColor="text-green-600" 
                />
              </div>

              {!isDriveConnected && (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm shrink-0">
                  <div className="flex items-start sm:items-center gap-3">
                    <div className="p-2.5 bg-blue-100 text-blue-600 rounded-xl shrink-0">
                      <Cloud size={20} className="animate-pulse" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-800 leading-snug">Cơ sở dữ liệu đám mây ngoại tuyến</h4>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                        Bạn đang xem dữ liệu ở chế độ lưu trữ mô phỏng ngoại tuyến. Hãy <strong>Đăng nhập tài khoản Google</strong> để kích hoạt đồng bộ dữ liệu với Firestore Cloud bền lâu, lưu minh chứng Drive, và tự động hóa hồ sơ.
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={handleConnectDrive}
                    disabled={authLoading}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-sm shadow-blue-100 shrink-0 inline-flex items-center gap-2 font-sans"
                  >
                    {authLoading ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                        <path
                          fill="currentColor"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="currentColor"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="currentColor"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                        />
                        <path
                          fill="currentColor"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                        />
                      </svg>
                    )}
                    <span>Đăng nhập ngay</span>
                  </button>
                </div>
              )}

              {/* Filtering & Table Container */}
              <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col min-h-0 overflow-hidden">
                {/* Table Header / Filter Bar */}
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/30">
                  <div className="flex items-center gap-2">
                    <Filter size={14} className="text-slate-400 mr-2" />
                    <FilterButton active={filterStatus === 'all'} onClick={() => setFilterStatus('all')} label="Tất cả" />
                    <FilterButton active={filterStatus === 'expired'} onClick={() => setFilterStatus('expired')} label="Quá hạn" />
                    <FilterButton active={filterStatus === 'warning'} onClick={() => setFilterStatus('warning')} label="Sắp hết hạn" />
                    <FilterButton active={filterStatus === 'ok'} onClick={() => setFilterStatus('ok')} label="Hợp lệ" />
                  </div>
                  <div className="text-xs text-slate-400 font-medium font-mono uppercase">
                    {filteredDevices.length} Thiết bị
                  </div>
                </div>

                {/* Scrollable Table */}
                <div className="overflow-auto flex-1 custom-scrollbar">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
                      <tr>
                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Thiết bị / Model</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Serial / Xuất xứ</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Giấy phép (GCP)</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Kiểm định (GKĐ)</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Bảo trì kế tiếp</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <AnimatePresence mode='popLayout'>
                        {filteredDevices.map((device) => (
                          <DeviceRowV2 
                            key={device.id} 
                            device={device} 
                            onConfirm={handleConfirmDone}
                            onDelete={handleDeleteDevice}
                            onEdit={(d) => {
                              setEditingDevice(d);
                              setIsModalOpen(true);
                            }}
                            onShowHistory={(d) => setSelectedHistoryDevice(d)}
                            onShowNote={(d) => setSelectedNoteDevice(d)}
                            warningDaysGCP={warningDaysGCP}
                            warningDaysGKD={warningDaysGKD}
                          />
                        ))}
                      </AnimatePresence>
                    </tbody>
                  </table>

                  {filteredDevices.length === 0 && (
                    <div className="flex flex-col items-center justify-center p-20 text-slate-400">
                      <Search size={48} className="mb-4 opacity-10" />
                      <p className="text-sm">Không có dữ liệu phù hợp với bộ lọc</p>
                    </div>
                  )}
                </div>

                {/* Pagination / Footer */}
                <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 bg-slate-50/30">
                  <div>Hiển thị {filteredDevices.length} trên {stats.total} thiết bị</div>
                  <div className="flex gap-2">
                    <button className="w-8 h-8 flex items-center justify-center border border-slate-200 rounded-lg bg-white shadow-sm hover:bg-slate-50 disabled:opacity-50">
                      <ChevronLeft size={14} />
                    </button>
                    <button className="w-8 h-8 flex items-center justify-center bg-blue-600 text-white rounded-lg shadow-sm font-medium">1</button>
                    <button className="w-8 h-8 flex items-center justify-center border border-slate-200 rounded-lg bg-white shadow-sm hover:bg-slate-50">
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : activeTab === 'maintenance' ? (
            <MaintenanceSchedule devices={devices} warningDaysBD={warningDaysBD} />
          ) : activeTab === 'settings' ? (
            <SettingsPanel 
              isDriveConnected={isDriveConnected}
              driveUserEmail={driveUserEmail}
              authLoading={authLoading}
              setIsDriveConnected={setIsDriveConnected}
              setDriveUserEmail={setDriveUserEmail}
              setAuthLoading={setAuthLoading}
              setDriveFolderIds={setDriveFolderIds}
              onUnauthorizedDomainError={(domain) => {
                setFailedDomain(domain);
                setShowAuthDomainError(true);
              }}
              askConfirmation={askConfirmation}
              warningDaysGCP={warningDaysGCP}
              setWarningDaysGCP={setWarningDaysGCP}
              warningDaysGKD={warningDaysGKD}
              setWarningDaysGKD={setWarningDaysGKD}
              warningDaysBD={warningDaysBD}
              setWarningDaysBD={setWarningDaysBD}
            />
          ) : (
            <LegalDocumentsPanel 
              devices={devices} 
              isDriveConnected={isDriveConnected}
              driveUserEmail={driveUserEmail}
              driveFiles={driveFiles}
              setDriveFiles={setDriveFiles}
              driveFolderIds={driveFolderIds}
              setDriveFolderIds={setDriveFolderIds}
              setActiveTab={setActiveTab}
              askConfirmation={askConfirmation}
              onActionLog={async (deviceId, text, type) => {
                const newAutoLog: ActivityLog = {
                  id: `doc-log-${Math.random().toString(36).substr(2, 9)}`,
                  deviceId,
                  date: new Date().toISOString().split('T')[0],
                  user: 'Người dùng',
                  type: type,
                  categoryLabel: 'Tài liệu',
                  description: text,
                  notes: type === 'UPLOAD' ? 'Nhật ký hệ thống: Tải hồ sơ lên thành công.' : 'Nhật ký hệ thống: Đã xóa hồ sơ tài liệu khỏi thiết bị.'
                };
                setActivityLogs(prev => [newAutoLog, ...prev]);
                if (auth.currentUser) {
                  await saveActivityLogToFirestore(auth.currentUser.uid, newAutoLog);
                }
              }}
            />
          )}
        </div>


      </main>

      {/* Device Form Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setIsModalOpen(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div>
                  <h2 className="text-xl font-bold text-slate-800">
                    {editingDevice ? 'Chỉnh sửa thiết bị' : 'Thêm thiết bị mới'}
                  </h2>
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Thông tin hồ sơ thiết bị y tế</p>
                </div>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-auto p-8">
                <DeviceForm 
                  initialData={editingDevice || undefined} 
                  onSave={handleSaveDevice} 
                  onCancel={() => setIsModalOpen(false)} 
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* History Modal */}
      <AnimatePresence>
        {selectedHistoryDevice && (
          <HistoryModal 
            device={selectedHistoryDevice}
            onClose={() => setSelectedHistoryDevice(null)}
            logs={activityLogs.filter(log => log.deviceId === selectedHistoryDevice?.id)}
            onAddLog={async (newLog) => {
              setActivityLogs(prev => [newLog, ...prev]);
              if (auth.currentUser) {
                await saveActivityLogToFirestore(auth.currentUser.uid, newLog);
              }
            }}
            onDeleteLog={async (logId) => {
              askConfirmation(
                'Xóa bản ghi nhật ký',
                'Bạn có chắc chắn muốn xóa bản ghi lịch sử hoạt động này? Hành động này không thể hoàn tác.',
                async () => {
                  setActivityLogs(prev => prev.filter(l => l.id !== logId));
                  if (auth.currentUser) {
                    await deleteActivityLogFromFirestore(auth.currentUser.uid, logId);
                  }
                },
                'danger',
                'Xóa bản ghi'
              );
            }}
          />
        )}
      </AnimatePresence>

      {/* Note Modal */}
      <AnimatePresence>
        {selectedNoteDevice && (
          <NoteModal 
            device={selectedNoteDevice}
            onClose={() => setSelectedNoteDevice(null)}
            onSave={handleSaveNote}
          />
        )}
      </AnimatePresence>

      {/* Firebase Unauthorized Domain Modal Helper */}
      <UnauthorizedDomainModal 
        isOpen={showAuthDomainError}
        onClose={() => setShowAuthDomainError(false)}
        domain={failedDomain}
      />

      {/* Custom Confirmation Modal Portal */}
      <CustomConfirmationModal
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText || 'Xác nhận'}
        cancelText="Hủy bỏ"
        variant={confirmDialog.variant || 'info'}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};

interface UnauthorizedDomainModalProps {
  isOpen: boolean;
  onClose: () => void;
  domain: string;
}

const UnauthorizedDomainModal: React.FC<UnauthorizedDomainModalProps> = ({ isOpen, onClose, domain }) => {
  const [copied, setCopied] = useState(false);
  const targetDomain = domain || (typeof window !== "undefined" ? window.location.hostname : "");
  
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(targetDomain);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-55 z-[9999] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/45 backdrop-blur-xs"
          />
          
          {/* Modal Content */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: "spring", duration: 0.4 }}
            className="bg-white rounded-3xl border border-slate-150 shadow-2xl overflow-hidden max-w-lg w-full relative z-10 flex flex-col font-sans"
          >
            {/* Header Stripe Accent */}
            <div className="h-2 bg-gradient-to-r from-red-500 to-amber-500" />
            
            <div className="p-7">
              {/* Absolute Close */}
              <button 
                onClick={onClose}
                className="absolute right-5 top-5 p-1.5 rounded-xl hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-705 cursor-pointer"
              >
                <X size={18} />
              </button>

              <div className="flex items-start gap-4">
                <div className="p-3 bg-red-50 rounded-2xl text-red-600 inline-flex shrink-0">
                  <ShieldCheck className="stroke-[2.5]" size={24} />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-800 leading-snug">
                    Lỗi xác thực tên miền Firebase
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed mt-1">
                    Trình đăng nhập Google yêu cầu địa chỉ website đang chạy ứng dụng của bạn phải nằm trong danh sách các miền được ủy quyền an toàn trong Firebase Console.
                  </p>
                </div>
              </div>

              {/* Step checklist */}
              <div className="mt-6 space-y-5 text-xs">
                <div className="p-4 bg-slate-50 border border-slate-150 rounded-2xl space-y-2">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tên miền cần Thêm:</div>
                  <div className="flex gap-2 items-center">
                    <input 
                      type="text" 
                      readOnly 
                      value={targetDomain}
                      className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-[11px] font-mono font-semibold text-slate-700 outline-none select-all"
                    />
                    <button 
                      onClick={handleCopy}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                        copied 
                          ? "bg-green-600 text-white" 
                          : "bg-slate-900 hover:bg-slate-800 text-white shadow-xs"
                      }`}
                    >
                      {copied ? "Đã Sao Chép!" : "Sao Chép"}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 italic">
                    *Mẹo: Bạn có thể thêm cả địa chỉ website <strong>Dev</strong> và <strong>Shared</strong> để sử dụng thuận tiện.
                  </p>
                </div>

                <div className="space-y-3">
                  <h4 className="font-bold text-slate-755 uppercase tracking-widest text-[10px]">Các bước thực hiện nhanh:</h4>
                  
                  <div className="grid gap-2.5 text-slate-600">
                    <div className="flex gap-2">
                      <span className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-500 text-[10px] shrink-0">1</span>
                      <p className="leading-relaxed mt-0.5">
                        Truy cập <a href="https://console.firebase.google.com/" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-0.5 font-semibold">Firebase Console <ExternalLink size={10} /></a> và chọn dự án có mã hiệu: <code className="bg-slate-100 text-red-650 px-1.5 py-0.5 rounded font-bold font-mono">quanlythietbiyte-babd8</code>
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <span className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-500 text-[10px] shrink-0">2</span>
                      <p className="leading-relaxed mt-0.5">
                        Nhấn chọn <strong>Authentication</strong> (ở menu thanh bên) &rarr; chọn tiếp tab <strong>Settings</strong> ở hàng trên đầu.
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <span className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-500 text-[10px] shrink-0">3</span>
                      <p className="leading-relaxed mt-0.5">
                        Tại menu dọc bên trái, bấm vào <strong>Authorized domains</strong> (Miền được ủy quyền).
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <span className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-500 text-[10px] shrink-0">4</span>
                      <p className="leading-relaxed mt-0.5">
                        Ấn nút <strong>Add domain</strong> (Thêm miền) &rarr; dán chính xác tên miền bạn vừa nhấn sao chép ở trên vào, sau đó ấn <strong>Add</strong> để lưu.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Close footer */}
              <div className="mt-8">
                <button
                  onClick={onClose}
                  className="w-full py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-2xl transition-all cursor-pointer text-center font-sans tracking-wide"
                >
                  Đóng Hướng Dẫn
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

const DeviceForm = ({ initialData, onSave, onCancel }: { initialData?: Device, onSave: (data: Partial<Device>) => void, onCancel: () => void }) => {
  const [formData, setFormData] = useState<Partial<Device>>(initialData || {
    name: '',
    model: '',
    serialNumber: '',
    manufacturer: '',
    origin: '',
    yearOfProduction: new Date().getFullYear(),
    expiryGCP: '',
    expiryGKD: '',
    lastMaintenance: '',
    maintenancePeriod: 6,
    notes: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  const inputClass = "w-full rounded-xl bg-slate-50 border border-slate-200 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all font-sans";
  const labelClass = "block text-xs font-bold text-slate-500 uppercase mb-1.5 ml-1";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-2 gap-6">
        <div className="col-span-2">
          <label className={labelClass}>Tên thiết bị</label>
          <input 
            required
            className={inputClass}
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Ví dụ: Máy X-quang DR"
          />
        </div>
        <div>
          <label className={labelClass}>Model</label>
          <input 
            required
            className={inputClass}
            value={formData.model}
            onChange={(e) => setFormData({ ...formData, model: e.target.value })}
            placeholder="Ví dụ: Titan 2000"
          />
        </div>
        <div>
          <label className={labelClass}>Số Serial</label>
          <input 
            required
            className={inputClass}
            value={formData.serialNumber}
            onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
            placeholder="SN-XXX-XXX"
          />
        </div>
        <div>
          <label className={labelClass}>Hãng sản xuất</label>
          <input 
            required
            className={inputClass}
            value={formData.manufacturer}
            onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
            placeholder="Ví dụ: Siemens"
          />
        </div>
        <div>
          <label className={labelClass}>Xuất xứ</label>
          <input 
            required
            className={inputClass}
            value={formData.origin}
            onChange={(e) => setFormData({ ...formData, origin: e.target.value })}
            placeholder="Ví dụ: Đức"
          />
        </div>
        <div>
          <label className={labelClass}>Năm sản xuất</label>
          <input 
            type="number"
            required
            className={inputClass}
            value={formData.yearOfProduction}
            onChange={(e) => setFormData({ ...formData, yearOfProduction: parseInt(e.target.value) })}
          />
        </div>
        <div>
          <label className={labelClass}>Chu kỳ bảo trì (Tháng)</label>
          <input 
            type="number"
            required
            className={inputClass}
            value={formData.maintenancePeriod}
            onChange={(e) => setFormData({ ...formData, maintenancePeriod: parseInt(e.target.value) })}
          />
        </div>
      </div>

      <div className="h-px bg-slate-100 my-2" />

      <div className="grid grid-cols-2 gap-6">
        <div className="col-span-2 text-xs font-bold text-blue-600 uppercase tracking-widest bg-blue-50 py-2 px-4 rounded-lg inline-block">
          Hồ sơ pháp lý & Kiểm định
        </div>
        <div>
          <label className={labelClass}>Hạn Giấy phép (GCP)</label>
          <input 
            type="date"
            className={inputClass}
            value={formData.expiryGCP}
            onChange={(e) => setFormData({ ...formData, expiryGCP: e.target.value })}
          />
        </div>
        <div>
          <label className={labelClass}>Hạn Kiểm định (GKĐ)</label>
          <input 
            type="date"
            className={inputClass}
            value={formData.expiryGKD}
            onChange={(e) => setFormData({ ...formData, expiryGKD: e.target.value })}
          />
        </div>
        <div className="col-span-2">
          <label className={labelClass}>Lần bảo trì cuối cùng</label>
          <input 
            type="date"
            className={inputClass}
            value={formData.lastMaintenance}
            onChange={(e) => setFormData({ ...formData, lastMaintenance: e.target.value })}
          />
        </div>
        <div className="col-span-2">
          <label className={labelClass}>Ghi chú của người quản lý</label>
          <textarea 
            rows={3}
            className={`${inputClass} resize-none`}
            value={formData.notes || ''}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Nhập ghi chú quan trọng, nhắc nhở vận hành, thông số kỹ thuật hoặc lưu ý riêng của quản lý..."
          />
        </div>
      </div>

      <div className="pt-6 flex gap-3 justify-end sticky bottom-0 bg-white border-t border-slate-50 mt-8">
        <button 
          type="button"
          onClick={onCancel}
          className="px-6 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-500 hover:bg-slate-50 transition-all font-sans"
        >
          Hủy bỏ
        </button>
        <button 
          type="submit"
          className="px-8 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all font-sans"
        >
          Lưu thông tin
        </button>
      </div>
    </form>
  );
};

const SidebarLink = ({ icon, label, onClick, active = false }: { icon: React.ReactNode, label: string, onClick?: () => void, active?: boolean }) => (
  <button 
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-all ${
      active ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
    }`}
  >
    {icon}
    <span className="text-sm">{label}</span>
  </button>
);

const StatCardV2 = ({ label, value, highlightColor = "text-slate-900", ringColor = "" }: { label: string, value: number, highlightColor?: string, ringColor?: string }) => (
  <div className={`bg-white p-5 rounded-2xl border border-slate-200 shadow-sm ${ringColor ? `ring-1 ${ringColor}` : ''}`}>
    <div className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">{label}</div>
    <div className={`text-2xl font-bold tracking-tight ${highlightColor}`}>
      {value < 10 ? `0${value}` : value}
    </div>
  </div>
);

const FilterButton = ({ active, onClick, label }: { active: boolean, onClick: () => void, label: string }) => (
  <button 
    onClick={onClick}
    className={`whitespace-nowrap px-3 py-1 text-xs font-bold uppercase tracking-tight transition-all rounded-md border ${
      active 
        ? 'bg-slate-900 text-white border-slate-900' 
        : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300 hover:text-slate-600'
    }`}
  >
    {label}
  </button>
);

interface DeviceRowProps {
  device: Device;
  onConfirm: (id: string, type: 'GCP' | 'GKD' | 'BD', manualDate?: string) => void;
  onDelete: (id: string) => void;
  onEdit: (device: Device) => void;
  onShowHistory: (device: Device) => void;
  onShowNote: (device: Device) => void;
  warningDaysGCP?: number;
  warningDaysGKD?: number;
  key?: any;
}

const DeviceRowV2 = ({ device, onConfirm, onDelete, onEdit, onShowHistory, onShowNote, warningDaysGCP = 30, warningDaysGKD = 30 }: DeviceRowProps) => {
  const [editingField, setEditingField] = useState<'GCP' | 'GKD' | null>(null);
  const [tempDate, setTempDate] = useState('');
  const [showMenu, setShowMenu] = useState(false);

  const gcpDays = getDaysRemaining(device.expiryGCP);
  const gkdDays = getDaysRemaining(device.expiryGKD);

  const getDayBadge = (days: number | null, warningDays: number) => {
    if (days === null) return null;
    if (days < 0) return (
      <div className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] bg-red-100 text-red-700 font-bold uppercase mt-1 tracking-tighter">
        Quá hạn {Math.abs(days)} ngày
      </div>
    );
    if (days <= warningDays) return (
      <div className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] bg-orange-100 text-orange-700 font-bold uppercase mt-1 tracking-tighter">
        Còn {days} ngày
      </div>
    );
    return (
      <div className="text-[10px] text-green-600 font-bold uppercase mt-1">
        Còn {days} ngày
      </div>
    );
  };

  const DateCell = ({ label, date, days, type, warningDays }: { label: string, date: string, days: number | null, type: 'GCP' | 'GKD', warningDays: number }) => (
    <div className="group/cell relative">
      <div className="flex items-center gap-2">
        <div className={`text-sm ${getStatusColor(days, warningDays)}`}>
          {formatDisplayDate(date)}
        </div>
        <button 
          onClick={() => {
            setEditingField(type);
            setTempDate(date || new Date().toISOString().split('T')[0]);
          }}
          className="opacity-0 group-hover/cell:opacity-100 transition-opacity p-1 hover:bg-slate-100 rounded text-slate-400"
          title="Sửa ngày"
        >
          <Pencil size={12} />
        </button>
      </div>
      {getDayBadge(days, warningDays)}
      
      {editingField === type && (
        <div className="absolute top-0 left-0 z-20 bg-white p-2 shadow-xl rounded-lg border border-slate-200 flex flex-col gap-2">
          <label className="text-[10px] font-bold text-slate-500 uppercase">Cập nhật ngày {type}</label>
          <input 
            type="date" 
            className="text-sm border border-slate-200 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-blue-500"
            value={tempDate}
            onChange={(e) => setTempDate(e.target.value)}
          />
          <div className="flex gap-1 justify-end">
            <button 
              onClick={() => setEditingField(null)}
              className="p-1 hover:bg-slate-100 rounded text-slate-400"
            >
              <X size={14} />
            </button>
            <button 
              onClick={() => {
                onConfirm(device.id, type, tempDate);
                setEditingField(null);
              }}
              className="px-2 py-1 bg-blue-600 text-white text-[10px] font-bold rounded"
            >
              Lưu
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <motion.tr 
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="hover:bg-slate-50/50 transition-colors border-b border-slate-100"
    >
      <td className="px-6 py-4">
        <div className="font-semibold text-sm flex items-center gap-2 flex-wrap">
          {device.name}
          {((device.notesList && device.notesList.length > 0) || device.notes) && (
            <span 
              onClick={(e) => {
                e.stopPropagation();
                onShowNote(device);
              }}
              className="inline-flex items-center gap-1.5 text-[10px] bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200/50 px-2.5 py-0.5 rounded-lg font-sans font-semibold cursor-pointer transition-all hover:scale-105 active:scale-95 shadow-sm"
              title={`Nhấn để xem ghi chú chi tiết (${device.notesList ? `${device.notesList.length} ghi chú` : 'Ghi chú chi tiết'})`}
            >
              <FileText size={11} className="text-amber-600" />
              <span>Ghi chú ({device.notesList ? device.notesList.length : 1})</span>
            </span>
          )}
        </div>
        <div className="text-[11px] text-slate-400 font-mono uppercase tracking-tighter">{device.model}</div>
      </td>
      <td className="px-6 py-4">
        <div className="text-sm font-medium text-slate-600">{device.serialNumber}</div>
        <div className="text-[11px] text-slate-400 italic">{device.origin} / {device.yearOfProduction}</div>
      </td>
      <td className="px-6 py-4">
        <DateCell type="GCP" date={device.expiryGCP} days={gcpDays} label="GCP" warningDays={warningDaysGCP} />
      </td>
      <td className="px-6 py-4">
        <DateCell type="GKD" date={device.expiryGKD} days={gkdDays} label="GKD" warningDays={warningDaysGKD} />
      </td>
      <td className="px-6 py-4">
        <div className="text-sm text-slate-500 italic">Định kỳ {device.maintenancePeriod} tháng</div>
        <div className="text-[10px] text-slate-400 font-medium uppercase mt-0.5">Lần cuối: {formatDisplayDate(device.lastMaintenance)}</div>
      </td>
      <td className="px-6 py-4 text-right">
        <div className="flex items-center justify-end gap-2 relative">
          <div className="relative">
            {(() => {
              const isWarningState = (gkdDays !== null && gkdDays >= 0 && gkdDays <= warningDaysGKD) ||
                                     (gcpDays !== null && gcpDays >= 0 && gcpDays <= warningDaysGCP);
              const isExpiredState = (gkdDays !== null && gkdDays < 0) || (gcpDays !== null && gcpDays < 0);

              let btnConfig = {
                label: 'BÌNH THƯỜNG',
                classes: 'bg-green-600 hover:bg-green-700 shadow-green-100'
              };

              if (isExpiredState) {
                btnConfig = { label: 'QUÁ HẠN', classes: 'bg-red-600 hover:bg-red-700 shadow-red-100' };
              } else if (isWarningState) {
                btnConfig = { label: 'CẬN HẠN', classes: 'bg-orange-500 hover:bg-orange-600 shadow-orange-100' };
              }

              return (
                <button 
                  onClick={() => onConfirm(device.id, 'GKD')}
                  className={`px-3 py-1.5 rounded-md text-[10px] font-bold text-white shadow-sm transition-all w-24 text-center ${btnConfig.classes}`}
                  title="Nhấn để xác nhận đã hoàn thành kiểm định/gia hạn"
                >
                  {btnConfig.label}
                </button>
              );
            })()}
          </div>
          
          <button 
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onShowNote(device);
            }}
            className={`p-1.5 rounded-md transition-all ${
              ((device.notesList && device.notesList.length > 0) || device.notes) 
                ? 'bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100' 
                : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
            }`}
            title="Xem / chỉnh sửa danh sách ghi chú trong Pop-up"
          >
            <FileText size={14} />
          </button>

          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className={`p-1.5 rounded-md transition-colors ${showMenu ? 'bg-slate-200 text-slate-800' : 'text-slate-300 hover:text-slate-600 hover:bg-slate-100'}`}
            >
              <MoreVertical size={14} />
            </button>

            <AnimatePresence>
              {showMenu && (
                <>
                  <div 
                    className="fixed inset-0 z-30" 
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenu(false);
                    }}
                  />
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95, y: -10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -10 }}
                    className="absolute right-0 bottom-full mb-2 w-48 bg-white rounded-xl shadow-2xl border border-slate-200 py-2 z-40"
                  >
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowMenu(false);
                        onShowNote(device);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <FileText size={16} className="text-amber-500" />
                      Ghi chú quản lý
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowMenu(false);
                        onEdit(device);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <Edit3 size={16} className="text-slate-400" />
                      Chỉnh sửa
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowMenu(false);
                        onShowHistory(device);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <History size={16} className="text-slate-400" />
                      Lịch sử hoạt động
                    </button>
                    <div className="h-px bg-slate-100 my-1 mx-2" />
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowMenu(false);
                        onDelete(device.id);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={16} />
                      Xóa thiết bị
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </td>
    </motion.tr>
  );
};

const MaintenanceSchedule = ({ devices, warningDaysBD = 30 }: { devices: Device[], warningDaysBD: number }) => {
  return (
    <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
      <div className="p-6 border-b border-slate-100 bg-slate-50/30">
        <h3 className="text-lg font-bold text-slate-800">Lịch trình bảo trì định kỳ</h3>
        <p className="text-xs text-slate-500">Danh sách các thiết bị cần bảo trì trong các tháng tới</p>
      </div>
      <div className="flex-1 overflow-auto p-6 space-y-4">
        {devices.map(device => {
          const lastDate = parseISO(device.lastMaintenance);
          const nextDate = addMonths(lastDate, device.maintenancePeriod);
          const daysToMaintenance = differenceInDays(nextDate, new Date());
          
          return (
            <div key={device.id} className="group flex items-center justify-between p-4 rounded-xl border border-slate-100 hover:border-blue-200 transition-all hover:shadow-md">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${daysToMaintenance < 7 ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-400'}`}>
                  <Clock size={24} />
                </div>
                <div>
                  <div className="font-bold text-slate-800">{device.name}</div>
                  <div className="text-xs text-slate-500 uppercase font-mono tracking-tighter">
                    Model: {device.model} | Chu kỳ: {device.maintenancePeriod} tháng
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className={`text-sm font-bold ${daysToMaintenance < 0 ? 'text-red-600' : daysToMaintenance < warningDaysBD ? 'text-orange-500' : 'text-slate-600'}`}>
                  Kiến nghị: {format(nextDate, 'dd/MM/yyyy')}
                </div>
                <div className="text-[10px] text-slate-400 italic">
                  {daysToMaintenance < 0 ? `Đã quá hạn ${Math.abs(daysToMaintenance)} ngày` : `Còn lại ${daysToMaintenance} ngày`}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface SettingsPanelProps {
  isDriveConnected: boolean;
  driveUserEmail: string | null;
  authLoading: boolean;
  setIsDriveConnected: (val: boolean) => void;
  setDriveUserEmail: (email: string | null) => void;
  setAuthLoading: (loading: boolean) => void;
  setDriveFolderIds: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onUnauthorizedDomainError?: (domain: string) => void;
  askConfirmation?: (title: string, message: string, onConfirm: () => void, variant?: 'danger' | 'warning' | 'info', confirmText?: string) => void;
  warningDaysGCP: number;
  setWarningDaysGCP: (val: number) => void;
  warningDaysGKD: number;
  setWarningDaysGKD: (val: number) => void;
  warningDaysBD: number;
  setWarningDaysBD: (val: number) => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  isDriveConnected,
  driveUserEmail,
  authLoading,
  setIsDriveConnected,
  setDriveUserEmail,
  setAuthLoading,
  setDriveFolderIds,
  onUnauthorizedDomainError,
  askConfirmation,
  warningDaysGCP,
  setWarningDaysGCP,
  warningDaysGKD,
  setWarningDaysGKD,
  warningDaysBD,
  setWarningDaysBD
}) => {
  const [email, setEmail] = useState('');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [channels, setChannels] = useState({
    expiryGCP: true,
    expiryGKD: true,
    maintenance: true
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      alert('Vui lòng nhập email');
      return;
    }
    setIsSubscribed(true);
    alert('Đã lưu cấu hình thông báo thành công!');
  };

  const toggleChannel = (key: keyof typeof channels) => {
    setChannels(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleConnectDrive = async () => {
    setAuthLoading(true);
    try {
      const res = await googleSignIn();
      if (res) {
        setIsDriveConnected(true);
        setDriveUserEmail(res.email || 'Người dùng Google');
        setDriveFolderIds({});
        alert('Kết nối Google Drive thành công!');
      }
    } catch (err: any) {
      console.error('Lỗi khi đăng nhập Google (Settings):', err);
      if (err.message && (err.message.includes("auth/unauthorized-domain") || err.code === "auth/unauthorized-domain" || String(err).includes("unauthorized-domain"))) {
        if (onUnauthorizedDomainError) {
          onUnauthorizedDomainError(window.location.hostname);
        }
      } else {
        alert(`Kết nối Google Drive thất bại: ${err.message || err}`);
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleDisconnectDrive = async () => {
    const disconnectAction = async () => {
      setAuthLoading(true);
      try {
        await logout();
        setIsDriveConnected(false);
        setDriveUserEmail(null);
      } catch (err: any) {
        alert(`Lỗi khi ngắt kết nối: ${err.message || err}`);
      } finally {
        setAuthLoading(false);
      }
    };

    if (askConfirmation) {
      askConfirmation(
        'Ngắt kết nối Google Drive',
        'Bạn có chắc chắn muốn ngắt kết nối tài khoản Google Drive? Hệ thống sẽ quay trở lại chế độ lưu trữ ngoại tuyến.',
        disconnectAction,
        'warning',
        'Ngắt kết nối'
      );
    } else {
      if (confirm('Bạn có chắc chắn muốn ngắt kết nối tài khoản Google Drive? Hệ thống sẽ quay trở lại chế độ lưu trữ ngoại tuyến.')) {
        await disconnectAction();
      }
    }
  };

  return (
    <div className="flex-1 overflow-y-auto w-full custom-scrollbar">
      <div className="max-w-3xl mx-auto w-full space-y-8 py-8 px-4">
        {/* SECTION 1: Notification settings */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-4 mb-2">
            <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-100">
              <Settings size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Cấu hình thông báo</h2>
              <p className="text-sm text-slate-500">Quản lý nhận diện cảnh báo tự động qua Email</p>
            </div>
          </div>
        </div>

        <div className="p-8 space-y-8">
          <section className="space-y-4">
            <h3 className="text-sm font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <FileText size={14} /> 
              Cài đặt người nhận
            </h3>
            <div className="flex gap-3">
              <input 
                type="email" 
                placeholder="Ví dụ: quanly@benhvien.com" 
                className="flex-1 rounded-2xl bg-slate-5s border border-slate-200 px-5 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all font-sans"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {isSubscribed ? (
                <button 
                  onClick={() => setIsSubscribed(false)}
                  className="px-6 py-3 rounded-2xl bg-slate-100 text-slate-600 text-sm font-bold hover:bg-slate-200 transition-all cursor-pointer"
                >
                  Xóa Email
                </button>
              ) : (
                <button 
                  onClick={handleSave}
                  className="px-8 py-3 rounded-2xl bg-blue-600 text-white text-sm font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all cursor-pointer"
                >
                  Kích hoạt
                </button>
              )}
            </div>
            <p className="text-xs text-slate-400 italic">Hệ thống sẽ gửi thông báo vào 8:00 sáng tại các mốc: Còn 30 ngày, 15 ngày và 7 ngày.</p>
          </section>

          <div className="h-px bg-slate-100" />

          <section className="space-y-4">
            <h3 className="text-sm font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <ShieldCheck size={14} /> 
              Sự kiện nhận thông báo
            </h3>
            <div className="grid gap-3">
              <NotificationToggle 
                label="Gia hạn Giấy phép (GCP)" 
                active={channels.expiryGCP} 
                onToggle={() => toggleChannel('expiryGCP')} 
                desc="Cảnh báo khi hồ sơ pháp lý sắp hết hạn"
              />
              <NotificationToggle 
                label="Kiểm định thiết bị (GKĐ)" 
                active={channels.expiryGKD} 
                onToggle={() => toggleChannel('expiryGKD')} 
                desc="Nhắc nhở lịch kiểm định an toàn bức xạ định kỳ"
              />
              <NotificationToggle 
                label="Lịch trình bảo trì (BD)" 
                active={channels.maintenance} 
                onToggle={() => toggleChannel('maintenance')} 
                desc="Thông báo dựa trên chu kỳ bảo trì tháng của từng thiết bị"
              />
            </div>
          </section>
        </div>

        <div className="p-6 bg-slate-900 border-t border-slate-800">
          <div className="flex items-center justify-between text-white">
            <div className="flex items-center gap-3">
              {isSubscribed ? (
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              ) : (
                <div className="w-2 h-2 rounded-full bg-slate-600" />
              )}
              <span className="text-xs font-bold uppercase tracking-widest">
                Thông báo Email: {isSubscribed ? `Đang hoạt động (${email})` : 'Chưa kích hoạt'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 1.5: Threshold warning lead times settings */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-4 mb-2">
            <div className="p-3 bg-orange-500 text-white rounded-2xl shadow-lg shadow-orange-100">
              <Clock size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-800 tracking-tight font-sans">Thời gian cảnh báo trước</h2>
              <p className="text-sm text-slate-500 font-sans">Cài đặt số ngày báo trước khi giấy phép, kiểm định hoặc bảo trì hết hạn</p>
            </div>
          </div>
        </div>

        <div className="p-8 space-y-6">
          <p className="text-xs text-slate-500 italic leading-relaxed font-sans">
            Hệ thống sẽ chuyển trạng thái các thiết bị sang màu cam (Cận hạn) và gửi cảnh báo trước khi đến ngày hết hạn thực tế theo cấu hình dưới đây.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block font-sans">
                Giấy phép (GCP)
              </label>
              <div className="relative flex items-center">
                <input 
                  type="number"
                  min="1"
                  max="365"
                  className="w-full rounded-2xl bg-slate-50 border border-slate-200 pl-4 pr-12 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono text-slate-700"
                  value={warningDaysGCP}
                  onChange={(e) => {
                    const parsed = parseInt(e.target.value);
                    if (!isNaN(parsed) && parsed > 0) setWarningDaysGCP(parsed);
                  }}
                />
                <span className="absolute right-4 text-xs font-bold text-slate-400">ngày</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-normal">
                Thời gian chuẩn bị gia hạn Giấy phép sử dụng.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block font-sans">
                Kiểm định (GKĐ)
              </label>
              <div className="relative flex items-center">
                <input 
                  type="number"
                  min="1"
                  max="365"
                  className="w-full rounded-2xl bg-slate-50 border border-slate-200 pl-4 pr-12 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono text-slate-700"
                  value={warningDaysGKD}
                  onChange={(e) => {
                    const parsed = parseInt(e.target.value);
                    if (!isNaN(parsed) && parsed > 0) setWarningDaysGKD(parsed);
                  }}
                />
                <span className="absolute right-4 text-xs font-bold text-slate-400">ngày</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-normal">
                Thời gian chuẩn bị kiểm định an toàn thiết bị.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block font-sans">
                Bảo dưỡng (BD)
              </label>
              <div className="relative flex items-center">
                <input 
                  type="number"
                  min="1"
                  max="365"
                  className="w-full rounded-2xl bg-slate-50 border border-slate-200 pl-4 pr-12 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono text-slate-700"
                  value={warningDaysBD}
                  onChange={(e) => {
                    const parsed = parseInt(e.target.value);
                    if (!isNaN(parsed) && parsed > 0) setWarningDaysBD(parsed);
                  }}
                />
                <span className="absolute right-4 text-xs font-bold text-slate-400">ngày</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-normal">
                Thời gian lên kế hoạch liên hệ kĩ sư bảo dưỡng định kì.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: Cloud Sync Settings (Google Drive) */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-4 mb-2">
            <div className="p-3 bg-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-100">
              <Cloud size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Đồng bộ Google Drive</h2>
              <p className="text-sm text-slate-500">Thiết lập nơi lưu trữ các tệp tin, biên bản kiểm định, tài liệu lắp đặt thực tế</p>
            </div>
          </div>
        </div>

        <div className="p-8 space-y-6">
          <div className="text-sm text-slate-600 leading-relaxed space-y-2">
            <p>
              Hệ thống hỗ trợ lưu hồ sơ trực tiếp vào tài khoản Google Drive cá nhân hoặc đơn vị. Các thiết bị sẽ có thư mục chứa biên bản riêng biệt để việc quy hoạch hồ sơ luôn khoa khọc, thuận tiện kiểm tra liên ngành.
            </p>
            <div className="bg-amber-50/60 border border-amber-200 rounded-2xl p-4.5 flex gap-3 text-amber-900 text-xs">
              <Lock className="text-amber-600 shrink-0 mt-0.5" size={16} />
              <div className="space-y-1">
                <strong>Cam kết quyền liên kết tối thiểu (drive.file)</strong>
                <p className="text-amber-800/90 leading-relaxed font-sans">
                  Ứng dụng chỉ được phép tạo các thư mục/tập tin tương ứng và tương tác độc quyền với các thư mục con và tệp tin do chính ứng dụng này tạo ra. Ứng dụng hoàn toàn không thể xem, sửa hoặc xóa bất kỳ tài liệu cá nhân nào khác thuộc sở hữu của bạn trên Google Drive.
                </p>
              </div>
            </div>
          </div>

          {!isDriveConnected ? (
            <div className="bg-slate-50 border border-slate-150 rounded-2xl p-6 flex flex-col items-center text-center gap-4">
              <Cloud className="text-slate-300 stroke-[1.5]" size={48} />
              <div>
                <h4 className="font-bold text-slate-800 text-sm">Chưa kích hoạt đồng bộ Google Drive</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">Tài liệu pháp lý hiện tại đang được lưu trong không gian ngoại tuyến mô phỏng trực tuyến của trình duyệt.</p>
              </div>
              <button
                onClick={handleConnectDrive}
                disabled={authLoading}
                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-2xl transition-all hover:scale-101 active:scale-99 shadow-md shadow-blue-100 cursor-pointer disabled:opacity-50"
              >
                {authLoading ? (
                  <>
                    <Loader2 className="animate-spin" size={16} />
                    <span>Đang xác thực liên kết...</span>
                  </>
                ) : (
                  <>
                    <Cloud size={16} />
                    <span>Kết nối tài khoản Google Drive</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-green-50/40 border border-green-150 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex gap-3items-start gap-3">
                  <div className="p-2.5 bg-green-100 text-green-700 rounded-xl mt-0.5">
                    <CheckCircle2 size={20} />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-850 text-sm">Đã đồng bộ Google Drive toàn diện</h4>
                    <p className="text-xs text-slate-510 font-bold mt-1.5 font-mono text-green-750">{driveUserEmail}</p>
                    <div className="text-[11px] text-slate-400 mt-2 space-y-1 font-sans">
                      <p>✨ Thư mục gốc tự tạo: <code className="bg-slate-100 text-amber-800 px-1 py-0.2 rounded font-bold">MedEquip_Pro_Documents</code></p>
                      <p>⚡️ Hồ sơ của từng thiết bị được phân nhóm tự động vào các thư mục tương ứng.</p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 shrink-0 justify-center">
                  <button
                    onClick={handleConnectDrive}
                    disabled={authLoading}
                    className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer shadow-2xs inline-flex items-center justify-center gap-1.5"
                  >
                    {authLoading ? <Loader2 className="animate-spin" size={12} /> : null}
                    Chọn tài khoản Google khác
                  </button>
                  <button
                    onClick={handleDisconnectDrive}
                    className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-650 text-xs font-bold rounded-xl transition-all border border-transparent hover:border-red-155 cursor-pointer inline-flex items-center justify-center"
                  >
                    Ngắt kết nối
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 bg-slate-900 border-t border-slate-800">
          <div className="flex items-center justify-between text-white font-sans">
            <span className="text-xs font-bold uppercase tracking-widest leading-relaxed">
              Trạng thái lưu trữ: {isDriveConnected ? "Cloud (Google Drive)" : "Chế độ an toàn ngoại tuyến (mô phỏng)"}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
  );
};

const NotificationToggle = ({ label, active, onToggle, desc }: { label: string, active: boolean, onToggle: () => void, desc: string }) => (
  <button 
    onClick={onToggle}
    className={`flex items-center justify-between p-4 rounded-2xl border transition-all text-left ${
      active ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-100 opacity-60'
    }`}
  >
    <div>
      <div className={`font-bold text-sm ${active ? 'text-blue-700' : 'text-slate-800'}`}>{label}</div>
      <div className="text-[11px] text-slate-500 mt-0.5">{desc}</div>
    </div>
    <div className={`w-10 h-6 rounded-full relative transition-colors ${active ? 'bg-blue-600' : 'bg-slate-200'}`}>
      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${active ? 'left-5' : 'left-1'}`} />
    </div>
  </button>
);

interface LegalDoc {
  id: string;
  name: string;
  type: string;
  uploadDate: string;
  size: string;
}

const LegalDocumentsPanel = ({ 
  devices, 
  isDriveConnected,
  driveUserEmail,
  driveFiles,
  setDriveFiles,
  driveFolderIds,
  setDriveFolderIds,
  setActiveTab,
  onActionLog,
  askConfirmation
}: { 
  devices: Device[]; 
  isDriveConnected: boolean;
  driveUserEmail: string | null;
  driveFiles: Record<string, DriveFile[]>;
  setDriveFiles: React.Dispatch<React.SetStateAction<Record<string, DriveFile[]>>>;
  driveFolderIds: Record<string, string>;
  setDriveFolderIds: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setActiveTab: (tab: 'inventory' | 'maintenance' | 'legal' | 'settings') => void;
  onActionLog?: (deviceId: string, text: string, type: 'UPLOAD' | 'DELETE') => void; 
  askConfirmation?: (title: string, message: string, onConfirm: () => void, variant?: 'danger' | 'warning' | 'info', confirmText?: string) => void;
}) => {
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  
  // Local simulated offline files
  const [mockDocs, setMockDocs] = useState<Record<string, LegalDoc[]>>(() => {
    const initialDocs: Record<string, LegalDoc[]> = {};
    devices.forEach(d => {
      initialDocs[d.id] = [
        { id: '1', name: 'Giay_Phep_Nhap_Khau.pdf', type: 'PDF', uploadDate: '2024-01-20', size: '1.2 MB' },
        { id: '2', name: 'Ket_Qua_Kiem_Dinh_2023.pdf', type: 'PDF', uploadDate: '2023-11-15', size: '0.8 MB' },
        { id: '3', name: 'Huong_Dan_Su_Dung.docx', type: 'DOCX', uploadDate: '2023-10-05', size: '2.5 MB' },
      ];
    });
    return initialDocs;
  });

  const [loadingDrive, setLoadingDrive] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const selectedDevice = devices.find(d => d.id === selectedDeviceId);

  // Fetch or retrieve folder files when device gets selected in Connected state
  React.useEffect(() => {
    if (selectedDeviceId && isDriveConnected && selectedDevice) {
      const loadDeviceFiles = async () => {
        setLoadingDrive(true);
        try {
          let folderId = driveFolderIds[selectedDeviceId];
          if (!folderId) {
            folderId = await getDeviceFolderId(selectedDevice.name);
            setDriveFolderIds(prev => ({ ...prev, [selectedDeviceId]: folderId }));
          }
          const filesFound = await listFolderFiles(folderId);
          setDriveFiles(prev => ({ ...prev, [selectedDeviceId]: filesFound }));
        } catch (err: any) {
          console.error(err);
        } finally {
          setLoadingDrive(false);
        }
      };
      loadDeviceFiles();
    }
  }, [selectedDeviceId, isDriveConnected]);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };



  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedDeviceId) return;

    if (isDriveConnected) {
      // Real Google Drive Upload
      setLoadingDrive(true);
      try {
        let folderId = driveFolderIds[selectedDeviceId];
        if (!folderId && selectedDevice) {
          folderId = await getDeviceFolderId(selectedDevice.name);
          setDriveFolderIds(prev => ({ ...prev, [selectedDeviceId]: folderId }));
        }
        
        const uploadedFile = await uploadFileToFolder(folderId, file);
        setDriveFiles(prev => ({
          ...prev,
          [selectedDeviceId]: [uploadedFile, ...(prev[selectedDeviceId] || [])]
        }));

        if (onActionLog) {
          onActionLog(selectedDeviceId, `Tải lên Google Drive tài liệu: "${file.name}"`, 'UPLOAD');
        }
      } catch (err: any) {
        alert(`Bảo tải tệp lên Google Drive thất bại: ${err.message || err}`);
      } finally {
        setLoadingDrive(false);
      }
    } else {
      // Local simulated upload
      const newDoc: LegalDoc = {
        id: Math.random().toString(36).substr(2, 9),
        name: file.name,
        type: file.name.split('.').pop()?.toUpperCase() || 'FILE',
        uploadDate: format(new Date(), 'yyyy-MM-dd'),
        size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`
      };
      setMockDocs(prev => ({
        ...prev,
        [selectedDeviceId]: [newDoc, ...prev[selectedDeviceId]]
      }));
      if (onActionLog) {
        onActionLog(selectedDeviceId, `Tải lên tài liệu ngoại tuyến: "${file.name}"`, 'UPLOAD');
      }
    }
    // Clear input
    e.target.value = '';
  };

  const handleDelete = async (docId: string) => {
    if (!selectedDeviceId) return;

    if (isDriveConnected) {
      const deleteAction = async () => {
        setLoadingDrive(true);
        try {
          const fileTarget = driveFiles[selectedDeviceId]?.find(d => d.id === docId);
          const fileName = fileTarget?.name || 'Tài liệu';

          await deleteDriveFile(docId);
          setDriveFiles(prev => ({
            ...prev,
            [selectedDeviceId]: (prev[selectedDeviceId] || []).filter(d => d.id !== docId)
          }));

          setConfirmDeleteId(null);
          if (onActionLog) {
            onActionLog(selectedDeviceId, `Xóa tài liệu trên Google Drive: "${fileName}"`, 'DELETE');
          }
        } catch (err: any) {
          alert(`Xóa tệp thất bại: ${err.message || err}`);
        } finally {
          setLoadingDrive(false);
        }
      };

      if (askConfirmation) {
        askConfirmation(
          'Xóa tài liệu',
          'CẢNH BÁO: Bạn có chắc chắn muốn xóa vĩnh viễn tài liệu này khỏi Google Drive của bạn? Hành động này không thể hoàn tác.',
          deleteAction,
          'danger',
          'Xóa vĩnh viễn'
        );
      } else {
        const confirmed = window.confirm(`CẢNH BÁO: Bạn có chắc chắn muốn xóa vĩnh viễn tài liệu này khỏi Google Drive của bạn? Hành động này không thể hoàn tác.`);
        if (confirmed) {
          await deleteAction();
        }
      }
    } else {
      // Local simulated delete
      const targetDocName = mockDocs[selectedDeviceId]?.find(d => d.id === docId)?.name || 'Tài liệu';
      setMockDocs(prev => ({
        ...prev,
        [selectedDeviceId]: prev[selectedDeviceId].filter(d => d.id !== docId)
      }));
      setConfirmDeleteId(null);
      if (onActionLog) {
        onActionLog(selectedDeviceId, `Xóa tài liệu mô phỏng: "${targetDocName}"`, 'DELETE');
      }
    }
  };

  const handleDownload = (doc: any) => {
    if (isDriveConnected) {
      if (doc.webContentLink) {
        window.open(doc.webContentLink, '_blank');
      } else if (doc.webViewLink) {
        window.open(doc.webViewLink, '_blank');
      } else {
        alert('Tệp này không có đường dẫn tải trực tiếp.');
      }
    } else {
      // Simulate download
      const dummyContent = `Mock content for ${doc.name}`;
      const blob = new Blob([dummyContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const activeFiles = isDriveConnected 
    ? (driveFiles[selectedDeviceId || ''] || [])
    : (mockDocs[selectedDeviceId || ''] || []);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      
      {/* Top Google Drive Connection Info Bar */}
      <div className="px-6 py-3.5 bg-slate-50 border-b border-slate-150 flex flex-col sm:flex-row gap-3 items-center justify-between text-xs font-sans">
        <div className="flex items-center gap-2">
          <Cloud className={isDriveConnected ? "text-green-500 animate-pulse" : "text-slate-400"} size={16} />
          {isDriveConnected ? (
            <span className="text-slate-700 font-medium leading-relaxed bg-green-50/50 border border-green-100 px-2.5 py-1 rounded-xl">
              Trạng thái: <strong className="text-green-600">Đã đồng bộ Google Drive</strong> ({driveUserEmail}). Thư mục: <code className="bg-slate-200 px-1.5 py-0.5 rounded font-bold font-mono text-amber-800 text-[10px]">MedEquip_Pro_Documents</code>
            </span>
          ) : (
            <span className="text-slate-500 font-medium bg-slate-100/55 border border-slate-200/40 px-2.5 py-1 rounded-xl">
              Cách thức lưu trữ: <strong className="text-amber-700 font-bold">Offline mô phỏng</strong>. Hãy kết nối Google Drive trong <span onClick={() => setActiveTab('settings')} className="text-blue-600 font-bold hover:underline cursor-pointer">Cài đặt hệ thống</span> bằng tài khoản thật để lưu trữ không giới hạn.
            </span>
          )}
        </div>
        <div>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-3.5 py-1.5 rounded-xl font-bold transition-all text-[11px] shadow-xs cursor-pointer ${
              isDriveConnected 
                ? "bg-white hover:bg-slate-50 text-slate-700 border border-slate-200" 
                : "bg-blue-600 hover:bg-blue-700 text-white animate-pulse"
            }`}
          >
            {isDriveConnected ? "Cấu hình tài khoản" : "Cấu hình Google Drive"}
          </button>
        </div>
      </div>

      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        className="hidden" 
      />
      
      {/* Search & Upload header section */}
      <div className="p-6 border-b border-slate-100 bg-slate-55/30 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {selectedDeviceId && (
            <button 
              onClick={() => setSelectedDeviceId(null)}
              className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-500 cursor-pointer"
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <div>
            <h3 className="text-lg font-bold text-slate-800">
              {selectedDevice ? `${isDriveConnected ? '📁 Google Drive: ' : '📁 Thư mục: '}${selectedDevice.name}` : 'Hồ sơ pháp lý thiết bị'}
            </h3>
            <p className="text-xs text-slate-500">
              {selectedDevice ? `Hồ sơ, tài liệu kiểm định & hướng dẫn ${selectedDevice.model}` : 'Quản lý tài liệu theo phân nhóm thiết bị'}
            </p>
          </div>
        </div>
        {selectedDeviceId && (
          <button 
            disabled={loadingDrive}
            onClick={handleUploadClick}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-2xl text-sm font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all font-sans cursor-pointer disabled:opacity-60"
          >
            {loadingDrive ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />}
            Tải tài liệu lên
          </button>
        )}
      </div>

      {/* Primary Files Viewer Area */}
      <div className="flex-1 overflow-auto p-6">
        {loadingDrive ? (
          <div className="flex flex-col items-center justify-center p-24 text-slate-400">
            <Loader2 size={40} className="text-blue-600 animate-spin mb-4" />
            <p className="text-sm font-medium">Đang tải tài liệu từ Google Drive của bạn...</p>
          </div>
        ) : !selectedDeviceId ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {devices.map(device => {
              const count = isDriveConnected 
                ? (driveFiles[device.id]?.length || 0)
                : (mockDocs[device.id]?.length || 0);

              return (
                <button 
                  key={device.id}
                  onClick={() => setSelectedDeviceId(device.id)}
                  className="group flex flex-col items-center p-6 rounded-3xl border border-slate-100 hover:border-blue-200 hover:bg-blue-50/30 transition-all cursor-pointer text-left w-full"
                >
                  <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mb-4 shadow-sm group-hover:scale-110 transition-transform">
                    <Folder size={32} fill="currentColor" fillOpacity={0.2} />
                  </div>
                  <div className="text-sm font-bold text-slate-800 text-center line-clamp-2 w-full">{device.name}</div>
                  <div className="text-[10px] text-slate-400 mt-1.5 uppercase font-semibold">{count} tài liệu</div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-4">
            {activeFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-20 text-slate-400">
                <FileText size={48} className="mb-4 opacity-15" />
                <p className="text-sm font-semibold text-slate-650">Chưa có tài liệu nào trong thư mục này</p>
                <p className="text-xs text-slate-400 mt-1 font-sans">Sử dụng nút "Tải tài liệu lên" ở trên để bổ sung tài liệu kỹ thuật.</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {activeFiles.map((doc: any) => {
                  const docType = isDriveConnected 
                    ? (doc.name.split('.').pop()?.toUpperCase() || 'FILE')
                    : doc.type;
                    
                  const docSize = isDriveConnected
                    ? formatBytes(doc.size)
                    : doc.size;
                    
                  const docUploadDate = isDriveConnected
                    ? doc.createdTime ? doc.createdTime.split('T')[0] : new Date().toISOString().split('T')[0]
                    : doc.uploadDate;

                  return (
                    <div key={doc.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-5 rounded-3xl border border-slate-100 hover:border-blue-100 hover:bg-blue-50/10 transition-all group gap-4">
                      <div className="flex items-center gap-4 flex-1">
                        <div className="p-4 bg-slate-100 text-slate-500 rounded-2xl group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                          <File size={24} />
                        </div>
                        <div className="min-w-0 flex-1">
                          {isDriveConnected && doc.webViewLink ? (
                            <a 
                              href={doc.webViewLink} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-base font-bold text-slate-800 hover:text-blue-650 flex items-center gap-1.5 group/link"
                              title="Xem/Xem trước trên Google Drive"
                            >
                              <span className="truncate">{doc.name}</span>
                              <ExternalLink size={14} className="opacity-0 group-hover/link:opacity-100 text-blue-500 transition-all" />
                            </a>
                          ) : (
                            <div className="text-base font-bold text-slate-800 break-words">{doc.name}</div>
                          )}
                          <div className="text-xs text-slate-500 font-medium mt-0.5">
                            {docType} • {docSize} • TẢI LÊN: {formatDisplayDate(docUploadDate)}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-end gap-3 self-end sm:self-center">
                        {isDriveConnected && doc.webViewLink && (
                          <a 
                            href={doc.webViewLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2.5 text-slate-400 hover:text-slate-700 bg-slate-50 border border-slate-100 rounded-xl transition-all hover:bg-slate-100"
                            title="Mở tài liệu trên Google Drive"
                          >
                            <ExternalLink size={18} />
                          </a>
                        )}
                        <button 
                          onClick={() => handleDownload(doc)}
                          className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-blue-100/50 rounded-xl border border-transparent hover:border-blue-100 transition-all"
                          title="Tải xuống trực tiếp"
                        >
                          <Download size={18} />
                        </button>
                        
                        <div className="flex items-center gap-2">
                          {confirmDeleteId === doc.id ? (
                            <motion.div 
                              initial={{ opacity: 0, x: 10 }}
                              animate={{ opacity: 1, x: 0 }}
                              className="flex items-center gap-1 bg-red-50 p-1 rounded-lg border border-red-150"
                            >
                              <button 
                                onClick={() => handleDelete(doc.id)}
                                className="px-3 py-1.5 text-[10px] font-bold bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors shadow-sm cursor-pointer"
                              >
                                XÁC NHẬN
                              </button>
                              <button 
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-3 py-1.5 text-[10px] font-bold bg-white text-slate-500 rounded-md hover:bg-slate-100 transition-colors border border-slate-200 cursor-pointer"
                              >
                                HỦY
                              </button>
                            </motion.div>
                          ) : (
                            <button 
                              className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all border border-transparent hover:border-red-100 cursor-pointer"
                              title="Xóa vĩnh viễn tài liệu"
                              onClick={() => setConfirmDeleteId(doc.id)}
                            >
                              <Trash2 size={18} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const HistoryModal = ({ 
  device, 
  onClose, 
  logs, 
  onAddLog, 
  onDeleteLog 
}: { 
  device: Device | null; 
  onClose: () => void; 
  logs: ActivityLog[]; 
  onAddLog: (log: ActivityLog) => void; 
  onDeleteLog: (id: string) => void;
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [categoryLabel, setCategoryLabel] = useState('Bảo dưỡng');
  const [executor, setExecutor] = useState('Nguyễn Mạnh Hà');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');

  if (!device) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;

    const newLog: ActivityLog = {
      id: `manual-log-${Math.random().toString(36).substr(2, 9)}`,
      deviceId: device.id,
      date,
      user: executor || 'Người dùng',
      type: 'MANUAL',
      categoryLabel,
      description,
      notes
    };

    onAddLog(newLog);
    
    // Reset form
    setDescription('');
    setNotes('');
    setShowAddForm(false);
  };

  const getCategoryColor = (label: string) => {
    switch (label) {
      case 'Kiểm định':
        return 'bg-green-50 text-green-700 border-green-200';
      case 'Giấy phép':
        return 'bg-orange-50 text-orange-700 border-orange-200';
      case 'Bảo trì':
      case 'Bảo dưỡng':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'Nhập máy':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'Thay đổi':
      case 'Cập nhật':
        return 'bg-slate-100 text-slate-700 border-slate-200';
      case 'Tài liệu':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 min-h-[110px]">
          <div>
            <span className="text-[10px] font-bold bg-blue-100 text-blue-800 px-2.5 py-1 rounded-full uppercase tracking-wider">Lịch sử hoạt động</span>
            <h2 className="text-xl font-bold text-slate-800 mt-2">
              {device.name}
            </h2>
            <p className="text-xs text-slate-500 font-medium font-sans">Model: {device.model} • S/N: {device.serialNumber}</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-8 flex flex-col gap-6">
          {/* Quick Stats overview of device health */}
          <div className="grid grid-cols-3 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400">Hạn Giấy Phép</div>
              <div className="text-xs font-semibold text-slate-800 mt-0.5">{device.expiryGCP ? formatDisplayDate(device.expiryGCP) : 'Chưa nhập'}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400">Hạn Kiểm Định</div>
              <div className="text-xs font-semibold text-slate-800 mt-0.5">{device.expiryGKD ? formatDisplayDate(device.expiryGKD) : 'Chưa nhập'}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400">Bảo Trì Định Kỳ</div>
              <div className="text-xs font-semibold text-slate-800 mt-0.5 font-sans">MỖI {device.maintenancePeriod} THÁNG</div>
            </div>
          </div>

          {/* Collapsible Manual Log form */}
          <div className="border border-slate-100 rounded-2xl overflow-hidden">
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="w-full flex items-center justify-between px-5 py-4 bg-slate-50/50 hover:bg-slate-50 transition-colors text-sm font-bold text-slate-700 font-sans"
            >
              <div className="flex items-center gap-2">
                <Plus size={16} className="text-blue-600" />
                <span>Thêm nhật ký hoạt động / sự kiện thủ công</span>
              </div>
              <span className="text-xs text-blue-600 font-semibold">{showAddForm ? 'Ẩn biểu mẫu' : 'Thêm mới'}</span>
            </button>

            {showAddForm && (
              <form onSubmit={handleSubmit} className="p-5 border-t border-slate-100 space-y-4 bg-slate-50/10">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Loại hoạt động</label>
                    <select
                      value={categoryLabel}
                      onChange={(e) => setCategoryLabel(e.target.value)}
                      className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                    >
                      <option value="Bảo dưỡng">Bảo dưỡng định kỳ</option>
                      <option value="Hiệu chuẩn">Hiệu chuẩn thiết bị</option>
                      <option value="Kiểm định">Kiểm định bức xạ / an toàn</option>
                      <option value="Sửa chữa">Sửa chữa sự cố</option>
                      <option value="Thay đổi">Thay đổi linh kiện</option>
                      <option value="Khác">Sự cố / Hoạt động khác</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Người thực hiện</label>
                    <input
                      type="text"
                      className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                      value={executor}
                      onChange={(e) => setExecutor(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Ngày thực hiện</label>
                    <input
                      type="date"
                      className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Nội dung tóm tắt</label>
                  <input
                    type="text"
                    required
                    placeholder="Ví dụ: Kiểm tra mức rò rỉ bức xạ quanh hệ thống bóng phát tia"
                    className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Ghi chú lưu ý kỹ thuật (nếu có)</label>
                  <textarea
                    rows={2}
                    placeholder="Ví dụ: Đo liều kế phóng xạ tại 5 vị trí phòng điều khiển ổn định, không vượt mức cho phép kỹ thuật..."
                    className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>

                <div className="flex gap-2 justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-50"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-md shadow-blue-100"
                  >
                    Lưu bản ghi
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Timeline and Logs details */}
          <div className="space-y-4">
            <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest">Dòng thời gian hoạt động</h3>
            
            {logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                <History size={32} className="mb-2 opacity-25 animate-pulse" />
                <p className="text-xs font-medium">Chưa có bản ghi hoạt động nào.</p>
              </div>
            ) : (
              <div className="relative pl-6 border-l-2 border-slate-100 space-y-6 ml-2 pr-2">
                {logs.map((log) => (
                  <div key={log.id} className="relative group/log">
                    {/* Pulsing bullet indicator */}
                    <span className="absolute -left-[33px] top-1.5 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-white ring-4 ring-white shadow border border-slate-200">
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                    </span>

                    <div className="bg-white border border-slate-100 hover:border-slate-200 p-4 rounded-2xl transition-all shadow-sm">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono font-bold text-slate-400">{formatDisplayDate(log.date)}</span>
                        <span className={`px-2 py-0.5 text-[9px] font-extrabold uppercase rounded-full border ${getCategoryColor(log.categoryLabel)}`}>
                          {log.categoryLabel}
                        </span>
                        <span className="text-xs text-slate-500 font-medium">Bởi: {log.user}</span>

                        <button
                          onClick={() => onDeleteLog(log.id)}
                          className="opacity-0 group-hover/log:opacity-100 p-1.5 hover:bg-red-50 hover:text-red-600 text-slate-400 rounded-lg transition-all ml-auto"
                          title="Xóa bản ghi"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      <div className="text-sm font-bold text-slate-800 mt-2 leading-relaxed">
                        {log.description}
                      </div>

                      {log.notes && (
                        <div className="mt-2 p-3 rounded-xl bg-slate-50/50 border border-slate-100 text-xs text-slate-500 italic font-sans leading-relaxed">
                          {log.notes}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="p-6 bg-slate-50/80 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-extrabold hover:bg-black transition-all"
          >
            Đóng bảng
          </button>
        </div>
      </motion.div>
    </div>
  );
};

const NoteModal = ({
  device,
  onClose,
  onSave
}: {
  device: Device | null;
  onClose: () => void;
  onSave: (id: string, notesList: DeviceNote[]) => void;
}) => {
  const [localNotesList, setLocalNotesList] = useState<DeviceNote[]>([]);
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null);
  const [noteContent, setNoteContent] = useState('');
  const [noteDate, setNoteDate] = useState(new Date().toISOString().split('T')[0]);
  const [localConfirm, setLocalConfirm] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant: 'danger' | 'warning' | 'info';
    confirmText?: string;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    variant: 'info'
  });

  React.useEffect(() => {
    if (device) {
      if (device.notesList && device.notesList.length > 0) {
        setLocalNotesList(device.notesList);
      } else if (device.notes) {
        setLocalNotesList([
          {
            id: 'legacy-note-1',
            date: device.noteDate || new Date().toISOString().split('T')[0],
            content: device.notes
          }
        ]);
      } else {
        setLocalNotesList([]);
      }
      
      // Reset form variables
      setCurrentNoteId(null);
      setNoteContent('');
      setNoteDate(new Date().toISOString().split('T')[0]);
    }
  }, [device]);

  if (!device) return null;

  const handleAddOrUpdateNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteContent.trim()) return;

    if (currentNoteId !== null) {
      // Correct existing note
      setLocalNotesList(prev => prev.map(n => n.id === currentNoteId ? { ...n, date: noteDate, content: noteContent.trim() } : n));
      setCurrentNoteId(null);
    } else {
      // Append a completely new chronological note
      const newNote: DeviceNote = {
        id: `note-${Math.random().toString(36).substring(2, 9)}`,
        date: noteDate,
        content: noteContent.trim()
      };
      setLocalNotesList(prev => [...prev, newNote]);
    }

    setNoteContent('');
    setNoteDate(new Date().toISOString().split('T')[0]);
  };

  const handleEditInit = (note: DeviceNote) => {
    setCurrentNoteId(note.id);
    setNoteContent(note.content);
    setNoteDate(note.date);
  };

  const handleCancelEdit = () => {
    setCurrentNoteId(null);
    setNoteContent('');
    setNoteDate(new Date().toISOString().split('T')[0]);
  };

  const handleDeleteNote = (id: string) => {
    setLocalConfirm({
      isOpen: true,
      title: 'Xóa ghi chú',
      message: 'Bạn có chắc chắn muốn xóa ghi chú này?',
      variant: 'danger',
      confirmText: 'Xóa ghi chú',
      onConfirm: () => {
        setLocalNotesList(prev => prev.filter(n => n.id !== id));
        if (currentNoteId === id) {
          handleCancelEdit();
        }
        setLocalConfirm(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const handleClearAll = () => {
    setLocalConfirm({
      isOpen: true,
      title: 'Xóa toàn bộ ghi chú',
      message: 'CẢNH BÁO: Bạn có chắc chắn muốn xóa toàn bộ tất cả bản ghi chú của thiết bị này? Hành động này không thể hoàn tác.',
      variant: 'danger',
      confirmText: 'Xóa tất cả',
      onConfirm: () => {
        setLocalNotesList([]);
        handleCancelEdit();
        setLocalConfirm(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const handleSaveAll = () => {
    onSave(device.id, localNotesList);
    onClose();
  };

  // Sort notes from newest to oldest for easy access on top
  const sortedNotes = [...localNotesList].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const wordCount = noteContent.trim() ? noteContent.trim().split(/\s+/).length : 0;
  const charCount = noteContent.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="relative w-full max-w-5xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-100"
      >
        {/* Modal Header */}
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-amber-50/30">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-150/40 text-amber-800 rounded-2xl border border-amber-200/20">
              <FileText size={24} className="text-amber-600 animate-pulse" />
            </div>
            <div>
              <span className="text-[10px] font-extrabold bg-amber-500/10 text-amber-800 border border-amber-500/25 px-2.5 py-1 rounded-full uppercase tracking-wider font-sans">
                Quản lý nâng cao • Nhiều ghi chú lịch trình
              </span>
              <h2 className="text-xl font-black text-slate-800 mt-1.5 leading-tight">
                {device.name}
              </h2>
              <p className="text-xs text-slate-500 font-medium font-sans mt-0.5">
                Model: <span className="font-mono text-slate-700">{device.model}</span> • S/N: <span className="font-mono text-slate-700">{device.serialNumber}</span> • Chu kỳ bảo trì: <span className="font-bold text-amber-700">{device.maintenancePeriod} tháng</span>
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="p-2.5 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-700"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Panel (Dual Grid) */}
        <div className="flex-1 overflow-auto p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Form Section */}
          <div className="lg:col-span-5 space-y-5 flex flex-col">
            <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-150">
              <h4 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1.5 mb-1">
                <AlertCircle size={14} className="text-amber-500" />
                Lưu ý quan trọng
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed font-sans">
                Ghi chú hỗ trợ lưu lại các hướng dẫn vận hành dự phòng, lỗi vặt hoặc số kỹ sư hãng. Hệ thống cho phép ghi nhận nhiều ghi chú với ngày cụ thể khác nhau.
              </p>
            </div>

            <form onSubmit={handleAddOrUpdateNote} className="flex-1 flex flex-col bg-slate-50/30 border border-slate-200/50 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-xs font-bold text-slate-755 uppercase tracking-wider flex items-center gap-2">
                  {currentNoteId !== null ? (
                    <>
                      <Pencil size={13} className="text-blue-600 animate-bounce" />
                      <span className="text-blue-700">Hiệu chỉnh ghi chú</span>
                    </>
                  ) : (
                    <>
                      <Plus size={14} className="text-amber-600" />
                      <span className="text-slate-700">Tạo ghi chú mới</span>
                    </>
                  )}
                </h3>
                {currentNoteId !== null && (
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="text-[10px] font-extrabold text-slate-500 bg-slate-100 px-2 py-1 rounded hover:bg-slate-200 transition-colors"
                  >
                    Hủy sửa
                  </button>
                )}
              </div>

              {/* Note Date Input */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-extrabold text-slate-600 uppercase tracking-wider">
                  Ngày ghi nhận
                </label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    required
                    className="flex-1 text-xs rounded-xl border border-slate-200 px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white font-sans text-slate-700 font-medium transition-all"
                    value={noteDate}
                    onChange={(e) => setNoteDate(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setNoteDate(new Date().toISOString().split('T')[0])}
                    className="px-3 bg-white hover:bg-amber-50 text-amber-700 hover:text-amber-800 border border-slate-200 rounded-xl transition-all shadow-sm text-xs font-bold flex items-center gap-1 hover:border-amber-200/50"
                    title="Chọn ngày làm việc hôm nay"
                  >
                    <Calendar size={14} className="text-amber-600" />
                    <span>Hôm nay</span>
                  </button>
                </div>
              </div>

              {/* Note Content Input */}
              <div className="space-y-1.5 flex-1 flex flex-col">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-extrabold text-slate-600 uppercase tracking-wider">
                    Nội dung chi tiết
                  </label>
                  <span className="text-[10px] font-mono font-bold text-slate-400 bg-white border border-slate-100 px-1.5 py-0.5 rounded">
                    {wordCount} từ • {charCount} ký tự
                  </span>
                </div>
                <textarea
                  required
                  className="w-full flex-1 text-xs rounded-xl border border-slate-200 p-4 outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white resize-none font-sans text-slate-705 leading-relaxed min-h-[140px] shadow-sm transition-all"
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="Nhập ghi chú kỹ thuật, nhắc nhở định kỳ hoặc dấu hiệu bất thường..."
                />
              </div>

              {/* Submit button */}
              <button
                type="submit"
                disabled={!noteContent.trim()}
                className={`w-full py-3 rounded-xl text-white text-xs font-extrabold transition-all shadow-md flex items-center justify-center gap-2 ${
                  !noteContent.trim() 
                    ? 'bg-slate-350 cursor-not-allowed shadow-none' 
                    : currentNoteId !== null
                      ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-100'
                      : 'bg-amber-600 hover:bg-amber-700 shadow-amber-100'
                }`}
              >
                {currentNoteId !== null ? (
                  <>
                    <CheckCircle2 size={14} />
                    <span>Cập nhật bản ghi</span>
                  </>
                ) : (
                  <>
                    <Plus size={14} />
                    <span>Lưu vào danh sách</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Right Column: History List */}
          <div className="lg:col-span-7 flex flex-col space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Lịch sử ghi chú tích lũy
                </h3>
                <span className="bg-amber-100 text-amber-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-amber-200/40">
                  {localNotesList.length} ghi chú
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-medium">Sắp xếp: Mới nhất lên đầu</span>
            </div>

            {localNotesList.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-16 text-slate-400 border-2 border-dashed border-slate-200/70 rounded-3xl bg-slate-50/40">
                <div className="p-4 bg-slate-200/50 text-slate-400 rounded-full mb-3">
                  <FileText size={32} className="opacity-40 animate-pulse" />
                </div>
                <h4 className="text-sm font-bold text-slate-700">Thiết bị chưa có ghi chú nào</h4>
                <p className="text-xs text-slate-400 text-center max-w-xs mt-1 leading-relaxed font-sans pr-4 pl-4">
                  Không gian lưu trữ đang trống. Hãy tạo ghi chú đầu tiên ở bảng nhập dữ liệu bên trái!
                </p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto max-h-[420px] pr-2 space-y-4 scrollbar-thin">
                {sortedNotes.map((note) => (
                  <div 
                    key={note.id} 
                    className={`p-4 rounded-2xl border transition-all relative group/note ${
                      currentNoteId === note.id 
                        ? 'bg-blue-50/40 border-blue-200 shadow-sm shadow-blue-50' 
                        : 'bg-white border-slate-100 hover:border-slate-200/80 hover:shadow-xs hover:bg-slate-50/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold text-amber-800 bg-amber-500/10 border border-amber-200/40 shadow-xs">
                        <Calendar size={11} className="text-amber-600" />
                        <span>{formatDisplayDate(note.date)}</span>
                      </span>

                      {/* Controls Area */}
                      <div className="flex items-center gap-1 opacity-100 lg:opacity-0 lg:group-hover/note:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => handleEditInit(note)}
                          className="p-1 px-1.5 hover:bg-blue-50 hover:text-blue-650 text-slate-400 rounded-lg transition-all text-[10px] font-bold flex items-center gap-1 border border-transparent hover:border-blue-200/40"
                          title="Chỉnh sửa nội dung ghi chú này"
                        >
                          <Pencil size={11} />
                          <span>Sửa</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteNote(note.id)}
                          className="p-1 px-1.5 hover:bg-red-50 hover:text-red-600 text-slate-400 rounded-lg transition-all text-[10px] font-bold flex items-center gap-1 border border-transparent hover:border-red-200/40"
                          title="Xóa vĩnh viễn ghi chú"
                        >
                          <Trash2 size={11} />
                          <span>Xóa</span>
                        </button>
                      </div>
                    </div>

                    <div className="mt-2.5 text-xs text-slate-700 font-sans font-medium leading-relaxed whitespace-pre-wrap break-words pr-2">
                      {note.content}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Footer Area */}
        <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <button
            type="button"
            onClick={handleClearAll}
            className="px-4 py-2.5 text-xs font-bold text-red-600 hover:bg-red-50 hover:text-red-700/90 border border-transparent hover:border-red-200/60 rounded-xl transition-all"
            disabled={localNotesList.length === 0}
          >
            Xóa toàn bộ ({localNotesList.length})
          </button>
          
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-extrabold hover:bg-slate-50 text-slate-600 transition-all"
            >
              Hủy bỏ
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              className="px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold transition-all shadow-md shadow-amber-100 flex items-center gap-1.5"
            >
              <CheckCircle2 size={14} />
              <span>Lưu thay đổi</span>
            </button>
          </div>
        </div>

        {/* Local Custom Confirmation Dialog inside NoteModal */}
        <CustomConfirmationModal
          isOpen={localConfirm.isOpen}
          title={localConfirm.title}
          message={localConfirm.message}
          confirmText={localConfirm.confirmText || 'Xác nhận'}
          cancelText="Hủy bỏ"
          variant={localConfirm.variant || 'info'}
          onConfirm={localConfirm.onConfirm}
          onCancel={() => setLocalConfirm(prev => ({ ...prev, isOpen: false }))}
        />
      </motion.div>
    </div>
  );
};

interface CustomConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant: 'danger' | 'warning' | 'info';
}

const CustomConfirmationModal: React.FC<CustomConfirmationModalProps> = ({
  isOpen,
  title,
  message,
  confirmText,
  cancelText,
  onConfirm,
  onCancel,
  variant
}) => {
  if (!isOpen) return null;

  const btnColors = {
    danger: 'bg-red-650 hover:bg-red-700 text-white shadow-red-100',
    warning: 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-100',
    info: 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-100'
  };

  const iconColors = {
    danger: 'bg-red-50 text-red-600 border border-red-100',
    warning: 'bg-amber-50 text-amber-600 border border-amber-100',
    info: 'bg-blue-50 text-blue-600 border border-blue-100'
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
        {/* Backdrop overlay */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onCancel}
          className="fixed inset-0 bg-slate-950/45 backdrop-blur-xs"
        />

        {/* Modal content body */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: "spring", duration: 0.35 }}
          className="bg-white rounded-3xl border border-slate-150 shadow-2xl overflow-hidden max-w-md w-full relative z-10 flex flex-col font-sans"
        >
          {/* Header Strip */}
          <div className={`h-1.5 ${variant === 'danger' ? 'bg-red-500' : variant === 'warning' ? 'bg-amber-500' : 'bg-blue-500'}`} />

          <div className="p-6">
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-2xl shrink-0 ${iconColors[variant]}`}>
                {variant === 'danger' ? <Trash2 size={22} /> : <AlertCircle size={22} />}
              </div>
              <div className="flex-1">
                <h3 className="text-base font-extrabold text-slate-800 leading-snug">
                  {title}
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed mt-2 text-slate-510 font-sans font-medium">
                  {message}
                </p>
              </div>
            </div>

            {/* Action buttons footer */}
            <div className="mt-8 flex gap-3 justify-end">
              <button
                type="button"
                onClick={onCancel}
                className="px-4.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                {cancelText}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className={`px-5 py-2.5 rounded-xl text-xs font-extrabold shadow-sm transition-colors cursor-pointer ${btnColors[variant]}`}
              >
                {confirmText}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default DeviceDashboard;
