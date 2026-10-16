import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const TELKOSH_USER = process.env.TELKOSH_USER || process.argv[2];
const TELKOSH_PWD = process.env.TELKOSH_PWD || process.argv[3];
const TELKOSH_SENDER = process.env.TELKOSH_SENDER || process.argv[4] || 'SMSAlert';
const PHONE = process.argv[5] || '9770133148';
const OTP = process.argv[6] || '123456';
const MSG_TEXT = process.env.TELKOSH_MSG_TEMPLATE
  ? process.env.TELKOSH_MSG_TEMPLATE.replace('{#var#}', OTP).replace('{OTP}', OTP)
  : `Your verification OTP is ${OTP}`;

async function testTelkoshSms() {
  console.log('----------------------------------------------------');
  console.log('Telkosh / Mshastra SMS Integration Test');
  console.log('----------------------------------------------------');
  console.log(`Target Phone   : ${PHONE}`);
  console.log(`OTP Code       : ${OTP}`);
  console.log(`Message Text   : ${MSG_TEXT}`);
  console.log(`Sender ID      : ${TELKOSH_SENDER}`);
  console.log(`User Profile ID: ${TELKOSH_USER ? TELKOSH_USER : '[MISSING]'}`);
  console.log(`Password       : ${TELKOSH_PWD ? '********' : '[MISSING]'}`);
  console.log('----------------------------------------------------');

  if (!TELKOSH_USER || !TELKOSH_PWD) {
    console.error('\n❌ ERROR: Telkosh credentials missing!');
    console.error('Please configure them in Backend/.env or pass as arguments:');
    console.error('  TELKOSH_USER=200XXXXX');
    console.error('  TELKOSH_PWD=your_password');
    console.error('  TELKOSH_SENDER=YourSenderId');
    console.error('\nUsage via command line:');
    console.error('  node scripts/test-telkosh-sms.mjs <USER> <PWD> <SENDER> <PHONE> <OTP>');
    process.exit(1);
  }

  // Normalize local numbers: 10 digits -> India (91), 9 digits -> Poland (48); otherwise assume country code is included
  const cleanPhone = String(PHONE).replace(/\D/g, '');
  const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone.length === 9 ? `48${cleanPhone}` : cleanPhone;

  // Test 1: Single SMS GET API with ShowError=C
  const queryParams = new URLSearchParams({
    user: TELKOSH_USER,
    pwd: TELKOSH_PWD,
    senderid: TELKOSH_SENDER,
    mobileno: formattedPhone,
    msgtext: MSG_TEXT,
    priority: 'High',
    CountryCode: 'ALL',
    ShowError: 'C'
  });

  const getUrl = `https://eu.mshastra.com/sendurl.aspx?${queryParams.toString()}`;
  console.log(`\nCalling GET API: https://eu.mshastra.com/sendurl.aspx?user=${TELKOSH_USER}&senderid=${TELKOSH_SENDER}&mobileno=${formattedPhone}...`);

  try {
    const res = await fetch(getUrl);
    const text = await res.text();
    console.log(`\nHTTP Status : ${res.status}`);
    console.log(`API Response: ${text.trim()}`);

    const errorCodes = {
      '000': 'Send Successful',
      '001': 'Invalid Receiver',
      '003': 'Invalid Message',
      '005': 'Authorization failed',
      '006': 'DND Number',
      '007': 'Cannot Extract Country Code',
      '008': 'Empty Receiver',
      '009': 'Profile Blocked',
      '010': 'Invalid Profile ID',
      '011': 'Profile ID expired',
      '012': 'Sender Id more than 13 Chars',
      '013': 'Server Error'
    };

    const trimmed = text.trim();
    if (errorCodes[trimmed]) {
      console.log(`Status Meaning: ${errorCodes[trimmed]}`);
    }
  } catch (err) {
    console.error('Network / Request Error:', err.message);
  }
}

testTelkoshSms();
