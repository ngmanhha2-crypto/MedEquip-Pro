/**
 * Vercel Serverless Function: Cron Job Automatic Scan & Notification
 * 
 * File path: /api/cron-notify.js
 * 
 * This endpoint is triggered daily by Vercel Cron Jobs (configured in vercel.json).
 * It scans all devices in Firestore and automatically sends alerts (Telegram, Email) 
 * when devices are close to expiring or overdue.
 */

import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

// Helper: Calculate remaining days
function getDaysRemaining(dateStr) {
  if (!dateStr) return null;
  const expiry = new Date(dateStr);
  if (isNaN(expiry.getTime())) return null;
  const today = new Date();
  
  // Strip times for precise day-to-day diff
  today.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);
  
  const diffTime = expiry - today;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// Helper: Format date for display (dd/MM/yyyy)
function formatDisplayDate(dateStr) {
  if (!dateStr) return 'Chưa cập nhật';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    }
  } catch (e) {}
  return dateStr;
}

export default async function handler(req, res) {
  console.log("=== BAT DAU TIEN TRINH QUET TU DONG CRON JOB ===");

  // Fallback credentials from Vercel Environment Variables
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.VITE_TELEGRAM_BOT_TOKEN;
  const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || process.env.VITE_TELEGRAM_CHAT_ID;
  const RECIPIENT_EMAIL = process.env.RECIPIENT_EMAIL || process.env.VITE_RECIPIENT_EMAIL;
  const RESEND_API_KEY = process.env.RESEND_API_KEY;

  // Handle Firebase initialization
  if (admin.apps.length === 0) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        let serviceAccount;
        const rawSA = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
        if (rawSA.startsWith('{')) {
          serviceAccount = JSON.parse(rawSA);
        } else {
          // In case it's base64 encoded or formatted differently
          const decoded = Buffer.from(rawSA, 'base64').toString('utf8');
          serviceAccount = JSON.parse(decoded);
        }

        if (serviceAccount.private_key) {
          serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
        }

        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
      } catch (err) {
        console.error("Loi doc tai khoan dich vu FIREBASE_SERVICE_ACCOUNT:", err);
        return res.status(500).json({ 
          success: false, 
          error: "Sai cau hinh FIREBASE_SERVICE_ACCOUNT",
          details: err.message,
          suggestion: "Vui lòng kiểm tra xem biến môi trường FIREBASE_SERVICE_ACCOUNT trên Vercel đã đúng định dạng JSON chưa."
        });
      }
    } else {
      // Setup default config from json
      try {
        const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        admin.initializeApp({
          projectId: config.projectId
        });
      } catch (err) {
        console.warn("Khong the tai default firebase config. Thu khoi tao mac dinh:", err.message);
        admin.initializeApp();
      }
    }
  }

  const db = admin.firestore();
  
  try {
    // 1. Fetch all devices across all users
    console.log("Dang truy van danh sach thiet bi tu Firestore...");
    const devicesSnap = await db.collection('devices').get();
    
    if (devicesSnap.empty) {
      console.log("Khong tim thay thiet bi nao trong co so du lieu.");
      return res.status(200).json({
        success: true,
        message: "Quá trình quét hoàn tất. Không có thiết bị nào trong hệ thống.",
        devicesScanned: 0
      });
    }

    const devices = [];
    devicesSnap.forEach(doc => {
      devices.push({ id: doc.id, ...doc.data() });
    });

    console.log(`Tim thay ${devices.length} thiet bi. Bat dau phan tich cac dong den ban han...`);

    // Standard warnings settings
    const warningDaysGKD = parseInt(process.env.WARNING_DAYS_GKD || '30', 10);
    const warningDaysGCP = parseInt(process.env.WARNING_DAYS_GCP || '30', 10);

    // Filter list of alert devices
    const expiredList = [];
    const warningList = [];

    devices.forEach(d => {
      const gkdDays = getDaysRemaining(d.expiryGKD);
      const gcpDays = getDaysRemaining(d.expiryGCP);

      const dStatus = {
        name: d.name,
        model: d.model,
        serialNumber: d.serialNumber,
        expiryGKD: d.expiryGKD,
        expiryGCP: d.expiryGCP,
        gkdRemaining: gkdDays,
        gcpRemaining: gcpDays,
        userId: d.userId
      };

      // Check Expired
      const isExpired = (gkdDays !== null && gkdDays < 0) || (gcpDays !== null && gcpDays < 0);
      // Check Near Expiry (within config warning days)
      const isWarning = (gkdDays !== null && gkdDays >= 0 && gkdDays <= warningDaysGKD) || 
                        (gcpDays !== null && gcpDays >= 0 && gcpDays <= warningDaysGCP);

      if (isExpired) {
        expiredList.push(dStatus);
      } else if (isWarning) {
        warningList.push(dStatus);
      }
    });

    console.log(`Ket qua quet: ${expiredList.length} thiet bi da het han, ${warningList.length} thiet bi sap toi han.`);

    // 2. Perform notifications if there is any alert
    if (expiredList.length === 0 && warningList.length === 0) {
      console.log("Moi thiet bi deu an toan. Khong can gui thong bao.");
      return res.status(200).json({
        success: true,
        message: "Không tìm thấy thiết bị nào cần cảnh báo hôm nay.",
        devicesScanned: devices.length,
        expired: 0,
        warning: 0
      });
    }

    // Prepare notifications body
    const todayStr = formatDisplayDate(new Date().toISOString().split('T')[0]);

    // Let's format Telegram Message
    let telegramMsg = `🔔 <b>CẢNH BÁO THỜI HẠN THIẾT BỊ ĐỊNH KỲ</b>\n`;
    telegramMsg += `<i>Ngày quét: ${todayStr}</i>\n\n`;

    if (expiredList.length > 0) {
      telegramMsg += `🔴 <b>HẾT HẠN (${expiredList.length}):</b>\n`;
      expiredList.forEach((d, idx) => {
        telegramMsg += `${idx + 1}. <b>${d.name}</b> M: <i>${d.model}</i> - S/N: <code>${d.serialNumber}</code>\n`;
        if (d.gkdRemaining !== null && d.gkdRemaining < 0) {
          telegramMsg += `   • Kiểm định hết hạn: ${formatDisplayDate(d.expiryGKD)} (Quá ${Math.abs(d.gkdRemaining)} ngày)\n`;
        }
        if (d.gcpRemaining !== null && d.gcpRemaining < 0) {
          telegramMsg += `   • Giấy phép hết hạn: ${formatDisplayDate(d.expiryGCP)} (Quá ${Math.abs(d.gcpRemaining)} ngày)\n`;
        }
      });
      telegramMsg += `\n`;
    }

    if (warningList.length > 0) {
      telegramMsg += `⚠️ <b>SẮP HẾT HẠN (${warningList.length}):</b>\n`;
      warningList.forEach((d, idx) => {
        telegramMsg += `${idx + 1}. <b>${d.name}</b> M: <i>${d.model}</i> - S/N: <code>${d.serialNumber}</code>\n`;
        if (d.gkdRemaining !== null && d.gkdRemaining >= 0 && d.gkdRemaining <= warningDaysGKD) {
          telegramMsg += `   • Kiểm định còn: ${d.gkdRemaining} ngày (${formatDisplayDate(d.expiryGKD)})\n`;
        }
        if (d.gcpRemaining !== null && d.gcpRemaining >= 0 && d.gcpRemaining <= warningDaysGCP) {
          telegramMsg += `   • Giấy phép còn: ${d.gcpRemaining} ngày (${formatDisplayDate(d.expiryGCP)})\n`;
        }
      });
    }

    telegramMsg += `\n🔗 Truy cập ứng dụng để xử lý ngay.`;

    // A. Send via Telegram
    let telegramSent = false;
    if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
      console.log(`Dang gui canh bao toi Telegram chat ${TELEGRAM_CHAT_ID}...`);
      try {
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: TELEGRAM_CHAT_ID,
            text: telegramMsg,
            parse_mode: 'HTML'
          })
        });
        if (response.ok) {
          telegramSent = true;
          console.log("Gui tin nhan Telegram thanh cong!");
        } else {
          const errText = await response.text();
          console.error("Loi gui Telegram tu API:", errText);
        }
      } catch (err) {
        console.error("Loi ket noi Telegram API:", err);
      }
    } else {
      console.log("Chua cau hinh thong tin nhan Telegram (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID). Bo qua.");
    }

    // B. Send via Email (using Resend API)
    let emailSent = false;
    if (RESEND_API_KEY && RECIPIENT_EMAIL) {
      console.log(`Dang gui email canh bao toi ${RECIPIENT_EMAIL} qua Resend API...`);
      
      // Build aesthetic HTML email body
      let htmlBody = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
          <div style="padding-bottom: 20px; border-bottom: 1px solid #f1f5f9; text-align: center;">
            <h1 style="color: #0f172a; font-size: 20px; margin: 0;">Báo Cáo Tình Trạng Thiết Bị Định Kỳ</h1>
            <p style="color: #64748b; font-size: 14px; margin: 5px 0 0 0;">Ngày kiểm tra: ${todayStr}</p>
          </div>
          <div style="padding: 20px 0;">
      `;

      if (expiredList.length > 0) {
        htmlBody += `
          <div style="margin-bottom: 25px;">
            <h2 style="color: #ef4444; font-size: 16px; margin-bottom: 10px; border-bottom: 2px solid #fee2e2; padding-bottom: 5px;">🔴 ĐÃ QUÁ HẠN (${expiredList.length})</h2>
            <table style="width: 100%; border-collapse: collapse;">
        `;
        expiredList.forEach(d => {
          htmlBody += `
            <tr style="border-bottom: 1px solid #f8fafc;">
              <td style="padding: 8px 0; font-weight: bold; font-size: 14px; color: #1e293b;">${d.name} (${d.model})</td>
              <td style="padding: 8px 0; font-size: 12px; color: #ef4444; text-align: right;">
                ${d.gkdRemaining < 0 ? `Kiểm định quá hạn ${Math.abs(d.gkdRemaining)} ngày<br/>` : ''}
                ${d.gcpRemaining < 0 ? `Giấy phép quá hạn ${Math.abs(d.gcpRemaining)} ngày` : ''}
              </td>
            </tr>
          `;
        });
        htmlBody += `</table></div>`;
      }

      if (warningList.length > 0) {
        htmlBody += `
          <div style="margin-bottom: 25px;">
            <h2 style="color: #f97316; font-size: 16px; margin-bottom: 10px; border-bottom: 2px solid #ffedd5; padding-bottom: 5px;">⚠️ SẮP HẾT HẠN (${warningList.length})</h2>
            <table style="width: 100%; border-collapse: collapse;">
        `;
        warningList.forEach(d => {
          htmlBody += `
            <tr style="border-bottom: 1px solid #f8fafc;">
              <td style="padding: 8px 0; font-weight: bold; font-size: 14px; color: #1e293b;">${d.name} (${d.model})</td>
              <td style="padding: 8px 0; font-size: 12px; color: #f97316; text-align: right;">
                ${d.gkdRemaining !== null && d.gkdRemaining >= 0 && d.gkdRemaining <= warningDaysGKD ? `Kiểm định còn ${d.gkdRemaining} ngày<br/>` : ''}
                ${d.gcpRemaining !== null && d.gcpRemaining >= 0 && d.gcpRemaining <= warningDaysGCP ? `Giấy phép còn ${d.gcpRemaining} ngày` : ''}
              </td>
            </tr>
          `;
        });
        htmlBody += `</table></div>`;
      }

      htmlBody += `
          </div>
          <div style="padding-top: 15px; border-top: 1px solid #f1f5f9; text-align: center; font-size: 11px; color: #94a3b8;">
            Vui lòng duy trì cập nhật thiết bị thường xuyên. Đây là email tự động từ MedEquip Manager.
          </div>
        </div>
      `;

      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${RESEND_API_KEY}`
          },
          body: JSON.stringify({
            from: 'MedEquip Manager <onboarding@resend.dev>',
            to: RECIPIENT_EMAIL,
            subject: `[CẢNH BÁO] Hệ thống MedEquip: Có ${expiredList.length + warningList.length} hồ sơ cần cập nhật!`,
            html: htmlBody
          })
        });

        if (response.ok) {
          emailSent = true;
          console.log("Gui Email qua Resend thanh cong!");
        } else {
          const errText = await response.text();
          console.error("Loi gui Email tu Resend API:", errText);
        }
      } catch (err) {
        console.error("Loi tien hanh gui Email API:", err);
      }
    } else {
      console.log("Chua cau hinh email nguoi nhan hoac RESEND_API_KEY. Bo qua.");
    }

    return res.status(200).json({
      success: true,
      message: "Quá trình kiểm tra và thông báo hoàn tất.",
      devicesScanned: devices.length,
      alertsTelegram: telegramSent ? "Đã gửi" : "Không gửi (Chưa cấu hình)",
      alertsEmail: emailSent ? "Đã gửi" : "Không gửi (Chưa cấu hình)",
      details: {
        expired: expiredList.length,
        warning: warningList.length
      }
    });

  } catch (err) {
    console.error("Loi trong tien trinh chay Cron:", err);
    
    const errStr = err.message || String(err);
    const isCredsError = errStr.includes("credentials") || errStr.includes("credential") || errStr.includes("default credentials") || errStr.includes("FIREBASE_SERVICE_ACCOUNT");

    if (isCredsError) {
      const suggestHtml = `
        <!DOCTYPE html>
        <html lang="vi">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Hướng dẫn Cấu hình Firebase Admin - MedEquip</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 40px; line-height: 1.6; max-width: 800px; margin: 0 auto; }
            h1 { color: #38bdf8; border-bottom: 2px solid #334155; padding-bottom: 10px; font-weight: 800; font-size: 24px; }
            h2 { color: #e2e8f0; font-size: 18px; margin-top: 30px; }
            code, pre { background-color: #1e293b; color: #38bdf8; padding: 4px 8px; border-radius: 6px; font-family: monospace; font-size: 13px; }
            pre { padding: 15px; overflow-x: auto; border: 1px solid #334155; border-radius: 12px; }
            .step { display: flex; margin-bottom: 20px; align-items: flex-start; }
            .step-number { background-color: #38bdf8; color: #010409; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; margin-right: 15px; flex-shrink: 0; }
            .step-text { flex: 1; }
            .tip { background-color: #0c4a6e; border-left: 4px solid #0284c7; padding: 15px; border-radius: 8px; font-size: 14px; color: #e0f2fe; margin: 25px 0; }
            .error-box { background-color: #451a03; border-left: 4px solid #f97316; padding: 15px; border-radius: 8px; font-size: 14px; color: #ffedd5; margin: 25px 0; }
          </style>
        </head>
        <body>
          <h1>🔒 Cần Cấu hình Tài khoản Dịch vụ Firebase Admin (Vercel API)</h1>
          <p>Để API chạy tự động quét (Cron Job) trên môi trường <strong>Vercel</strong> bảo mật của bạn hoạt động, bạn cần cung cấp thông tin <strong>Firebase Service Account Key</strong> bảo mật của hệ thống.</p>
          
          <div class="error-box">
            <strong>Chi tiết lỗi hệ thống:</strong> Could not load credentials. Firebase không thể xác thực tự động trên Vercel khi thiếu chuỗi khóa bảo mật.
          </div>

          <h2>🛠️ Các bước khắc phục nhanh (Chỉ mất 2 phút):</h2>
          
          <div class="step">
            <div class="step-number">1</div>
            <div class="step-text">
              Truy cập vào <strong><a href="https://console.firebase.google.com" target="_blank" style="color: #38bdf8; text-decoration: underline;">Firebase Console</a></strong>, chọn dự án của bạn (<code>quanlythietbiyte-babd8</code>).
            </div>
          </div>

          <div class="step">
            <div class="step-number">2</div>
            <div class="step-text">
              Bấm vào biểu tượng <strong>Bánh Răng Cài Đặt (Project Settings)</strong> ở thực đơn góc trái phía trên -> Chọn tab <strong>"Service Accounts" (Tài khoản dịch vụ)</strong>.
            </div>
          </div>

          <div class="step">
            <div class="step-number">3</div>
            <div class="step-text">
              Chọn cấu hình là <strong>"Node.js"</strong> và click chuột vào nút màu xanh <strong>"Generate new private key" (Tạo khóa riêng tư mới)</strong>. Một tệp tin có định dạng <code>.json</code> chứa mã khóa bí mật sẽ được tải xuống máy tính của bạn.
            </div>
          </div>

          <div class="step">
            <div class="step-number">4</div>
            <div class="step-text">
              Mở file <code>.json</code> vừa tải về bằng bất kỳ phần mềm đọc văn bản nào và sao chép toàn bộ nội dung của tệp đó.
            </div>
          </div>

          <div class="step">
            <div class="step-number">5</div>
            <div class="step-text">
              Mở trang quản trị dự án của bạn trên <strong>Vercel Dashboard</strong> hoặc <strong>GitHub Settings</strong> nơi triển khai mã nguồn -> Tìm phần <strong>Environment Variables (Biến môi trường)</strong>.
            </div>
          </div>

          <div class="step">
            <div class="step-number">6</div>
            <div class="step-text">
              Thêm một biến môi trường mới với:<br>
              • <strong>Name (Tên biến):</strong> <code>FIREBASE_SERVICE_ACCOUNT</code><br>
              • <strong>Value (Giá trị):</strong> <i>Dán toàn bộ nội dung file JSON bạn vừa copy ở Bước 4 vào đây.</i><br>
              Sau đó lưu lại và tiến hành Redeploy dự án hoặc Restart thì API Cron sẽ kết nối thông suốt cực kỳ bảo mật!
            </div>
          </div>

          <div class="tip">
            💡 <strong>Mẹo nhỏ bảo mật:</strong> Firebase Service Account Key là cực kỳ bảo mật, giúp ứng dụng backend Vercel được phép truy vấn dữ liệu từ Firestore của bạn định kỳ để tự động bắn cảnh báo qua Telegram / Email mà không cần mở tab trình duyệt!
          </div>
        </body>
        </html>
      `;

      if (req.headers.accept && req.headers.accept.includes('text/html')) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(200).send(suggestHtml);
      }

      return res.status(500).json({
        success: false,
        error: "Yêu cầu cấu hình FIREBASE_SERVICE_ACCOUNT",
        message: "Firebase setup requires valid service account credentials in process.env.FIREBASE_SERVICE_ACCOUNT for serverless environments.",
        steps: [
          "Mở Firebase Console dự án của bạn.",
          "Vào Project Settings -> Service Accounts.",
          "Bấm 'Generate new private key' chọn Node.js để tải JSON về.",
          "Copy nội dung file JSON dán vào biến môi trường FIREBASE_SERVICE_ACCOUNT trên Vercel của bạn."
        ]
      });
    }

    return res.status(500).json({
      success: false,
      error: err.message || String(err)
    });
  }
}
