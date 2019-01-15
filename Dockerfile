FROM keymetrics/pm2:8-stretch



# Bundle APP files
COPY src app/src/
COPY package.json app/.
COPY app.config.js app/.

# Install app dependencies
RUN npm install

# Expose the listening port
EXPOSE 80

CMD ["pm2-runtime", "start", "app.config.js"]