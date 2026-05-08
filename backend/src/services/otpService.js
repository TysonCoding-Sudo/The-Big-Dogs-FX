const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const otpStore = new Map();

const otpService = {
  async sendOTP(email, otp) {
    try {
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
            <p style="color:#888; font-size:14px;">This code expires in 10 minutes. If you didn't request this, ignore this email.</p>
          </div>
        `
      });

      otpStore.set(email, { otp, expires: Date.now() + 600000 });
      return { success: true };
    } catch (error) {
      console.error('Email send failed:', error.message);
      otpStore.set(email, { otp, expires: Date.now() + 600000 });
      return { success: false, error: error.message };
    }
  },

  verifyOTP(email, otp) {
    const record = otpStore.get(email);
    if (!record) return { valid: false, message: 'No code sent to this email' };
    if (Date.now() > record.expires) {
      otpStore.delete(email);
      return { valid: false, message: 'Code expired' };
    }
    if (record.otp !== otp) return { valid: false, message: 'Invalid code' };
    
    otpStore.delete(email);
    return { valid: true };
  }
};

module.exports = otpService;
