const nodemailer = require('nodemailer');
const { buildReminderEmailHtml } = require('./messageTemplates');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  family: 4,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

async function sendEmail(to, subject, html) {
  await transporter.sendMail({
    from: `"Mervat Horse Riding Academy" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html
  });
}

async function sendReminderEmail(booking) {
  const html = buildReminderEmailHtml(booking);
  // ⚠️ TESTING MODE: sends to ADMIN_TEST_EMAIL. Remove the "||" fallback later to use booking.email for real customers.
  const recipient = process.env.ADMIN_TEST_EMAIL || booking.email;
  await sendEmail(recipient, '🐴 Reminder: Your booking is tomorrow!', html);
}

module.exports = { sendEmail, sendReminderEmail };