/**
 * Terms of Service and Privacy Policy shown under Profile → Legal.
 * Written to match how SLACKR actually handles data today; update `updated` whenever the text changes.
 */
export interface LegalSection {
  id: string;
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
  note?: string; // shown after the bullets
  link?: { href: string; label: string }; // external link shown at the end of the section
}

export interface LegalDoc {
  slug: 'terms' | 'privacy';
  title: string;
  summary: string;
  updated: string; // YYYY-MM-DD
  sections: LegalSection[];
}

export const CREATOR = {
  name: 'Ruhmer Jairus R. Espina',
  location: 'Cebu City, Philippines',
  email: 'espinajairus@gmail.com',
  phone: '0992 787 1226',
} as const;

export const PHILNITS_URL = 'https://philnits.org/';

const CONTACT = CREATOR.email;
const OPERATOR = CREATOR.name;

export const TERMS: LegalDoc = {
  slug: 'terms',
  title: 'Terms of Service',
  summary: 'The rules for using SLACKR, what you can expect from us, and what we expect from you.',
  updated: '2026-10-14',
  sections: [
    {
      id: 'agreement',
      heading: 'Agreement to these terms',
      paragraphs: [
        `SLACKR ("the app", "we", "us") is a free study tool for the PhilNITS Fundamental IT Engineer exam, created and operated by ${OPERATOR} of ${CREATOR.location}. By opening or installing the app, you agree to these Terms of Service and to our Privacy Policy. If you do not agree, do not use the app.`,
        'You may use SLACKR as a guest without an account. Some features, such as cloud backup, need an optional online account.',
      ],
    },
    {
      id: 'eligibility',
      heading: 'Who can use SLACKR',
      paragraphs: [
        'You must be at least 13 years old to create an online account. If you are under 18, use the app with the permission of a parent or guardian.',
      ],
    },
    {
      id: 'accounts',
      heading: 'Your account',
      bullets: [
        'Give a valid email address and keep your password private. You are responsible for activity on your account.',
        'Choose a username that does not impersonate others or contain offensive language. We may rename or remove accounts that break this rule.',
        'You can stop using your account at any time. To delete it and its cloud backup, contact us at ' + CONTACT + '.',
      ],
    },
    {
      id: 'philnits',
      heading: 'PhilNITS exam content and our non-profit purpose',
      paragraphs: [
        'All past exam questions, answer keys, diagrams and official exam materials in SLACKR come from PhilNITS (the Philippine National IT Standards Foundation) and the IT Passport and Fundamental IT Engineer examinations it administers with IPA Japan. They remain the property of PhilNITS, IPA and their respective owners.',
        'SLACKR is a free, independent study project. It is not affiliated with, endorsed by, or sponsored by PhilNITS, IPA or any examining body. We do not sell the questions, charge for access, run ads, or make any profit from PhilNITS materials.',
        'For official exam schedules, registration, syllabi and the authoritative versions of past papers, go to PhilNITS directly.',
      ],
      link: { href: PHILNITS_URL, label: 'Visit the official PhilNITS website' },
    },
    {
      id: 'content',
      heading: 'Our own content',
      paragraphs: [
        'The SLACKR name, logo, koala mascot, interface and original explanations belong to ' + OPERATOR + '. You may use them for personal study. You may not copy, resell or redistribute the question bank or the app.',
        'If you represent PhilNITS or IPA and want any material credited differently or removed, contact ' + CONTACT + ' and we will act on it promptly.',
      ],
    },
    {
      id: 'acceptable-use',
      heading: 'Acceptable use',
      paragraphs: ['When you use SLACKR, do not:'],
      bullets: [
        'Scrape, bulk-download or republish the question bank for others.',
        'Attempt to access other people’s accounts or data, or probe, overload or disrupt the service.',
        'Submit bug reports that contain abuse, spam, or other people’s personal information.',
        'Use the app for anything unlawful.',
      ],
    },
    {
      id: 'reports',
      heading: 'Bug reports and feedback',
      paragraphs: [
        'When you send a bug report or suggestion, you allow us to use it to improve SLACKR without owing you anything for it. Do not include passwords or sensitive personal details in a report.',
      ],
    },
    {
      id: 'availability',
      heading: 'Availability and changes',
      paragraphs: [
        'SLACKR is built to work offline, but online features such as sign-in and cloud backup depend on third-party services and may be unavailable at times. We may add, change or remove features, and we may update these terms. The "Last updated" date above changes when we do. Continuing to use the app after a change means you accept the new terms.',
      ],
    },
    {
      id: 'disclaimer',
      heading: 'No guarantee of results',
      paragraphs: [
        'SLACKR is provided "as is" and "as available". We work to keep questions, answers and explanations accurate, but we do not guarantee that they are error-free, complete or current, and we do not guarantee that you will pass any exam. Always confirm important details with official PhilNITS sources.',
      ],
    },
    {
      id: 'liability',
      heading: 'Limitation of liability',
      paragraphs: [
        `To the fullest extent allowed by law, ${OPERATOR} is not liable for indirect or consequential losses, or for loss of study data, that arise from using or being unable to use SLACKR. Your progress is stored on your device: export a backup regularly.`,
      ],
    },
    {
      id: 'law',
      heading: 'Governing law',
      paragraphs: [
        'These terms are governed by the laws of the Republic of the Philippines. Disputes will be handled by the proper courts of Cebu City.',
      ],
    },
    {
      id: 'contact',
      heading: 'Contact',
      paragraphs: [`Questions about these terms? Contact ${OPERATOR} at ${CONTACT} or ${CREATOR.phone}.`],
    },
  ],
};

export const PRIVACY: LegalDoc = {
  slug: 'privacy',
  title: 'Privacy Policy',
  summary: 'What SLACKR stores, where it lives, and the choices you have. Short version: your study data stays on your device unless you turn on cloud backup.',
  updated: '2026-10-14',
  sections: [
    {
      id: 'overview',
      heading: 'Overview',
      paragraphs: [
        `${OPERATOR} of ${CREATOR.location} created and operates SLACKR, a free, non-profit study app that is not affiliated with PhilNITS. This policy explains what information the app handles and why. We handle personal data in line with the Data Privacy Act of 2012 (Republic Act No. 10173) of the Philippines and other laws that apply to you.`,
      ],
    },
    {
      id: 'on-device',
      heading: 'Data stored only on your device',
      paragraphs: [
        'By default SLACKR runs entirely in your browser. The following stays in your browser’s storage (IndexedDB and localStorage) and is not sent to us:',
      ],
      bullets: [
        'Your answers, response times and confidence ratings.',
        'Spaced repetition schedules, bookmarks and deferred questions.',
        'Daily Set progress, streaks and analytics.',
        'Settings such as theme and review algorithm, and local device profiles.',
      ],
    },
    {
      id: 'account',
      heading: 'If you create an online account',
      paragraphs: ['An online account is optional. When you create one, we collect:'],
      bullets: [
        'Your username and email address, used to sign you in and to send password reset links.',
        'Your password, which is stored only as a secure hash by our authentication provider. We never see it in plain text.',
        'A backup copy of your study data (the same items listed above), so you can restore it on another device.',
      ],
    },
    {
      id: 'reports',
      heading: 'Bug reports',
      paragraphs: [
        'When you send a bug report we receive the category you chose, your message, the question ID if the report is about a question, the app version, the page you were on and your device type. Reports do not include your account details. Reports written offline wait on your device and send when you reconnect.',
      ],
    },
    {
      id: 'use',
      heading: 'How we use information',
      bullets: [
        'To provide sign-in, cloud backup and restore.',
        'To fix bugs and correct questions and explanations.',
        'To keep the service secure and prevent abuse.',
      ],
      note: 'We do not sell your data, show ads, or use your data for advertising profiles.',
    },
    {
      id: 'third-parties',
      heading: 'Service providers',
      paragraphs: ['SLACKR relies on these providers, which process data on our behalf under their own security commitments:'],
      bullets: [
        'Supabase: authentication, cloud backups and bug reports.',
        'Vercel: hosting the app and its server functions.',
        'Google Fonts: serving the app’s typefaces. Your browser contacts Google when it downloads them, until they are cached for offline use.',
      ],
    },
    {
      id: 'retention',
      heading: 'How long we keep data',
      paragraphs: [
        'Data we hold on our servers (account details, cloud backups and bug reports) is kept for no longer than one year, then deleted. You can ask us to delete it sooner at any time. On-device data is never sent to us: it stays until you clear it with Reset in Profile, clear your browser data, or uninstall the app.',
      ],
    },
    {
      id: 'rights',
      heading: 'Your choices and rights',
      bullets: [
        'Use SLACKR as a guest and nothing about your study leaves your device.',
        'Export all on-device data at any time with Export JSON Archive in Profile.',
        'Ask us to access, correct or delete your account and cloud backup by emailing ' + CONTACT + '.',
        'You may lodge a complaint with the National Privacy Commission of the Philippines.',
      ],
    },
    {
      id: 'security',
      heading: 'Security',
      paragraphs: [
        'Connections to our servers use HTTPS. Your browser never talks to our database directly; requests go through our own server, which checks them first. No system is perfectly secure, so use a password you do not reuse elsewhere.',
      ],
    },
    {
      id: 'children',
      heading: 'Children',
      paragraphs: [
        'Online accounts are for people aged 13 and over. If you believe a child under 13 created an account, contact us and we will delete it.',
      ],
    },
    {
      id: 'changes',
      heading: 'Changes to this policy',
      paragraphs: [
        'When we change this policy we update the "Last updated" date above. Significant changes will also be announced in the News tab.',
      ],
    },
    {
      id: 'contact',
      heading: 'Contact',
      paragraphs: [`Privacy questions or requests go to ${OPERATOR}, who acts as the data protection contact for SLACKR: ${CONTACT} or ${CREATOR.phone}, ${CREATOR.location}.`],
    },
  ],
};

export const LEGAL_DOCS = { terms: TERMS, privacy: PRIVACY } as const;
