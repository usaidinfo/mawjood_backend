import { Router } from 'express';
import { submitContactForm } from '../controllers/contact.controller';

const router = Router();

// Contact form submission (public)
router.post('/', submitContactForm);

export default router;

