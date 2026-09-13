import twilio from 'twilio';

function getTwilioConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const fromNumber = process.env.TWILIO_FROM_NUMBER?.trim();

  if (!accountSid || !authToken || !fromNumber) {
    throw new Error(
      'Twilio credentials missing. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER in backend/.env',
    );
  }

  return { accountSid, authToken, fromNumber };
}

export async function sendSMS(to: string, message: string): Promise<string> {
  const { accountSid, authToken, fromNumber } = getTwilioConfig();
  const client = twilio(accountSid, authToken);

  const sms = await client.messages.create({
    to,
    from: fromNumber,
    body: message,
  });

  return sms.sid;
}
