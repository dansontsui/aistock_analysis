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
    <table style="width: 100%; border-collapse: separate; border-spacing: 0; margin-top: 25px; font-family: 'Microsoft JhengHei', 'PingFang TC', 'Heiti TC', 'Helvetica Neue', Helvetica, Arial, sans-serif;">
      <thead>
        <tr style="background-color: #f8fafc; text-align: left;">
          <th style="padding: 16px; border-bottom: 2px solid #e2e8f0; color: #64748b; font-size: 15px; font-weight: 700;">狀態</th>
          <th style="padding: 16px; border-bottom: 2px solid #e2e8f0; color: #64748b; font-size: 15px; font-weight: 700;">代號</th>
          <th style="padding: 16px; border-bottom: 2px solid #e2e8f0; color: #64748b; font-size: 15px; font-weight: 700;">名稱</th>
          <th style="padding: 16px; border-bottom: 2px solid #e2e8f0; color: #64748b; font-size: 15px; font-weight: 700;">產業</th>
          <th style="padding: 16px; border-bottom: 2px solid #e2e8f0; color: #64748b; font-size: 15px; font-weight: 700;">進場價</th>
          <th style="padding: 16px; border-bottom: 2px solid #e2e8f0; color: #64748b; font-size: 15px; font-weight: 700;">報酬率</th>
          <th style="padding: 16px; border-bottom: 2px solid #e2e8f0; color: #64748b; font-size: 15px; font-weight: 700;">理由</th>
        </tr>
      </thead>
      <tbody>
  ` + portfolio.map((stock, index) => {
    const statusColor = stock.status === 'NEW' ? '#dc2626' : '#059669';
    const statusText = stock.status === 'NEW' ? '🔥 新增' : '🛡️ 續抱';
    const roiColor = (stock.roi || 0) >= 0 ? '#dc2626' : '#059669';
    // Zebra Striping logic
    const zebraColor = index % 2 === 0 ? '#ffffff' : '#f3f4f6';

    return `
      <tr style="background-color: ${zebraColor};">
        <td style="padding: 16px 12px; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: ${statusColor}; font-size: 16px;">${statusText}</td>
        <td style="padding: 16px 12px; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: #334155; font-size: 16px;">${stock.code}</td>
        <td style="padding: 16px 12px; border-bottom: 1px solid #e5e7eb; color: #334155; font-size: 16px;">${stock.name}</td>
        <td style="padding: 16px 12px; border-bottom: 1px solid #e5e7eb; color: #64748b; font-size: 16px;">${stock.industry}</td>
        <td style="padding: 16px 12px; border-bottom: 1px solid #e5e7eb; color: #334155; font-size: 16px;">${stock.entryPrice}</td>
        <td style="padding: 16px 12px; border-bottom: 1px solid #e5e7eb; font-weight: 800; color: ${roiColor}; font-size: 16px;">${stock.roi ? stock.roi.toFixed(2) : '0.00'}%</td>
        <td style="padding: 16px 12px; border-bottom: 1px solid #e5e7eb; font-size: 15px; color: #475569; line-height: 1.5;">${stock.reason}</td>
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
    <div style="font-family: 'Microsoft JhengHei', 'PingFang TC', 'Heiti TC', 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; color: #374151; background-color: #f8fafc;">
      <div style="text-align: center; margin-bottom: 35px; padding-bottom: 20px; border-bottom: 1px solid #e2e8f0;">
        <h1 style="color: #4338ca; margin-bottom: 5px; font-size: 32px; letter-spacing: 0.05em;">📊 AI 台股每日分析報告</h1>
        <p style="color: #64748b; font-size: 16px; margin-top: 5px;">日期：${currentDate}</p>
      </div>
      
      <!-- Market Summary Section -->
      <div style="background-color: #ffffff; padding: 30px; border-radius: 12px; box-shadow: 0 4px 15px -3px rgba(0, 0, 0, 0.1); border: 1px solid #e5e7eb;">
        <h2 style="font-size: 1.5rem; font-weight: 800; margin: 0 0 20px 0; border-left: 6px solid #4f46e5; padding-left: 15px; color: #111827; letter-spacing: -0.025em;">📰 市場摘要</h2>
        
        <div style="line-height: 1.8; color: #334155; font-size: 17px;">
        ${(() => {
      // Simple Markdown to HTML parser for Email
      let text = report.newsSummary || "暫無摘要";

      // 1. Headers (#### Title) -> <h3>Title</h3>
      text = text.replace(/####\s*(.*?)(?:\n|$)/g, '<h3 style="color: #4338ca; font-size: 20px; margin-top: 25px; margin-bottom: 15px; border-bottom: 1px dashed #cbd5e1; padding-bottom: 8px;">$1</h3>');

      // 2. Bold (**Text**) -> <strong style="color: #1e293b;">Text</strong>
      text = text.replace(/\*\*(.*?)\*\*/g, '<strong style="color: #0f172a; background-color: #f1f5f9; padding: 2px 6px; border-radius: 4px;">$1</strong>');

      // 3. Bullet points (* or - ) -> <li>
      // This is tricky with simple regex, let's just handle newlines first.

      // 4. Newlines -> <br> or <p>
      // Split by double newline to form paragraphs
      const paragraphs = text.split(/\n\s*\n/);
      return paragraphs.map(p => {
        // Handle single newlines within paragraph
        const content = p.replace(/\n/g, '<br/>');
        // If line starts with bullet, style it
        if (content.trim().startsWith('•') || content.trim().startsWith('-')) {
          return `<div style="margin-bottom: 12px; padding-left: 15px;">${content}</div>`;
        }
        return `<p style="margin-bottom: 18px;">${content}</p>`;
      }).join('');
    })()}
        </div>
      </div>

      <div style="margin-top: 35px; background-color: #ffffff; padding: 30px; border-radius: 12px; box-shadow: 0 4px 15px -3px rgba(0, 0, 0, 0.1); border: 1px solid #e5e7eb;">
        <h2 style="font-size: 1.5rem; font-weight: 800; margin: 0 0 25px 0; border-left: 6px solid #6366f1; padding-left: 15px; color: #111827; letter-spacing: -0.025em;">📊 績效追蹤 (Performance)</h2>
        
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: separate; border-spacing: 12px 0;">
          <tr>
            ${(() => {
      const stats = report.performance;
      if (!stats) return '<td colspan="3" style="text-align:center;">暫無績效數據</td>';

      const renderCell = (label, data, isHoldings = false) => {
        if (!data) return '';
        // Taiwan Stock Colors: Red is Good (Up), Green is Bad (Down)
        const getCol = (val) => val > 0 ? '#dc2626' : (val < 0 ? '#16a34a' : '#4b5563'); // Dark Red / Green
        // const getBg = (val) => val > 0 ? '#fef2f2' : (val < 0 ? '#f0fdf4' : '#f9fafb'); // Light Red / Green BG

        // Colors for specific metrics
        // const totalRoiColor = getCol(data.totalRoi);
        const bgStyle = isHoldings ? 'background: linear-gradient(145deg, #eef2ff 0%, #e0e7ff 100%); border: 1px solid #818cf8;' : 'background-color: #f8fafc; border: 1px solid #e2e8f0;';

        return `
                 <td width="33%" valign="top" style="${bgStyle} border-radius: 12px; padding: 20px; vertical-align: top;">
                   <div style="text-align: center;">
                      <h3 style="margin: 0 0 15px 0; color: #475569; font-size: 15px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700;">${label}</h3>
                      
                      <!-- Main Big Number (Total ROI) -->
                      <div style="font-size: 32px; font-weight: 800; color: ${getCol(data.totalRoi)}; line-height: 1;">
                        ${data.totalRoi ? (data.totalRoi > 0 ? '+' : '') + data.totalRoi.toFixed(1) : '0.0'}%
                      </div>
                      <div style="font-size: 13px; color: #94a3b8; margin-bottom: 15px;">Total ROI</div>

                      <!-- Divider -->
                      <div style="height: 1px; background-color: #e2e8f0; margin: 12px 15px;"></div>

                      <!-- Sub Stats -->
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td width="50%" style="text-align: center; border-right: 1px solid #e2e8f0;">
                             <div style="font-size: 13px; color: #64748b;">Win Rate</div>
                             <div style="font-size: 16px; font-weight: 700; color: #334155;">${data.winRate ? data.winRate.toFixed(0) : 0}%</div>
                          </td>
                          <td width="50%" style="text-align: center;">
                             <div style="font-size: 13px; color: #64748b;">Avg ROI</div>
                             <div style="font-size: 16px; font-weight: 700; color: ${getCol(data.avgRoi)};">
                               ${data.avgRoi ? (data.avgRoi > 0 ? '+' : '') + data.avgRoi.toFixed(1) : '0.0'}%
                             </div>
                          </td>
                        </tr>
                      </table>
                   </div>
                 </td>
                 `;
      };

      // Use an empty cell if we want spacing, but separate border-spacing handles it.
      return [
        renderCell('近 30 天績效', stats.month1, false),
        renderCell('近 3 個月績效', stats.month3, false),
        renderCell('目前持倉 (未實現)', stats.currentHoldings, true)
      ].join('');
    })()}
          </tr>
        </table>
      </div>

      <div style="margin-top: 35px; background-color: #fff; padding: 30px; border-radius: 12px; box-shadow: 0 4px 15px -3px rgba(0, 0, 0, 0.1); border: 1px solid #e5e7eb;">
        <h2 style="font-size: 1.5rem; font-weight: bold; margin-bottom: 20px; border-left: 6px solid #10b981; padding-left: 15px;">📈 目前最新持倉 (Current Portfolio)</h2>
        <p style="color: #6b7280; font-size: 1.1rem; margin-bottom: 20px;">AI 已根據今日行情進行再平衡，以下是最新建議持股（上限 5 檔）：</p>
        ${portfolioHtml}
      </div>

      ${soldHtml}

      <!-- New Section: Candidates -->
       <div style="margin-top: 35px; background-color: #ffffff; padding: 30px; border-radius: 12px; box-shadow: 0 4px 15px -3px rgba(0, 0, 0, 0.1); border: 1px solid #e5e7eb;">
        <h2 style="font-size: 1.5rem; font-weight: 800; margin: 0 0 20px 0; border-left: 6px solid #f59e0b; padding-left: 15px; color: #111827; letter-spacing: -0.025em;">⚡ AI 今日觀察名單 (Candidates)</h2>
        <p style="color: #64748b; font-size: 1.1rem; line-height: 1.5; margin-bottom: 20px;">AI 根據市場題材篩選出的強勢股，列入觀察但不一定買進：</p>
        
        <table style="width: 100%; border-collapse: separate; border-spacing: 0; font-family: 'Microsoft JhengHei', 'PingFang TC', 'Heiti TC', 'Helvetica Neue', Helvetica, Arial, sans-serif;">
          <thead>
            <tr style="background-color: #fffbeb; text-align: left;">
              <th style="padding: 16px; border-bottom: 2px solid #fcd34d; color: #92400e; font-size: 15px; font-weight: 700;">代號</th>
              <th style="padding: 16px; border-bottom: 2px solid #fcd34d; color: #92400e; font-size: 15px; font-weight: 700;">名稱</th>
              <th style="padding: 16px; border-bottom: 2px solid #fcd34d; color: #92400e; font-size: 15px; font-weight: 700;">現價</th>
              <th style="padding: 16px; border-bottom: 2px solid #fcd34d; color: #92400e; font-size: 15px; font-weight: 700;">AI 分析觀點</th>
            </tr>
          </thead>
          <tbody>
            ${(report.candidates || []).map((c, index) => {
      // Zebra Striping made more obvious: #f3f4f6 (gray-100) instead of #fafaf9
      const zebraColor = index % 2 === 0 ? '#ffffff' : '#f3f4f6';

      return `
              <tr style="background-color: ${zebraColor};">
                <td style="padding: 16px; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: #44403c; font-size: 16px;">${c.code}</td>
                <td style="padding: 16px; border-bottom: 1px solid #e5e7eb; color: #44403c; font-size: 16px;">${c.name}</td>
                <td style="padding: 16px; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: #0891b2; font-size: 16px;">${c.price}</td>
                <td style="padding: 16px; border-bottom: 1px solid #e5e7eb; font-size: 15px; color: #57534e; line-height: 1.6;">${c.reason}</td>
              </tr>
              `;
    }).join('')}
          </tbody>
        </table>
      </div>


      <div style="margin-top: 45px; text-align: center; color: #9ca3af; font-size: 0.9rem;">
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
