import { Router } from 'express';
import * as controller from './search.controller';
import { validate } from '../../middleware/validate';
import { optionalAuth } from '../../middleware/auth';
import { searchSchema, autocompleteSchema } from './search.validation';

const router = Router();

router.get('/', optionalAuth, validate(searchSchema), controller.search);
router.get('/autocomplete', optionalAuth, validate(autocompleteSchema), controller.autocomplete);

export { router as searchRouter };
