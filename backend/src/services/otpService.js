const nodemailer = require('nodemailer');
const crypto = require('crypto');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT || '587'),
  secure: parseInt(process.env.EMAIL_PORT || '587') === 465,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const otpStore = new Map();
const rateLimitStore = new Map();
const failedAttemptsStore = new Map();

const OTP_CONFIG = {
  length: 6,
  expiryMs: 5 * 60 * 1000,
  maxRequestsPerHour: 3,
  maxFailedAttempts: 5,
  lockoutDurationMs: 15 * 60 * 1000
};

function generateSecureOTP() {
  const min = Math.pow(10, OTP_CONFIG.length - 1);
  const max = Math.pow(10, OTP_CONFIG.length) - 1;
  const range = max - min + 1;
  
  let randomBytes;
  try {
    randomBytes = crypto.randomBytes(4);
  } catch {
    randomBytes = crypto.randomBytes(4);
  }
  
  const randomNum = randomBytes.readUInt32BE(0);
  return (min + (randomNum % range)).toString();
}

function checkRateLimit(email) {
  const now = Date.now();
  const hourAgo = now - (60 * 60 * 1000);
  
  if (!rateLimitStore.has(email)) {
    rateLimitStore.set(email, []);
  }
  
  const timestamps = rateLimitStore.get(email).filter(ts => ts > hourAgo);
  rateLimitStore.set(email, timestamps);
  
  if (timestamps.length >= OTP_CONFIG.maxRequestsPerHour) {
    return { allowed: false, message: 'Too many OTP requests. Please try again in 1 hour.' };
  }
  
  timestamps.push(now);
  return { allowed: true };
}

function checkFailedAttempts(email) {
  const now = Date.now();
  
  if (!failedAttemptsStore.has(email)) {
    failedAttemptsStore.set(email, { count: 0, lockedUntil: 0 });
  }
  
  const record = failedAttemptsStore.get(email);
  
  if (record.lockedUntil > now) {
    const remainingMs = record.lockedUntil - now;
    const remainingMin = Math.ceil(remainingMs / 60000);
    return { 
      allowed: false, 
      message: `Too many failed attempts. Account locked for ${remainingMin} minute${remainingMin > 1 ? 's' : ''}.` 
    };
  }
  
  return { allowed: true };
}

function recordFailedAttempt(email) {
  if (!failedAttemptsStore.has(email)) {
    failedAttemptsStore.set(email, { count: 0, lockedUntil: 0 });
  }
  
  const record = failedAttemptsStore.get(email);
  record.count++;
  
  if (record.count >= OTP_CONFIG.maxFailedAttempts) {
    record.lockedUntil = Date.now() + OTP_CONFIG.lockoutDurationMs;
    record.count = 0;
  }
}

function clearFailedAttempts(email) {
  failedAttemptsStore.delete(email);
}

const otpService = {
  async sendOTP(email) {
    const rateCheck = checkRateLimit(email);
    if (!rateCheck.allowed) {
      return { success: false, error: rateCheck.message };
    }

    const attemptsCheck = checkFailedAttempts(email);
    if (!attemptsCheck.allowed) {
      return { success: false, error: attemptsCheck.message };
    }

    const otp = generateSecureOTP();

    try {
      if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        await transporter.sendMail({
          from: '"THE BIG DOGS FX" <noreply@bigdogsfx.com>',
          to: email,
          subject: 'Your Verification Code - THE BIG DOGS FX',
          html: `
            <div style="background:#0a0a0a; padding:40px; border-radius:16px; max-width:500px; margin:0 auto; font-family:sans-serif; color:#fff;">
              <h1 style="color:#FFD700; text-align:center; letter-spacing:3px;">THE BIG DOGS FX</h1>
              <p style="text-align:center; color:#888; font-style:italic;">We chase the cash</p>
              <hr style="border-color:#2a2a2a; margin:24px 0;">
              <p>Your verification code is:</p>
              <div style="background:#1a1a1a; padding:20px; border-radius:12px; text-align:center; margin:20px 0;">
                <span style="font-size:36px; font-weight:800; color:#FFD700; letter-spacing:8px;">${otp}</span>
              </div>
              <p style="color:#888; font-size:14px;">This code expires in <strong>5 minutes</strong>. If you didn't request this, ignore this email.</p>
              <p style="color:#666; font-size:12px; margin-top:20px;">Never share this code with anyone. Our team will never ask for it.</p>
            </div>
          `
        });
        console.log(`OTP email sent to: ${email}`);
      } else {
        console.log(`[DEV MODE] OTP for ${email}: ${otp}`);
      }

      otpStore.set(email, { 
        otp, 
        expires: Date.now() + OTP_CONFIG.expiryMs,
        attempts: 0
      });

      return { success: true, otp };
    } catch (error) {
      console.error('Email send failed:', error.message);
      return { success: false, error: 'Failed to send verification code. Please try again.' };
    }
  },

  verifyOTP(email, otp) {
    const attemptsCheck = checkFailedAttempts(email);
    if (!attemptsCheck.allowed) {
      return { valid: false, message: attemptsCheck.message };
    }

    const record = otpStore.get(email);
    
    if (!record) {
      return { valid: false, message: 'No verification code was sent to this email. Request a new code.' };
    }

    if (Date.now() > record.expires) {
      otpStore.delete(email);
      return { valid: false, message: 'Verification code has expired. Request a new code.' };
    }

    if (record.otp !== otp) {
      record.attempts++;
      recordFailedAttempt(email);
      
      const remaining = OTP_CONFIG.maxFailedAttempts - (failedAttemptsStore.get(email)?.count || 0);
      
      if (remaining > 0 && remaining <= 2) {
        return { valid: false, message: `Invalid code. ${remaining} attempt${remaining > 1 ? 's' : ''} remaining.` };
      }
      return { valid: false, message: 'Invalid verification code.' };
    }

    otpStore.delete(email);
    clearFailedAttempts(email);
    
    return { valid: true };
  },

  getDevOTP(email) {
    if (process.env.NODE_ENV !== 'production' && otpStore.has(email)) {
      return otpStore.get(email).otp;
    }
    return null;
  }
};

module.exports = otpService;
