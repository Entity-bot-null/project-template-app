import { addBreadcrumb, type Breadcrumb } from './errorReporter';
import { redact } from './redact';

// The app's logger. In development it prints (redacted) to the Metro console;
// in every build it leaves a breadcrumb, the trail that comes with the next
// error report. There is no remote log shipping: a phone is not a server.
// Log ids and states, never personal data or anything a user typed.

type Category = Breadcrumb['category'];
type Data = Breadcrumb['data'];

function write(
  level: 'info' | 'warning' | 'error',
  category: Category,
  message: string,
  data?: Data,
) {
  if (__DEV__) {
    // The one place allowed to print (ESLint no-console elsewhere).
    const print =
      level === 'info' ? console.log : level === 'warning' ? console.warn : console.error;
    print(`[${category}] ${message}`, data === undefined ? '' : redact(data));
  }
  addBreadcrumb({ category, message, level, ...(data && { data: redact(data) }) });
}

export const logger = {
  info: (category: Category, message: string, data?: Data) => {
    write('info', category, message, data);
  },
  warn: (category: Category, message: string, data?: Data) => {
    write('warning', category, message, data);
  },
  error: (category: Category, message: string, data?: Data) => {
    write('error', category, message, data);
  },
};
