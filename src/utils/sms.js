const twilio = require('twilio');
require('dotenv').config();

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Strips WhatsApp markdown (*bold*) and any leftover HTML tags so the
// existing WhatsApp-text templates read cleanly as plain SMS.
function cleanForSms(message) {
  return message
    .replace(/<[^>]+>/g, '')   // remove HTML tags like <strong>...</strong>
    .replace(/\*/g, '')        // remove WhatsApp *bold* markers
    .trim();
}

async function sendSMS(toNumber, message) {
  try {
    await client.messages.create({
      from: process.env.TWILIO_SMS_NUMBER,
      to: toNumber,
      body: cleanForSms(message)
    });
    console.log(`✅ SMS sent to ${toNumber}`);
  } catch (err) {
    console.log('❌ SMS error:', err.message);
  }
}

module.exports = { sendSMS };