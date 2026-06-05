import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://IndinaFoods:IndinaFoods@cluster0.gptsvku.mongodb.net/?appName=Cluster0';

mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    console.log('Connected to DB');
    const appConfigSchema = new mongoose.Schema({}, { strict: false });
    const AppConfig = mongoose.model('AppConfigCheck', appConfigSchema, 'appconfigs');
    
    const configs = await AppConfig.find({});
    console.log('Configs found in DB:');
    console.log(JSON.stringify(configs, null, 2));
    
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
