import { Resend } from "resend";
import { env } from "./env.js";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export const sendPasswordResetEmail = async (to: string, token: string) => {
  if (!resend || !env.RESEND_FROM) {
    return;
  }

  const resetLink = `${env.APP_BASE_URL}/reset-password?token=${token}`;

  await resend.emails.send({
    from: env.RESEND_FROM,
    to,
    subject: "Reset your EasyFinder password",
    html: `
      <p>You requested a password reset for your EasyFinder account.</p>
      <p><a href="${resetLink}">Reset your password</a></p>
      <p>This link expires in 15 minutes.</p>
    `,
  });
};

export const sendOfferStatusEmail = async (args: {
  to: string;
  listingId: string;
  status: "pending" | "countered" | "accepted" | "rejected" | "expired";
  amount: number;
  message?: string;
}) => {
  if (!resend || !env.RESEND_FROM) {
    return;
  }

  await resend.emails.send({
    from: env.RESEND_FROM,
    to: args.to,
    subject: `Offer ${args.status}: ${args.amount}`,
    html: `
      <p>Your offer on listing <strong>${args.listingId}</strong> is now <strong>${args.status}</strong>.</p>
      <p>Amount: ${args.amount}</p>
      ${args.message ? `<p>Message: ${args.message}</p>` : ""}
    `,
  });
};

export const sendInquiryNotificationEmail = async (args: {
  to: string;
  buyerName: string;
  buyerEmail: string;
  listingTitle: string;
  message: string;
}) => {
  if (!resend || !env.RESEND_FROM) return;
  await resend.emails.send({
    from: env.RESEND_FROM,
    to: args.to,
    subject: `New inquiry on: ${args.listingTitle}`,
    html: `
      <p><strong>${args.buyerName}</strong> (${args.buyerEmail}) sent an inquiry about <strong>${args.listingTitle}</strong>:</p>
      <blockquote>${args.message}</blockquote>
      <p>Log in to EasyFinder to respond.</p>
    `,
  });
};
