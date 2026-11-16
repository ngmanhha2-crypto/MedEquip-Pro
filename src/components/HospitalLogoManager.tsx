import React, { useState, useRef } from 'react';
import { 
  Building2, 
  Upload, 
  Trash2, 
  Check, 
  Sparkles, 
  RotateCcw, 
  Image as ImageIcon,
  CheckCircle2,
  Shield,
  Radio,
  HeartPulse,
  Activity
} from 'lucide-react';

export interface HospitalLogoConfig {
  type: 'preset' | 'custom';
  presetId: string;
  customUrl: string | null;
  hospitalName?: string;
  departmentName?: string;
}

export const DEFAULT_LOGO_CONFIG: HospitalLogoConfig = {
  type: 'preset',
  presetId: 'default',
  customUrl: null,
  hospitalName: 'MedEquip Pro',
  departmentName: 'Phòng X-Quang'
};

export const LOGO_PRESETS = [
  {
    id: 'default',
    name: 'Chữ thập & Điện tim (Mặc định)',
    tag: 'Công nghệ Y tế',
    description: 'Chữ thập y tế hiện đại với sóng xung nhịp điện tim trên nền xanh dương',
    accentColor: '#2563eb',
    renderIcon: () => (
      <svg viewBox="0 0 64 64" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="pDefaultGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1d4ed8" />
            <stop offset="60%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#0284c7" />
          </linearGradient>
          <linearGradient id="pDefaultSheen" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="64" height="64" rx="16" fill="url(#pDefaultGrad)" />
        <rect x="2" y="2" width="60" height="30" rx="14" fill="url(#pDefaultSheen)" />
        <rect x="1" y="1" width="62" height="62" rx="15" fill="none" stroke="#ffffff" strokeWidth="1.5" strokeOpacity="0.3" />
        <g fill="#ffffff">
          <rect x="26.5" y="13" width="11" height="38" rx="5.5" />
          <rect x="13" y="26.5" width="38" height="11" rx="5.5" />
        </g>
        <circle cx="32" cy="32" r="5" fill="#1d4ed8" />
        <circle cx="32" cy="32" r="2.5" fill="#38bdf8" />
        <path d="M19 32h5l2.5-4 4 8 3-5 2.5 1h6" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  },
  {
    id: 'red_cross',
    name: 'Hội Chữ Thập Đỏ & Cấp Cứu',
    tag: 'Chuẩn Quốc Tế',
    description: 'Chữ thập đỏ kinh điển trên nền tròn trắng viền đỏ ruby nổi bật',
    accentColor: '#dc2626',
    renderIcon: () => (
      <svg viewBox="0 0 64 64" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="pRedGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="100%" stopColor="#b91c1c" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="64" height="64" rx="16" fill="url(#pRedGrad)" />
        <rect x="1" y="1" width="62" height="62" rx="15" fill="none" stroke="#ffffff" strokeWidth="1.5" strokeOpacity="0.4" />
        <circle cx="32" cy="32" r="23" fill="#ffffff" />
        <rect x="27" y="16" width="10" height="32" rx="3" fill="#dc2626" />
        <rect x="16" y="27" width="32" height="10" rx="3" fill="#dc2626" />
      </svg>
    )
  },
  {
    id: 'hospital_shield',
    name: 'Khiên Bảo Vệ & Bệnh Viện',
    tag: 'Bệnh Viện Đa Khoa',
    description: 'Khiên xanh lục ngọc bích biểu trưng cho an toàn, phòng hộ và sự vững chắc',
    accentColor: '#059669',
    renderIcon: () => (
      <svg viewBox="0 0 64 64" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="pShieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#047857" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="64" height="64" rx="16" fill="url(#pShieldGrad)" />
        <rect x="1" y="1" width="62" height="62" rx="15" fill="none" stroke="#ffffff" strokeWidth="1.5" strokeOpacity="0.3" />
        {/* Shield contour */}
        <path d="M32 11c6 0 17 2 17 8 0 14-8 25-17 31-9-6-17-17-17-31 0-6 11-8 17-8z" fill="#ffffff" fillOpacity="0.2" />
        <path d="M32 14c5 0 14 1.8 14 6.8 0 11.5-6.8 20.8-14 25.8-7.2-5-14-14.3-14-25.8 0-5 9-6.8 14-6.8z" fill="#ffffff" />
        {/* Hospital cross in center */}
        <rect x="28.5" y="21" width="7" height="19" rx="2" fill="#047857" />
        <rect x="22.5" y="27" width="19" height="7" rx="2" fill="#047857" />
      </svg>
    )
  },
  {
    id: 'radiology_nuclear',
    name: 'An Toàn Bức Xạ & X-Quang',
    tag: 'Chẩn Đoán Hình Ảnh',
    description: 'Biểu tượng cánh quạt bức xạ hạt nhân và tia X quang sắc nét chuyên dụng',
    accentColor: '#eab308',
    renderIcon: () => (
      <svg viewBox="0 0 64 64" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="pRadGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0f172a" />
            <stop offset="100%" stopColor="#1e293b" />
          </linearGradient>
          <linearGradient id="pGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#d97706" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="64" height="64" rx="16" fill="url(#pRadGrad)" />
        <rect x="1" y="1" width="62" height="62" rx="15" fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeOpacity="0.6" />
        
        {/* Radiology radiation 3-blade symbol */}
        <circle cx="32" cy="32" r="22" stroke="#eab308" strokeWidth="2" strokeDasharray="3 3" opacity="0.4" />
        
        {/* Top blade */}
        <path d="M26 15h12l-4 11a7 7 0 0 0-4 0z" fill="url(#pGoldGrad)" />
        {/* Bottom right blade */}
        <path d="M47 38l-6 10-8-8a7 7 0 0 0 3-3z" fill="url(#pGoldGrad)" />
        {/* Bottom left blade */}
        <path d="M17 38l6 10 8-8a7 7 0 0 1-3-3z" fill="url(#pGoldGrad)" />
        
        {/* Center core */}
        <circle cx="32" cy="32" r="5" fill="#fef08a" stroke="#d97706" strokeWidth="1.5" />
      </svg>
    )
  },
  {
    id: 'caduceus_heart',
    name: 'Ống Nghe Y Khoa & Trái Tim',
    tag: 'Y Đức & Tim Mạch',
    description: 'Ống nghe khám chữa bệnh uốn lượn hình trái tim trên nền xanh chàm quý phái',
    accentColor: '#6366f1',
    renderIcon: () => (
      <svg viewBox="0 0 64 64" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="pHeartGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4f46e5" />
            <stop offset="100%" stopColor="#3730a3" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="64" height="64" rx="16" fill="url(#pHeartGrad)" />
        <rect x="1" y="1" width="62" height="62" rx="15" fill="none" stroke="#ffffff" strokeWidth="1.5" strokeOpacity="0.3" />
        
        {/* Heart background */}
        <path d="M32 46s-16-10-16-20c0-6 4.5-10 10-10 3.5 0 6 2 6 2s2.5-2 6-2c5.5 0 10 4 10 10 0 10-16 20-16 20z" fill="#ffffff" fillOpacity="0.2" />
        
        {/* Stethoscope Path */}
        <path d="M22 17v7c0 5 4 9 10 9s10-4 10-9v-7" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
        <path d="M32 33v6c0 3-2 5-5 5h-2" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="23" cy="44" r="3.5" fill="#38bdf8" stroke="#ffffff" strokeWidth="1.5" />
        {/* Earpieces */}
        <circle cx="22" cy="16" r="2" fill="#ffffff" />
        <circle cx="42" cy="16" r="2" fill="#ffffff" />
      </svg>
    )
  },
  {
    id: 'healing_hands',
    name: 'Bàn Tay Nâng Niu & Mầm Sống',
    tag: 'Chăm Sóc & Hồi Phục',
    description: 'Đôi bàn tay thầy thuốc nâng đỡ chữ thập bảo hộ trên nền xanh ngọc biển',
    accentColor: '#0891b2',
    renderIcon: () => (
      <svg viewBox="0 0 64 64" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="pHandGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#0e7490" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="64" height="64" rx="16" fill="url(#pHandGrad)" />
        <rect x="1" y="1" width="62" height="62" rx="15" fill="none" stroke="#ffffff" strokeWidth="1.5" strokeOpacity="0.3" />
        
        {/* Cross floating */}
        <g fill="#ffffff">
          <rect x="29" y="14" width="6" height="18" rx="2.5" />
          <rect x="23" y="20" width="18" height="6" rx="2.5" />
        </g>
        
        {/* Gentle caring hands curving under */}
        <path d="M14 41c5-2 11 1 18 5 7-4 13-7 18-5 1 2-2 7-6 9-5 2-9-1-12-3-3 2-7 5-12 3-4-2-7-7-6-9z" fill="#ffffff" fillOpacity="0.85" />
        <circle cx="32" cy="23" r="2.5" fill="#0891b2" />
      </svg>
    )
  }
];

export const HospitalLogoViewer: React.FC<{
  config?: HospitalLogoConfig;
  className?: string;
  sizeClass?: string;
}> = ({ 
  config = DEFAULT_LOGO_CONFIG, 
  className = '', 
  sizeClass = 'w-10 h-10 sm:w-11 sm:h-11' 
}) => {
  if (config.type === 'custom' && config.customUrl) {
    return (
      <img
        src={config.customUrl}
        alt={config.hospitalName || 'Logo Bệnh viện'}
        className={`rounded-xl shadow-md object-contain bg-white/95 p-1 ring-1 ring-white/20 ${sizeClass} ${className}`}
      />
    );
  }

  const selectedPreset = LOGO_PRESETS.find(p => p.id === config.presetId) || LOGO_PRESETS[0];

  return (
    <div className={`rounded-xl shadow-md overflow-hidden bg-slate-900/90 ring-1 ring-white/20 shrink-0 ${sizeClass} ${className}`}>
      {selectedPreset.renderIcon()}
    </div>
  );
};

export const HospitalLogoSettingsSection: React.FC<{
  config: HospitalLogoConfig;
  onChange: (newConfig: HospitalLogoConfig) => void;
  onSave?: () => void;
}> = ({ config, onChange, onSave }) => {
  const [activeTab, setActiveTab] = useState<'preset' | 'upload'>(config.type === 'custom' ? 'upload' : 'preset');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSelectPreset = (id: string) => {
    onChange({
      ...config,
      type: 'preset',
      presetId: id
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);

    // Validate size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('Tệp ảnh quá lớn. Vui lòng chọn ảnh dung lượng dưới 5MB.');
      return;
    }

    // Validate type
    if (!file.type.startsWith('image/')) {
      setUploadError('Tệp không hợp lệ. Vui lòng tải lên định dạng hình ảnh (PNG, JPG, SVG, WebP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (base64) {
        onChange({
          ...config,
          type: 'custom',
          customUrl: base64
        });
        setActiveTab('upload');
      }
    };
    reader.onerror = () => {
      setUploadError('Không thể đọc file ảnh. Vui lòng thử lại với ảnh khác.');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveCustomLogo = () => {
    onChange({
      ...config,
      type: 'preset',
      presetId: 'default',
      customUrl: null
    });
    setActiveTab('preset');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleTriggerSave = () => {
    if (onSave) onSave();
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden font-sans">
      {/* Header */}
      <div className="p-6 sm:p-8 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-2xl shadow-lg shadow-blue-500/20">
            <Building2 size={24} />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight">
              Nhận diện Cơ sở Y tế & Logo Bệnh viện
            </h2>
            <p className="text-xs sm:text-sm text-slate-500">
              Tùy chỉnh biểu trưng (Logo), tên Bệnh viện và Khoa/Phòng hiển thị trên thanh Banner đầu trang
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleTriggerSave}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm rounded-xl transition-all shadow-md shadow-blue-500/20 cursor-pointer active:scale-95"
        >
          {saveSuccess ? (
            <>
              <Check size={16} className="text-emerald-300" />
              <span>Đã lưu nhận diện!</span>
            </>
          ) : (
            <>
              <Sparkles size={16} />
              <span>Lưu cấu hình</span>
            </>
          )}
        </button>
      </div>

      <div className="p-6 sm:p-8 space-y-8">
        {/* LIVE PREVIEW BANNER CARD */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Activity size={14} className="text-blue-500" />
              Xem trước hiển thị thực tế trên thanh Banner:
            </h3>
            <span className="text-[11px] text-slate-400 italic">Cập nhật ngay tức thì</span>
          </div>

          <div className="bg-gradient-to-r from-slate-950 via-[#0b162c] to-[#0f1f3d] border border-slate-800 rounded-2xl p-4 sm:p-5 relative overflow-hidden shadow-inner">
            <div className="pointer-events-none absolute -top-12 -left-12 w-64 h-64 bg-blue-500/15 rounded-full blur-2xl" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:20px_20px] opacity-10" />

            <div className="relative z-10 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3.5">
                <div className="relative group">
                  <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 to-cyan-400 rounded-2xl blur-xs opacity-60"></div>
                  <HospitalLogoViewer config={config} sizeClass="w-12 h-12 relative" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-base sm:text-lg font-black tracking-tight text-white leading-none">
                      {config.hospitalName || 'MedEquip Pro'}
                    </h1>
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-blue-500/20 text-sky-300 border border-blue-400/30 uppercase tracking-wider">
                      {config.departmentName || 'Phòng X-Quang'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300/80 font-medium mt-1">
                    Hệ thống Quản lý Thiết bị Y tế, Kiểm định & An toàn Bức xạ
                  </p>
                </div>
              </div>

              <div className="text-right hidden sm:block">
                <span className="text-[10px] font-mono text-sky-400/80 bg-slate-900/90 border border-slate-700/80 px-2.5 py-1 rounded-lg">
                  {config.type === 'custom' ? '✨ Logo ảnh tải lên' : `🎯 Kiểu mẫu: ${LOGO_PRESETS.find(p => p.id === config.presetId)?.name.split('(')[0] || 'Mặc định'}`}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* FACILITY NAME & DEPARTMENT INPUTS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
              <span>Tên Bệnh viện / Cơ sở Y tế</span>
            </label>
            <input
              type="text"
              value={config.hospitalName || ''}
              onChange={(e) => onChange({ ...config, hospitalName: e.target.value })}
              placeholder="Ví dụ: Bệnh viện Đa khoa Tỉnh, MedEquip..."
              className="w-full px-4 py-2.5 bg-slate-50 hover:bg-slate-50/80 focus:bg-white border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl text-sm font-semibold text-slate-800 outline-none transition-all"
            />
            <p className="text-[11px] text-slate-400">Tên đơn vị nổi bật trên thanh tiêu đề đầu trang.</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
              <span>Khoa / Phòng ban quản lý</span>
            </label>
            <input
              type="text"
              value={config.departmentName || ''}
              onChange={(e) => onChange({ ...config, departmentName: e.target.value })}
              placeholder="Ví dụ: Phòng X-Quang, Khoa CĐHA, P. Vật tư..."
              className="w-full px-4 py-2.5 bg-slate-50 hover:bg-slate-50/80 focus:bg-white border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl text-sm font-semibold text-slate-800 outline-none transition-all"
            />
            <p className="text-[11px] text-slate-400">Hiển thị trong nhãn màu xanh bên cạnh tên bệnh viện.</p>
          </div>
        </div>

        <div className="h-px bg-slate-100" />

        {/* TAB NAVIGATION: PRESET CHOICES vs UPLOAD FILE */}
        <div className="space-y-5">
          <div className="flex items-center gap-2 p-1 bg-slate-100/80 rounded-2xl w-fit border border-slate-200/60">
            <button
              type="button"
              onClick={() => setActiveTab('preset')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                activeTab === 'preset'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sparkles size={15} />
              <span>Kiểu Logo chuẩn Y tế có sẵn ({LOGO_PRESETS.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('upload')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                activeTab === 'upload'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Upload size={15} />
              <span>Tải ảnh Logo Bệnh viện lên</span>
              {config.type === 'custom' && config.customUrl && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
              )}
            </button>
          </div>

          {/* TAB 1: PRESET LOGOS GRID */}
          {activeTab === 'preset' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500">
                Chọn một trong các mẫu logo y tế chuẩn vector độ phân giải cao được thiết kế sẵn:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {LOGO_PRESETS.map((preset) => {
                  const isSelected = config.type === 'preset' && config.presetId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleSelectPreset(preset.id)}
                      className={`text-left p-3.5 rounded-2xl border transition-all flex items-start gap-3.5 cursor-pointer group relative ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50/40 shadow-sm ring-2 ring-blue-500/20'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/70 bg-white'
                      }`}
                    >
                      <div className="w-12 h-12 rounded-xl shrink-0 overflow-hidden shadow-xs group-hover:scale-105 transition-transform">
                        {preset.renderIcon()}
                      </div>
                      <div className="flex-1 min-w-0 pr-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-extrabold text-slate-800 line-clamp-1">
                            {preset.name}
                          </span>
                        </div>
                        <span className="inline-block mt-0.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                          {preset.tag}
                        </span>
                        <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-tight">
                          {preset.description}
                        </p>
                      </div>

                      {isSelected && (
                        <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-xs">
                          <Check size={12} strokeWidth={3} />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: CUSTOM IMAGE UPLOAD */}
          {activeTab === 'upload' && (
            <div className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png, image/jpeg, image/jpg, image/svg+xml, image/webp"
                onChange={handleFileUpload}
                className="hidden"
              />

              {config.type === 'custom' && config.customUrl ? (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 flex flex-col sm:flex-row items-center gap-6">
                  <div className="relative group">
                    <img
                      src={config.customUrl}
                      alt="Logo hiện tại"
                      className="w-24 h-24 rounded-2xl object-contain bg-white border border-slate-200 p-2 shadow-md"
                    />
                    <div className="absolute -bottom-2 -right-2 bg-emerald-500 text-white p-1 rounded-full shadow-xs">
                      <Check size={12} strokeWidth={3} />
                    </div>
                  </div>

                  <div className="flex-1 text-center sm:text-left space-y-1.5">
                    <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                      <CheckCircle2 size={13} />
                      Đang sử dụng ảnh logo tải lên của Bệnh viện
                    </div>
                    <h4 className="text-sm font-bold text-slate-800">Ảnh logo bệnh viện đã sẵn sàng</h4>
                    <p className="text-xs text-slate-500 max-w-md">
                      Logo này đang hiển thị trên thanh banner của toàn bộ hệ thống. Bạn có thể chọn ảnh khác hoặc quay lại các mẫu logo mặc định bất kỳ lúc nào.
                    </p>

                    <div className="flex flex-wrap gap-2.5 pt-2 justify-center sm:justify-start">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer shadow-2xs"
                      >
                        <Upload size={14} />
                        Chọn ảnh khác
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveCustomLogo}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-xl transition-all border border-rose-200 cursor-pointer"
                      >
                        <Trash2 size={14} />
                        Xóa ảnh tùy chỉnh
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 hover:border-blue-500 hover:bg-blue-50/20 rounded-2xl p-8 sm:p-10 text-center cursor-pointer transition-all group flex flex-col items-center justify-center gap-3"
                >
                  <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 group-hover:scale-110 group-hover:bg-blue-600 group-hover:text-white transition-all flex items-center justify-center shadow-xs">
                    <Upload size={24} />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-slate-800 group-hover:text-blue-600 transition-colors">
                      Nhấn vào đây để tải ảnh Logo Bệnh viện từ máy tính
                    </h4>
                    <p className="text-xs text-slate-400">
                      Hỗ trợ các định dạng: PNG, JPG, SVG, WebP (Khuyến khích ảnh nền trong suốt PNG hoặc SVG, tối đa 5MB)
                    </p>
                  </div>
                  <button
                    type="button"
                    className="mt-1 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-sm shadow-blue-500/20 group-hover:bg-blue-700"
                  >
                    Chọn file ảnh từ thiết bị
                  </button>
                </div>
              )}

              {uploadError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
                  {uploadError}
                </div>
              )}
            </div>
          )}
        </div>

        {/* FOOTER ACTIONS */}
        <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100">
          <button
            type="button"
            onClick={() => {
              onChange(DEFAULT_LOGO_CONFIG);
              setActiveTab('preset');
            }}
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 font-semibold cursor-pointer"
          >
            <RotateCcw size={13} />
            Khôi phục cài đặt logo mặc định
          </button>

          <button
            type="button"
            onClick={handleTriggerSave}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm rounded-xl transition-all shadow-md shadow-blue-500/25 cursor-pointer active:scale-95"
          >
            <Check size={16} />
            <span>Áp dụng & Lưu thay đổi</span>
          </button>
        </div>
      </div>
    </div>
  );
};
