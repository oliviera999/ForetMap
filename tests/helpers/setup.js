const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
if (process.env.TEST_DB_NAME) process.env.DB_NAME = process.env.TEST_DB_NAME;
process.env.NODE_ENV = 'test';
if (!process.env.TEACHER_PIN) process.env.TEACHER_PIN = '1234';
