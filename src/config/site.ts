/**
 * Site configuration
 */
export const siteConfig = {
  name: 'PDFPilot AI',
  description: 'AI-powered PDF workspace for editing, summarizing, translating, OCR, and chat with PDF.',
  url: 'https://pdfpilot-ai.com',
  ogImage: '/images/og-image.png',
  links: {
    github: 'https://github.com/PDFCraftTool/pdfcraft',
    twitter: 'https://twitter.com/pdfpilotai',
  },
  creator: 'PDFPilot AI Team',
  keywords: [
    'PDF tools',
    'PDF editor',
    'merge PDF',
    'split PDF',
    'compress PDF',
    'convert PDF',
    'free PDF tools',
    'online PDF editor',
    'browser-based PDF',
    'private PDF processing',
  ],
  // SEO-related settings
  seo: {
    titleTemplate: '%s | PDFPilot AI',
    defaultTitle: 'PDFPilot AI - AI PDF Workspace',
    twitterHandle: '@pdfpilotai',
    locale: 'en_US',
  },
};

/**
 * Navigation configuration
 */
export const navConfig = {
  mainNav: [
    { title: 'Home', href: '/' },
    { title: 'Tools', href: '/tools' },
    { title: 'About', href: '/about' },
    { title: 'FAQ', href: '/faq' },
  ],
  footerNav: [
    { title: 'Privacy', href: '/privacy' },
    { title: 'Terms', href: '/terms' },
    { title: 'Contact', href: '/contact' },
  ],
};
