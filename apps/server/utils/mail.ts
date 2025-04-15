import { createTransport } from "nodemailer"

export const sendEmail = async (
  email: string,
  subject: string,
  message: string
) => {
  const auth = {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  }

  const transporter = createTransport({
    name: process.env.SMTP_USER,
    host: process.env.SMTP_HOST,
    port: 587,
    secure: false,
    auth,
    tls: {
      // do not fail on invalid certs
      rejectUnauthorized: false,
    },
  })

  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to: email,
    subject,
    text: message,
    html: `<p>${message}</p>`,
  })
}
