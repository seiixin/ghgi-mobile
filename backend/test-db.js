import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function testConnection() {
  console.log('Testing connection to:', process.env.DB_HOST);
  console.log('User:', process.env.DB_USER);
  console.log('Password length:', process.env.DB_PASSWORD ? process.env.DB_PASSWORD.length : 0);
  console.log('Password first char:', process.env.DB_PASSWORD ? process.env.DB_PASSWORD[0] : 'N/A');
  console.log('Password last char:', process.env.DB_PASSWORD ? process.env.DB_PASSWORD[process.env.DB_PASSWORD.length - 1] : 'N/A');
  
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT
    });
    
    console.log('Successfully connected!');
    await connection.end();
  } catch (err) {
    console.error('Connection failed:', err.message);
  }
}

testConnection();
