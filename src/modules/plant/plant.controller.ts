// src/modules/plant/plant.controller.ts

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import { validate } from '../../middleware/validation';
import { upload, handleImageUpload } from '../../middleware/upload';
import {
  getUserPlants, getPlantById, createPlant, updatePlant, deletePlant,
  getCareSchedule, createCareSchedule, completeCareTask, deleteCareSchedule,
} from './plant.service';

const router = Router();
router.use(authMiddleware);

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createPlantSchema = z.object({
  name:           z.string().min(1, 'Plant name is required'),
  plantType:      z.string().min(1, 'Plant type is required'),
  scientificName: z.string().optional(),
  location:       z.string().optional(),
  notes:          z.string().optional(),
  imageUrl:       z.string().url().optional(),
});

const updatePlantSchema = createPlantSchema.partial().extend({
  lastWatered:    z.string().datetime().optional().transform(v => v ? new Date(v) : undefined),
  lastFertilized: z.string().datetime().optional().transform(v => v ? new Date(v) : undefined),
  imageUrl:       z.string().url().optional(),
});

const careScheduleSchema = z.object({
  taskType:  z.enum(['WATER', 'FERTILIZE', 'PRUNE', 'REPOT', 'CHECK_HEALTH']),
  frequency: z.enum(['DAILY', 'TWICE_WEEKLY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'AS_NEEDED']),
  notes:     z.string().optional(),
  nextDue:   z.string().datetime().optional().transform(v => v ? new Date(v) : undefined),
}).refine(
  data => data.frequency !== 'AS_NEEDED' || data.nextDue !== undefined,
  { message: 'nextDue is required when frequency is AS_NEEDED', path: ['nextDue'] }
);

// ─── Plant routes ──────────────────────────────────────────────────────────────

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const plants = await getUserPlants(req.user!.userId);
  res.json({ plants });
}));

router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const plant = await getPlantById(req.params.id, req.user!.userId);
  res.json({ plant });
}));

router.post(
  '/',
  upload.single('image'),
  handleImageUpload('plant', () => `plant_${Date.now()}`),
  validate(createPlantSchema),
  asyncHandler(async (req, res) => {
    const plant = await createPlant(req.user!.userId, req.body);
    res.status(201).json({ plant });
  }),
);

router.put(
  '/:id',
  upload.single('image'),
  handleImageUpload('plant', req => req.params.id),
  validate(updatePlantSchema),
  asyncHandler(async (req, res) => {
    const plant = await updatePlant(req.params.id, req.user!.userId, req.body);
    res.json({ plant });
  }),
);

router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  await deletePlant(req.params.id, req.user!.userId);
  res.json({ message: 'Plant deleted' });
}));

// ─── Care schedule routes ─────────────────────────────────────────────────────

// GET /plants/:id/care-schedule — get all schedules for a specific plant
router.get('/:id/care-schedule', asyncHandler(async (req: Request, res: Response) => {
  const schedules = await getCareSchedule(req.params.id, req.user!.userId);
  // Always return an array wrapped in { schedules } so the frontend can do res.schedules
  res.json({ schedules });
}));

// POST /plants/:id/care-schedule — create a new schedule for a specific plant
router.post(
  '/:id/care-schedule',
  validate(careScheduleSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const schedule = await createCareSchedule(req.params.id, req.user!.userId, req.body);
    res.status(201).json({ schedule });
  }),
);

// POST /plants/:id/care-schedule/:scheduleId/complete — mark a task as done
// :scheduleId here is care_schedule_id from the DB
router.post(
  '/:id/care-schedule/:scheduleId/complete',
  asyncHandler(async (req: Request, res: Response) => {
    // Verify plant ownership via plantId before completing, then complete by scheduleId
    const schedule = await completeCareTask(
      req.params.scheduleId,
      req.user!.userId,
      req.params.id,        // plantId passed for ownership check
    );
    res.json({ schedule });
  }),
);

// DELETE /plants/:id/care-schedule/:scheduleId — remove a care schedule
router.delete(
  '/:id/care-schedule/:scheduleId',
  asyncHandler(async (req: Request, res: Response) => {
    await deleteCareSchedule(
      req.params.scheduleId,
      req.user!.userId,
      req.params.id,        // plantId passed for ownership check
    );
    res.json({ message: 'Care schedule deleted' });
  }),
);

export default router;