const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
if (process.env.TEST_DB_NAME) process.env.DB_NAME = process.env.TEST_DB_NAME;
process.env.NODE_ENV = 'test';
if (!process.env.TEACHER_PIN) process.env.TEACHER_PIN = '1234';
if (!process.env.TEACHER_ADMIN_EMAIL) process.env.TEACHER_ADMIN_EMAIL = 'admin.test@foretmap.local';
if (!process.env.TEACHER_ADMIN_PASSWORD) process.env.TEACHER_ADMIN_PASSWORD = 'admin1234';
