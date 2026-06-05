import { differenceInDays, parseISO, isValid, format, addMonths } from 'date-fns';

export const getDaysRemaining = (expiryDateStr: string): number | null => {
  if (!expiryDateStr) return null;
  const expiryDate = parseISO(expiryDateStr);
  if (!isValid(expiryDate)) return null;
  
  return differenceInDays(expiryDate, new Date());
};

export const getStatusColor = (days: number | null, warningDays: number = 30) => {
  if (days === null) return 'text-gray-400';
  if (days < 0) return 'text-red-500 font-bold';
  if (days <= warningDays) return 'text-orange-500 font-medium';
  return 'text-green-600';
};

export const formatDisplayDate = (dateStr: string) => {
  if (!dateStr || dateStr.trim() === '') return 'Chưa cập nhật dữ liệu';
  const date = parseISO(dateStr);
  if (!isValid(date)) return 'Định dạng ngày không hợp lệ';
  return format(date, 'dd/MM/yyyy');
};

export const checkReminders = (days: number | null, warningDays: number = 30) => {
  if (days === null) return null;
  if (days >= 0 && days <= warningDays) {
    return `Thiết bị sắp hết hạn trong ${days} ngày!`;
  }
  return null;
};
