import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config({ path: "./Backend/.env" });

const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/food-delivery";

async function run() {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const controls = await db.collection("platformcontrols").find({}).toArray();
  console.log("Controls count:", controls.length);
  for (const c of controls) {
    if (['smartRotation', 'selectMode', 'familyBox', 'customDaySelection'].includes(c.key)) {
      console.log(c.key, ":", c.value);
    }
  }
  process.exit(0);
}
run().catch(console.error);
