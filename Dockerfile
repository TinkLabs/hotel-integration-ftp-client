FROM node:10-jessie-slim

# Bundle APP files
COPY ./ /app

# Set working directory
WORKDIR /app

# Install app dependencies
RUN npm install

CMD ["npm", "start"]