import mongoose from "mongoose";

export async function connectSystemTestDb(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error("MONGODB_URI is missing. Check your test environment file.");
  }

  if (mongoose.connection.readyState === 1) {
    return;
  }

  await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 10000,
  });
}

export async function clearSystemTestDb(): Promise<void> {
  if (mongoose.connection.readyState !== 1) {
    return;
  }

  const { collections } = mongoose.connection;

  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
}

export async function closeSystemTestDb(): Promise<void> {
  if (mongoose.connection.readyState !== 1) {
    return;
  }

  await mongoose.connection.db?.dropDatabase();
  await mongoose.connection.close();
}