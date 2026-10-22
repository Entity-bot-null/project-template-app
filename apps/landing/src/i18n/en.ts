import { PRIVACY_EMAIL, SITE_NAME } from '../lib/site';
import type { Messages } from './messages';

export const en = {
  languageName: 'English',
  skipToContent: 'Skip to content',
  shareImageAlt: `${SITE_NAME}, beside a phone showing the list of items of the app.`,
  header: {
    navigation: 'Main',
    getApp: 'Get the app',
  },
  home: {
    title: 'Your product, in your pocket',
    description:
      'A mobile app with accounts, secure sessions and its own API, ready for the App Store and Google Play from the first release.',
    heading: ['Your product,', 'in your pocket.'],
    lead: 'A mobile app with accounts, secure sessions and its own API, ready for the App Store and Google Play from the first release.',
    action: 'Get the app',
    phone:
      'The app on a phone: the list of items, with a search field, a button to add one and the first items.',
  },
  capabilities: {
    heading: 'What it does',
    items: [
      {
        name: 'An account in a minute',
        description:
          'Sign up with your email address and confirm it with a link that opens the app.',
      },
      {
        name: 'Signed in, safely',
        description:
          "Your session lives in the phone's secure storage, and every device is signed out when your password changes.",
      },
      {
        name: 'Your data, your call',
        description:
          'Delete your account from the app whenever you want, with everything you created in it.',
      },
      {
        name: 'Made for every hand',
        description:
          'Screen readers, large text and dark mode work on every screen, with controls big enough to hit.',
      },
      {
        name: 'Keeps up with you',
        description:
          'Fixes arrive without a trip to the store; when a version is retired, the app says how to update.',
      },
      {
        name: 'Ready for teams',
        description: 'Administrators invite people with a role and see who has an account.',
      },
    ],
  },
  howItWorks: {
    heading: 'How it works',
    steps: [
      {
        name: 'Get the app',
        description: 'Download it from the App Store or Google Play.',
      },
      {
        name: 'Create your account',
        description:
          'Sign up with your email address, or accept an invitation: the link in the email opens the app.',
      },
      {
        name: 'Carry on anywhere',
        description: 'You stay signed in on your phone until you sign out.',
      },
    ],
  },
  download: {
    heading: 'Get the app',
    body: 'For iPhone and Android phones.',
    soon: 'Coming soon to the App Store and Google Play.',
    appStore: 'Download on the App Store',
    googlePlay: 'Get it on Google Play',
  },
  callToAction: {
    heading: ['Take it', 'with you.'],
    body: 'Download the app, create your account, and it is ready wherever you are.',
    action: 'Get the app',
  },
  footer: {
    product: 'Product',
    privacy: 'Privacy',
    deleteAccount: 'Delete your account',
    languages: 'Languages',
    rights: 'All rights reserved.',
    backToTop: 'Back to top',
  },
  notFound: {
    title: 'Page not found',
    heading: ['Nothing', 'lives here.'],
    body: 'The address may be mistyped, or the page may have moved.',
    action: 'Go to the home page',
  },
  openInApp: {
    title: 'Open this link in the app',
    heading: ['Open it', 'in the app.'],
    lead: `This link is for ${SITE_NAME}: it opens in the app, on the phone where the app is installed.`,
    steps: [
      'On your phone, with the app installed, open the link from the email again: the app opens on the right screen.',
      'No app yet? Install it, then open the link from the email once more.',
      'On a computer? Open the email on your phone instead: the link works in the app only.',
    ],
    action: 'Go to the home page',
  },
  privacy: {
    title: 'Privacy',
    description: `What ${SITE_NAME} collects, why, where it is kept, and how to delete it.`,
    heading: 'Privacy',
    templateNotice:
      'This page is a template. Its sections follow the data the app actually handles; the legal text, the providers and the retention periods are for the project to write before publishing.',
    sections: [
      {
        heading: 'What this covers',
        paragraphs: [
          `This page explains what ${SITE_NAME} collects, why, where it is kept and how to delete it, for the app and this website.`,
        ],
      },
      {
        heading: 'What you give us',
        paragraphs: [
          'Your email address, your name and your password when you create an account. The password is kept only as a one-way hash: nobody can read it back.',
          'What you create in the app, and a new email address when you ask to change yours.',
        ],
      },
      {
        heading: 'What the app sends with every request',
        paragraphs: [
          'The platform of your phone and the version and build of the app, so the service can ask an outdated version to update; and a random request identifier, to find a failure in the logs.',
        ],
      },
      {
        heading: 'What stays on your phone',
        paragraphs: [
          "The key that keeps you signed in, in the phone's secure storage (the iOS Keychain or the Android Keystore), deleted when you sign out.",
          'Your settings: the theme, whether you have seen the introduction, and your choice about usage analytics.',
        ],
      },
      {
        heading: 'Error reports and usage analytics',
        paragraphs: [
          'When error reports are turned on, they carry an anonymous identifier, the device model and system, and what led to the error: never your email address, your name or what you typed.',
          'Usage analytics are sent only after you agree to them in Settings, and you can withdraw at any time.',
        ],
      },
      {
        heading: 'Emails',
        paragraphs: [
          'We email you about your account only: links to confirm your address or choose a new password, invitations, and notices when your password or address changes or your account is deleted.',
        ],
      },
      {
        heading: 'Who else processes it',
        paragraphs: [
          'The providers that run the service for us: hosting, email delivery and, when turned on, error reporting. They process the data only to provide the service.',
        ],
      },
      {
        heading: 'How long we keep it',
        paragraphs: [
          'Your account and what you created, until you delete them. Sessions, until they expire. Records of the emails sent to you keep a coded form of the address, never the address itself, for 30 days.',
          'Backups of the database keep a copy until they rotate, after which nothing of a deleted account is left.',
        ],
      },
      {
        heading: 'Your choices',
        paragraphs: [
          'In the app you can change your email address and your password, and withdraw from usage analytics. You can delete your account and everything in it, from the app or by email.',
          `Questions about your data: ${PRIVACY_EMAIL}.`,
        ],
      },
    ],
  },
  deleteAccount: {
    title: 'Delete your account',
    description: `How to delete your ${SITE_NAME} account and everything in it, from the app or by email.`,
    heading: 'Delete your account',
    lead: 'You can delete your account at any time. It is deleted for good, with everything you created in it.',
    inApp: {
      heading: 'From the app',
      steps: [
        'Open the app and sign in.',
        'Go to Settings, then Delete account.',
        'Enter your password and confirm. Your account is deleted at once, and every device signed in to it is signed out.',
      ],
    },
    byEmail: {
      heading: 'Without the app',
      body: `If you cannot use the app, write to ${PRIVACY_EMAIL} from the address of your account. We reply to confirm that the request is yours, then delete the account.`,
      subject: 'Delete my account',
    },
    deleted: {
      heading: 'What is deleted',
      paragraphs: [
        'Your profile (email address, name and password), what you created in the app, your sessions and any pending links.',
        'A notice goes to your address once it is done.',
      ],
    },
    kept: {
      heading: 'What is kept, and for how long',
      paragraphs: [
        'Backups of the database keep a copy until they rotate; after that, nothing of the account is left.',
        'Records of the emails sent to you keep a coded form of the address, never the address itself, for 30 days.',
      ],
    },
  },
} as const satisfies Messages;
