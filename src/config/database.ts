import mongoose from 'mongoose';
import { env } from './env.js';
import { MESSAGES } from '../constants/index.js';
import { logger } from '../utils/logger.js';

mongoose.set('strictQuery', true);

export async function connectDatabase(): Promise<typeof mongoose> {
  try {
    const connection = await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10_000,
      maxPoolSize: 10,
      minPoolSize: 1,
    });

    logger.info(MESSAGES.DATABASE_CONNECTED, {
      host: connection.connection.host,
      name: connection.connection.name,
    });

    mongoose.connection.on('error', (error: Error) => {
      logger.error('MongoDB connection error', { error: error.message });
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn(MESSAGES.DATABASE_DISCONNECTED);
    });

    return connection;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown database error';
    logger.error('Failed to connect to MongoDB', { error: message });
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
    logger.info(MESSAGES.DATABASE_DISCONNECTED);
  }
}
