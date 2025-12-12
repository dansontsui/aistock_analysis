// services/emailService.js
import nodemailer from 'nodemailer';

// Configure Transporter (Gmail)
const createTransporter = () => {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    console.warn("[Email] SMTP credentials missing in .env.local");
    return null;
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass }
  });
};

export const sendDailyReportEmail = async (report, subscribers = []) => {
  const transporter = createTransporter();
  if (!transporter) return false;

  // Merge Env Receiver + DB Subscribers
  let receivers = [];

  // Add Env Receiver (split by comma if multiple)
  if (process.env.RECEIVER_EMAIL) {
    receivers = [...receivers, ...process.env.RECEIVER_EMAIL.split(',')];
  }

  // Add DB Subscribers
  if (subscribers && Array.isArray(subscribers)) {
    receivers = [...receivers, ...subscribers];
  }

  // Clean, Trim, Deduplicate
  receivers = receivers
    .map(e => e.trim())
    .filter(e => e && e.includes('@')); // Simple validation
  receivers = [...new Set(receivers)];

  // Fallback
  if (receivers.length === 0) receivers.push(process.env.SMTP_USER);

  const receiverString = receivers.join(',');
  console.log(`[Email] Sending to: ${receiverString}`);

  // Format Email Body (HTML)
  const currentDate = report.date;
  const portfolio = report.finalists || [];

  const portfolioHtml = `
    <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
      <thead>
        <tr style="background-color: #f3f4f6; text-align: left;">
          <th style="padding: 12px; border: 1px solid #e5e7eb;">狀態</th>
          <th style="padding: 12px; border: 1px solid #e5e7eb;">代號</th>
          <th style="padding: 12px; border: 1px solid #e5e7eb;">名稱</th>
          <th style="padding: 12px; border: 1px solid #e5e7eb;">產業</th>
          <th style="padding: 12px; border: 1px solid #e5e7eb;">進場價</th>
          <th style="padding: 12px; border: 1px solid #e5e7eb;">報酬率</th>
          <th style="padding: 12px; border: 1px solid #e5e7eb;">理由</th>
        </tr>
      </thead>
      <tbody>
  ` + portfolio.map(stock => {
    const statusColor = stock.status === 'NEW' ? '#dc2626' : '#059669'; // Red for New, Green for Hold
    const statusText = stock.status === 'NEW' ? '🔥 新增' : '🛡️ 續抱';
    const roiColor = (stock.roi || 0) >= 0 ? '#dc2626' : '#059669';
    return `
      <tr>
        <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: bold; color: ${statusColor};">${statusText}</td>
        <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: bold;">${stock.code}</td>
        <td style="padding: 12px; border: 1px solid #e5e7eb;">${stock.name}</td>
        <td style="padding: 12px; border: 1px solid #e5e7eb; color: #6b7280;">${stock.industry}</td>
        <td style="padding: 12px; border: 1px solid #e5e7eb;">${stock.entryPrice}</td>
        <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: bold; color: ${roiColor};">${stock.roi ? stock.roi.toFixed(2) : '0.00'}%</td>
        <td style="padding: 12px; border: 1px solid #e5e7eb; font-size: 0.9em;">${stock.reason}</td>
      </tr>
    `;
  }).join('') + `</tbody></table>`;

  // Sold Stocks HTML
  const sold = report.sold || [];
  let soldHtml = '';
  if (sold.length > 0) {
    soldHtml = `
        <div style="margin-top: 30px; background-color: #fff; padding: 20px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); border: 1px solid #e5e7eb;">
          <h2 style="font-size: 1.25rem; font-weight: bold; margin-bottom: 15px; border-left: 4px solid #9ca3af; padding-left: 10px;">📉 已賣出/剔除 (Sold)</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background-color: #f3f4f6; text-align: left;">
                <th style="padding: 12px; border: 1px solid #e5e7eb;">代號</th>
                <th style="padding: 12px; border: 1px solid #e5e7eb;">名稱</th>
                <th style="padding: 12px; border: 1px solid #e5e7eb;">進場價</th>
                <th style="padding: 12px; border: 1px solid #e5e7eb;">出場價</th>
                <th style="padding: 12px; border: 1px solid #e5e7eb;">報酬率</th>
                <th style="padding: 12px; border: 1px solid #e5e7eb;">賣出理由</th>
              </tr>
            </thead>
            <tbody>
              ${sold.map(s => {
      const roiClass = s.roi >= 0 ? '#dc2626' : '#059669'; // Red for profit
      return `
                  <tr>
                    <td style="padding: 12px; border: 1px solid #e5e7eb;">${s.code}</td>
                    <td style="padding: 12px; border: 1px solid #e5e7eb;">${s.name}</td>
                    <td style="padding: 12px; border: 1px solid #e5e7eb;">${s.entryPrice}</td>
                    <td style="padding: 12px; border: 1px solid #e5e7eb;">${s.exitPrice}</td>
                    <td style="padding: 12px; border: 1px solid #e5e7eb; color: ${roiClass}; font-weight: bold;">${s.roi ? s.roi.toFixed(2) : 0}%</td>
                    <td style="padding: 12px; border: 1px solid #e5e7eb; font-size: 0.9em; color: #4b5563;">${s.reason || 'AI 判斷調整'}</td>
                  </tr>
                  `;
    }).join('')}
            </tbody>
          </table>
        </div>
        `;
  }

  const htmlContent = `
    <div style="font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; color: #374151;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #4f46e5; margin-bottom: 10px;">📊 AI 台股每日分析報告</h1>
        <p style="color: #6b7280;">日期：${currentDate}</p>
      </div>

      <div style="background-color: #fff; padding: 20px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); border: 1px solid #e5e7eb;">
        <h2 style="font-size: 1.25rem; font-weight: bold; margin-bottom: 15px; border-left: 4px solid #4f46e5; padding-left: 10px;">📰 市場摘要</h2>
        <p style="line-height: 1.6;">${report.newsSummary}</p>
      </div>

      <div style="margin-top: 30px; background-color: #fff; padding: 20px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); border: 1px solid #e5e7eb;">
        <h2 style="font-size: 1.25rem; font-weight: bold; margin-bottom: 15px; border-left: 4px solid #10b981; padding-left: 10px;">📈 目前最新持倉 (Current Portfolio)</h2>
        <p style="color: #6b7280; font-size: 0.9rem;">AI 已根據今日行情進行再平衡，以下是最新建議持股（上限 5 檔）：</p>
        ${portfolioHtml}
      </div>

      ${soldHtml}

      <!-- New Section: Candidates -->
       <div style="margin-top: 30px; background-color: #fff; padding: 20px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); border: 1px solid #e5e7eb;">
        <h2 style="font-size: 1.25rem; font-weight: bold; margin-bottom: 15px; border-left: 4px solid #f59e0b; padding-left: 10px;">⚡ AI 今日觀察名單 (Candidates)</h2>
        <p style="color: #6b7280; font-size: 0.9rem;">AI 根據市場題材篩選出的強勢股，列入觀察但不一定買進：</p>
        <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
          <thead>
            <tr style="background-color: #f3f4f6; text-align: left;">
              <th style="padding: 12px; border: 1px solid #e5e7eb;">代號</th>
              <th style="padding: 12px; border: 1px solid #e5e7eb;">名稱</th>
              <th style="padding: 12px; border: 1px solid #e5e7eb;">現價</th>
              <th style="padding: 12px; border: 1px solid #e5e7eb;">AI 分析觀點</th>
            </tr>
          </thead>
          <tbody>
            ${(report.candidates || []).map(c => `
              <tr>
                <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: bold;">${c.code}</td>
                <td style="padding: 12px; border: 1px solid #e5e7eb;">${c.name}</td>
                <td style="padding: 12px; border: 1px solid #e5e7eb;">${c.price}</td>
                <td style="padding: 12px; border: 1px solid #e5e7eb; font-size: 0.9em; color: #4b5563;">${c.reason}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>


      <div style="margin-top: 40px; text-align: center; color: #9ca3af; font-size: 0.8rem;">
        <p>此信件由 Google Cloud Run 自動發送</p>
        <p>AI 分析僅供參考，投資請自負風險</p>
      </div>
    </div>
  `;

  try {
    const info = await transporter.sendMail({
      from: `"AI Stock Analyst" <${process.env.SMTP_USER}>`,
      to: receiverString,
      subject: `[AI Stock] 每日投資組合報告 - ${currentDate}`,
      html: htmlContent
    });
    console.log(`[Email] Sent: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error("[Email] Send Failed:", error);
    return false;
  }
};
