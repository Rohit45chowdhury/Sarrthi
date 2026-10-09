const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});

exports.sendCode = (to, code) =>
    transporter.sendMail({
        from: process.env.MAIL_FROM,
        to,
        subject: `Your Saarthi code: ${code}`,
        text: `Your Saarthi verification code is ${code}. It expires in 10 minutes.`,
        html: `
      <div style="font-family:Arial,sans-serif;max-width:420px;margin:auto">
        <h2 style="color:#12334A">Saarthi</h2>
        <p>Your verification code is</p>
        <p style="font-size:32px;letter-spacing:8px;font-weight:bold;color:#F15A24">${code}</p>
        <p style="color:#666">Expires in 10 minutes. If you didn't request this, ignore this email.</p>
      </div>`
    });