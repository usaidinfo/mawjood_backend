import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../utils/response.util';
import { emailService } from '../services/email.service';

export const submitContactForm = async (req: Request, res: Response) => {
  try {
    const { name, email, phone, subject, message } = req.body;

    // Validation
    if (!name || !email || !subject || !message) {
      return sendError(res, 400, 'Name, email, subject, and message are required');
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return sendError(res, 400, 'Invalid email format');
    }

    // Send email to admin
    try {
      await emailService.sendContactFormEmail(
        name.trim(),
        email.trim(),
        subject.trim(),
        message.trim(),
        phone?.trim()
      );
    } catch (emailError: any) {
      console.error('Failed to send contact form email:', emailError);
      return sendError(res, 500, 'Failed to send your message. Please try again later.');
    }

    return sendSuccess(res, 200, 'Your message has been sent successfully. We will get back to you soon!');
  } catch (error) {
    console.error('Contact form submission error:', error);
    return sendError(res, 500, 'Failed to process your request', error);
  }
};

