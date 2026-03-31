import mongoose from "mongoose";
import { env } from "./env.js";

const maskMongoUri = (uri = "") => {
  try {
    return uri.replace(/\/\/(.*?):(.*?)@/, "//$1:***@");
  } catch {
    return uri;
  }
};

export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });

    console.log("✅ MongoDB connected");
    console.log("DB HOST:", conn.connection.host);
    console.log("DB PORT:", conn.connection.port);
    console.log("DB NAME:", conn.connection.name);
    console.log("DB URI:", maskMongoUri(env.MONGODB_URI));
    console.log("DB READY STATE:", conn.connection.readyState);
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error.message);
    process.exit(1);
  }
};