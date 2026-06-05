import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://IndinaFoods:IndinaFoods@cluster0.gptsvku.mongodb.net/?appName=Cluster0';

mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    console.log('Connected to DB');
    
    // Define exact schema to trigger pre-save hooks if any, or just hash manually
    const adminSchema = new mongoose.Schema({ 
        email: { type: String, required: true },
        password: { type: String, required: true },
        role: { type: String, default: 'ADMIN' },
        isActive: { type: Boolean, default: true }
    }, { collection: 'food_admins', strict: false });
    
    const Admin = mongoose.model('FoodAdmin', adminSchema);
    
    const email = 'admin@example.com';
    const rawPassword = 'password123';
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(rawPassword, salt);
    
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
        console.log(`Admin ${email} already exists. Updating password...`);
        existingAdmin.password = hashedPassword;
        await existingAdmin.save();
        console.log('Password updated.');
    } else {
        const newAdmin = new Admin({
            email,
            password: hashedPassword,
            role: 'ADMIN',
            isActive: true
        });
        await newAdmin.save();
        console.log(`Created new admin: ${email}`);
    }
    
    console.log(`Email: ${email}`);
    console.log(`Password: ${rawPassword}`);
    
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
