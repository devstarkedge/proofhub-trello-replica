import express from 'express';
import { body } from 'express-validator';
import { protect } from '../../middleware/authMiddleware.js';
import { requireResourcePermission } from '../../middleware/requireAccessControl.js';
import { validate } from '../../middleware/validation.js';
import * as controller from './attendanceLocation.controller.js';

const router = express.Router();
router.use(protect);
router.use(requireResourcePermission('attendance', 'manage_locations'));

router.get('/locations', controller.listLocations);
router.post(
  '/locations',
  [
    body('name').trim().notEmpty(),
    body('latitude').isFloat({ min: -90, max: 90 }),
    body('longitude').isFloat({ min: -180, max: 180 }),
    body('allowedRadiusMeters').isInt({ min: 1, max: 50000 }),
    validate
  ],
  controller.createLocation
);
router.patch('/locations/:locationId', controller.updateLocation);
router.post('/locations/:locationId/deactivate', controller.deactivateLocation);
router.post('/locations/:locationId/activate', controller.activateLocation);
router.post('/locations/:locationId/delete', controller.deleteLocation);

export default router;
