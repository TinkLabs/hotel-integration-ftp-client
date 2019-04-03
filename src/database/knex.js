/* eslint-disable global-require */
import dotenv from 'dotenv';

// load the .env file
dotenv.load();

let knex = require('knex');

export default knex({
  client: 'mysql2',
  connection: {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  },
  debug: true,
});
