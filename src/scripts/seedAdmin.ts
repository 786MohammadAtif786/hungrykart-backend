import "dotenv/config";
import mongoose from "mongoose";
import { User, Role } from "../models/User";

const run = async () => {
  const { MONGO_URI, ADMIN_NAME, ADMIN_EMAIL, ADMIN_MOBILE, ADMIN_PASSWORD } = process.env;

  if (!MONGO_URI || !ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_MOBILE || !ADMIN_PASSWORD) {
    console.error("MONGO_URI, ADMIN_NAME, ADMIN_EMAIL, ADMIN_MOBILE, ADMIN_PASSWORD .env mein set karein");
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);

  const existing = await User.findOne({ email: ADMIN_EMAIL.toLowerCase() });
  if (existing) {
    existing.role = Role.ADMIN;
    await existing.save();
    console.log(`Existing user ${existing.email} ko admin bana diya`);
  } else {
    await User.create({
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      mobile: ADMIN_MOBILE,
      password: ADMIN_PASSWORD,
      role: Role.ADMIN,
    });
    console.log(`Admin created: ${ADMIN_EMAIL}`);
  }

  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
