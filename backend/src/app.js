import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

import router from "./routes/index.js";
import { env } from "./config/env.js";
import { notFound } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();

const isProduction = env.NODE_ENV === "production";
const isTest = env.NODE_ENV === "test";


if (isProduction) {
  app.set("trust proxy", 1);
} else {
  app.set("trust proxy", false);
}

app.use(helmet());
app.use(compression());

app.use(
  cors({
    origin: env.CLIENT_URL === "*" ? true : env.CLIENT_URL,
    credentials: true,
  })
);

if (isProduction) {
  app.use((req, res, next) => {
    const forwardedProto = req.headers["x-forwarded-proto"];
    const isSecure = req.secure || forwardedProto === "https";

    if (isSecure) {
      return next();
    }

    return res.status(400).json({
      success: false,
      message: "HTTPS is required in production.",
    });
  });
}

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.NODE_ENV === "development" ? 5000 : 500,
  standardHeaders: true,
  legacyHeaders: false,
});


if (!isTest) {
  app.use("/api", apiLimiter);
}

app.use("/api", router);

app.use(notFound);
app.use(errorHandler);

export default app;