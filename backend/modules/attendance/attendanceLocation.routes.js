import express from 'express';
import { body } from 'express-validator';
import { protect } from '../../middleware/authMiddleware.js';
import { requireResourcePermission } from '../../middleware/requireAccessControl.js';
import { validate } from '../../middleware/validation.js';
import * as controller from './attendanceLocation.controller.js';

const router = express.Router();
router.use(protect);
const gate = requireResourcePermission('attendance', 'manage_locations');

router.get('/locations', gate, controller.listLocations);
router.post('/locations', gate,
  [
    body('name').trim().notEmpty(),
    body('latitude').isFloat({ min: -90, max: 90 }),
    body('longitude').isFloat({ min: -180, max: 180 }),
    body('allowedRadiusMeters').isInt({ min: 1, max: 50000 }),
    validate
  ],
  controller.createLocation
);
router.patch('/locations/:locationId', gate, controller.updateLocation);
router.post('/locations/:locationId/deactivate', gate, controller.deactivateLocation);
router.post('/locations/:locationId/activate', gate, controller.activateLocation);
router.post('/locations/:locationId/delete', gate, controller.deleteLocation);

export default router;
