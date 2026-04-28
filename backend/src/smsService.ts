/**
 * Simple SMS Service placeholder.
 * In a real production app, you would use Twilio, Vonage, or another SMS gateway.
 */
export async function sendSMS(to: string, message: string) {
  // letter
  // const client = new Twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
  // await client.messages.create({ body: message, to, from: process.env.TWILIO_PHONE });

  console.log(`[SMS] Sending to ${to}: "${message}"`);
  
  // Return true to simulate success
  return true;
}
