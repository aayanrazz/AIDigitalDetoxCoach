import app from "./app.js";
import { connectDB } from "./config/db.js";
import { env } from "./config/env.js";
import { startPrivacyRetentionJob } from "./jobs/privacyRetention.job.js";

const startServer = async () => {
  try {
    await connectDB();

    startPrivacyRetentionJob();

    app.listen(env.PORT, () => {
      console.log(
        `🚀 Server running on ${
          env.NODE_ENV === "production"
            ? `port ${env.PORT}`
            : `http://localhost:${env.PORT}`
        }`
      );
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error.message);
    process.exit(1);
  }
};

startServer();