const { buildReminderEmailHtml } = require('./messageTemplates');
require('dotenv').config();

async function sendEmail(to, subject, html) {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': process.env.BREVO_API_KEY,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      sender: { name: 'Mervat Horse Riding Academy', email: process.env.EMAIL_USER },
      to: [{ email: to }],
      subject,
      htmlContent: html
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Brevo API error (${response.status}): ${errorText}`);
  }

  console.log(`✅ Email sent to ${to}`);
}

async function sendReminderEmail(booking) {
  const html = buildReminderEmailHtml(booking);
  const recipient = process.env.ADMIN_TEST_EMAIL || booking.email;
  await sendEmail(recipient, '🐴 Reminder: Your booking is tomorrow!', html);
}

module.exports = { sendEmail, sendReminderEmail };