import React, { useState, useRef } from 'react';
import { 
  Upload, 
  FileSpreadsheet, 
  Download, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Check, 
  X, 
  ArrowRight,
  Info,
  Calendar,
  Layers
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Device } from '../types';
import { formatDisplayDate } from '../utils/dateUtils';

interface DeviceExcelImportProps {
  onImportComplete: (devices: Device[]) => Promise<void> | void;
  onDownloadTemplate: () => void;
  onSwitchToManual: () => void;
  onCancel: () => void;
  authUid?: string;
}

export const DeviceExcelImport: React.FC<DeviceExcelImportProps> = ({
  onImportComplete,
  onDownloadTemplate,
  onSwitchToManual,
  onCancel,
  authUid
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [parsedDevices, setParsedDevices] = useState<Device[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = (selectedFile: File) => {
    setErrorMsg(null);
    setFile(selectedFile);
    setParsing(true);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rawData: any[] = XLSX.utils.sheet_to_json(ws);

        if (!rawData || rawData.length === 0) {
          setErrorMsg('Tệp Excel không có dòng dữ liệu nào. Vui lòng tải file mẫu để kiểm tra cấu trúc.');
          setParsedDevices([]);
          setParsing(false);
          return;
        }

        const userPrefix = authUid ? authUid.slice(0, 8) : 'dev';
        const timestamp = Date.now();

        const devicesList: Device[] = rawData.map((row, idx) => {
          const newId = `${userPrefix}_excel_${timestamp}_${idx + 1}`;
          
          const rawGCP = String(row['Hạn GCP'] || row['expiryGCP'] || row['GCP'] || '').trim();
          const rawGKD = String(row['Hạn GKĐ'] || row['expiryGKD'] || row['GKĐ'] || '').trim();
          const rawGKX = String(row['Hạn Kiểm xạ (GKX)'] || row['Hạn GKX'] || row['expiryGKX'] || row['GKX'] || '').trim();

          const isNoGCP = rawGCP.toLowerCase().includes('không áp dụng') || rawGCP.toLowerCase().includes('khong ap dung') || row['noGCP'] === true;
          const isNoGKD = rawGKD.toLowerCase().includes('không áp dụng') || rawGKD.toLowerCase().includes('khong ap dung') || row['noGKD'] === true;
          const isNoGKX = rawGKX.toLowerCase().includes('không áp dụng') || rawGKX.toLowerCase().includes('khong ap dung') || row['noGKX'] === true;

          return {
            id: newId,
            name: String(row['Tên thiết bị'] || row['Tên'] || row['name'] || `Thiết bị ${idx + 1}`).trim(),
            model: String(row['Model'] || row['model'] || '').trim(),
            serialNumber: String(row['Số Serial'] || row['Serial'] || row['serialNumber'] || `SN-${timestamp}-${idx + 1}`).trim(),
            manufacturer: String(row['Hãng sản xuất'] || row['Hãng'] || row['Hãng/Xuất xứ'] || row['manufacturer'] || '').trim(),
            origin: String(row['Xuất xứ'] || row['origin'] || '').trim(),
            yearOfProduction: Number(row['Năm SX'] || row['Năm sản xuất'] || row['yearOfProduction'] || new Date().getFullYear()),
            expiryGCP: isNoGCP ? '' : rawGCP,
            expiryGKD: isNoGKD ? '' : rawGKD,
            expiryGKX: isNoGKX ? '' : rawGKX,
            noGCP: isNoGCP,
            noGKD: isNoGKD,
            noGKX: isNoGKX,
            lastMaintenance: String(row['Bảo dưỡng lần cuối'] || row['lastMaintenance'] || '').trim(),
            maintenancePeriod: Number(row['Chu kỳ bảo trì (tháng)'] || row['Chu kỳ bảo trì'] || row['maintenancePeriod'] || 6),
            manager: String(row['Người quản lý'] || row['manager'] || '').trim(),
            department: String(row['Khoa/Phòng'] || row['Phòng'] || row['department'] || 'Phòng X-Quang').trim()
          };
        });

        setParsedDevices(devicesList);
      } catch (err: any) {
        console.error('Lỗi khi phân tích file Excel:', err);
        setErrorMsg('Định dạng tệp không tương thích hoặc bị lỗi. Vui lòng đảm bảo tệp có định dạng .xlsx, .xls hoặc .csv.');
        setParsedDevices([]);
      } finally {
        setParsing(false);
      }
    };

    reader.onerror = () => {
      setErrorMsg('Không thể đọc tệp đã chọn. Vui lòng thử lại.');
      setParsing(false);
    };

    reader.readAsBinaryString(selectedFile);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      processFile(selected);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      processFile(droppedFile);
    }
  };

  const handleConfirmImport = async () => {
    if (parsedDevices.length === 0) return;
    setImporting(true);
    try {
      await onImportComplete(parsedDevices);
    } catch (err: any) {
      console.error('Lỗi khi nhập thiết bị:', err);
      setErrorMsg('Có lỗi xảy ra khi lưu thiết bị vào hệ thống.');
    } finally {
      setImporting(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setParsedDevices([]);
    setErrorMsg(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Hidden native input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx, .xls, .csv"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Top Banner Guide */}
      <div className="bg-blue-50/70 border border-blue-200/80 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="p-2.5 bg-blue-600 text-white rounded-xl shrink-0 shadow-sm shadow-blue-500/20">
            <FileSpreadsheet size={22} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">
              Nhập hàng loạt danh mục thiết bị từ Excel
            </h3>
            <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
              Tiết kiệm thời gian bằng cách tải lên file Excel sẵn có. Hệ thống tự động nhận diện thông tin máy, hạn Giấy phép (GCP), Kiểm định (GKĐ) và Kiểm xạ (GKX).
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onDownloadTemplate}
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-50 text-blue-700 text-xs font-bold rounded-xl border border-blue-200 transition-all cursor-pointer shadow-2xs whitespace-nowrap shrink-0 hover:border-blue-300"
          title="Tải file mẫu Excel chuẩn để điền dữ liệu"
        >
          <Download size={14} />
          <span>Tải file Excel mẫu</span>
        </button>
      </div>

      {/* Upload Dropzone (when no file or when picking new) */}
      {parsedDevices.length === 0 ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-3xl p-8 sm:p-12 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3.5 ${
            isDragOver 
              ? 'border-blue-500 bg-blue-50/50 scale-101' 
              : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50/60 bg-slate-50/30'
          }`}
        >
          <div className="w-16 h-16 rounded-2xl bg-blue-100/80 text-blue-600 flex items-center justify-center shadow-xs">
            {parsing ? (
              <Loader2 size={32} className="animate-spin text-blue-600" />
            ) : (
              <Upload size={30} />
            )}
          </div>

          <div className="space-y-1">
            <h4 className="text-sm sm:text-base font-bold text-slate-800">
              {parsing ? 'Đang đọc và xử lý tệp Excel...' : 'Kéo thả tệp Excel vào đây hoặc bấm để chọn tệp'}
            </h4>
            <p className="text-xs text-slate-400 max-w-md">
              Hỗ trợ định dạng <strong>.xlsx, .xls, .csv</strong> (Khuyến khích sử dụng mẫu chuẩn của hệ thống)
            </p>
          </div>

          <button
            type="button"
            className="mt-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md shadow-blue-500/20 transition-all"
          >
            Chọn file từ máy tính
          </button>
        </div>
      ) : (
        /* Preview Table & Confirm Stage */
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-emerald-50/60 border border-emerald-200 rounded-2xl">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
              <div>
                <span className="text-xs font-bold text-emerald-900">
                  Tệp: <strong className="font-mono">{file?.name}</strong>
                </span>
                <span className="text-xs text-emerald-700 ml-2">
                  (Tìm thấy <strong>{parsedDevices.length}</strong> thiết bị hợp lệ)
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 transition-all cursor-pointer shadow-2xs"
              >
                Chọn tệp khác
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold rounded-xl border border-rose-200 transition-all cursor-pointer"
              >
                Xóa
              </button>
            </div>
          </div>

          {/* Table Preview */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <div className="px-4 py-2.5 bg-slate-100/70 border-b border-slate-200 flex items-center justify-between text-xs font-bold text-slate-600">
              <span>Xem trước dữ liệu ({parsedDevices.length} thiết bị):</span>
              <span className="text-[11px] font-normal text-slate-400">Cuộn ngang để xem đủ các cột</span>
            </div>
            <div className="max-h-72 overflow-auto custom-scrollbar">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider sticky top-0 border-b border-slate-200 text-[10px] font-bold">
                  <tr>
                    <th className="py-2.5 px-3 w-10 text-center">STT</th>
                    <th className="py-2.5 px-3">Tên thiết bị</th>
                    <th className="py-2.5 px-3">Model</th>
                    <th className="py-2.5 px-3">Số Serial</th>
                    <th className="py-2.5 px-3">Hạn Giấy phép (GCP)</th>
                    <th className="py-2.5 px-3">Hạn Kiểm định (GKĐ)</th>
                    <th className="py-2.5 px-3">Hạn Kiểm xạ (GKX)</th>
                    <th className="py-2.5 px-3">Khoa / Phòng</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parsedDevices.slice(0, 15).map((d, i) => (
                    <tr key={d.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2 px-3 text-center text-slate-400 font-mono text-[11px]">{i + 1}</td>
                      <td className="py-2 px-3 font-bold text-slate-800">{d.name}</td>
                      <td className="py-2 px-3 text-slate-600 font-medium">{d.model || '-'}</td>
                      <td className="py-2 px-3 font-mono text-slate-500">{d.serialNumber || '-'}</td>
                      <td className="py-2 px-3">
                        {d.noGCP ? (
                          <span className="text-slate-400 italic">Tắt (Không áp dụng)</span>
                        ) : d.expiryGCP ? (
                          <span className="text-blue-700 font-semibold">{formatDisplayDate(d.expiryGCP)}</span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        {d.noGKD ? (
                          <span className="text-slate-400 italic">Tắt (Không áp dụng)</span>
                        ) : d.expiryGKD ? (
                          <span className="text-emerald-700 font-semibold">{formatDisplayDate(d.expiryGKD)}</span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        {d.noGKX ? (
                          <span className="text-slate-400 italic">Tắt (Không áp dụng)</span>
                        ) : d.expiryGKX ? (
                          <span className="text-amber-700 font-semibold">{formatDisplayDate(d.expiryGKX)}</span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-slate-500">{d.department || 'Phòng X-Quang'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsedDevices.length > 15 && (
              <div className="p-2.5 bg-slate-50 text-center text-xs text-slate-400 border-t border-slate-200">
                ...và còn {parsedDevices.length - 15} thiết bị khác trong tệp sẽ được nhập toàn bộ.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error Message if any */}
      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-3 text-xs text-rose-700 font-medium">
          <AlertCircle size={18} className="shrink-0 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Columns Format Hint Cards */}
      <div className="bg-slate-50/80 border border-slate-200/70 rounded-2xl p-4 space-y-2">
        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
          <Info size={13} className="text-blue-500" />
          <span>Quy ước các cột trong file Excel mẫu:</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-slate-600">
          <div className="bg-white p-2 rounded-lg border border-slate-200/80">
            <strong className="block text-slate-800">Tên thiết bị *</strong>
            <span className="text-slate-400">Tên máy y tế (bắt buộc)</span>
          </div>
          <div className="bg-white p-2 rounded-lg border border-slate-200/80">
            <strong className="block text-slate-800">Model & Serial</strong>
            <span className="text-slate-400">Mã máy & số sê-ri</span>
          </div>
          <div className="bg-white p-2 rounded-lg border border-slate-200/80">
            <strong className="block text-slate-800">Hạn GCP / GKĐ / GKX</strong>
            <span className="text-slate-400">Định dạng YYYY-MM-DD hoặc bỏ trống</span>
          </div>
          <div className="bg-white p-2 rounded-lg border border-slate-200/80">
            <strong className="block text-slate-800">Chu kỳ bảo trì</strong>
            <span className="text-slate-400">Số tháng (ví dụ: 6 hoặc 12)</span>
          </div>
        </div>
      </div>

      {/* Footer Modal Actions */}
      <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onSwitchToManual}
          className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 cursor-pointer"
        >
          <span>Quay lại nhập biểu mẫu thủ công</span>
        </button>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs sm:text-sm font-semibold hover:bg-slate-50 transition-all cursor-pointer"
          >
            Đóng
          </button>

          {parsedDevices.length > 0 && (
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={importing}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold shadow-lg shadow-blue-500/25 transition-all cursor-pointer disabled:opacity-50 active:scale-95"
            >
              {importing ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Đang nhập dữ liệu...</span>
                </>
              ) : (
                <>
                  <Check size={16} />
                  <span>Xác nhận nhập {parsedDevices.length} thiết bị</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
