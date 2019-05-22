FROM node:10-jessie-slim
# Bundle APP files
COPY ./ /app
RUN apt-get install git
# Set working directory
WORKDIR /app

# Install app dependencies
RUN mkdir runtime

CMD ["npm", "start"]
