import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://IndinaFoods:IndinaFoods@cluster0.gptsvku.mongodb.net/?appName=Cluster0';

mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    console.log('Connected to DB');
    const adminSchema = new mongoose.Schema({ email: String }, { strict: false });
    const Admin = mongoose.model('FoodAdmin', adminSchema, 'food_admins');
    
    const admins = await Admin.find({});
    console.log('Admins found:');
    admins.forEach(a => console.log(a.email, a.password));
    
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
