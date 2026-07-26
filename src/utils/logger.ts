type LogMeta = Record<string, unknown>;

function formatMessage(level: string, message: string, meta?: LogMeta): string {
  const timestamp = new Date().toISOString();
  const metaString =
    meta && Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level}] ${message}${metaString}`;
}

export const logger = {
  info(message: string, meta?: LogMeta): void {
    console.log(formatMessage('INFO', message, meta));
  },

  warn(message: string, meta?: LogMeta): void {
    console.warn(formatMessage('WARN', message, meta));
  },

  error(message: string, meta?: LogMeta): void {
    console.error(formatMessage('ERROR', message, meta));
  },

  debug(message: string, meta?: LogMeta): void {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(formatMessage('DEBUG', message, meta));
    }
  },
};
