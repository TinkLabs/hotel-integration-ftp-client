/* eslint-disable comma-dangle */
module.exports = {
  apps: [{
    name: 'ftp-client',
    script: './app.js',
    interpreter: './node_modules/.bin/babel-node',
    // autorestart: true,
    watch: true,
    env: {
      NODE_ENV: 'development'
    },
    env_production: {
      NODE_ENV: 'production'
    },
  }],
};
