import { AppError } from '../errors';
import {
  addBreadcrumb,
  disabledReporter,
  type ErrorReporter,
  errorReporter,
  reportError,
  setErrorReporter,
} from './errorReporter';
import { logger } from './logger';

function fakeReporter(): jest.Mocked<ErrorReporter> {
  return { enabled: true, capture: jest.fn(), addBreadcrumb: jest.fn(), setUser: jest.fn() };
}

afterEach(() => {
  setErrorReporter(disabledReporter);
});

describe('reportError', () => {
  let reporter: jest.Mocked<ErrorReporter>;

  beforeEach(() => {
    reporter = fakeReporter();
    setErrorReporter(reporter);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('reports unexpected errors with their kind and status', () => {
    const error = new AppError('server', 'HTTP 500', { status: 500 });
    reportError(error, { tags: { feature: 'items' } });
    expect(reporter.capture).toHaveBeenCalledWith(error, {
      tags: { 'error.kind': 'server', 'http.status': 500, feature: 'items' },
    });
  });

  it('keeps expected outcomes as breadcrumbs only', () => {
    reportError(new AppError('network', 'offline'));
    expect(reporter.capture).not.toHaveBeenCalled();
    expect(reporter.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'app', message: 'network error' }),
    );
  });

  it('is a no-op without a provider', () => {
    setErrorReporter(disabledReporter);
    expect(errorReporter().enabled).toBe(false);
    expect(() => {
      reportError(new Error('bug'));
      addBreadcrumb({ category: 'app', message: 'x' });
      disabledReporter.setUser('u');
    }).not.toThrow();
  });
});

describe('logger', () => {
  it('prints redacted lines in development and leaves breadcrumbs', () => {
    const reporter = fakeReporter();
    setErrorReporter(reporter);
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    logger.info('auth', 'Session restored', { password: 'x' });
    logger.warn('network', 'Slow');
    logger.error('app', 'Broken');
    expect(log).toHaveBeenCalledWith('[auth] Session restored', { password: '[REDACTED]' });
    expect(warn).toHaveBeenCalledWith('[network] Slow', '');
    expect(error).toHaveBeenCalledWith('[app] Broken', '');
    expect(reporter.addBreadcrumb).toHaveBeenCalledWith({
      category: 'auth',
      message: 'Session restored',
      level: 'info',
      data: { password: '[REDACTED]' },
    });
  });
});
