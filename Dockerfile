FROM node:10-jessie-slim

# Bundle APP files
COPY src /app/src
COPY package.json /app
COPY app.js /app
# env
COPY .env /app
COPY .babelrc /app

# Set working directory
WORKDIR /app

# Install app dependencies
RUN npm install

CMD ["npm", "start"]