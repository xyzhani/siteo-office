// Email adapters. "test" keeps every email in the built-in test inbox (nothing leaves the app).
// "smtp" sends through your own mail server with nodemailer (npm install nodemailer).
// Emails are only ever sent after a human clicks Approve (see pipeline.approveEmail).
import { settings, demoMode } from "../../config.js";

let transporter = null;
async function smtpSend(msg) {
  if (!transporter) {
    let nodemailer;
    try { nodemailer = (await import("nodemailer")).default; } catch { throw new Error("EMAIL_PROVIDER=smtp needs nodemailer: run npm install nodemailer"); }
    const s = settings.email.smtp;
    transporter = nodemailer.createTransport({ host: s.host, port: s.port, secure: s.secure, auth: s.user ? { user: s.user, pass: s.pass } : undefined });
  }
  // SMTP_TEST_RECIPIENT reroutes every email to you while you test
  const to = settings.email.testRecipient || msg.to;
  const info = await transporter.sendMail({ from: msg.from, to, subject: msg.subject, text: msg.text, html: msg.html, headers: msg.headers });
  return { provider: "smtp", messageId: info.messageId, deliveredTo: to };
}

export const providerName = () => (!demoMode && settings.email.provider === "smtp" && settings.email.smtp.host ? "smtp" : "test");

export async function send(msg) {
  if (providerName() === "smtp") return smtpSend(msg);
  return { provider: "test", messageId: "test-" + Date.now(), deliveredTo: msg.to + " (test inbox)" };
}
