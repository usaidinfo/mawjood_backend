import { Request, Response } from 'express';
import prisma from '../config/database';
import { sendSuccess, sendError } from '../utils/response.util';

const SETTINGS_KEY = 'default';

const DEFAULT_SITE_SETTINGS = {
  hero: {
    title: 'Discover & Connect Locally',
    subtitle: 'Find trusted businesses, services, and experiences across Saudi Arabia.',
    cards: [
      {
        id: 'transporters',
        title: 'Packers & Movers',
        buttonText: 'Get Best Deal',
        buttonColor: 'bg-orange-500 hover:bg-orange-600',
        image: '/home/packers.jpg',
        slug: 'transporters',
      },
      {
        id: 'repairs',
        title: 'Repairs & Services',
        buttonText: 'Book Now',
        buttonColor: 'bg-blue-500 hover:bg-blue-600',
        image: '/home/b2b.jpg',
        slug: 'repairs',
      },
      {
        id: 'real-estate',
        title: 'Real Estate',
        buttonText: 'Explore',
        buttonColor: 'bg-purple-500 hover:bg-purple-600',
        image: '/home/real-estate.jpg',
        slug: 'real-estate',
      },
      {
        id: 'healthcare',
        title: 'Doctors & Clinics',
        buttonText: 'Book Now',
        buttonColor: 'bg-green-500 hover:bg-green-600',
        image: '/home/doctors.jpg',
        slug: 'healthcare',
      },
    ],
  },
  navbar: {
    logoUrl: '/logo/logo-light.png',
    brandName: 'Mawjood',
    tagline: 'Discover & connect locally',
  },
  featuredSections: [
    {
      id: 'home-services',
      title: 'Home Services',
      subtitle: 'Top-rated services for your home',
      layout: 'grid',
      cardsPerRow: 3,
      items: [
        {
          id: 'cleaning-services',
          name: 'Cleaning Services',
          image: 'https://images.pexels.com/photos/4108715/pexels-photo-4108715.jpeg?auto=compress&cs=tinysrgb&w=400',
          slug: 'cleaning-services',
        },
        {
          id: 'plumbing',
          name: 'Plumbing',
          image: 'https://media.istockphoto.com/id/183953925/photo/young-plumber-fixing-a-sink-in-bathroom.jpg?s=612x612&w=0&k=20&c=Ps2U_U4_Z60mIZsuem-BoaHLlCjsT8wYWiXNWR-TCDA=',
          slug: 'plumbing',
        },
        {
          id: 'painting',
          name: 'Painting',
          image: 'https://5.imimg.com/data5/SELLER/Default/2021/6/MY/NI/YW/52844401/wall-paintings.jpg',
          slug: 'painting',
        },
      ],
    },
    {
      id: 'beauty-spa',
      title: 'Beauty & Spa',
      subtitle: 'Relax and rejuvenate with premium services',
      layout: 'grid',
      cardsPerRow: 3,
      items: [
        {
          id: 'beauty-parlours',
          name: 'Beauty Parlours',
          image: 'https://images.pexels.com/photos/3993449/pexels-photo-3993449.jpeg?auto=compress&cs=tinysrgb&w=400',
          slug: 'beauty-parlours',
        },
        {
          id: 'spa-massages',
          name: 'Spa & Massages',
          image: 'https://images.pexels.com/photos/3757952/pexels-photo-3757952.jpeg?auto=compress&cs=tinysrgb&w=400',
          slug: 'spa-massages',
        },
        {
          id: 'salons',
          name: 'Salons',
          image: 'https://images.pexels.com/photos/3993462/pexels-photo-3993462.jpeg?auto=compress&cs=tinysrgb&w=400',
          slug: 'salons',
        },
      ],
    },
    {
      id: 'repairs-services',
      title: 'Repairs & Maintenance',
      subtitle: 'Keep everything running smoothly',
      layout: 'grid',
      cardsPerRow: 3,
      items: [
        {
          id: 'ac-service',
          name: 'AC Service',
          image: 'https://www.rightcliq.in/blogs/images/blogs/ac-repair-service.jpg',
          slug: 'ac-service',
        },
        {
          id: 'car-service',
          name: 'Car Service',
          image: 'https://images.pexels.com/photos/3806288/pexels-photo-3806288.jpeg?auto=compress&cs=tinysrgb&w=400',
          slug: 'car-service',
        },
        {
          id: 'electricians',
          name: 'Electricians',
          image: 'https://img.freepik.com/free-photo/man-electrical-technician-working-switchboard-with-fuses_169016-24062.jpg',
          slug: 'electricians',
        },
      ],
    },
  ],
  reviews: [
    {
      id: 1,
      name: 'Sarah Johnson',
      designation: 'Marketing Director',
      rating: 5,
      comment:
        'Mawjood has completely transformed how I find local services. The platform is incredibly user-friendly and the verified listings give me confidence in my choices. Highly recommend!',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&h=150&fit=crop',
    },
    {
      id: 2,
      name: 'Ahmed Al-Rashid',
      designation: 'Business Owner',
      rating: 5,
      comment:
        "As a business owner, listing on Mawjood was the best decision. We've seen a 300% increase in customer inquiries. The platform connects us with genuinely interested customers.",
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop',
    },
  ],
  downloadBanner: {
    title: 'Download Mawjood App',
    subtitle: 'Explore trusted local businesses anytime, anywhere.',
    appStoreUrl: '#',
    playStoreUrl: '#',
    metrics: [
      { label: 'Active Users', value: '10K+' },
      { label: 'App Rating', value: '4.8/5' },
      { label: 'Cities Covered', value: '45+' },
    ],
  },
  footer: {
    companyName: 'Mawjood',
    tagline: 'Connecting people to trusted local businesses across Saudi Arabia.',
    quickLinks: [
      { label: 'About Us', url: '/about' },
      { label: 'Careers', url: '/careers' },
      { label: 'Terms & Conditions', url: '/terms' },
      { label: 'Privacy Policy', url: '/privacy' },
      { label: 'Support', url: '/support' },
    ],
    businessLinks: [
      { label: 'Add Business', url: '/add-business' },
      { label: 'Advertise', url: '/advertise' },
      { label: 'What’s New', url: '/whats-new' },
      { label: 'For Brands', url: '/brands' },
    ],
    socialLinks: [
      { name: 'Facebook', url: 'https://facebook.com', icon: 'facebook' },
      { name: 'Instagram', url: 'https://instagram.com', icon: 'instagram' },
      { name: 'Twitter', url: 'https://twitter.com', icon: 'twitter' },
      { name: 'LinkedIn', url: 'https://linkedin.com', icon: 'linkedin' },
    ],
  },
  about: {
    hero: {
      title: 'Welcome to Mawjood',
      subtitle: 'Your trusted platform connecting businesses and customers across Saudi Arabia',
      stats: [
        { icon: 'building', label: '1000+ Businesses' },
        { icon: 'users', label: '50,000+ Users' },
        { icon: 'award', label: 'Verified & Trusted' },
      ],
    },
    mission: {
      title: 'Our Mission',
      description:
        'To empower local businesses in Saudi Arabia by providing them with a powerful digital platform to reach more customers, grow their presence, and thrive in the digital economy.',
    },
    vision: {
      title: 'Our Vision',
      description:
        'To become the leading business discovery platform in Saudi Arabia, where every local business is visible, accessible, and celebrated.',
    },
    story: {
      title: 'Our Story',
      paragraphs: [
        'Mawjood was born from a simple observation: finding reliable local businesses in Saudi Arabia was harder than it should be. In 2024, we set out to change that by creating a platform that brings businesses and customers together seamlessly.',
        'What started as a small directory has grown into a comprehensive platform serving thousands of businesses across major Saudi cities.',
      ],
    },
    values: [
      { icon: 'shield', title: 'Trust & Safety', description: 'We verify every business to ensure our users connect with legitimate, trustworthy services.' },
      { icon: 'zap', title: 'Innovation', description: 'We continuously improve our platform with cutting-edge features and user-friendly design.' },
      { icon: 'users', title: 'Community First', description: 'We prioritize the needs of our local communities and support Saudi businesses at every stage.' },
      { icon: 'heart', title: 'Passion', description: "We're passionate about helping businesses succeed and making life easier for our users." },
    ],
    stats: [
      { label: 'Active Businesses', value: '1,000+' },
      { label: 'Happy Users', value: '50,000+' },
      { label: 'Cities Covered', value: '45+' },
      { label: 'Monthly Searches', value: '100,000+' },
    ],
  },
  contact: {
    emails: ['info@mawjood.sa', 'support@mawjood.sa'],
    phones: ['+966 11 234 5678', '+966 50 987 6543'],
    socialLinks: [
      { name: 'Facebook', url: 'https://facebook.com' },
      { name: 'Instagram', url: 'https://instagram.com' },
      { name: 'Twitter', url: 'https://twitter.com' },
      { name: 'LinkedIn', url: 'https://linkedin.com' },
    ],
    location: {
      address: 'King Fahd Road, Riyadh, Saudi Arabia',
      latitude: 24.7136,
      longitude: 46.6753,
    },
  },
};

const prismaClient = prisma as any;

const ensureSiteSettings = async () => {
  let settings = await prismaClient.siteSettings.findUnique({
    where: { key: SETTINGS_KEY },
  });

  if (!settings) {
    settings = await prismaClient.siteSettings.create({
      data: {
        key: SETTINGS_KEY,
        ...DEFAULT_SITE_SETTINGS,
      },
    });
  }

  return settings;
};

export const getSiteSettings = async (_req: Request, res: Response) => {
  try {
    const settings = await ensureSiteSettings();
    return sendSuccess(res, 200, 'Site settings fetched successfully', settings);
  } catch (error) {
    console.error('Get site settings error:', error);
    return sendError(res, 500, 'Failed to fetch site settings', error);
  }
};

export const updateSiteSettings = async (req: Request, res: Response) => {
  try {
    const payload = req.body ?? {};
    const settings = await ensureSiteSettings();

    const data: Record<string, unknown> = {};

    if (Object.prototype.hasOwnProperty.call(payload, 'hero')) {
      data.hero = payload.hero;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'navbar')) {
      data.navbar = payload.navbar;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'featuredSections')) {
      data.featuredSections = payload.featuredSections;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'reviews')) {
      data.reviews = payload.reviews;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'downloadBanner')) {
      data.downloadBanner = payload.downloadBanner;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'footer')) {
      data.footer = payload.footer;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'about')) {
      data.about = payload.about;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'contact')) {
      data.contact = payload.contact;
    }

    if (Object.keys(data).length === 0) {
      return sendError(res, 400, 'No updatable fields provided');
    }

    const updated = await prismaClient.siteSettings.update({
      where: { id: settings.id },
      data,
    });

    return sendSuccess(res, 200, 'Site settings updated successfully', updated);
  } catch (error) {
    console.error('Update site settings error:', error);
    return sendError(res, 500, 'Failed to update site settings', error);
  }
};

