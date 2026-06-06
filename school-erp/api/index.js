require('dotenv').config();
const app = require('../backend/src/app');
const connectDatabase = require('../backend/config/db');

let isDbConnected = false;

module.exports = async (req, res) => {
  if (!isDbConnected) {
    const originalExit = process.exit;
    process.exit = (code) => {
      console.warn(`process.exit(${code}) called, but ignored in Vercel serverless function.`);
    };

    try {
      await connectDatabase();
      isDbConnected = true;
    } catch (err) {
      console.error("Failed to connect to database in Vercel handler", err);
      return res.status(500).json({ error: "Database connection failed" });
    }
  }

  return app(req, res);
};
