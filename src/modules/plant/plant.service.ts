/// src/modules/plant/plant.service.ts

import prisma from '../../config/connectionDb';
import { NotFoundError, ForbiddenError, TaskConflictError } from '../../utils/errors';

// ─── Get all plants ───────────────────────────────────────────────────────────

export async function getUserPlants(userId: string) {
  return prisma.plant.findMany({
    where:   { userId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
  });
}

// ─── Get single plant ─────────────────────────────────────────────────────────

export async function getPlantById(plantId: string, userId: string) {
  const plant = await prisma.plant.findUnique({
    where:   { plant_id: plantId, deletedAt: null },
    include: { scans: { orderBy: { createdAt: 'desc' }, take: 5 } },
  });
  if (!plant) throw new NotFoundError('Plant');
  if (plant.userId !== userId) throw new ForbiddenError();
  return plant;
}

// ─── Create plant ─────────────────────────────────────────────────────────────

export async function createPlant(
  userId: string,
  data: {
    name: string;
    plantType: string;
    scientificName?: string;
    location?: string;
    notes?: string;
    imageUrl?: string;
  }
) {
  return prisma.plant.create({ data: { userId, ...data } });
}

// ─── Update plant ─────────────────────────────────────────────────────────────

export async function updatePlant(
  plantId: string,
  userId: string,
  data: {
    name?: string;
    plantType?: string;
    scientificName?: string;
    location?: string;
    notes?: string;
    imageUrl?: string;
    lastWatered?: Date;
    lastFertilized?: Date;
  }
) {
  const plant = await prisma.plant.findUnique({ where: { plant_id: plantId } });
  if (!plant || plant.deletedAt) throw new NotFoundError('Plant');
  if (plant.userId !== userId) throw new ForbiddenError();
  return prisma.plant.update({ where: { plant_id: plantId }, data });
}

// ─── Soft delete ──────────────────────────────────────────────────────────────

export async function deletePlant(plantId: string, userId: string): Promise<void> {
  const plant = await prisma.plant.findUnique({ where: { plant_id: plantId } });
  if (!plant || plant.deletedAt) throw new NotFoundError('Plant');
  if (plant.userId !== userId) throw new ForbiddenError();
  await prisma.plant.update({ where: { plant_id: plantId }, data: { deletedAt: new Date() } });
}

// ─── Care schedule ────────────────────────────────────────────────────────────

/**
 * Returns all care schedules for a given plant.
 * Ownership is verified via userId.
 */
export async function getCareSchedule(plantId: string, userId: string) {
  const plant = await prisma.plant.findUnique({ where: { plant_id: plantId } });
  if (!plant || plant.deletedAt) throw new NotFoundError('Plant');
  if (plant.userId !== userId) throw new ForbiddenError();

  return prisma.careSchedule.findMany({
    where:   { plantId },
    orderBy: { nextDue: 'asc' },
  });
}

/**
 * Creates a new care schedule entry for a plant.
 * Prevents duplicate taskType per plant.
 */
export async function createCareSchedule(
  plantId: string,
  userId: string,
  data: { taskType: any; frequency: any; notes?: string; nextDue?: Date }
) {
  const plant = await prisma.plant.findUnique({ where: { plant_id: plantId } });
  if (!plant || plant.deletedAt) throw new NotFoundError('Plant');
  if (plant.userId !== userId) throw new ForbiddenError();

  // Prevent duplicate task types for the same plant
  const existing = await prisma.careSchedule.findFirst({
    where: { plantId, taskType: data.taskType },
  });
  if (existing) {
    throw new TaskConflictError(`A ${data.taskType} task already exists for this plant`);
  }

  const nextDue = data.nextDue ?? calcNextDue(data.frequency);
  return prisma.careSchedule.create({ data: { plantId, userId, ...data, nextDue } });
}

/**
 * Marks a care task as completed and advances nextDue.
 * FIX: scheduleId is care_schedule_id (the DB primary key) — not a generic "id".
 * plantId is accepted for an additional ownership/consistency check.
 */
export async function completeCareTask(
  scheduleId: string,
  userId: string,
  plantId?: string,   // optional extra guard — verifies the schedule belongs to the expected plant
) {
  const schedule = await prisma.careSchedule.findUnique({
    where: { care_schedule_id: scheduleId },
  });
  if (!schedule) throw new NotFoundError('Care schedule');
  if (schedule.userId !== userId) throw new ForbiddenError();

  // Extra consistency check: if plantId is supplied, ensure it matches
  if (plantId && schedule.plantId !== plantId) throw new ForbiddenError();

  const nextDue = calcNextDue(schedule.frequency);
  return prisma.careSchedule.update({
    where: { care_schedule_id: scheduleId },
    data:  { lastCompleted: new Date(), nextDue },
  });
}

/**
 * Deletes a care schedule by its primary key (care_schedule_id).
 * plantId is accepted for an additional ownership/consistency check.
 */
export async function deleteCareSchedule(
  scheduleId: string,
  userId: string,
  plantId?: string,
): Promise<void> {
  const schedule = await prisma.careSchedule.findUnique({
    where: { care_schedule_id: scheduleId },
  });
  if (!schedule) throw new NotFoundError('Care schedule');
  if (schedule.userId !== userId) throw new ForbiddenError();

  // Extra consistency check
  if (plantId && schedule.plantId !== plantId) throw new ForbiddenError();

  await prisma.careSchedule.delete({ where: { care_schedule_id: scheduleId } });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcNextDue(frequency: string): Date {
  const now = new Date();
  const daysMap: Record<string, number> = {
    DAILY:        1,
    TWICE_WEEKLY: 3,
    WEEKLY:       7,
    BIWEEKLY:     14,
    MONTHLY:      30,
    AS_NEEDED:    7,  // fallback default for AS_NEEDED
  };
  now.setDate(now.getDate() + (daysMap[frequency] ?? 7));
  return now;
}