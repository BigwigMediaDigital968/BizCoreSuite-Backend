import mongoose from "mongoose";

import { env } from "../config/env.js";
import { User } from "../models/User.js";
import { ROLES } from "../constants/roles.js";
import {
  hashPassword
} from "../utils/password.js";

const createInitialHead = async () => {
  await mongoose.connect(env.mongoUri);

  const existingHead = await User.findOne({
    role: ROLES.HEAD
  });

  if (existingHead) {
    console.log(
      "A Head user already exists."
    );

    await mongoose.disconnect();

    return;
  }

  const password = process.env.INITIAL_HEAD_PASSWORD;

  if (!password) {
    throw new Error(
      "INITIAL_HEAD_PASSWORD is required"
    );
  }

  const hashedPassword =
    await hashPassword(password);

  const head = await User.create({
    name: process.env.INITIAL_HEAD_NAME || "System Head",
    email: process.env.INITIAL_HEAD_EMAIL,
    password: hashedPassword,
    role: ROLES.HEAD,
    branches: [],
    isActive: true
  });

  console.log(
    `Initial Head created: ${head.email}`
  );

  await mongoose.disconnect();
};

createInitialHead().catch((error) => {
  console.error(error);
  process.exit(1);
});