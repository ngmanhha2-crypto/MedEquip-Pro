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
  Loader2,
  Send,
  RefreshCw,
  HelpCircle
} from 'lucide-react';
import { MOCK_DEVICES } from '../mockData';
import { Device, DeviceNote, ActivityLog } from '../types';
import { getDaysRemaining, getStatusColor, formatDisplayDate, checkReminders, calculateExpiryFromIssue } from '../utils/dateUtils';
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
  deleteActivityLogFromFirestore,
  fetchSettingsFromFirestore,
  saveSettingsToFirestore
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

  // Lifted Email Settings States
  const [recipientEmail, setRecipientEmail] = useState<string>(() => {
    return localStorage.getItem('medequip_saved_recipient_email') || '';
  });
  const [isSubscribed, setIsSubscribed] = useState<boolean>(() => {
    return localStorage.getItem('medequip_saved_is_subscribed') === 'true';
  });
  const [channels, setChannels] = useState<{ expiryGCP: boolean; expiryGKD: boolean; maintenance: boolean }>(() => {
    try {
      const saved = localStorage.getItem('medequip_saved_notification_channels');
      return saved ? JSON.parse(saved) : { expiryGCP: true, expiryGKD: true, maintenance: true };
    } catch {
      return { expiryGCP: true, expiryGKD: true, maintenance: true };
    }
  });

  React.useEffect(() => {
    localStorage.setItem('medequip_saved_recipient_email', recipientEmail);
  }, [recipientEmail]);

  React.useEffect(() => {
    localStorage.setItem('medequip_saved_is_subscribed', isSubscribed ? 'true' : 'false');
  }, [isSubscribed]);

  React.useEffect(() => {
    localStorage.setItem('medequip_saved_notification_channels', JSON.stringify(channels));
  }, [channels]);

  // Shared Google Drive Integration States
  const [isDriveConnected, setIsDriveConnected] = useState(() => {
    return localStorage.getItem('medequip_google_connected') === 'true';
  });
  const [driveUserEmail, setDriveUserEmail] = useState<string | null>(() => {
    return localStorage.getItem('medequip_google_email');
  });
  const [authLoading, setAuthLoading] = useState(false);

  // Telegram Integration States
  const [telegramBotToken, setTelegramBotToken] = useState<string>(() => {
    return localStorage.getItem('medequip_telegram_bot_token') || '';
  });
  const [telegramChatId, setTelegramChatId] = useState<string>(() => {
    return localStorage.getItem('medequip_telegram_chat_id') || '';
  });
  const [telegramEnabled, setTelegramEnabled] = useState<boolean>(() => {
    return localStorage.getItem('medequip_telegram_enabled') === 'true';
  });

  React.useEffect(() => {
    localStorage.setItem('medequip_telegram_bot_token', telegramBotToken);
  }, [telegramBotToken]);

  React.useEffect(() => {
    localStorage.setItem('medequip_telegram_chat_id', telegramChatId);
  }, [telegramChatId]);

  React.useEffect(() => {
    localStorage.setItem('medequip_telegram_enabled', telegramEnabled.toString());
  }, [telegramEnabled]);
  
  // Primary Email/Password Auth States
  const [appUser, setAppUser] = useState<FirebaseUser | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isRegisterScreen, setIsRegisterScreen] = useState(false);
  const [driveFiles, setDriveFiles] = useState<Record<string, DriveFile[]>>(() => {
    try {
      const saved = localStorage.getItem('medequip_saved_drive_files');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [driveFolderIds, setDriveFolderIds] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('medequip_saved_drive_folder_ids');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // States/data for automatic documents & folders scanning (lifted up to run once per page load and save locally)
  const [mockDocs, setMockDocs] = useState<Record<string, LegalDoc[]>>(() => {
    try {
      const saved = localStorage.getItem('medequip_saved_mock_docs');
      if (saved) return JSON.parse(saved);
    } catch {}
    
    const initialDocs: Record<string, LegalDoc[]> = {};
    MOCK_DEVICES.forEach(d => {
      initialDocs[d.id] = [
        { id: `${d.id}-gcp`, name: `GiayPhep_GCP_${d.serialNumber}.pdf`, type: 'PDF', uploadDate: '2024-01-10', size: '2.5 MB' },
        { id: `${d.id}-gkd`, name: `ChungNhan_GKD_${d.serialNumber}.pdf`, type: 'PDF', uploadDate: '2023-11-15', size: '1.8 MB' },
        { id: `${d.id}-contract`, name: `HopDong_MuaBan_${d.serialNumber}.pdf`, type: 'PDF', uploadDate: '2023-06-01', size: '4.2 MB' }
      ];
    });
    initialDocs['shared-legal-docs-folder'] = [
      { id: 'shared-1', name: 'NghiDinh_98_2021_ND-CP_QuanLyTrangThietBiYTe.pdf', type: 'PDF', uploadDate: '2021-11-08', size: '3.4 MB' },
      { id: 'shared-2', name: 'QuyetDinh_1522_QuyCongBoGiaThietBi.pdf', type: 'PDF', uploadDate: '2023-04-12', size: '1.1 MB' },
      { id: 'shared-3', name: 'ChungChi_KyThuatVien_NguyenVanA.pdf', type: 'PDF', uploadDate: '2024-02-15', size: '1.8 MB' },
      { id: 'shared-4', name: 'NghiDinh_07_2023_SuaDoiNghiDinh98.pdf', type: 'PDF', uploadDate: '2023-03-03', size: '2.0 MB' },
    ];
    return initialDocs;
  });

  const [scanState, setScanState] = useState<'idle' | 'scanning' | 'completed'>('idle');
  const [scanProgress, setScanProgress] = useState(0);
  const [currentScanningName, setCurrentScanningName] = useState('');
  const [scanResults, setScanResults] = useState<Array<{ id: string; folderName: string; fileCount: number; files: string[] }>>([]);

  const [isScanReportVisible, setIsScanReportVisible] = useState(false);

  const [driveError, setDriveError] = useState<string | null>(null);

  React.useEffect(() => {
    localStorage.setItem('medequip_saved_drive_files', JSON.stringify(driveFiles));
  }, [driveFiles]);

  React.useEffect(() => {
    localStorage.setItem('medequip_saved_drive_folder_ids', JSON.stringify(driveFolderIds));
  }, [driveFolderIds]);

  React.useEffect(() => {
    localStorage.setItem('medequip_saved_mock_docs', JSON.stringify(mockDocs));
  }, [mockDocs]);


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
      } else if (errorMsg.includes("auth/operation-not-allowed") || errorMsg.includes("operation-not-allowed")) {
        errorMsg = "Phương thức đăng nhập bằng Email/Mật khẩu (Email/Password) hiện đang bị tắt trong cấu hình Firebase của dự án.\n\nCách kích hoạt rất dễ dàng:\n\n1️⃣ Bước 1: Hãy truy cập vào trang quản trị Firebase Console bằng đường dẫn dưới đây:\n👉 https://console.firebase.google.com/\n\n2️⃣ Bước 2: Chọn dự án Firebase của bạn, sau đó vào phần \"Build\" -> \"Authentication\" -> chọn tab \"Sign-in method\".\n\n3️⃣ Bước 3: Tìm mục \"Email/Password\" dưới phần \"Sign-in providers\", nhấp vào nút Chỉnh sửa (Edit) và kích hoạt trạng thái \"Bật\" (Enable) rồi bấm Lưu (Save).\n\n4️⃣ Bước 4: Quay lại ứng dụng này, tải lại trang và tiến hành đăng ký/đăng nhập lại tài khoản!";
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
          // Fetch settings from Firestore
          const firestoreSettings = await fetchSettingsFromFirestore(currentUser.uid);
          if (active && firestoreSettings) {
            if (firestoreSettings.telegramBotToken !== undefined) setTelegramBotToken(firestoreSettings.telegramBotToken);
            if (firestoreSettings.telegramChatId !== undefined) setTelegramChatId(firestoreSettings.telegramChatId);
            if (firestoreSettings.telegramEnabled !== undefined) setTelegramEnabled(firestoreSettings.telegramEnabled);
            if (firestoreSettings.warningDaysGCP !== undefined) setWarningDaysGCP(firestoreSettings.warningDaysGCP);
            if (firestoreSettings.warningDaysGKD !== undefined) setWarningDaysGKD(firestoreSettings.warningDaysGKD);
            if (firestoreSettings.warningDaysBD !== undefined) setWarningDaysBD(firestoreSettings.warningDaysBD);
            if (firestoreSettings.recipientEmail !== undefined) setRecipientEmail(firestoreSettings.recipientEmail);
            if (firestoreSettings.isSubscribed !== undefined) setIsSubscribed(firestoreSettings.isSubscribed);
            if (firestoreSettings.channels !== undefined) setChannels(firestoreSettings.channels);
          }

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

  // Lifted Automated scan for files and document names in all folders (only once per connection status per page load)
  const triggerAutoScan = async () => {
    setScanState('scanning');
    setScanProgress(0);
    setCurrentScanningName('Đang khởi tạo danh sách thư mục thiết bị...');
    const results: Array<{ id: string; folderName: string; fileCount: number; files: string[] }> = [];

    const scanTargets = [
      { id: 'shared-legal-docs-folder', name: 'Văn bản pháp quy & Chứng chỉ nhân viên' },
      ...devices.map(d => ({ id: d.id, name: d.name }))
    ];

    let currentDriveConnected = isDriveConnected;

    for (let i = 0; i < scanTargets.length; i++) {
      const target = scanTargets[i];
      setCurrentScanningName(`Đang rà soát thư mục: ${target.name}...`);
      
      try {
        if (currentDriveConnected) {
          let folderId = driveFolderIds[target.id];
          if (!folderId) {
            folderId = await getDeviceFolderId(target.name);
            setDriveFolderIds(prev => ({ ...prev, [target.id]: folderId }));
          }
          const filesFound = await listFolderFiles(folderId);
          setDriveFiles(prev => ({ ...prev, [target.id]: filesFound }));
          results.push({
            id: target.id,
            folderName: target.name,
            fileCount: filesFound.length,
            files: filesFound.map(f => f.name)
          });
        } else {
          // Local simulated
          const localFiles = mockDocs[target.id] || [];
          results.push({
            id: target.id,
            folderName: target.name,
            fileCount: localFiles.length,
            files: localFiles.map(f => f.name)
          });
        }
      } catch (err: any) {
        console.warn(`Tính năng đồng bộ Google Drive tạm dừng cho thư mục ${target.name}:`, err.message || err);
        const errorMsg = err.message || String(err);
        const isUnauthorized = errorMsg.includes('401') || errorMsg.includes('Unauthorized') || errorMsg.includes('exp') || errorMsg.includes('token');
        const isApiDisabled = errorMsg.includes('chưa được kích hoạt') || errorMsg.includes('403') || errorMsg.includes('Forbidden') || errorMsg.includes('developers.google.com') || errorMsg.includes('disabled') || errorMsg.includes('has not been used');
        
        if ((isUnauthorized || isApiDisabled) && currentDriveConnected) {
          currentDriveConnected = false;
          setIsDriveConnected(false);
          setDriveUserEmail(null);
          logout().catch(console.error);
          if (isApiDisabled) {
            setDriveError(errorMsg);
          } else {
            setDriveError("Phiên kết nối Google Drive đã hết hạn hoặc bị thu hồi. Hệ thống đã tự động quay lại chế độ ngoại tuyến.");
          }
        }

        // Standard local fallback for safe offline simulation
        const localFiles = mockDocs[target.id] || [];
        results.push({
          id: target.id,
          folderName: target.name,
          fileCount: localFiles.length,
          files: localFiles.map(f => f.name)
        });
      }
      
      await new Promise(resolve => setTimeout(resolve, 150));
      setScanProgress(Math.round(((i + 1) / scanTargets.length) * 100));
    }
    
    setScanResults(results);
    setScanState('completed');
    setCurrentScanningName('Quét tự động hoàn tất thành công!');
  };

  const hasScannedRef = React.useRef<Record<string, boolean>>({});

  React.useEffect(() => {
    const currentStateKey = String(isDriveConnected);
    if (!hasScannedRef.current[currentStateKey]) {
      triggerAutoScan();
      hasScannedRef.current[currentStateKey] = true;
    }
  }, [isDriveConnected]);

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

  const handleConfirmDone = async (
    id: string, 
    type: 'GCP' | 'GKD' | 'BD', 
    manualDate?: string,
    issueDate?: string,
    period?: number
  ) => {
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
        if (type === 'GKD') {
          return { 
            ...d, 
            expiryGKD: targetDate,
            gkdIssueDate: issueDate || d.gkdIssueDate,
            gkdPeriod: period !== undefined ? period : d.gkdPeriod
          }; 
        }
        if (type === 'GCP') {
          return { 
            ...d, 
            expiryGCP: targetDate,
            gcpIssueDate: issueDate || d.gcpIssueDate,
            gcpPeriod: period !== undefined ? period : d.gcpPeriod
          };
        }
        if (type === 'BD') return { ...d, lastMaintenance: targetDate };
      }
      return d;
    }));

    const targetDevice = devices.find(d => d.id === id);
    if (targetDevice && auth.currentUser) {
      const targetDate = manualDate || new Date().toISOString().split('T')[0];
      const updatedD = { ...targetDevice };
      if (type === 'GKD') {
        updatedD.expiryGKD = targetDate;
        if (issueDate) updatedD.gkdIssueDate = issueDate;
        if (period !== undefined) updatedD.gkdPeriod = period;
      }
      if (type === 'GCP') {
        updatedD.expiryGCP = targetDate;
        if (issueDate) updatedD.gcpIssueDate = issueDate;
        if (period !== undefined) updatedD.gcpPeriod = period;
      }
      if (type === 'BD') updatedD.lastMaintenance = targetDate;
      await updateDeviceInFirestore(auth.currentUser.uid, updatedD);
    }

    // Auto-notify on Telegram
    if (targetDevice) {
      const extraNotes = `Hạn mới: ${formatDisplayDate(manualDate || new Date().toISOString().split('T')[0])}${issueDate ? ` | Ngày cấp/kiểm định: ${formatDisplayDate(issueDate)}` : ''}${period ? ` | Hiệu lực: ${period} tháng` : ''}`;
      sendTelegramDeviceActivity(logDescription, targetDevice, extraNotes);
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
    const targetEditDevice = editingDevice; // capture current state
    
    // Close the popup and reset editing status instantly
    setIsModalOpen(false);
    setEditingDevice(null);

    if (targetEditDevice) {
      const notesChanged = deviceData.notes !== targetEditDevice.notes;
      const updatedNoteDate = notesChanged ? (deviceData.notes ? todayStr : undefined) : targetEditDevice.noteDate;
      
      let updatedNotesList = targetEditDevice.notesList || [];
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

      const updatedDevice = { ...targetEditDevice, ...deviceData, noteDate: updatedNoteDate, notesList: updatedNotesList } as Device;
      setDevices(prev => prev.map(d => d.id === targetEditDevice.id ? updatedDevice : d));
      
      if (auth.currentUser) {
        updateDeviceInFirestore(auth.currentUser.uid, updatedDevice).catch(console.error);
      }
      
      // Auto-notify on Telegram
      sendTelegramDeviceActivity(`Chỉnh sửa hồ sơ thiết bị`, updatedDevice, `Chỉnh sửa bởi Người dùng`);

      const newAutoLog: ActivityLog = {
        id: `auto-${Math.random().toString(36).substr(2, 9)}`,
        deviceId: targetEditDevice.id,
        date: todayStr,
        user: 'Người dùng',
        type: 'EDIT',
        categoryLabel: 'Cập nhật',
        description: `Chỉnh sửa thông tin hồ sơ thiết bị "${deviceData.name || targetEditDevice.name}".`,
        notes: `Năm sản xuất: ${deviceData.yearOfProduction || targetEditDevice.yearOfProduction}, Chu kỳ bảo trì: ${deviceData.maintenancePeriod || targetEditDevice.maintenancePeriod} tháng.`
      };
      setActivityLogs(prev => [newAutoLog, ...prev]);
      if (auth.currentUser) {
        saveActivityLogToFirestore(auth.currentUser.uid, newAutoLog).catch(console.error);
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
        saveDeviceToFirestore(auth.currentUser.uid, newDevice).catch(console.error);
      }

      // Auto-notify on Telegram
      sendTelegramDeviceActivity(`Khởi tạo thiết bị mới`, newDevice, `Khởi tạo bởi Người dùng`);

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
        saveActivityLogToFirestore(auth.currentUser.uid, newAutoLog).catch(console.error);
      }
    }
  };

  const sendTelegramDeviceActivity = async (actionText: string, device: Device, extraNotes?: string) => {
    if (!telegramEnabled || !telegramBotToken || !telegramChatId) return;
    
    let msg = `🔔 <b>THÔNG BÁO HOẠT ĐỘNG THIẾT BỊ Y TẾ</b>\n\n`;
    msg += `<b>Hành động:</b> ${actionText}\n`;
    msg += `<b>Thiết bị:</b> <code>${device.name}</code>\n`;
    if (device.model) msg += `<b>Model:</b> ${device.model}\n`;
    if (device.serialNumber) msg += `<b>S/N:</b> <code>${device.serialNumber}</code>\n`;
    if (device.origin) msg += `<b>Xuất xứ:</b> ${device.origin}\n`;
    if (device.expiryGCP) msg += `<b>Hạn Giấy phép (GCP):</b> <code>${formatDisplayDate(device.expiryGCP)}</code>\n`;
    if (device.expiryGKD) msg += `<b>Hạn Kiểm định (GKĐ):</b> <code>${formatDisplayDate(device.expiryGKD)}</code>\n`;
    if (extraNotes) msg += `\n📝 <b>Ghi chú:</b> <i>${extraNotes}</i>`;
    msg += `\n\n🕒 Thời gian: ${new Date().toLocaleString('vi-VN')}`;

    try {
      const url = `https://api.telegram.org/bot${telegramBotToken}/sendMessage`;
      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: telegramChatId,
          text: msg,
          parse_mode: 'HTML',
        }),
      });
    } catch (e) {
      console.error('Lỗi gửi Telegram tự động:', e);
    }
  };

  const handleSendTelegramTestMessage = async (message: string, inputToken?: string, inputChatId?: string): Promise<boolean> => {
    const tokenToUse = inputToken || telegramBotToken;
    const chatIdToUse = inputChatId || telegramChatId;
    if (!tokenToUse || !chatIdToUse) {
      alert('Vui lòng cấu hình chi tiết Token và Chat ID trước.');
      return false;
    }
    try {
      const url = `https://api.telegram.org/bot${tokenToUse}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatIdToUse,
          text: message || '🔔 <b>Hệ thống quản lý đo lường thiết bị</b>\n\nTin nhắn kiểm tra kết nối Telegram đã được gửi thành công! 🎉',
          parse_mode: 'HTML',
        }),
      });
      if (response.ok) {
        return true;
      } else {
        const errData = await response.json().catch(() => ({}));
        let errMsg = errData.description || 'API Telegram phản hồi lỗi.';
        if (errMsg.includes('chat not found')) {
          errMsg = 'Không tìm thấy Chat ID này (chat not found).\n\nCách khắc phục:\n1. Nếu gửi vào NHÓM/KÊNH: Hãy chắc chắn bạn đã THÊM BOT của bạn vào nhóm đó.\n2. Nếu gửi CÁ NHÂN: Hãy tìm tên bot trên Telegram của bạn, bấm nút "BẮT ĐẦU" (START) để cho phép bot gửi tin nhắn.\n3. Hãy kiểm tra lại Chat ID (Ví dụ: Chat ID nhóm thường bắt đầu bằng dấu trừ -100...)';
        } else if (errMsg.includes('bot was blocked by the user')) {
          errMsg = 'Bot đã bị bạn chặn trên Telegram (bot was blocked by the user).\nVui lòng Unblock (bỏ chặn) Bot rồi nhấn thử lại!';
        } else if (errMsg.includes('is not a member of the supergroup')) {
          errMsg = 'Bot chưa phải là thành viên của Nhóm này.\nHãy thêm Bot của bạn vào nhóm Telegram trước rồi nhấn thử lại.';
        }
        throw new Error(errMsg);
      }
    } catch (error: any) {
      console.error('Lỗi khi gửi Telegram:', error);
      alert(`Gửi tin nhắn thử thất bại: ${error.message || error}`);
      return false;
    }
  };

  const handleSendTelegramSummaryReport = async () => {
    if (!telegramBotToken || !telegramChatId) {
      alert('Vui lòng cấu hình đầy đủ Bot Token và Chat ID trước.');
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const expiredList = devices.filter(d => {
      const gkd = getDaysRemaining(d.expiryGKD);
      const gcp = getDaysRemaining(d.expiryGCP);
      return (gkd !== null && gkd < 0) || (gcp !== null && gcp < 0);
    });

    const warningList = devices.filter(d => {
      const gkd = getDaysRemaining(d.expiryGKD);
      const gcp = getDaysRemaining(d.expiryGCP);
      return (gkd !== null && gkd >= 0 && gkd <= warningDaysGKD) || (gcp !== null && gcp >= 0 && gcp <= warningDaysGCP);
    });

    let msg = `📊 <b>BÁO CÁO TRẠNG THÁI THIẾT BỊ ĐỊNH KỲ</b>\n`;
    msg += `<i>Ngày lập: ${formatDisplayDate(todayStr)}</i>\n\n`;
    msg += `📈 <b>Thống kê chung:</b>\n`;
    msg += `• Tổng số thiết bị: <b>${devices.length}</b> máy\n`;
    msg += `• Đã quá hạn (⚠️ Nguy cấp): <code>${expiredList.length}</code> máy\n`;
    msg += `• Sắp hết hạn (🔴 Cận hạn): <code>${warningList.length}</code> máy\n`;
    msg += `• Trạng thái an toàn: <b>${devices.length - expiredList.length - warningList.length}</b> máy\n\n`;

    if (expiredList.length > 0) {
      msg += `⚠️ <b>DANH SÁCH THIẾT BỊ QUÁ HẠN:</b>\n`;
      expiredList.slice(0, 8).forEach((d, i) => {
        const gkdDays = getDaysRemaining(d.expiryGKD);
        const gcpDays = getDaysRemaining(d.expiryGCP);
        const reasons = [];
        if (gkdDays !== null && gkdDays < 0) reasons.push(`GKĐ quá ${Math.abs(gkdDays)} ngày`);
        if (gcpDays !== null && gcpDays < 0) reasons.push(`GCP quá ${Math.abs(gcpDays)} ngày`);
        msg += `${i + 1}. <b>${d.name}</b> (Model: ${d.model || 'N/A'})\n`;
        msg += `   └ <i>Trạng thái: ${reasons.join(', ')}</i>\n`;
      });
      if (expiredList.length > 8) {
        msg += `   ...và ${expiredList.length - 8} thiết bị quá hạn khác.\n`;
      }
      msg += `\n`;
    }

    if (warningList.length > 0) {
      msg += `🔴 <b>DANH SÁCH THIẾT BỊ SẮP HẾT HẠN (CẬN HẠN):</b>\n`;
      warningList.slice(0, 8).forEach((d, i) => {
        const gkdDays = getDaysRemaining(d.expiryGKD);
        const gcpDays = getDaysRemaining(d.expiryGCP);
        const warnDetails = [];
        if (gkdDays !== null && gkdDays >= 0 && gkdDays <= warningDaysGKD) warnDetails.push(`GKĐ còn ${gkdDays} ngày`);
        if (gcpDays !== null && gcpDays >= 0 && gcpDays <= warningDaysGCP) warnDetails.push(`GCP còn ${gcpDays} ngày`);
        msg += `${i + 1}. <b>${d.name}</b> (Model: ${d.model || 'N/A'})\n`;
        msg += `   └ <i>Còn lại: ${warnDetails.join(', ')}</i>\n`;
      });
      if (warningList.length > 8) {
        msg += `   ...và ${warningList.length - 8} thiết bị cận hạn khác.\n`;
      }
      msg += `\n`;
    }

    msg += `🔗 <i>Đồng bộ hóa dữ liệu trực tiếp tại hệ thống của bạn!</i>`;

    const success = await handleSendTelegramTestMessage(msg);
    if (success) {
      alert('Đã gửi báo cáo tổng hợp tình trạng thiết bị qua Telegram thành công!');
    }
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

  // Auto-sync all settings to Firestore (Debounced)
  React.useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser || loadingData) return;

    const timer = setTimeout(async () => {
      try {
        await saveSettingsToFirestore(currentUser.uid, {
          telegramBotToken,
          telegramChatId,
          telegramEnabled,
          warningDaysGCP,
          warningDaysGKD,
          warningDaysBD,
          recipientEmail,
          isSubscribed,
          channels
        });
        console.log("Cài đặt thông báo & Telegram đã tự động đồng bộ hóa lên Firestore.");
      } catch (err) {
        console.warn("Lỗi khi tự động lưu cài đặt lên Firestore:", err);
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [
    telegramBotToken,
    telegramChatId,
    telegramEnabled,
    warningDaysGCP,
    warningDaysGKD,
    warningDaysBD,
    recipientEmail,
    isSubscribed,
    channels,
    loadingData
  ]);

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
            <MaintenanceSchedule 
              devices={devices} 
              warningDaysBD={warningDaysBD} 
              activityLogs={activityLogs}
            />
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
              telegramBotToken={telegramBotToken}
              setTelegramBotToken={setTelegramBotToken}
              telegramChatId={telegramChatId}
              setTelegramChatId={setTelegramChatId}
              telegramEnabled={telegramEnabled}
              setTelegramEnabled={setTelegramEnabled}
              onSendTestMessage={handleSendTelegramTestMessage}
              onSendSummaryReport={handleSendTelegramSummaryReport}
              recipientEmail={recipientEmail}
              setRecipientEmail={setRecipientEmail}
              isSubscribed={isSubscribed}
              setIsSubscribed={setIsSubscribed}
              channels={channels}
              setChannels={setChannels}
            />
          ) : (
            <LegalDocumentsPanel 
              devices={devices} 
              isDriveConnected={isDriveConnected}
              setIsDriveConnected={setIsDriveConnected}
              driveUserEmail={driveUserEmail}
              setDriveUserEmail={setDriveUserEmail}
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
              scanState={scanState}
              setScanState={setScanState}
              scanProgress={scanProgress}
              setScanProgress={setScanProgress}
              currentScanningName={currentScanningName}
              setCurrentScanningName={setCurrentScanningName}
              scanResults={scanResults}
              setScanResults={setScanResults}
              isScanReportVisible={isScanReportVisible}
              setIsScanReportVisible={setIsScanReportVisible}
              driveError={driveError}
              setDriveError={setDriveError}
              mockDocs={mockDocs}
              setMockDocs={setMockDocs}
              triggerAutoScan={triggerAutoScan}
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
    gcpIssueDate: '',
    gcpPeriod: 12,
    gkdIssueDate: '',
    gkdPeriod: 12,
    lastMaintenance: '',
    maintenancePeriod: 6,
    notes: ''
  });

  const handleGcpChange = (updates: { gcpIssueDate?: string; gcpPeriod?: number; expiryGCP?: string }) => {
    const nextData = { ...formData, ...updates };
    if (updates.gcpIssueDate !== undefined || updates.gcpPeriod !== undefined) {
      if (nextData.gcpIssueDate && nextData.gcpPeriod) {
        nextData.expiryGCP = calculateExpiryFromIssue(nextData.gcpIssueDate, nextData.gcpPeriod);
      }
    }
    setFormData(nextData);
  };

  const handleGkdChange = (updates: { gkdIssueDate?: string; gkdPeriod?: number; expiryGKD?: string }) => {
    const nextData = { ...formData, ...updates };
    if (updates.gkdIssueDate !== undefined || updates.gkdPeriod !== undefined) {
      if (nextData.gkdIssueDate && nextData.gkdPeriod) {
        nextData.expiryGKD = calculateExpiryFromIssue(nextData.gkdIssueDate, nextData.gkdPeriod);
      }
    }
    setFormData(nextData);
  };

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

      <div className="space-y-4">
        <div className="text-xs font-bold text-blue-600 uppercase tracking-widest bg-blue-50 py-2 px-4 rounded-lg inline-block w-full">
          Hồ sơ pháp lý & Kiểm định
        </div>

        {/* Giấy phép GCP Section */}
        <div className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100 space-y-3">
          <div className="text-xs font-bold text-slate-700 font-sans flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-[10px] text-blue-700 font-bold">1</span>
            <span>THÔNG TIN GIẤY PHÉP (GCP)</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Ngày cấp / gia hạn gần nhất</label>
              <input 
                type="date"
                className={inputClass}
                value={formData.gcpIssueDate || ''}
                onChange={(e) => handleGcpChange({ gcpIssueDate: e.target.value })}
              />
            </div>
            <div>
              <label className={labelClass}>Thời hạn hiệu lực (tháng)</label>
              <input 
                type="number"
                min="1"
                className={inputClass}
                value={formData.gcpPeriod !== undefined ? formData.gcpPeriod : ''}
                onChange={(e) => handleGcpChange({ gcpPeriod: e.target.value ? parseInt(e.target.value) : undefined })}
                placeholder="Ví dụ: 12, 24, 36..."
              />
            </div>
            <div>
              <label className={labelClass}>Hạn Giấy phép (GCP)</label>
              <input 
                type="date"
                required
                className={`${inputClass} bg-blue-50/30 border-blue-100 font-semibold text-blue-900`}
                value={formData.expiryGCP || ''}
                onChange={(e) => handleGcpChange({ expiryGCP: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* Kiểm định GKD Section */}
        <div className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100 space-y-3">
          <div className="text-xs font-bold text-slate-700 font-sans flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-[10px] text-emerald-700 font-bold">2</span>
            <span>THÔNG TIN KIỂM ĐỊNH (GKĐ)</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Ngày kiểm định thực tế</label>
              <input 
                type="date"
                className={inputClass}
                value={formData.gkdIssueDate || ''}
                onChange={(e) => handleGkdChange({ gkdIssueDate: e.target.value })}
              />
            </div>
            <div>
              <label className={labelClass}>Thời hạn hiệu lực (tháng)</label>
              <input 
                type="number"
                min="1"
                className={inputClass}
                value={formData.gkdPeriod !== undefined ? formData.gkdPeriod : ''}
                onChange={(e) => handleGkdChange({ gkdPeriod: e.target.value ? parseInt(e.target.value) : undefined })}
                placeholder="Ví dụ: 12, 24, 36..."
              />
            </div>
            <div>
              <label className={labelClass}>Hạn Kiểm định (GKĐ)</label>
              <input 
                type="date"
                required
                className={`${inputClass} bg-emerald-50/30 border-emerald-100 font-semibold text-emerald-900`}
                value={formData.expiryGKD || ''}
                onChange={(e) => handleGkdChange({ expiryGKD: e.target.value })}
              />
            </div>
          </div>
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
  onConfirm: (id: string, type: 'GCP' | 'GKD' | 'BD', manualDate?: string, issueDate?: string, period?: number) => void;
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
  const menuContainerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (showMenu && menuContainerRef.current) {
      const timer = setTimeout(() => {
        menuContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [showMenu]);

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

  const DateCell = ({ label, date, days, type, warningDays }: { label: string, date: string, days: number | null, type: 'GCP' | 'GKD', warningDays: number }) => {
    const [issueDate, setIssueDate] = useState(type === 'GCP' ? (device.gcpIssueDate || '') : (device.gkdIssueDate || ''));
    const [period, setPeriod] = useState<number>(type === 'GCP' ? (device.gcpPeriod || 12) : (device.gkdPeriod || 12));
    const [localTempDate, setLocalTempDate] = useState(date || '');

    React.useEffect(() => {
      if (editingField === type) {
        setIssueDate(type === 'GCP' ? (device.gcpIssueDate || '') : (device.gkdIssueDate || ''));
        setPeriod(type === 'GCP' ? (device.gcpPeriod || 12) : (device.gkdPeriod || 12));
        setLocalTempDate(date || '');
      }
    }, [editingField, type, date]);

    const handleLocalIssueDateChange = (val: string) => {
      setIssueDate(val);
      if (val && period) {
        const nextDate = calculateExpiryFromIssue(val, period);
        if (nextDate) setLocalTempDate(nextDate);
      }
    };

    const handleLocalPeriodChange = (val: number) => {
      setPeriod(val);
      if (issueDate && val) {
        const nextDate = calculateExpiryFromIssue(issueDate, val);
        if (nextDate) setLocalTempDate(nextDate);
      }
    };

    return (
      <div className="group/cell relative select-none">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <div className={`text-sm ${getStatusColor(days, warningDays)}`}>
              {formatDisplayDate(date)}
            </div>
            <button 
              onClick={() => {
                setEditingField(type);
              }}
              className="opacity-0 group-hover/cell:opacity-100 transition-opacity p-1 hover:bg-slate-100 rounded text-slate-400 cursor-pointer"
              title="Sửa nhanh thông tin"
            >
              <Pencil size={12} />
            </button>
          </div>
          {type === 'GCP' && device.gcpIssueDate && (
            <div className="text-[10px] text-slate-400 mt-0.5 leading-tight font-medium">
              Gia hạn: {formatDisplayDate(device.gcpIssueDate)} ({device.gcpPeriod} tháng)
            </div>
          )}
          {type === 'GKD' && device.gkdIssueDate && (
            <div className="text-[10px] text-slate-400 mt-0.5 leading-tight font-medium">
              Kiểm định: {formatDisplayDate(device.gkdIssueDate)} ({device.gkdPeriod} tháng)
            </div>
          )}
        </div>
        {getDayBadge(days, warningDays)}
        
        {editingField === type && (
          <div className="absolute top-0 left-0 z-35 bg-white p-4 shadow-2xl rounded-2xl border border-slate-200/80 flex flex-col gap-3 min-w-[270px]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider font-sans">
                {type === 'GCP' ? 'Cập nhật Giấy phép (GCP)' : 'Cập nhật Kiểm định (GKĐ)'}
              </span>
              <button 
                onClick={() => setEditingField(null)}
                className="p-1 hover:bg-slate-100 rounded text-slate-400 cursor-pointer"
                title="Đóng popup"
              >
                <X size={13} />
              </button>
            </div>
            
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">
                {type === 'GCP' ? 'Ngày gia hạn gần nhất' : 'Ngày thực hiện kiểm định'}
              </label>
              <input 
                type="date" 
                className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-blue-500 w-full font-sans"
                value={issueDate}
                onChange={(e) => handleLocalIssueDateChange(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Thời hạn hiệu lực (tháng)</label>
              <input 
                type="number" 
                min="1"
                className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-blue-500 w-full font-sans"
                value={period}
                onChange={(e) => handleLocalPeriodChange(e.target.value ? parseInt(e.target.value) : 12)}
              />
            </div>

            <div className="flex flex-col gap-1 bg-blue-50/20 p-2.5 rounded-xl border border-blue-50/50">
              <label className="text-[9px] font-bold text-blue-500 uppercase tracking-wide">Hạn hết hạn mới dự kiến</label>
              <input 
                type="date" 
                className="text-xs border border-blue-100 bg-white font-semibold text-blue-900 rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-blue-500 w-full font-sans"
                value={localTempDate}
                onChange={(e) => setLocalTempDate(e.target.value)}
              />
            </div>

            <div className="flex gap-2 justify-end pt-1">
              <button 
                type="button"
                onClick={() => setEditingField(null)}
                className="px-3 py-1.5 hover:bg-slate-100 rounded-lg text-[10px] text-slate-500 font-bold tracking-tight cursor-pointer border border-slate-100"
              >
                Hủy bỏ
              </button>
              <button 
                type="button"
                onClick={() => {
                  onConfirm(device.id, type, localTempDate, issueDate, period);
                  setEditingField(null);
                }}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold rounded-lg cursor-pointer shadow-sm shadow-blue-100 font-sans tracking-wide"
              >
                Lưu lại
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

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
                    ref={menuContainerRef}
                    initial={{ opacity: 0, scale: 0.95, y: -10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -10 }}
                    className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-2xl border border-slate-200 py-2 z-40 origin-top-right"
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

const MaintenanceSchedule = ({ 
  devices, 
  warningDaysBD = 30,
  activityLogs = []
}: { 
  devices: Device[], 
  warningDaysBD: number,
  activityLogs?: ActivityLog[]
}) => {
  const [expandedDevices, setExpandedDevices] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedDevices(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  return (
    <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
      <div className="p-6 border-b border-slate-100 bg-slate-50/30">
        <h3 className="text-lg font-bold text-slate-800">Lịch trình bảo trì định kỳ</h3>
        <p className="text-xs text-slate-500">Danh sách các thiết bị cần bảo trì trong các tháng tới (Nhấn vào thẻ thiết bị để xem dòng thời gian lịch sử)</p>
      </div>
      <div className="flex-1 overflow-auto p-6 space-y-4">
        {devices.map(device => {
          const lastDate = parseISO(device.lastMaintenance);
          const nextDate = addMonths(lastDate, device.maintenancePeriod);
          const daysToMaintenance = differenceInDays(nextDate, new Date());
          const isExpanded = !!expandedDevices[device.id];

          const thisLogs = activityLogs
            .filter(log => log.deviceId === device.id)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          
          return (
            <div 
              key={device.id} 
              className={`flex flex-col rounded-xl border transition-all duration-200 bg-white overflow-hidden ${
                isExpanded 
                  ? 'border-blue-200 shadow-md ring-1 ring-blue-100' 
                  : 'border-slate-100 hover:border-blue-200 hover:shadow-md'
              }`}
            >
              {/* Card Header Trigger */}
              <div 
                onClick={() => toggleExpand(device.id)}
                className="flex items-center justify-between p-4 cursor-pointer select-none"
              >
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center transition-colors ${
                    daysToMaintenance < 7 ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-400'
                  }`}>
                    <Clock size={24} />
                  </div>
                  <div>
                    <div className="font-bold text-slate-800">{device.name}</div>
                    <div className="text-xs text-slate-500 uppercase font-mono tracking-tighter">
                      Model: {device.model} | Chu kỳ: {device.maintenancePeriod} tháng
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className={`text-sm font-bold ${
                      daysToMaintenance < 0 
                        ? 'text-red-600' 
                        : daysToMaintenance < warningDaysBD 
                        ? 'text-orange-500' 
                        : 'text-slate-600'
                    }`}>
                      Kiến nghị: {format(nextDate, 'dd/MM/yyyy')}
                    </div>
                    <div className="text-[10px] text-slate-400 italic">
                      {daysToMaintenance < 0 ? `Đã quá hạn ${Math.abs(daysToMaintenance)} ngày` : `Còn lại ${daysToMaintenance} ngày`}
                    </div>
                  </div>
                  <ChevronRight 
                    size={16} 
                    className={`text-slate-400 transition-transform duration-200 ${
                      isExpanded ? 'rotate-90 text-blue-600' : ''
                    }`} 
                  />
                </div>
              </div>

              {/* Card Collapsible Timeline Area */}
              <AnimatePresence initial={false}>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    {thisLogs.length > 0 ? (
                      <div className="px-6 pb-6 pt-2 border-t border-slate-100 bg-slate-50/20">
                        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                          <History size={12} className="text-blue-500" />
                          <span>Dòng thời gian lịch sử hoạt động ({thisLogs.length})</span>
                        </div>
                        <div className="relative pl-5 border-l border-slate-200 space-y-4 ml-2">
                          {thisLogs.map(log => (
                            <div key={log.id} className="relative text-xs">
                              {/* Bullet node */}
                              <span className="absolute -left-[24px] top-1 flex h-2 w-2 items-center justify-center rounded-full bg-blue-500 ring-4 ring-white" />
                              <div className="flex items-center gap-2 text-slate-400 font-medium">
                                <span className="font-bold text-slate-500">{formatDisplayDate(log.date)}</span>
                                <span className="px-1.5 py-0.5 text-[9px] font-extrabold uppercase rounded border bg-blue-50 text-blue-700 border-blue-200/50">
                                  {log.categoryLabel || 'Sự kiện'}
                                </span>
                                <span className="text-slate-450 text-[11px]">bởi {log.user}</span>
                              </div>
                              <p className="mt-1 font-semibold text-slate-700 leading-relaxed">{log.description}</p>
                              {log.notes && (
                                <p className="mt-0.5 text-slate-400 italic leading-snug font-medium bg-slate-50 p-2 rounded-lg border border-slate-100/50">
                                  {log.notes}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="px-6 pb-6 pt-4 border-t border-slate-100 bg-slate-50/20 text-center py-6 text-slate-400">
                        <History size={20} className="mx-auto mb-1.5 opacity-30" />
                        <p className="text-xs font-semibold">Chưa ghi nhận lịch sử bảo dưỡng nào cho thiết bị này.</p>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
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
  telegramBotToken: string;
  setTelegramBotToken: (val: string) => void;
  telegramChatId: string;
  setTelegramChatId: (val: string) => void;
  telegramEnabled: boolean;
  setTelegramEnabled: (val: boolean) => void;
  onSendTestMessage: (message: string) => Promise<boolean>;
  onSendSummaryReport: () => Promise<void>;
  recipientEmail: string;
  setRecipientEmail: (val: string) => void;
  isSubscribed: boolean;
  setIsSubscribed: (val: boolean) => void;
  channels: { expiryGCP: boolean; expiryGKD: boolean; maintenance: boolean };
  setChannels: React.Dispatch<React.SetStateAction<{ expiryGCP: boolean; expiryGKD: boolean; maintenance: boolean }>>;
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
  setWarningDaysBD,
  telegramBotToken,
  setTelegramBotToken,
  telegramChatId,
  setTelegramChatId,
  telegramEnabled,
  setTelegramEnabled,
  onSendTestMessage,
  onSendSummaryReport,
  recipientEmail,
  setRecipientEmail,
  isSubscribed,
  setIsSubscribed,
  channels,
  setChannels
}) => {
  const email = recipientEmail;
  const setEmail = setRecipientEmail;

  // Telegram scanner states
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ id: string; name: string; type: string }[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);

  const handleScanRecentChats = async () => {
    if (!telegramBotToken) {
      alert('Vui lòng nhập Telegram Bot Token trước khi quét tìm.');
      return;
    }
    setScanning(true);
    setScanError(null);
    setScanResult([]);
    try {
      const url = `https://api.telegram.org/bot${telegramBotToken}/getUpdates`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('API Telegram phản hồi lỗi. Hãy kiểm tra Bot Token của bạn có đúng không.');
      }
      const data = await response.json();
      if (!data.ok) {
        throw new Error(data.description || 'Không thể lấy dữ liệu.');
      }
      const updates = data.result || [];
      const chatsMap = new Map<string, { id: string; name: string; type: string }>();

      updates.forEach((u: any) => {
        const chatInfo = u.message?.chat || u.my_chat_member?.chat || u.edited_message?.chat || u.channel_post?.chat;
        if (chatInfo) {
          const idStr = String(chatInfo.id);
          let name = chatInfo.title || '';
          if (!name) {
            const first = chatInfo.first_name || '';
            const last = chatInfo.last_name || '';
            name = `${first} ${last}`.trim() || chatInfo.username || `User ID: ${idStr}`;
          }
          chatsMap.set(idStr, {
            id: idStr,
            name,
            type: chatInfo.type || 'unknown'
          });
        }
      });

      const uniqueChats = Array.from(chatsMap.values());
      setScanResult(uniqueChats);
      if (uniqueChats.length === 0) {
        setScanError('Chưa nhận được tin nhắn nào gần đây. Hãy gửi 1 tin nhắn bất kỳ cho Bot hoặc thêm Bot vào Nhóm, rồi bấm Quét lại.');
      }
    } catch (err: any) {
      console.error('Lỗi khi quét tin nhắn Telegram:', err);
      setScanError(err.message || 'Không thể kết nối đến API Telegram.');
    } finally {
      setScanning(false);
    }
  };

  const chatIdWarning = useMemo(() => {
    if (!telegramChatId) return null;
    const cleanId = telegramChatId.trim();
    if (/[a-zA-Z]/.test(cleanId)) {
      return "⚠️ Chat ID phải là số (Ví dụ: -10012345678 hoặc 98765432). Hãy điền đúng dạng số.";
    }
    if (cleanId.length > 5 && !cleanId.startsWith('-')) {
      return "💡 Lưu ý: Đối với chat nhóm/kênh, ID thường bắt đầu bằng dấu trừ '-' (ví dụ: -100112233).";
    }
    return null;
  }, [telegramChatId]);

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

      {/* SECTION 1.2: Telegram Notification Settings */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden" id="telegram-settings-section">
        <div className="p-8 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center justify-between flex-wrap gap-4 mb-2">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-sky-500 text-white rounded-2xl shadow-lg shadow-sky-100">
                <Send size={24} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-800 tracking-tight font-sans">Cấu hình thông báo Telegram</h2>
                <p className="text-sm text-slate-500 font-sans">Nhận thông báo lập tức tới điện thoại khi hồ sơ đến hạn</p>
              </div>
            </div>
            
            <button
              type="button"
              onClick={() => setTelegramEnabled(!telegramEnabled)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all cursor-pointer border ${
                telegramEnabled
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-slate-100 text-slate-500 border-slate-200'
              }`}
            >
              <div className={`w-2.5 h-2.5 rounded-full ${telegramEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              {telegramEnabled ? 'BẬT GỬI TỰ ĐỘNG' : 'TẮT GỬI TỰ ĐỘNG'}
            </button>
          </div>
        </div>

        <div className="p-8 space-y-6">
          <section className="space-y-4">
            <h3 className="text-sm font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-2 font-sans">
              Thông tin kết nối Telegram Bot
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block font-sans">
                  Telegram Bot Token
                </label>
                <input
                  type="password"
                  placeholder="Ví dụ: 1234567890:ABCdefGh..."
                  className="w-full rounded-2xl bg-slate-50 border border-slate-200 px-5 py-3 text-sm outline-none focus:ring-2 focus:ring-sky-500 transition-all font-mono text-slate-700"
                  value={telegramBotToken}
                  onChange={(e) => setTelegramBotToken(e.target.value.trim())}
                />
                <p className="text-[11px] text-slate-400">
                  Nhận Token bằng cách tạo bot qua <b>@BotFather</b> trên Telegram.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block font-sans">
                  Telegram Chat ID / Group ID
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: -1001234567890 hoặc 987654321"
                  className={`w-full rounded-2xl bg-slate-50 border px-5 py-3 text-sm outline-none focus:ring-2 focus:ring-sky-500 transition-all font-mono text-slate-700 ${
                    chatIdWarning ? 'border-amber-300 focus:ring-amber-500' : 'border-slate-200'
                  }`}
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value.trim())}
                />
                {chatIdWarning ? (
                  <p className="text-xs text-amber-600 font-medium font-sans animate-fade-in">
                    {chatIdWarning}
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-400">
                    ID người nhận cá nhân hoặc ID của nhóm/kênh Telegram.
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* DYNAMIC RECENTS FINDER (GETUPDATES SCANNER) */}
          <section className="bg-slate-50 rounded-2xl p-6 border border-slate-100 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h4 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <RefreshCw size={16} className="text-sky-500" />
                  Không biết tìm Chat ID? Sử dụng tính năng quét tự động
                </h4>
                <p className="text-xs text-slate-500 mt-1">
                  Nhắn tin gì đó cho Bot của bạn rồi nhấn quét bên dưới để tìm ID ngay lập tức.
                </p>
              </div>
              <button
                type="button"
                onClick={handleScanRecentChats}
                disabled={scanning || !telegramBotToken}
                className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  telegramBotToken
                    ? 'bg-sky-50 text-sky-600 hover:bg-sky-100 border border-sky-100'
                    : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                }`}
              >
                {scanning ? (
                  <>
                    <Loader2 size={14} className="animate-spin text-sky-600" />
                    Đang quét...
                  </>
                ) : (
                  <>
                    <Search size={14} />
                    Quét Chat ID gần đây
                  </>
                )}
              </button>
            </div>

            {scanError && (
              <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-4 text-xs text-slate-600 leading-relaxed font-sans mt-3">
                <div className="flex gap-2 text-amber-800 font-bold mb-1">
                  <AlertCircle size={14} className="mt-0.5 shrink-0" />
                  Hướng dẫn tự động lấy Chat ID:
                </div>
                <div className="pl-6 space-y-1 text-slate-600">
                  <p>1. Tìm nickname Bot của bạn trên Telegram và nhấn nút <b>"BẮT ĐẦU" (START)</b></p>
                  <p>2. Gửi một tin nhắn bất kỳ (Ví dụ: <code>test</code>) cho Bot.</p>
                  <p>3. <i>Nếu muốn nhận ở Group</i>: Hãy <b>Thêm Bot vào Nhóm</b> trước, rồi gửi một tin nhắn vào nhóm đó.</p>
                  <p>4. Sau khi hoàn thành các bước trên, hãy nhấn lại nút <b>"Quét Chat ID gần đây"</b> để lấy ID tự động!</p>
                  <p className="text-[10px] text-amber-500 mt-2 font-mono italic">Chi tiết lỗi: {scanError}</p>
                </div>
              </div>
            )}

            {scanResult.length > 0 && (
              <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-4 mt-3 space-y-3">
                <div className="text-xs font-extrabold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                  <CheckCircle2 size={14} />
                  Tìm thấy {scanResult.length} cuộc trò chuyện gần đây có liên tác:
                </div>
                <div className="max-h-40 overflow-y-auto space-y-2 pr-2">
                  {scanResult.map((chat) => (
                    <div key={chat.id} className="bg-white p-3 rounded-lg border border-emerald-100/60 flex items-center justify-between text-xs transition-all hover:shadow-xs">
                      <div className="space-y-0.5">
                        <div className="font-bold text-slate-800 flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 scale-90 text-[10px] inline-block uppercase font-extrabold">
                            {chat.type}
                          </span>
                          {chat.name}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500">ID: <code>{chat.id}</code></div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setTelegramChatId(chat.id);
                          if (!telegramEnabled) {
                            setTelegramEnabled(true);
                          }
                          alert(`Đã áp dụng Chat ID: ${chat.name} (${chat.id})`);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-extrabold text-[11px] hover:bg-emerald-700 transition-colors cursor-pointer"
                      >
                        Sử dụng ID này
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* TROUBLESHOOTING HELP DRAWER */}
          <section className="bg-amber-50/30 border border-amber-200/50 rounded-2xl p-6">
            <div className="flex gap-3">
              <HelpCircle className="text-amber-500 shrink-0 mt-0.5" size={20} />
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-800">Cơ chế sửa lỗi kết nối "chat not found":</h4>
                <div className="text-xs text-slate-600 space-y-2 leading-relaxed">
                  <p>Khi Telegram trả về lỗi <b>"chat not found" (Không tìm thấy Chat ID)</b>, đây là lỗi trả về từ hệ thống bảo mật Telegram do Bot chưa có quyền bắt đầu liên lạc với bạn. Hãy khắc phục theo 2 trường hợp bên dưới:</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    <div className="bg-white p-4 rounded-xl border border-amber-100/50">
                      <p className="font-bold text-amber-800 mb-1">Trường hợp 1: Nhận tin cá nhân 👤</p>
                      <p className="text-slate-500 font-sans leading-relaxed">
                        Tìm kiếm ID Bot của bạn trên Telegram, ấn <b>"BẮT ĐẦU" (START)</b> để cho phép Bot trò chuyện cá nhân. Lấy Chat ID của bạn thông qua bot <code>@userinfobot</code>.
                      </p>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-amber-100/50">
                      <p className="font-bold text-amber-800 mb-1">Trường hợp 2: Gửi vào Nhóm / Kênh 👥</p>
                      <p className="text-slate-500 font-sans leading-relaxed">
                        Bạn phải <b>THÊM BOT của bạn vào Nhóm</b> trước, sau đó lấy Group ID (Có dạng số bắt đầu bằng dấu trừ <code>-</code> như <code>-100xxxxxxxxxx</code>).
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="h-px bg-slate-100" />

          {/* Action buttons */}
          <section className="flex flex-wrap gap-4">
            <button
              type="button"
              onClick={async () => {
                const checked = await onSendTestMessage('🔔 <b>Kiểm thử thành công!</b>\nTelegram Bot của bạn đã kết nối thành công tới Hệ thống quản lý hồ sơ đo lường thiết bị. 🎉');
                if (checked) {
                  alert('Kiểm tra Telegram thành công! Hãy kiểm tra cửa sổ chat Telegram của bạn.');
                }
              }}
              disabled={!telegramBotToken || !telegramChatId}
              className={`flex items-center justify-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold transition-all cursor-pointer ${
                telegramBotToken && telegramChatId
                  ? 'bg-sky-500 text-white shadow-lg shadow-sky-100 hover:bg-sky-600'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Send size={16} />
              Gửi tin nhắn thử
            </button>

            <button
              type="button"
              onClick={async () => {
                await onSendSummaryReport();
              }}
              disabled={!telegramBotToken || !telegramChatId}
              className={`flex items-center justify-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold transition-all cursor-pointer ${
                telegramBotToken && telegramChatId
                  ? 'bg-slate-800 text-white shadow-lg shadow-slate-100 hover:bg-slate-900 border border-slate-700'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              }`}
            >
              <FileText size={16} />
              Gửi báo cáo tổng hợp hiện tại
            </button>
          </section>
        </div>

        <div className="p-6 bg-slate-900 border-t border-slate-800">
          <div className="flex items-center justify-between text-white">
            <div className="flex items-center gap-3">
              {telegramEnabled && telegramBotToken && telegramChatId ? (
                <div className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
              ) : (
                <div className="w-2 h-2 rounded-full bg-slate-600" />
              )}
              <span className="text-xs font-bold uppercase tracking-widest font-sans">
                Trạng thái: {telegramEnabled && telegramBotToken && telegramChatId ? 'Đồng bộ tự động cảnh báo thời gian thực' : 'Chưa bật đồng bộ tự động'}
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
  setIsDriveConnected,
  driveUserEmail,
  setDriveUserEmail,
  driveFiles,
  setDriveFiles,
  driveFolderIds,
  setDriveFolderIds,
  setActiveTab,
  onActionLog,
  askConfirmation,
  scanState,
  setScanState,
  scanProgress,
  setScanProgress,
  currentScanningName,
  setCurrentScanningName,
  scanResults,
  setScanResults,
  isScanReportVisible,
  setIsScanReportVisible,
  driveError,
  setDriveError,
  mockDocs,
  setMockDocs,
  triggerAutoScan,
}: { 
  devices: Device[]; 
  isDriveConnected: boolean;
  setIsDriveConnected: React.Dispatch<React.SetStateAction<boolean>>;
  driveUserEmail: string | null;
  setDriveUserEmail: React.Dispatch<React.SetStateAction<string | null>>;
  driveFiles: Record<string, DriveFile[]>;
  setDriveFiles: React.Dispatch<React.SetStateAction<Record<string, DriveFile[]>>>;
  driveFolderIds: Record<string, string>;
  setDriveFolderIds: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setActiveTab: (tab: 'inventory' | 'maintenance' | 'legal' | 'settings') => void;
  onActionLog?: (deviceId: string, text: string, type: 'UPLOAD' | 'DELETE') => void; 
  askConfirmation?: (title: string, message: string, onConfirm: () => void, variant?: 'danger' | 'warning' | 'info', confirmText?: string) => void;
  scanState: 'idle' | 'scanning' | 'completed';
  setScanState: React.Dispatch<React.SetStateAction<'idle' | 'scanning' | 'completed'>>;
  scanProgress: number;
  setScanProgress: React.Dispatch<React.SetStateAction<number>>;
  currentScanningName: string;
  setCurrentScanningName: React.Dispatch<React.SetStateAction<string>>;
  scanResults: Array<{ id: string; folderName: string; fileCount: number; files: string[] }>;
  setScanResults: React.Dispatch<React.SetStateAction<Array<{ id: string; folderName: string; fileCount: number; files: string[] }>>>;
  isScanReportVisible: boolean;
  setIsScanReportVisible: React.Dispatch<React.SetStateAction<boolean>>;
  driveError: string | null;
  setDriveError: React.Dispatch<React.SetStateAction<string | null>>;
  mockDocs: Record<string, LegalDoc[]>;
  setMockDocs: React.Dispatch<React.SetStateAction<Record<string, LegalDoc[]>>>;
  triggerAutoScan: () => Promise<void>;
}) => {
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  
  const [loadingDrive, setLoadingDrive] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const selectedDevice = (() => {
    if (selectedDeviceId === 'shared-legal-docs-folder') {
      return {
        id: 'shared-legal-docs-folder',
        name: 'Văn bản pháp quy & Chứng chỉ nhân viên',
        model: 'Văn bản luật, nghị định, quyết định, chứng chỉ hành nghề...',
        expiryGCP: '',
        expiryGKD: '',
        lastMaintenance: '',
        maintenancePeriod: 0,
        serialNumber: 'SYSTEM_SHARED',
        origin: 'Hệ thống',
        yearOfProduction: '2026',
      };
    }
    return devices.find(d => d.id === selectedDeviceId);
  })();

  // Fetch or retrieve folder files when device gets selected in Connected state
  React.useEffect(() => {
    if (selectedDeviceId && isDriveConnected && selectedDevice) {
      const loadDeviceFiles = async () => {
        setLoadingDrive(true);
        setDriveError(null);
        try {
          let folderId = driveFolderIds[selectedDeviceId];
          if (!folderId) {
            folderId = await getDeviceFolderId(selectedDevice.name);
            setDriveFolderIds(prev => ({ ...prev, [selectedDeviceId]: folderId }));
          }
          const filesFound = await listFolderFiles(folderId);
          setDriveFiles(prev => ({ ...prev, [selectedDeviceId]: filesFound }));
          setDriveError(null);
        } catch (err: any) {
          console.error(err);
          const errorMsg = err.message || String(err);
          const isUnauthorized = errorMsg.includes('401') || errorMsg.includes('Unauthorized') || errorMsg.includes('exp') || errorMsg.includes('token');
          const isApiDisabled = errorMsg.includes('chưa được kích hoạt') || errorMsg.includes('403') || errorMsg.includes('Forbidden') || errorMsg.includes('developers.google.com') || errorMsg.includes('disabled') || errorMsg.includes('has not been used');
          if (isUnauthorized || isApiDisabled) {
            setIsDriveConnected(false);
            setDriveUserEmail(null);
            logout().catch(console.error);
            if (isApiDisabled) {
              setDriveError(errorMsg);
            } else {
              setDriveError("Phiên kết nối Google Drive đã hết hạn hoặc bị thu hồi. Hệ thống đã tự động quay lại chế độ ngoại tuyến.");
            }
          } else {
            setDriveError(err.message || String(err));
          }
        } finally {
          setLoadingDrive(false);
        }
      };
      loadDeviceFiles();
    } else {
      setDriveError(null);
    }
  }, [selectedDeviceId, isDriveConnected]);

  const uploadSingleFile = async (file: File) => {
    if (!selectedDeviceId) return;

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
        const errorMsg = err.message || String(err);
        const isUnauthorized = errorMsg.includes('401') || errorMsg.includes('Unauthorized') || errorMsg.includes('exp') || errorMsg.includes('token');
        const isApiDisabled = errorMsg.includes('chưa được kích hoạt') || errorMsg.includes('403') || errorMsg.includes('Forbidden') || errorMsg.includes('developers.google.com') || errorMsg.includes('disabled') || errorMsg.includes('has not been used');
        if (isUnauthorized || isApiDisabled) {
          setIsDriveConnected(false);
          setDriveUserEmail(null);
          logout().catch(console.error);
          if (isApiDisabled) {
            setDriveError(errorMsg);
            alert("Dịch vụ Google Drive API chưa được kích hoạt. Hệ thống đã chuyển về chế độ ngoại tuyến và hiển thị hướng dẫn kích hoạt trong Cài đặt.");
          } else {
            alert("Phiên kết nối Google Drive đã hết hạn hoặc bị thu hồi. Hệ thống đã tự động quay lại chế độ ngoại tuyến.");
          }
        } else {
          alert(`Tải tệp lên Google Drive thất bại: ${err.message || err}`);
        }
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
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedDeviceId) return;
    await uploadSingleFile(file);
    // Clear input
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!selectedDeviceId) return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      await uploadSingleFile(file);
    }
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
          const errorMsg = err.message || String(err);
          const isUnauthorized = errorMsg.includes('401') || errorMsg.includes('Unauthorized') || errorMsg.includes('exp') || errorMsg.includes('token');
          const isApiDisabled = errorMsg.includes('chưa được kích hoạt') || errorMsg.includes('403') || errorMsg.includes('Forbidden') || errorMsg.includes('developers.google.com') || errorMsg.includes('disabled') || errorMsg.includes('has not been used');
          if (isUnauthorized || isApiDisabled) {
            setIsDriveConnected(false);
            setDriveUserEmail(null);
            logout().catch(console.error);
            if (isApiDisabled) {
              setDriveError(errorMsg);
              alert("Dịch vụ Google Drive API chưa được kích hoạt. Hệ thống đã chuyển về chế độ ngoại tuyến và hiển thị hướng dẫn kích hoạt trong Cài đặt.");
            } else {
              alert("Phiên kết nối Google Drive đã hết hạn hoặc bị thu hồi. Hệ thống đã tự động quay lại chế độ ngoại tuyến.");
            }
          } else {
            alert(`Xóa tệp thất bại: ${err.message || err}`);
          }
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
    <div 
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="flex-1 flex flex-col min-h-0 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden relative"
    >
      {isDragging && selectedDeviceId && (
        <div className="absolute inset-x-2 inset-y-2 z-50 bg-blue-50/95 backdrop-blur-[2px] flex flex-col items-center justify-center border-4 border-dashed border-blue-500 rounded-[22px] transition-all duration-200 animate-fade-in pointer-events-none">
          <div className="p-5 bg-blue-100 text-blue-600 rounded-3xl mb-4 animate-bounce">
            <Upload size={42} />
          </div>
          <p className="text-xl font-bold text-blue-800 font-sans">Thả tài liệu của bạn tại đây</p>
          <p className="text-sm text-blue-600 font-medium font-sans mt-2 text-center max-w-md px-6 leading-relaxed">
            Hệ thống sẽ tự động tải tài liệu lên thư mục tương ứng với thiết bị <strong className="text-blue-900">{selectedDevice?.name || 'Văn bản chung'}</strong>
          </p>
        </div>
      )}

      {isDragging && !selectedDeviceId && (
        <div className="absolute inset-x-2 inset-y-2 z-50 bg-amber-50/95 backdrop-blur-[2px] flex flex-col items-center justify-center border-4 border-dashed border-amber-500 rounded-[22px] transition-all duration-200 animate-fade-in pointer-events-none">
          <div className="p-5 bg-amber-100 text-amber-600 rounded-3xl mb-4">
            <AlertCircle size={42} />
          </div>
          <p className="text-xl font-bold text-amber-800 font-sans">Vui lòng mở một thư mục trước</p>
          <p className="text-sm text-amber-600 font-medium font-sans mt-2 text-center max-w-md px-6 leading-relaxed">
            Hãy click chọn mở một thư mục quản lý thiết bị phía dưới, sau đó kéo thả tệp vào đây để tải lên.
          </p>
        </div>
      )}
      
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
        ) : (selectedDeviceId && driveError) ? (
          <div className="mx-auto max-w-2xl bg-amber-50/60 border border-amber-200 rounded-3xl p-8 space-y-4 shadow-sm animate-fade-in my-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-amber-100 text-amber-850 rounded-2xl shrink-0">
                <AlertCircle size={28} />
              </div>
              <div className="space-y-1.5 flex-1">
                <h3 className="text-lg font-bold text-slate-800 font-sans">Lỗi truy cập bộ nhớ Google Drive</h3>
                <p className="text-sm text-slate-600 font-sans whitespace-pre-wrap leading-relaxed">
                  {(() => {
                    const urlRegex = /(https?:\/\/[^\s]+)/g;
                    const parts = driveError.split(urlRegex);
                    return parts.map((part, idx) => {
                      if (part.match(urlRegex)) {
                        return (
                          <a
                            key={idx}
                            href={part}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 underline font-bold bg-sky-50 px-2 py-0.5 rounded inline-block my-0.5 break-all transition-colors"
                          >
                            {part}
                          </a>
                        );
                      }
                      return part;
                    });
                  })()}
                </p>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setDriveError(null);
                  setSelectedDeviceId(null);
                }}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Quay lại danh sách thư mục
              </button>
              
              <button
                type="button"
                onClick={() => {
                  const currentId = selectedDeviceId;
                  setSelectedDeviceId(null);
                  setTimeout(() => {
                    setSelectedDeviceId(currentId);
                  }, 50);
                }}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-xs cursor-pointer"
              >
                Thử tải lại
              </button>
            </div>
          </div>
        ) : !selectedDeviceId ? (
          <div className="space-y-6">
            {driveError && (
              <div className="bg-amber-50/65 border border-amber-200 rounded-3xl p-6 shadow-sm animate-fade-in">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-amber-100 text-amber-850 rounded-2xl shrink-0 mt-0.5">
                    <AlertCircle size={24} />
                  </div>
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <h4 className="font-bold text-slate-800 text-sm">Trạng thái đồng bộ Google Drive</h4>
                    <div className="text-xs text-slate-650 font-sans whitespace-pre-wrap leading-relaxed break-words">
                      {(() => {
                        const urlRegex = /(https?:\/\/[^\s]+)/g;
                        const parts = driveError.split(urlRegex);
                        return parts.map((part, idx) => {
                          if (part.match(urlRegex)) {
                            return (
                              <a
                                key={idx}
                                href={part}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800 underline font-extrabold bg-sky-50 px-2 py-0.5 rounded inline-block my-0.5 break-all transition-colors hover:bg-sky-100"
                              >
                                {part}
                              </a>
                            );
                          }
                          return part;
                        });
                      })()}
                    </div>
                  </div>
                  <button 
                    onClick={() => setDriveError(null)} 
                    className="text-slate-400 hover:text-slate-600 p-2 rounded-xl transition-colors cursor-pointer text-sm font-bold shrink-0 self-start"
                    title="Đóng thông báo"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}

            {/* Automatic Document & Structure Scanner Panel */}
            <div className="bg-slate-50 border border-slate-200 rounded-3xl p-6 shadow-xs relative overflow-hidden">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl transition-all ${scanState === 'scanning' ? 'bg-blue-105 text-blue-600 animate-pulse animate-spin' : 'bg-green-105 text-green-600'}`}>
                    <RefreshCw size={22} className={scanState === 'scanning' ? 'animate-spin' : ''} />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                      Quét & Đồng bộ hóa Tài liệu Hệ thống
                      {scanState === 'scanning' && <span className="text-[10px] bg-blue-150 text-blue-800 font-bold px-2 py-0.5 rounded-full animate-pulse font-sans">ĐANG QUÉT TỰ ĐỘNG...</span>}
                      {scanState === 'completed' && <span className="text-[10px] bg-green-150 text-green-800 font-bold px-2 py-0.5 rounded-full font-sans">ĐÃ HOÀN THÀNH</span>}
                    </h4>
                    <p className="text-xs text-slate-500 font-sans mt-0.5">
                      Tự động rà soát, kiểm tra số lượng và danh sách tên tài liệu hiện có trong toàn bộ các thư mục.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
                  <button
                    onClick={() => setIsScanReportVisible(!isScanReportVisible)}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-605 hover:text-slate-800 font-semibold text-xs font-sans transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    {isScanReportVisible ? 'Ẩn báo cáo quét' : 'Mở chi tiết báo cáo quét'}
                  </button>
                  <button
                    disabled={scanState === 'scanning'}
                    onClick={triggerAutoScan}
                    className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs font-sans transition-all cursor-pointer flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                  >
                    <RefreshCw size={12} className={scanState === 'scanning' ? 'animate-spin' : ''} />
                    Quét lại
                  </button>
                </div>
              </div>

              {scanState === 'scanning' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-600 font-mono">
                    <span className="font-sans text-slate-500 font-medium animate-pulse">{currentScanningName}</span>
                    <strong className="text-blue-600">{scanProgress}%</strong>
                  </div>
                  <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                    <div 
                      className="bg-blue-600 h-full rounded-full transition-all duration-350"
                      style={{ width: `${scanProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {scanState === 'completed' && isScanReportVisible && (
                <div className="mt-4 border-t border-slate-150 pt-4 animate-fade-in">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {scanResults.map((result, idx) => (
                      <div key={result.id || idx} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-2xs hover:border-slate-350 transition-colors">
                        <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-50">
                          <span className="text-xs font-extrabold text-slate-700 truncate max-w-[70%]" title={result.folderName}>
                            📁 {result.folderName}
                          </span>
                          <span className="px-2 py-0.5 rounded-md font-mono text-[10px] bg-slate-100 text-slate-700 font-bold">
                            {result.fileCount} tệp
                          </span>
                        </div>
                        {result.files.length > 0 ? (
                          <ul className="space-y-1.5 max-h-[85px] overflow-y-auto pr-1">
                            {result.files.map((filename, fIdx) => (
                              <li key={fIdx} className="text-[11px] text-slate-600 flex items-start gap-1 font-sans break-all select-all leading-normal hover:bg-slate-50 p-0.5 rounded cursor-help" title={filename}>
                                <FileText size={11} className="text-slate-400 shrink-0 mt-0.5" />
                                <span className="line-clamp-2">{filename}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="text-[10px] text-slate-400 italic py-1 font-sans">
                            Chưa có tài liệu nào trong thư mục này
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  
                  <div className="mt-4 bg-green-50 border border-green-100 rounded-2xl p-3.5 flex items-center justify-between text-xs text-green-850 font-sans">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-green-500 shrink-0" />
                      <span>
                        Hệ thống đã quét toàn diện: <strong>{scanResults.length} nhóm thư mục</strong>. Phát hiện tổng cộng <strong>{scanResults.reduce((acc, r) => acc + r.fileCount, 0)} tài liệu</strong> kiểm định, hồ sơ pháp lý và tài liệu hướng dẫn sử dụng.
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {/* Thư mục tài liệu chung / Văn bản pháp lý & Chứng chỉ nhân viên */}
              {(() => {
                const count = isDriveConnected 
                  ? (driveFiles['shared-legal-docs-folder']?.length || 0)
                  : (mockDocs['shared-legal-docs-folder']?.length || 0);

                return (
                  <button 
                    onClick={() => setSelectedDeviceId('shared-legal-docs-folder')}
                    className="group flex flex-col items-center p-6 rounded-3xl border border-amber-150 bg-amber-50/10 hover:border-amber-300 hover:bg-amber-50/40 transition-all cursor-pointer text-left w-full shadow-sm"
                  >
                    <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mb-4 shadow-xs group-hover:scale-110 transition-transform">
                      <Folder size={32} fill="currentColor" fillOpacity={0.3} />
                    </div>
                    <div className="text-sm font-bold text-slate-800 text-center line-clamp-2 w-full">Văn bản & Chứng chỉ chung</div>
                    <div className="text-[10px] text-amber-705 mt-1.5 uppercase font-bold tracking-wider">{count} tài liệu</div>
                  </button>
                );
              })()}

              {devices.map(device => {
                const count = isDriveConnected 
                  ? (driveFiles[device.id]?.length || 0)
                  : (mockDocs[device.id]?.length || 0);

                return (
                  <button 
                    key={device.id}
                    onClick={() => setSelectedDeviceId(device.id)}
                    className="group flex flex-col items-center p-6 rounded-3xl border border-slate-100 hover:border-blue-200 hover:bg-blue-50/30 transition-all cursor-pointer text-left w-full shadow-sm"
                  >
                    <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mb-4 shadow-xs group-hover:scale-110 transition-transform">
                      <Folder size={32} fill="currentColor" fillOpacity={0.2} />
                    </div>
                    <div className="text-sm font-bold text-slate-800 text-center line-clamp-2 w-full">{device.name}</div>
                    <div className="text-[10px] text-slate-400 mt-1.5 uppercase font-semibold">{count} tài liệu</div>
                  </button>
                );
              })}
            </div>
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
