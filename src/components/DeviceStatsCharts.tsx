import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  ReferenceLine,
} from 'recharts';
import { Device, ActivityLog } from '../types';
import { getDaysRemaining, formatDisplayDate } from '../utils/dateUtils';
import { parseISO, addMonths, differenceInDays } from 'date-fns';
import {
  AlertTriangle,
  Clock,
  ShieldAlert,
  Wrench,
  CheckCircle2,
  Calendar,
  Filter,
  BarChart3,
  PieChart as PieIcon,
  Layers,
  ArrowRight,
  ExternalLink,
  ChevronRight,
  AlertCircle
} from 'lucide-react';
import { motion } from 'motion/react';

interface DeviceStatsChartsProps {
  devices: Device[];
  warningDaysGCP?: number;
  warningDaysGKD?: number;
  warningDaysBD?: number;
  onSelectDevice?: (device: Device) => void;
  onConfirmDone?: (id: string, type: 'GCP' | 'GKD' | 'BD') => void;
}

interface ProcessedDeviceInfo {
  device: Device;
  id: string;
  name: string;
  model: string;
  serialNumber: string;
  manager: string;
  gkdDays: number | null;
  gcpDays: number | null;
  minInspectionDays: number | null;
  gkdStatus: 'expired' | 'warning' | 'ok' | 'none';
  maintenanceDays: number | null;
  nextMaintenanceDate: Date | null;
  maintenanceStatus: 'expired' | 'warning' | 'ok' | 'none';
  urgentScore: number; // lower number = more urgent
}

const COLORS = {
  expired: '#ef4444',     // Red
  warning: '#f59e0b',     // Amber
  ok: '#10b981',          // Emerald
  none: '#94a3b8',        // Slate
  gkdPrimary: '#3b82f6',  // Blue
  bdPrimary: '#8b5cf6',   // Violet
};

export const DeviceStatsCharts: React.FC<DeviceStatsChartsProps> = ({
  devices,
  warningDaysGCP = 75,
  warningDaysGKD = 30,
  warningDaysBD = 30,
  onSelectDevice,
  onConfirmDone
}) => {
  const [filterView, setFilterView] = useState<'all' | 'urgent' | 'gkd' | 'bd'>('all');
  const [barChartMode, setBarChartMode] = useState<'both' | 'gkd' | 'bd'>('both');
  const [pieChartActiveIndex, setPieChartActiveIndex] = useState<number | null>(null);

  // 1. Process all devices with unified metrics
  const processedDevices: ProcessedDeviceInfo[] = useMemo(() => {
    return devices.map(d => {
      const gkdDays = getDaysRemaining(d.expiryGKD);
      const gcpDays = getDaysRemaining(d.expiryGCP);

      let minInspectionDays: number | null = null;
      if (gkdDays !== null && gcpDays !== null) {
        minInspectionDays = Math.min(gkdDays, gcpDays);
      } else if (gkdDays !== null) {
        minInspectionDays = gkdDays;
      } else if (gcpDays !== null) {
        minInspectionDays = gcpDays;
      }

      let gkdStatus: 'expired' | 'warning' | 'ok' | 'none' = 'none';
      if (minInspectionDays !== null) {
        if (minInspectionDays < 0) {
          gkdStatus = 'expired';
        } else if (minInspectionDays <= warningDaysGKD) {
          gkdStatus = 'warning';
        } else {
          gkdStatus = 'ok';
        }
      }

      // Maintenance calculation
      let maintenanceDays: number | null = null;
      let nextMaintenanceDate: Date | null = null;
      let maintenanceStatus: 'expired' | 'warning' | 'ok' | 'none' = 'none';

      if (d.lastMaintenance && !isNaN(new Date(d.lastMaintenance).getTime()) && d.maintenancePeriod) {
        try {
          const lastDate = parseISO(d.lastMaintenance);
          nextMaintenanceDate = addMonths(lastDate, d.maintenancePeriod);
          maintenanceDays = differenceInDays(nextMaintenanceDate, new Date());

          if (maintenanceDays < 0) {
            maintenanceStatus = 'expired';
          } else if (maintenanceDays <= warningDaysBD) {
            maintenanceStatus = 'warning';
          } else {
            maintenanceStatus = 'ok';
          }
        } catch {
          maintenanceStatus = 'none';
        }
      }

      // Urgency score (used for sorting)
      let urgentScore = 9999;
      if (minInspectionDays !== null && maintenanceDays !== null) {
        urgentScore = Math.min(minInspectionDays, maintenanceDays);
      } else if (minInspectionDays !== null) {
        urgentScore = minInspectionDays;
      } else if (maintenanceDays !== null) {
        urgentScore = maintenanceDays;
      }

      return {
        device: d,
        id: d.id,
        name: d.name,
        model: d.model || 'N/A',
        serialNumber: d.serialNumber || 'N/A',
        manager: d.manager || 'Chưa gán',
        gkdDays,
        gcpDays,
        minInspectionDays,
        gkdStatus,
        maintenanceDays,
        nextMaintenanceDate,
        maintenanceStatus,
        urgentScore
      };
    });
  }, [devices, warningDaysGKD, warningDaysGCP, warningDaysBD]);

  // 2. High-level Summary Statistics
  const summaryStats = useMemo(() => {
    const total = processedDevices.length;
    const gkdExpired = processedDevices.filter(d => d.gkdStatus === 'expired').length;
    const gkdWarning = processedDevices.filter(d => d.gkdStatus === 'warning').length;
    const gkdOk = processedDevices.filter(d => d.gkdStatus === 'ok').length;

    const bdExpired = processedDevices.filter(d => d.maintenanceStatus === 'expired').length;
    const bdWarning = processedDevices.filter(d => d.maintenanceStatus === 'warning').length;
    const bdOk = processedDevices.filter(d => d.maintenanceStatus === 'ok').length;
    const bdNone = processedDevices.filter(d => d.maintenanceStatus === 'none').length;

    // Total unique devices that need urgent action (expired or warning in either inspection or maintenance)
    const totalUrgentDevices = processedDevices.filter(
      d => d.gkdStatus === 'expired' || d.gkdStatus === 'warning' || d.maintenanceStatus === 'expired' || d.maintenanceStatus === 'warning'
    ).length;

    const complianceRate = total > 0 
      ? Math.round(((total - totalUrgentDevices) / total) * 100) 
      : 100;

    return {
      total,
      gkdExpired,
      gkdWarning,
      gkdOk,
      bdExpired,
      bdWarning,
      bdOk,
      bdNone,
      totalUrgentDevices,
      complianceRate
    };
  }, [processedDevices]);

  // 3. Inspection Status Donut Data
  const inspectionPieData = useMemo(() => {
    return [
      { name: 'Quá hạn kiểm định', value: summaryStats.gkdExpired, color: COLORS.expired },
      { name: 'Sắp cận hạn kiểm định', value: summaryStats.gkdWarning, color: COLORS.warning },
      { name: 'Kiểm định hợp lệ', value: summaryStats.gkdOk, color: COLORS.ok },
    ].filter(item => item.value > 0);
  }, [summaryStats]);

  // 4. Maintenance Status Donut Data
  const maintenancePieData = useMemo(() => {
    return [
      { name: 'Quá hạn bảo trì', value: summaryStats.bdExpired, color: COLORS.expired },
      { name: 'Cần bảo trì sớm', value: summaryStats.bdWarning, color: COLORS.warning },
      { name: 'Đã bảo trì định kỳ', value: summaryStats.bdOk, color: COLORS.ok },
      { name: 'Chưa đặt lịch', value: summaryStats.bdNone, color: COLORS.none },
    ].filter(item => item.value > 0);
  }, [summaryStats]);

  // 5. Time Horizons Distribution (Stacked/Grouped Bar Chart)
  // Categories: Quá hạn (<0), Dưới 15 ngày, 15-30 ngày, 31-60 ngày, Trên 60 ngày
  const timeHorizonData = useMemo(() => {
    const buckets = [
      { label: 'Đã quá hạn', gkd: 0, bd: 0, order: 1 },
      { label: 'Cận hạn (<15 ngày)', gkd: 0, bd: 0, order: 2 },
      { label: 'Sắp đến hạn (15-30 ngày)', gkd: 0, bd: 0, order: 3 },
      { label: 'Chu kỳ tới (31-60 ngày)', gkd: 0, bd: 0, order: 4 },
      { label: 'An toàn (>60 ngày)', gkd: 0, bd: 0, order: 5 },
    ];

    processedDevices.forEach(d => {
      // Inspection
      if (d.minInspectionDays !== null) {
        if (d.minInspectionDays < 0) buckets[0].gkd++;
        else if (d.minInspectionDays <= 15) buckets[1].gkd++;
        else if (d.minInspectionDays <= 30) buckets[2].gkd++;
        else if (d.minInspectionDays <= 60) buckets[3].gkd++;
        else buckets[4].gkd++;
      }

      // Maintenance
      if (d.maintenanceDays !== null) {
        if (d.maintenanceDays < 0) buckets[0].bd++;
        else if (d.maintenanceDays <= 15) buckets[1].bd++;
        else if (d.maintenanceDays <= 30) buckets[2].bd++;
        else if (d.maintenanceDays <= 60) buckets[3].bd++;
        else buckets[4].bd++;
      }
    });

    return buckets;
  }, [processedDevices]);

  // 6. Device-level Bar Chart Data (Sorted by urgency)
  const deviceBarData = useMemo(() => {
    // Sort all devices by urgency
    const sorted = [...processedDevices].sort((a, b) => a.urgentScore - b.urgentScore);

    // Filter based on view mode
    let filtered = sorted;
    if (filterView === 'urgent') {
      filtered = sorted.filter(
        d => d.gkdStatus === 'expired' || d.gkdStatus === 'warning' || d.maintenanceStatus === 'expired' || d.maintenanceStatus === 'warning'
      );
    } else if (filterView === 'gkd') {
      filtered = sorted.filter(d => d.minInspectionDays !== null);
    } else if (filterView === 'bd') {
      filtered = sorted.filter(d => d.maintenanceDays !== null);
    }

    return filtered.slice(0, 12).map(d => {
      // Truncate name for clean axis label
      const shortName = d.name.length > 18 ? d.name.substring(0, 16) + '...' : d.name;
      return {
        id: d.id,
        fullName: d.name,
        shortName: `${shortName} (${d.model})`,
        model: d.model,
        serial: d.serialNumber,
        gkdDays: d.minInspectionDays !== null ? d.minInspectionDays : 0,
        hasGkd: d.minInspectionDays !== null,
        bdDays: d.maintenanceDays !== null ? d.maintenanceDays : 0,
        hasBd: d.maintenanceDays !== null,
        gkdStatus: d.gkdStatus,
        maintenanceStatus: d.maintenanceStatus,
        device: d.device
      };
    });
  }, [processedDevices, filterView]);

  // 7. Urgent Action Queue (Table list of priority items)
  const urgentQueue = useMemo(() => {
    return [...processedDevices]
      .filter(d => 
        d.gkdStatus === 'expired' || 
        d.gkdStatus === 'warning' || 
        d.maintenanceStatus === 'expired' || 
        d.maintenanceStatus === 'warning'
      )
      .sort((a, b) => a.urgentScore - b.urgentScore);
  }, [processedDevices]);

  // Custom Tooltip for Device Bar Chart
  const CustomDeviceBarTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-900 text-white p-3.5 rounded-xl shadow-xl border border-slate-700 text-xs max-w-xs z-50">
          <div className="font-bold text-sm text-slate-100 mb-1">{data.fullName}</div>
          <div className="text-[11px] text-slate-400 font-mono mb-2">
            Model: <span className="text-slate-200">{data.model}</span> | S/N: <span className="text-slate-200">{data.serial}</span>
          </div>
          <div className="space-y-1.5 border-t border-slate-800 pt-2">
            {data.hasGkd && (
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-blue-400 font-medium">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  Hạn kiểm định (GKĐ):
                </span>
                <span className={`font-bold font-mono ${
                  data.gkdDays < 0 ? 'text-red-400' : data.gkdDays <= warningDaysGKD ? 'text-amber-400' : 'text-emerald-400'
                }`}>
                  {data.gkdDays < 0 ? `Quá hạn ${Math.abs(data.gkdDays)} ngày` : `Còn ${data.gkdDays} ngày`}
                </span>
              </div>
            )}
            {data.hasBd && (
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-purple-400 font-medium">
                  <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                  Hạn bảo trì (BD):
                </span>
                <span className={`font-bold font-mono ${
                  data.bdDays < 0 ? 'text-red-400' : data.bdDays <= warningDaysBD ? 'text-amber-400' : 'text-emerald-400'
                }`}>
                  {data.bdDays < 0 ? `Quá hạn ${Math.abs(data.bdDays)} ngày` : `Còn ${data.bdDays} ngày`}
                </span>
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden min-h-0">
      {/* Top Header / View Filter Bar */}
      <div className="p-6 border-b border-slate-100 bg-slate-50/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <BarChart3 size={22} className="stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
                Biểu đồ Thống kê Thiết bị Sắp đến hạn & Cần bảo trì
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-100 text-blue-800">
                  Recharts
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Giám sát trực quan hạn kiểm định định kỳ (GKĐ/GCP) và thời gian chu kỳ bảo dưỡng trang thiết bị y tế
              </p>
            </div>
          </div>
        </div>

        {/* Filter Pill Controls */}
        <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-slate-200 shadow-xs self-start md:self-auto">
          <button
            onClick={() => setFilterView('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              filterView === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            Tất cả ({processedDevices.length})
          </button>
          <button
            onClick={() => setFilterView('urgent')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              filterView === 'urgent'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-rose-600 hover:bg-rose-50'
            }`}
          >
            <AlertTriangle size={13} />
            Cần xử lý gấp ({summaryStats.totalUrgentDevices})
          </button>
          <button
            onClick={() => setFilterView('gkd')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              filterView === 'gkd'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            Kiểm định ({summaryStats.gkdExpired + summaryStats.gkdWarning})
          </button>
          <button
            onClick={() => setFilterView('bd')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              filterView === 'bd'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            Bảo trì ({summaryStats.bdExpired + summaryStats.bdWarning})
          </button>
        </div>
      </div>

      {/* Main Body: Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
        {/* KPI Cards Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-4 flex items-center justify-between shadow-xs">
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Tổng số máy theo dõi</div>
              <div className="text-2xl font-black text-slate-800 mt-1">{summaryStats.total}</div>
              <div className="text-[11px] text-slate-500 font-medium mt-0.5">Phòng thiết bị X-Quang</div>
            </div>
            <div className="w-12 h-12 bg-white rounded-2xl border border-slate-200/60 flex items-center justify-center text-slate-600 shadow-xs">
              <Layers size={22} />
            </div>
          </div>

          <div className="bg-rose-50/50 border border-rose-100 rounded-2xl p-4 flex items-center justify-between shadow-xs">
            <div>
              <div className="text-[11px] font-bold text-rose-500 uppercase tracking-wider">Cần kiểm định khẩn</div>
              <div className="text-2xl font-black text-rose-600 mt-1">
                {summaryStats.gkdExpired + summaryStats.gkdWarning}
              </div>
              <div className="text-[11px] text-rose-600/80 font-medium mt-0.5">
                {summaryStats.gkdExpired} quá hạn • {summaryStats.gkdWarning} cận hạn
              </div>
            </div>
            <div className="w-12 h-12 bg-white rounded-2xl border border-rose-100 flex items-center justify-center text-rose-600 shadow-xs">
              <ShieldAlert size={22} />
            </div>
          </div>

          <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-4 flex items-center justify-between shadow-xs">
            <div>
              <div className="text-[11px] font-bold text-amber-600 uppercase tracking-wider">Cần bảo dưỡng kỹ thuật</div>
              <div className="text-2xl font-black text-amber-600 mt-1">
                {summaryStats.bdExpired + summaryStats.bdWarning}
              </div>
              <div className="text-[11px] text-amber-600/80 font-medium mt-0.5">
                {summaryStats.bdExpired} quá hạn • {summaryStats.bdWarning} cận hạn
              </div>
            </div>
            <div className="w-12 h-12 bg-white rounded-2xl border border-amber-100 flex items-center justify-center text-amber-600 shadow-xs">
              <Wrench size={22} />
            </div>
          </div>

          <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-4 flex items-center justify-between shadow-xs">
            <div>
              <div className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">Tỷ lệ đạt chuẩn an toàn</div>
              <div className="text-2xl font-black text-emerald-600 mt-1">
                {summaryStats.complianceRate}%
              </div>
              <div className="text-[11px] text-emerald-600/80 font-medium mt-0.5">
                {summaryStats.total - summaryStats.totalUrgentDevices} / {summaryStats.total} thiết bị hợp lệ
              </div>
            </div>
            <div className="w-12 h-12 bg-white rounded-2xl border border-emerald-100 flex items-center justify-center text-emerald-600 shadow-xs">
              <CheckCircle2 size={22} />
            </div>
          </div>
        </div>

        {/* Primary Chart: Số ngày còn lại đến hạn Kiểm định & Bảo trì theo từng Thiết bị */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-slate-100 gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <span>Số ngày còn lại đến hạn Kiểm định & Bảo trì của từng thiết bị</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Cột hiển thị số ngày còn lại (giá trị âm & đỏ biểu thị đã quá hạn cần xử lý gấp)
              </p>
            </div>

            {/* Toggle Bar View Mode */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400 font-medium hidden sm:inline">Hiển thị:</span>
              <div className="inline-flex p-0.5 bg-slate-100 rounded-lg">
                <button
                  onClick={() => setBarChartMode('both')}
                  className={`px-2.5 py-1 rounded-md font-semibold text-[11px] transition-all cursor-pointer ${
                    barChartMode === 'both' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Cả 2 chỉ số
                </button>
                <button
                  onClick={() => setBarChartMode('gkd')}
                  className={`px-2.5 py-1 rounded-md font-semibold text-[11px] transition-all cursor-pointer ${
                    barChartMode === 'gkd' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Chỉ Kiểm định
                </button>
                <button
                  onClick={() => setBarChartMode('bd')}
                  className={`px-2.5 py-1 rounded-md font-semibold text-[11px] transition-all cursor-pointer ${
                    barChartMode === 'bd' ? 'bg-white text-purple-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Chỉ Bảo trì
                </button>
              </div>
            </div>
          </div>

          <div className="h-80 w-full">
            {deviceBarData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={deviceBarData}
                  margin={{ top: 15, right: 30, left: 10, bottom: 45 }}
                  barGap={4}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis 
                    dataKey="shortName" 
                    tick={{ fontSize: 11, fill: '#64748b' }} 
                    angle={-20}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis 
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    label={{ value: 'Số ngày còn lại', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#94a3b8' }}
                  />
                  <Tooltip content={<CustomDeviceBarTooltip />} />
                  <Legend 
                    verticalAlign="top" 
                    align="right" 
                    wrapperStyle={{ paddingBottom: '10px', fontSize: '12px' }} 
                  />
                  <ReferenceLine y={0} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 4" label={{ value: 'Mốc hết hạn', fill: '#ef4444', fontSize: 10, position: 'right' }} />
                  
                  {(barChartMode === 'both' || barChartMode === 'gkd') && (
                    <Bar 
                      dataKey="gkdDays" 
                      name="Kiểm định (GKĐ) - Ngày" 
                      fill={COLORS.gkdPrimary} 
                      radius={[4, 4, 0, 0]}
                    >
                      {deviceBarData.map((entry, index) => {
                        let cellColor = COLORS.gkdPrimary;
                        if (entry.gkdDays < 0) cellColor = COLORS.expired;
                        else if (entry.gkdDays <= warningDaysGKD) cellColor = COLORS.warning;
                        return <Cell key={`cell-gkd-${index}`} fill={cellColor} />;
                      })}
                    </Bar>
                  )}

                  {(barChartMode === 'both' || barChartMode === 'bd') && (
                    <Bar 
                      dataKey="bdDays" 
                      name="Bảo trì (BD) - Ngày" 
                      fill={COLORS.bdPrimary} 
                      radius={[4, 4, 0, 0]}
                    >
                      {deviceBarData.map((entry, index) => {
                        let cellColor = COLORS.bdPrimary;
                        if (entry.bdDays < 0) cellColor = COLORS.expired;
                        else if (entry.bdDays <= warningDaysBD) cellColor = COLORS.warning;
                        return <Cell key={`cell-bd-${index}`} fill={cellColor} />;
                      })}
                    </Bar>
                  )}
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400">
                <AlertCircle size={32} className="mb-2 opacity-40" />
                <p className="text-xs">Không có dữ liệu thiết bị phù hợp với bộ lọc hiện tại</p>
              </div>
            )}
          </div>

          <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-500">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                <span>Đã quá hạn (&lt; 0 ngày)</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                <span>Cận hạn cảnh báo (&le; {warningDaysGKD} ngày)</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                <span>Đang hợp lệ</span>
              </span>
            </div>
            <span className="text-slate-400 italic">
              *Mẹo: Nhấn vào thiết bị trong danh sách bên dưới để xem/cập nhật hồ sơ.
            </span>
          </div>
        </div>

        {/* Secondary Charts Grid (Donut Pie Charts + Time Horizon Chart) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Donut 1: Kiểm định GKĐ */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col">
            <div className="mb-2">
              <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <ShieldAlert size={16} className="text-blue-600" />
                Tỉ lệ Kiểm định & An toàn
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">Phân bổ tình trạng giấy kiểm định (GKĐ/GCP)</p>
            </div>

            <div className="h-56 w-full relative flex items-center justify-center">
              {inspectionPieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={inspectionPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {inspectionPieData.map((entry, index) => (
                        <Cell key={`pie-gkd-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: any, name: any) => [`${value} thiết bị`, name]} 
                      contentStyle={{ borderRadius: '12px', fontSize: '12px', borderColor: '#e2e8f0' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-xs text-slate-400">Chưa có dữ liệu</p>
              )}
              {/* Inner Center Label */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-black text-slate-800">{summaryStats.total}</span>
                <span className="text-[9px] uppercase tracking-wider font-bold text-slate-400">Thiết bị</span>
              </div>
            </div>

            <div className="space-y-1.5 mt-auto pt-3 border-t border-slate-100 text-xs">
              {inspectionPieData.map(item => (
                <div key={item.name} className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-slate-600">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }}></span>
                    <span>{item.name}</span>
                  </span>
                  <span className="font-bold text-slate-800 font-mono">
                    {item.value} ({summaryStats.total > 0 ? Math.round((item.value / summaryStats.total) * 100) : 0}%)
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Donut 2: Bảo trì BD */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col">
            <div className="mb-2">
              <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Wrench size={16} className="text-purple-600" />
                Tỉ lệ Bảo trì Định kỳ
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">Phân bổ tiến độ chu kỳ bảo dưỡng kỹ thuật</p>
            </div>

            <div className="h-56 w-full relative flex items-center justify-center">
              {maintenancePieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={maintenancePieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {maintenancePieData.map((entry, index) => (
                        <Cell key={`pie-bd-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: any, name: any) => [`${value} thiết bị`, name]} 
                      contentStyle={{ borderRadius: '12px', fontSize: '12px', borderColor: '#e2e8f0' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-xs text-slate-400">Chưa có dữ liệu</p>
              )}
              {/* Inner Center Label */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-black text-slate-800">{summaryStats.total}</span>
                <span className="text-[9px] uppercase tracking-wider font-bold text-slate-400">Chu kỳ BD</span>
              </div>
            </div>

            <div className="space-y-1.5 mt-auto pt-3 border-t border-slate-100 text-xs">
              {maintenancePieData.map(item => (
                <div key={item.name} className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-slate-600">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }}></span>
                    <span>{item.name}</span>
                  </span>
                  <span className="font-bold text-slate-800 font-mono">
                    {item.value} ({summaryStats.total > 0 ? Math.round((item.value / summaryStats.total) * 100) : 0}%)
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Chart 3: Phân nhóm Mốc thời gian (Thời hạn xử lý) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col">
            <div className="mb-2">
              <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Calendar size={16} className="text-emerald-600" />
                Kế hoạch theo Khung thời gian
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">Số lượng máy cần xử lý theo từng mốc thời gian</p>
            </div>

            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={timeHorizonData}
                  layout="vertical"
                  margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} allowDecimals={false} />
                  <YAxis 
                    type="category" 
                    dataKey="label" 
                    tick={{ fontSize: 10, fill: '#64748b' }} 
                    width={105}
                  />
                  <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '11px', borderColor: '#e2e8f0' }} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Bar dataKey="gkd" name="Kiểm định (máy)" fill={COLORS.gkdPrimary} radius={[0, 4, 4, 0]} />
                  <Bar dataKey="bd" name="Bảo trì (máy)" fill={COLORS.bdPrimary} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-auto pt-3 border-t border-slate-100 text-[11px] text-slate-400 italic">
              Giúp dự trù ngân sách và lên lịch làm việc trước với đơn vị kiểm định & kỹ thuật viên.
            </div>
          </div>
        </div>

        {/* Priority Action Queue: Danh sách các máy cần ưu tiên can thiệp */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
                <AlertTriangle size={18} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">
                  Hàng đợi Ưu tiên Xử lý Cận hạn & Quá hạn ({urgentQueue.length} thiết bị)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Danh sách sắp xếp theo độ cấp thiết cao nhất cần kiểm định hoặc bảo dưỡng ngay
                </p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            {urgentQueue.length > 0 ? (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                    <th className="px-5 py-3">Thiết bị / Model</th>
                    <th className="px-5 py-3">Phụ trách</th>
                    <th className="px-5 py-3">Tình trạng Kiểm định (GKĐ)</th>
                    <th className="px-5 py-3">Tình trạng Bảo trì (BD)</th>
                    <th className="px-5 py-3 text-right">Thao tác nhanh</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {urgentQueue.map(item => (
                    <tr 
                      key={item.id} 
                      className="hover:bg-slate-50/70 transition-colors cursor-pointer group"
                      onClick={() => onSelectDevice?.(item.device)}
                    >
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-slate-800 group-hover:text-blue-600 transition-colors">
                          {item.name}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
                          <span>{item.model}</span>
                          <span>•</span>
                          <span>SN: {item.serialNumber}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-slate-600">
                        {item.manager}
                      </td>
                      <td className="px-5 py-3.5">
                        {item.gkdStatus === 'expired' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-red-50 text-red-700 border border-red-200 font-bold text-[10px]">
                            <ShieldAlert size={12} />
                            Quá hạn ({Math.abs(item.minInspectionDays || 0)} ngày)
                          </span>
                        ) : item.gkdStatus === 'warning' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200 font-bold text-[10px]">
                            <Clock size={12} />
                            Cận hạn (còn {item.minInspectionDays} ngày)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 font-bold text-[10px]">
                            <CheckCircle2 size={12} />
                            Còn {item.minInspectionDays} ngày
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        {item.maintenanceStatus === 'expired' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-red-50 text-red-700 border border-red-200 font-bold text-[10px]">
                            <Wrench size={12} />
                            Quá hạn ({Math.abs(item.maintenanceDays || 0)} ngày)
                          </span>
                        ) : item.maintenanceStatus === 'warning' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200 font-bold text-[10px]">
                            <Clock size={12} />
                            Cần bảo trì (còn {item.maintenanceDays} ngày)
                          </span>
                        ) : item.maintenanceStatus === 'ok' ? (
                          <span className="text-slate-500 font-normal">
                            Định kỳ còn {item.maintenanceDays} ngày
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Chưa đặt chu kỳ</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="inline-flex items-center gap-2" onClick={e => e.stopPropagation()}>
                          {onConfirmDone && (item.gkdStatus === 'expired' || item.gkdStatus === 'warning') && (
                            <button
                              onClick={() => onConfirmDone(item.id, 'GKD')}
                              className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-[11px] transition-all cursor-pointer"
                              title="Xác nhận hoàn thành kiểm định"
                            >
                              Gia hạn GKĐ
                            </button>
                          )}
                          <button
                            onClick={() => onSelectDevice?.(item.device)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                            title="Xem chi tiết hồ sơ thiết bị"
                          >
                            <ChevronRight size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-8 text-center text-slate-400">
                <CheckCircle2 size={36} className="mx-auto text-emerald-500 mb-2 opacity-80" />
                <p className="font-bold text-slate-700 text-sm">Tuyệt vời! Tất cả thiết bị đều trong hạn an toàn</p>
                <p className="text-xs text-slate-400 mt-1">Không có thiết bị nào đang trong tình trạng quá hạn kiểm định hoặc bảo trì khẩn cấp.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
