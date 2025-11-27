import axios from 'axios';

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_API_URL = 'https://api.brevo.com/v3';
const SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || 'm.41usaid@gmail.com';
const SENDER_NAME = process.env.BREVO_SENDER_NAME || 'Mawjood';
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || 'm.41usaid@gmail.com';

// Optional: Template IDs from Brevo (if you create templates)
// Note: Brevo template IDs can be numeric or string identifiers
const TEMPLATE_IDS = {
  OTP: process.env.BREVO_TEMPLATE_ID_OTP || null,
  SUBSCRIPTION_EXPIRY: process.env.BREVO_TEMPLATE_ID_SUBSCRIPTION_EXPIRY || null,
  CONTACT_FORM: process.env.BREVO_TEMPLATE_ID_CONTACT_FORM || null,
};

interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

class EmailService {
  private apiKey: string;
  private apiUrl: string;

  constructor() {
    if (!BREVO_API_KEY) {
      throw new Error('BREVO_API_KEY is not configured');
    }
    this.apiKey = BREVO_API_KEY;
    this.apiUrl = BREVO_API_URL;
  }

  /**
   * Send email using Brevo Transactional Email API
   */
  async sendEmail(options: EmailOptions, templateId?: number | string, templateParams?: Record<string, any>): Promise<void> {
    const recipients = Array.isArray(options.to) ? options.to : [options.to];
    
    const emailData: any = {
      sender: {
        name: SENDER_NAME,
        email: SENDER_EMAIL,
      },
      to: recipients.map((email) => ({ email })),
    };

    // Use template if provided, otherwise use HTML content
    if (templateId && templateParams) {
      // Brevo accepts both numeric IDs and string identifiers
      // Try to parse as number first, otherwise use as string
      const parsedId = typeof templateId === 'string' && !isNaN(Number(templateId)) 
        ? parseInt(templateId) 
        : templateId;
      emailData.templateId = parsedId;
      emailData.params = templateParams;
    } else {
      emailData.subject = options.subject;
      emailData.htmlContent = options.html;
      emailData.textContent = options.text || this.stripHtml(options.html);
    }

    try {
      const response = await axios.post(
        `${this.apiUrl}/smtp/email`,
        emailData,
        {
          headers: {
            'api-key': this.apiKey,
            'Content-Type': 'application/json',
          },
        }
      );

      console.log('✅ Email sent successfully:', response.data);
    } catch (error: any) {
      // If template ID is invalid, fall back to HTML email
      if (templateId && error.response?.data?.code === 'invalid_parameter' && error.response?.data?.message?.includes('template')) {
        console.warn('⚠️ Template ID invalid, falling back to HTML email');
        // Retry with HTML content
        const fallbackData = {
          sender: {
            name: SENDER_NAME,
            email: SENDER_EMAIL,
          },
          to: recipients.map((email) => ({ email })),
          subject: options.subject,
          htmlContent: options.html,
          textContent: options.text || this.stripHtml(options.html),
        };

        try {
          const fallbackResponse = await axios.post(
            `${this.apiUrl}/smtp/email`,
            fallbackData,
            {
              headers: {
                'api-key': this.apiKey,
                'Content-Type': 'application/json',
              },
            }
          );
          console.log('✅ Email sent successfully (HTML fallback):', fallbackResponse.data);
          return;
        } catch (fallbackError: any) {
          console.error('❌ Error sending email (fallback failed):', fallbackError.response?.data || fallbackError.message);
          throw new Error(`Failed to send email: ${fallbackError.response?.data?.message || fallbackError.message}`);
        }
      }

      console.error('❌ Error sending email:', error.response?.data || error.message);
      throw new Error(`Failed to send email: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Send OTP email
   */
  async sendOTPEmail(email: string, otp: string): Promise<void> {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Your OTP Code</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #1c4233 0%, #245240 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0;">Mawjood</h1>
          </div>
          <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
            <h2 style="color: #1c4233; margin-top: 0;">Verification Code</h2>
            <p>Hello,</p>
            <p>Your verification code for Mawjood is:</p>
            <div style="background: white; border: 2px dashed #1c4233; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
              <h1 style="color: #1c4233; font-size: 36px; letter-spacing: 5px; margin: 0;">${otp}</h1>
            </div>
            <p>This code will expire in <strong>10 minutes</strong>.</p>
            <p>If you didn't request this code, please ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
            <p style="color: #666; font-size: 12px; margin: 0;">This is an automated message, please do not reply.</p>
          </div>
        </body>
      </html>
    `;

    // Try template first if available, with HTML fallback
    if (TEMPLATE_IDS.OTP) {
      try {
        await this.sendEmail(
          { to: email, subject: 'Your Verification Code - Mawjood', html },
          TEMPLATE_IDS.OTP,
          { otp, expiryMinutes: 10 }
        );
        return;
      } catch (error) {
        // Template failed, will fall back to HTML in sendEmail method
        console.warn('Template email failed, using HTML fallback');
      }
    }

    // Use HTML email directly
    await this.sendEmail({
      to: email,
      subject: 'Your Verification Code - Mawjood',
      html,
    });
  }

  /**
   * Send subscription expiry reminder email
   */
  async sendSubscriptionExpiryEmail(
    email: string,
    businessName: string,
    planName: string,
    expiryDate: Date,
    daysUntilExpiry: number
  ): Promise<void> {
    const expiryDateStr = expiryDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    let urgencyText = '';
    let urgencyColor = '#1c4233';
    
    if (daysUntilExpiry === 1) {
      urgencyText = '⚠️ Your subscription expires TOMORROW!';
      urgencyColor = '#dc2626';
    } else if (daysUntilExpiry <= 3) {
      urgencyText = `⚠️ Your subscription expires in ${daysUntilExpiry} days!`;
      urgencyColor = '#f59e0b';
    } else {
      urgencyText = `Your subscription expires in ${daysUntilExpiry} days`;
    }

    // Fallback to HTML email
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Subscription Expiring Soon</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #1c4233 0%, #245240 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0;">Mawjood</h1>
          </div>
          <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
            <h2 style="color: ${urgencyColor}; margin-top: 0;">${urgencyText}</h2>
            <p>Hello,</p>
            <p>We wanted to remind you that your subscription for <strong>${businessName}</strong> is expiring soon.</p>
            <div style="background: white; border-left: 4px solid ${urgencyColor}; padding: 20px; margin: 20px 0;">
              <p style="margin: 5px 0;"><strong>Plan:</strong> ${planName}</p>
              <p style="margin: 5px 0;"><strong>Expiry Date:</strong> ${expiryDateStr}</p>
              <p style="margin: 5px 0;"><strong>Days Remaining:</strong> ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''}</p>
            </div>
            <p>To continue enjoying premium benefits and keep your business featured, please renew your subscription.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL || 'https://mawjood.com'}/dashboard/subscriptions" 
                 style="background: #1c4233; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                Renew Subscription
              </a>
            </div>
            <p>If you have any questions, please don't hesitate to contact our support team.</p>
            <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
            <p style="color: #666; font-size: 12px; margin: 0;">This is an automated message, please do not reply.</p>
          </div>
        </body>
      </html>
    `;

    // Try template first if available, with HTML fallback
    if (TEMPLATE_IDS.SUBSCRIPTION_EXPIRY) {
      // Handle pluralization for days
      const daysText = daysUntilExpiry === 1 ? '1 day' : `${daysUntilExpiry} days`;
      
      try {
        await this.sendEmail(
          { to: email, subject: `${urgencyText} - ${businessName}`, html },
          TEMPLATE_IDS.SUBSCRIPTION_EXPIRY,
          {
            businessName,
            planName,
            expiryDate: expiryDateStr,
            daysUntilExpiry,
            daysText, // Pre-formatted text with correct pluralization
            urgencyText,
            renewUrl: `${process.env.FRONTEND_URL || 'https://mawjood.com'}/dashboard/subscriptions`,
          }
        );
        return;
      } catch (error) {
        // Template failed, will fall back to HTML in sendEmail method
        console.warn('Template email failed, using HTML fallback');
      }
    }

    // Use HTML email directly
    await this.sendEmail({
      to: email,
      subject: `${urgencyText} - ${businessName}`,
      html,
    });
  }

  /**
   * Send contact form email to admin
   */
  async sendContactFormEmail(
    name: string,
    email: string,
    subject: string,
    message: string,
    phone?: string
  ): Promise<void> {
    // Fallback to HTML email
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>New Contact Form Submission</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #1c4233 0%, #245240 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0;">New Contact Form Submission</h1>
          </div>
          <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
            <h2 style="color: #1c4233; margin-top: 0;">You have received a new message</h2>
            <div style="background: white; padding: 20px; margin: 20px 0; border-radius: 5px;">
              <p style="margin: 10px 0;"><strong>Name:</strong> ${name}</p>
              <p style="margin: 10px 0;"><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
              ${phone ? `<p style="margin: 10px 0;"><strong>Phone:</strong> <a href="tel:${phone}">${phone}</a></p>` : ''}
              <p style="margin: 10px 0;"><strong>Subject:</strong> ${subject}</p>
            </div>
            <div style="background: white; padding: 20px; margin: 20px 0; border-radius: 5px;">
              <h3 style="color: #1c4233; margin-top: 0;">Message:</h3>
              <p style="white-space: pre-wrap;">${message}</p>
            </div>
            <div style="text-align: center; margin: 30px 0;">
              <a href="mailto:${email}" 
                 style="background: #1c4233; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                Reply to ${name}
              </a>
            </div>
            <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
            <p style="color: #666; font-size: 12px; margin: 0;">This email was sent from the Mawjood contact form.</p>
          </div>
        </body>
      </html>
    `;

    // Try template first if available, with HTML fallback
    if (TEMPLATE_IDS.CONTACT_FORM) {
      try {
        await this.sendEmail(
          { to: CONTACT_EMAIL, subject: `Contact Form: ${subject}`, html },
          TEMPLATE_IDS.CONTACT_FORM,
          {
            name,
            email,
            phone: phone || 'Not provided',
            subject,
            message,
          }
        );
        return;
      } catch (error) {
        // Template failed, will fall back to HTML in sendEmail method
        console.warn('Template email failed, using HTML fallback');
      }
    }

    // Use HTML email directly
    await this.sendEmail({
      to: CONTACT_EMAIL,
      subject: `Contact Form: ${subject}`,
      html,
      text: `
New Contact Form Submission

Name: ${name}
Email: ${email}
${phone ? `Phone: ${phone}` : ''}
Subject: ${subject}

Message:
${message}
      `.trim(),
    });
  }

  /**
   * Strip HTML tags to create plain text version
   */
  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }
}

// Export singleton instance
export const emailService = new EmailService();

