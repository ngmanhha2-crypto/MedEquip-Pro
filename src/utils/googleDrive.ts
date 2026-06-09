import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User, signOut } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase safely
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

// Secondary Firebase App and Auth specifically for Google Drive integration
// to prevent signing out or switching the main email/password user
const driveApp = getApps().find(a => a.name === 'GoogleDriveApp') || initializeApp(firebaseConfig, 'GoogleDriveApp');
export const driveAuth = getAuth(driveApp);

const provider = new GoogleAuthProvider();
// Request Google Drive app folder access
provider.addScope('https://www.googleapis.com/auth/drive.file');
provider.setCustomParameters({
  prompt: 'select_account'
});

let isSigningIn = false;
let cachedAccessToken: string | null = null;

// Initialize auth state listener
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(driveAuth, async (user: User | null) => {
    if (user) {
      const token = cachedAccessToken || localStorage.getItem('medequip_google_access_token');
      if (token) {
        cachedAccessToken = token;
        if (onAuthSuccess) onAuthSuccess(user, token);
      } else {
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

// Sign in via Firebase Auth popup specifically for Google Drive
export const googleSignIn = async (): Promise<{ email: string; accessToken: string } | null> => {
  if (isSigningIn) {
    console.warn('Yêu cầu đăng nhập Google Drive đang được xử lý, bỏ qua lượt click trùng lặp.');
    return null;
  }
  try {
    isSigningIn = true;
    const result = await signInWithPopup(driveAuth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to retrieve Google Access Token.');
    }
    cachedAccessToken = credential.accessToken;
    const email = result.user.email || 'Người dùng Google';
    localStorage.setItem('medequip_google_access_token', cachedAccessToken);
    localStorage.setItem('medequip_google_email', email);
    localStorage.setItem('medequip_google_connected', 'true');
    return { email, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Lỗi khi đăng nhập Google:', error);
    
    const isIframe = window.self !== window.top;
    const errorCode = error?.code || '';
    const errorMsg = error?.message || String(error);
    
    let friendlyError = error;
    if (errorCode === 'auth/cancelled-popup-request' || errorMsg.includes('cancelled-popup-request')) {
      if (isIframe) {
        friendlyError = new Error('Yêu cầu đăng nhập đã bị hủy tự động (cancelled-popup-request).\n\nVì ứng dụng đang chạy bên trong khung xem trước (iframe) của AI Studio, một số trình duyệt (như Chrome, Safari) sẽ tự động chặn các luồng xác thực popup để bảo mật.\n\nCách khắc phục:\n1. Hãy mở ứng dụng bằng một Tab độc lập (click vào góc trên của màn hình ứng dụng).\n2. Tiến hành liên kết lại Google Drive từ tab mới đó.');
      } else {
        friendlyError = new Error('Yêu cầu đăng nhập đã được hủy tự động để tránh trùng lặp. Vui lòng kiểm tra xem bạn có nhấn liên tục không, hoặc cấp quyền hiển thị popup cho trang web này.');
      }
    } else if (errorCode === 'auth/popup-closed-by-user' || errorMsg.includes('popup-closed-by-user')) {
      friendlyError = new Error('Cửa sổ đăng nhập Google đã bị đóng trước khi hoàn tất. Vui lòng giữ cửa sổ mở và tiến hành đăng nhập.');
    } else if (errorCode === 'auth/popup-blocked' || errorMsg.includes('popup-blocked')) {
      friendlyError = new Error('Trình duyệt của bạn đã chặn cửa sổ đăng nhập (Popup).\n\nHãy cho phép hiển thị Popup từ trang web này hoặc bấm mở ứng dụng trong Tab độc lập mới ở góc trên của AI Studio để liên kết Google Drive dễ dàng hơn.');
    }
    
    throw friendlyError;
  } finally {
    isSigningIn = false;
  }
};

// Sign out / Disconnect Google Drive
export const logout = async () => {
  await signOut(driveAuth);
  cachedAccessToken = null;
  localStorage.removeItem('medequip_google_access_token');
  localStorage.removeItem('medequip_google_email');
  localStorage.removeItem('medequip_google_connected');
};

// Retrieve cached access token in memory or localStorage
export const getAccessToken = async (): Promise<string | null> => {
  if (cachedAccessToken) return cachedAccessToken;
  return localStorage.getItem('medequip_google_access_token');
};

// Google Drive API Interfaces & Helpers
const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_API_URL = 'https://www.googleapis.com/upload/drive/v3/files';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  webViewLink?: string;
  webContentLink?: string;
  createdTime?: string;
}

// Convert bytes to human readable string
export function formatBytes(bytesStr?: string): string {
  if (!bytesStr) return 'Lớn';
  const bytes = parseInt(bytesStr, 10);
  if (isNaN(bytes) || bytes === 0) return 'Lớn';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Helper to parse detailed Google API error response safely and return a descriptive user-friendly Error
async function parseGoogleApiError(res: Response, prefix: string): Promise<Error> {
  let details = '';
  try {
    const data = await res.json();
    if (data.error) {
      details = data.error.message || JSON.stringify(data.error);
    } else {
      details = JSON.stringify(data);
    }
  } catch (e) {
    details = res.statusText || `Mã lỗi HTTP: ${res.status}`;
  }

  let finalMessage = `${prefix}: ${details}`;
  if (details.includes('has not been used') || details.includes('disabled') || details.includes('googleapis.com')) {
    const urlMatch = details.match(/https:\/\/console\S+/);
    const link = urlMatch ? urlMatch[0].replace(/[\.\,\)\(]+$/, '').trim() : 'https://console.cloud.google.com/apis/library/drive.googleapis.com';
    finalMessage = `Dịch vụ Google Drive API hiện chưa được kích hoạt trong dự án Google Cloud của bạn (${res.status || '403'} Forbidden).\n\nCách kích hoạt dễ dàng trong 3 bước:\n\n1️⃣ Bước 1: Nhấn giữ hoặc Click trực tiếp vào liên kết Google Cloud Platform chính thức dưới đây:\n👉 ${link}\n\n2️⃣ Bước 2: Nhấn nút màu xanh dương "BẬT" (ENABLE) để khởi chạy dịch vụ lưu trữ này trên tài khoản của bạn.\n\n3️⃣ Bước 3: Đợi khoảng 30 - 60 giây để Google hoàn thành tiến trình kích hoạt hệ thống, sau đó quay lại ứng dụng này và nhấn nút "Thử tải lại" để bắt đầu sao lưu & đồng bộ hồ sơ không giới hạn!`;
  } else if (res.status === 401) {
    finalMessage = `Phiên kết nối Google Drive đã hết hạn hoặc bị thu hồi (401 Unauthorized).\n\nCách khắc phục:\n1. Vào phần "Cài đặt" -> "Đồng bộ Google Drive".\n2. Bấm nút "Ngắt kết nối tài khoản Google Drive".\n3. Trở lại trạng thái ngoại tuyến, và sau đó bấm "Kết nối tài khoản Google Drive" để đăng nhập và cấp quyền lại.`;
  } else if (res.status === 403) {
    if (details.includes('insufficientPermissions') || details.includes('permission')) {
      finalMessage = `Yêu cầu bị từ chối hoặc thiếu quyền truy cập tệp Google Drive (403 Forbidden).\n\nCách khắc phục:\n- Khi đăng nhập Google bằng cửa sổ popup, hãy chắc chắn tích chọn vào hộp kiểm cho phép ứng dụng: "Xem, tạo và xóa các tệp Google Drive mà bạn đã mở hoặc tạo bằng ứng dụng này" (See, create, and delete Google Drive files you’ve opened or created with this app) trước khi bấm Đồng ý.`;
    } else {
      finalMessage = `Lỗi phân quyền từ Google Drive (403 Forbidden): ${details}.\n\nCách khắc phục:\n1. "Ngắt kết nối Google Drive" trong Cài đặt và thực hiện kết nối lại.\n2. Kiểm tra xem tài khoản của bạn có bị quản lý bởi chính sách nội bộ của công ty (Google Workspace Admin) chặn ứng dụng bên thứ ba hay không.`;
    }
  } else if (res.status === 404) {
    finalMessage = `Không thể tìm thấy tài nguyên trên Google Drive (404 Not Found).\n\nCó thể thư mục hoặc tệp này đã bị xóa hoặc di chuyển trên Drive của bạn. Bạn hãy làm mới trang hoặc kết nối lại Google Drive để hệ thống tự động tái cấu trúc thư mục mới.`;
  }

  return new Error(finalMessage);
}

// 1. Search or create folder by name
export async function findOrCreateFolder(name: string, parentId?: string): Promise<string> {
  const token = await getAccessToken();
  if (!token) throw new Error('Vui lòng kết nối Google Drive để bắt đầu.');

  let query = `mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false`;
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  }

  const searchUrl = `${DRIVE_API_URL}?q=${encodeURIComponent(query)}&fields=files(id,name)`;
  let searchRes: Response;
  try {
    searchRes = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });
  } catch (e: any) {
    throw new Error(`Không thể kết nối đến máy chủ Google Drive: ${e.message || e}`);
  }

  if (!searchRes.ok) {
    throw await parseGoogleApiError(searchRes, 'Tìm kiếm thư mục thất bại');
  }

  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // Not found, create
  const createBody: any = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId) {
    createBody.parents = [parentId];
  }

  let createRes: Response;
  try {
    createRes = await fetch(DRIVE_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(createBody)
    });
  } catch (e: any) {
    throw new Error(`Không thể kết nối để khởi tạo thư mục Google Drive: ${e.message || e}`);
  }

  if (!createRes.ok) {
    throw await parseGoogleApiError(createRes, 'Tạo thư mục thất bại');
  }

  const createData = await createRes.json();
  return createData.id;
}

// Search folder by name without creating it if not found
export async function findFolderOnly(name: string, parentId?: string): Promise<string | null> {
  const token = await getAccessToken();
  if (!token) return null;

  let query = `mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false`;
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  }

  const searchUrl = `${DRIVE_API_URL}?q=${encodeURIComponent(query)}&fields=files(id,name)`;
  try {
    const searchRes = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();
    if (searchData.files && searchData.files.length > 0) {
      return searchData.files[0].id;
    }
  } catch (e) {
    console.warn("Lỗi tìm kiếm nhanh thư mục:", e);
  }
  return null;
}

// Helper to share a file or folder so that "anyone with the link can view & download"
export async function shareFileOrFolderToEveryone(fileId: string): Promise<void> {
  const token = await getAccessToken();
  if (!token) return;

  const url = `${DRIVE_API_URL}/${fileId}/permissions`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone'
      })
    });
    if (!res.ok) {
      const errText = await res.text();
      console.warn('Lỗi thiết lập quyền chia sẻ công khai:', errText);
    }
  } catch (e) {
    console.warn('Lỗi kết nối khi gọi API chia sẻ:', e);
  }
}

// 2. Resolve subfolder for target Device
export async function getDeviceFolderId(deviceName: string, createIfNotFound: boolean = true): Promise<string | null> {
  const rootFolderName = 'MedEquip_Pro_Documents';
  
  let rootFolderId: string | null = null;
  if (createIfNotFound) {
    rootFolderId = await findOrCreateFolder(rootFolderName);
    // Always share the root folder to ensure all accounts have read access
    await shareFileOrFolderToEveryone(rootFolderId);
  } else {
    rootFolderId = await findFolderOnly(rootFolderName);
    if (!rootFolderId) return null;
  }

  // Clean device name from invalid characters
  const cleanName = deviceName.replace(/[^\w\s\-\u00C0-\u1EF9]/gi, '').trim() || 'Device_Files';
  
  if (createIfNotFound) {
    const deviceFolderId = await findOrCreateFolder(cleanName, rootFolderId);
    // Share child folder to ensure access to specific device documents
    await shareFileOrFolderToEveryone(deviceFolderId);
    return deviceFolderId;
  } else {
    return await findFolderOnly(cleanName, rootFolderId);
  }
}

// 3. List files in designated subfolder
export async function listFolderFiles(folderId: string): Promise<DriveFile[]> {
  const token = await getAccessToken();
  if (!token) throw new Error('Vui lòng kết nối Google Drive.');

  const query = `'${folderId}' in parents and trashed=false`;
  const url = `${DRIVE_API_URL}?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,size,webViewLink,webContentLink,createdTime)&orderBy=createdTime desc`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
  } catch (e: any) {
    throw new Error(`Không thể truy cập Google Drive để tải danh sách tệp: ${e.message || e}`);
  }

  if (!res.ok) {
    throw await parseGoogleApiError(res, 'Truy vấn tài liệu thiết bị thất bại');
  }

  const data = await res.json();
  return data.files || [];
}

// 4. Multipart upload file to designated folder
export async function uploadFileToFolder(folderId: string, file: File): Promise<DriveFile> {
  const token = await getAccessToken();
  if (!token) throw new Error('Vui lòng kết nối Google Drive.');

  const metadata = {
    name: file.name,
    parents: [folderId]
  };

  const formData = new FormData();
  formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  formData.append('file', file);

  const url = `${UPLOAD_API_URL}?uploadType=multipart&fields=id,name,mimeType,size,webViewLink,webContentLink,createdTime`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: formData
    });
  } catch (e: any) {
    throw new Error(`Không thể tải tệp lên Google Drive do lỗi kết nối: ${e.message || e}`);
  }

  if (!res.ok) {
    throw await parseGoogleApiError(res, 'Đăng tải tài liệu thất bại');
  }

  const data = await res.json();
  // Always share the uploaded file so all accounts can view & download
  await shareFileOrFolderToEveryone(data.id);
  return data;
}

// 5. Delete specific file
export async function deleteDriveFile(fileId: string): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw new Error('Vui lòng kết nối Google Drive.');

  const url = `${DRIVE_API_URL}/${fileId}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  } catch (e: any) {
    throw new Error(`Không thể xóa tệp trên Google Drive do lỗi kết nối: ${e.message || e}`);
  }

  if (!res.ok) {
    throw await parseGoogleApiError(res, 'Xóa tài liệu trên Drive thất bại');
  }
}

// 6. Rename specific folder/file on Google Drive
export async function renameDriveFolder(folderId: string, newName: string): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw new Error('Vui lòng kết nối Google Drive.');

  // Clean device name from invalid characters
  const cleanNewName = newName.replace(/[^\w\s\-\u00C0-\u1EF9]/gi, '').trim() || 'Device_Files';

  const url = `${DRIVE_API_URL}/${folderId}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: cleanNewName })
    });
  } catch (e: any) {
    throw new Error(`Không thể kết nối để đổi tên thư mục Google Drive: ${e.message || e}`);
  }

  if (!res.ok) {
    throw await parseGoogleApiError(res, 'Đổi tên thư mục thất bại');
  }
}

