const { APP_NAME, mail: cfg } = require('./config');

const emailOf = (from) => {
  const m = /<([^>]+)>/.exec(from);
  return (m ? m[1] : from).trim();
};

function template(code) {
  return `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;max-width:420px;margin:auto;padding:28px;border:1px solid #e5e7eb;border-radius:14px">
<h2 style="margin:0 0 12px;color:#3390ec">${APP_NAME}</h2>
<p style="margin:0 0 8px;color:#111">کد تأیید شما:</p>
<p style="font-size:34px;letter-spacing:10px;font-weight:bold;direction:ltr;text-align:center;margin:12px 0">${code}</p>
<p style="color:#6b7280;font-size:13px;margin:0">این کد ۱۰ دقیقه اعتبار دارد. اگر شما درخواست نداده‌اید این ایمیل را نادیده بگیرید.</p>
</div>`;
}

async function sendCode(to, code) {
  const subject = `${code} — کد تأیید ${APP_NAME}`;
  const html = template(code);

  if (cfg.resend) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.resend}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: cfg.from || 'onboarding@resend.dev', to: [to], subject, html }),
    });
    if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
    return;
  }

  if (cfg.brevo) {
    if (!cfg.from) throw new Error('MAIL_FROM is required for Brevo');
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': cfg.brevo, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sender: { name: APP_NAME, email: emailOf(cfg.from) }, to: [{ email: to }], subject, htmlContent: html }),
    });
    if (!r.ok) throw new Error(`Brevo ${r.status}: ${await r.text()}`);
    return;
  }

  if (cfg.smtp.host) {
    const nodemailer = require('nodemailer');
    const transport = nodemailer.createTransport({
      host: cfg.smtp.host,
      port: cfg.smtp.port,
      secure: cfg.smtp.secure,
      auth: cfg.smtp.user ? { user: cfg.smtp.user, pass: cfg.smtp.pass } : undefined,
    });
    await transport.sendMail({ from: cfg.from || cfg.smtp.user, to, subject, html });
    return;
  }

  // No provider configured: print the code in the server logs (testing only).
  console.log(`[MAIL not configured] verification code for ${to}: ${code}`);
}

module.exports = { sendCode };
