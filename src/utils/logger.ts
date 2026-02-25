export const log = (level: 'INFO' | 'WARN' | 'ERROR', msg: string, meta?: unknown): void => {
  const stamp = new Date().toISOString();
  if (meta !== undefined) {
    console.log(`[${stamp}] [${level}] ${msg}`, meta);
  } else {
    console.log(`[${stamp}] [${level}] ${msg}`);
  }
};
