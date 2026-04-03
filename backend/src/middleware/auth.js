import jwt from "jsonwebtoken";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { verifyToken } from "../utils/jwt.js";
import User from "../models/User.js";

export const protect = asyncHandler(async (req, _res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new ApiError(401, "Not authorized. Missing token.");
  }

  const token = authHeader.split(" ")[1];

  let decoded;

  try {
    decoded = verifyToken(token);
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new ApiError(401, "Session expired. Please log in again.");
    }

    if (error instanceof jwt.JsonWebTokenError) {
      throw new ApiError(401, "Invalid session token. Please log in again.");
    }

    throw error;
  }

  const user = await User.findById(decoded.userId);

  if (!user) {
    throw new ApiError(401, "User not found.");
  }

  req.user = user;
  next();
});