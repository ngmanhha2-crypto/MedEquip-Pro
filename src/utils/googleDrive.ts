import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User, signOut } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Secondary Firebase App and Auth specifically for Google Drive integration
// to prevent signing out or switching the main email/password user
const driveApp = initializeApp(firebaseConfig, 'GoogleDriveApp');
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
    throw error;
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

// 1. Search or create folder by name
export async function findOrCreateFolder(name: string, parentId?: string): Promise<string> {
  const token = await getAccessToken();
  if (!token) throw new Error('Vui lòng kết nối Google Drive để bắt đầu.');

  let query = `mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false`;
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  }

  const searchUrl = `${DRIVE_API_URL}?q=${encodeURIComponent(query)}&fields=files(id,name)`;
  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!searchRes.ok) {
    throw new Error(`Tìm kiếm thư mục thất bại: ${searchRes.statusText}`);
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

  const createRes = await fetch(DRIVE_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(createBody)
  });

  if (!createRes.ok) {
    throw new Error(`Tạo thư mục thất bại: ${createRes.statusText}`);
  }

  const createData = await createRes.json();
  return createData.id;
}

// 2. Resolve subfolder for target Device
export async function getDeviceFolderId(deviceName: string): Promise<string> {
  const rootFolderName = 'MedEquip_Pro_Documents';
  const rootFolderId = await findOrCreateFolder(rootFolderName);

  // Clean device name from invalid characters
  const cleanName = deviceName.replace(/[^\w\s\-\u00C0-\u1EF9]/gi, '').trim() || 'Device_Files';
  const deviceFolderId = await findOrCreateFolder(cleanName, rootFolderId);
  return deviceFolderId;
}

// 3. List files in designated subfolder
export async function listFolderFiles(folderId: string): Promise<DriveFile[]> {
  const token = await getAccessToken();
  if (!token) throw new Error('Vui lòng kết nối Google Drive.');

  const query = `'${folderId}' in parents and trashed=false`;
  const url = `${DRIVE_API_URL}?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,size,webViewLink,webContentLink,createdTime)&orderBy=createdTime desc`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    throw new Error(`Truy vấn tài liệu thiết bị thất bại: ${res.statusText}`);
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
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: formData
  });

  if (!res.ok) {
    throw new Error(`Đăng tải tài liệu thất bại: ${res.statusText}`);
  }

  return await res.json();
}

// 5. Delete specific file
export async function deleteDriveFile(fileId: string): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw new Error('Vui lòng kết nối Google Drive.');

  const url = `${DRIVE_API_URL}/${fileId}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!res.ok) {
    throw new Error(`Xóa tài liệu trên Drive thất bại: ${res.statusText}`);
  }
}
