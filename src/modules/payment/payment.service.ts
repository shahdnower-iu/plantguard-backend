// src/modules/payment/payment.service.ts

import prisma from '../../config/connectionDb';
import { NotFoundError, ValidationError } from '../../utils/errors';

// ─── Create a payment intent ──────────────────────────────────────────────────
//
// Creates a PENDING payment record and returns a reference code the user
// must "confirm" via POST /api/payment/:ref/confirm.
// The link expires in 30 minutes if not confirmed.

export async function createPayment(
  userId: string,
  data: { amount: number; currency?: string; plan: 'PRO'; durationDays: number }
): Promise<{ reference: string; expiresAt: Date; amount: number; currency: string; durationDays: number }> {
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

  const payment = await prisma.payment.create({
    data: {
      userId,
      amount:      data.amount,
      currency:    data.currency ?? 'USD',
      plan:        data.plan,
      durationDays: data.durationDays,
      status:      'PENDING',
      expiresAt,
    },
  });

  return {
    reference:   payment.reference,
    expiresAt,
    amount:      payment.amount,
    currency:    payment.currency,
    durationDays: payment.durationDays,
  };
}

// ─── Confirm payment → activate / extend PRO ──────────────────────────────────
//
// If the user already has an active PRO subscription, the new days are ADDED
// on top of their existing end date (not replaced).
// If PRO has already expired, the new period starts from today.

export async function confirmPayment(
  reference: string,
  userId: string
): Promise<{ subscriptionEndDate: Date; daysAdded: number }> {
  const payment = await prisma.payment.findUnique({ where: { reference } });

  if (!payment)                         throw new NotFoundError('Payment');
  if (payment.userId !== userId)        throw new ValidationError('Payment not found');
  if (payment.status === 'COMPLETED')   throw new ValidationError('Payment already confirmed');
  if (payment.status === 'FAILED')      throw new ValidationError('Payment has been cancelled');
  if (payment.expiresAt && payment.expiresAt < new Date()) {
    await prisma.payment.update({ where: { reference }, data: { status: 'FAILED' } });
    throw new ValidationError('Payment link has expired. Please create a new payment.');
  }

  const user = await prisma.user.findUnique({
    where:  { user_id: userId },
    select: { subscription: true, subscriptionEndDate: true },
  });
  if (!user) throw new NotFoundError('User');

  const now  = new Date();
  // If already PRO and still active, extend from the current end date.
  // Otherwise start from today.
  const base = user.subscription === 'PRO' &&
               user.subscriptionEndDate &&
               user.subscriptionEndDate > now
    ? user.subscriptionEndDate
    : now;

  const newEndDate = new Date(base);
  newEndDate.setDate(newEndDate.getDate() + payment.durationDays);

  // Persist changes atomically
  await prisma.$transaction([
    prisma.payment.update({
      where: { reference },
      data:  { status: 'COMPLETED', confirmedAt: now },
    }),
    prisma.user.update({
      where: { user_id: userId },
      data: {
        subscription:          'PRO',
        subscriptionStartDate: user.subscription !== 'PRO' ? now : undefined,
        subscriptionEndDate:   newEndDate,
      },
    }),
  ]);

  return { subscriptionEndDate: newEndDate, daysAdded: payment.durationDays };
}

// ─── Payment history ──────────────────────────────────────────────────────────

export async function getPaymentHistory(userId: string) {
  return prisma.payment.findMany({
    where:   { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      payment_id:  true,
      amount:      true,
      currency:    true,
      plan:        true,
      durationDays: true,
      status:      true,
      reference:   true,
      confirmedAt: true,
      expiresAt:   true,
      createdAt:   true,
    },
  });
}
