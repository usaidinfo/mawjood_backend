import { Router } from 'express';
import { getSitemapChunk, getSitemapIndex } from '../controllers/sitemap.controller';

const router = Router();

router.get('/sitemap.xml', getSitemapIndex);
router.get('/sitemap-:index.xml', getSitemapChunk);

export default router;

