import { Router } from 'express';
import * as controller from './genre.controller';

const router = Router();

router.get('/', controller.listGenres);

export { router as genreRouter };
