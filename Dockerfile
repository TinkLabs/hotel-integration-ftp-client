FROM node:10-jessie-slim
ARG GIT_TOKEN
# Bundle APP files
COPY ./ /app
RUN apt-get install git
# Set working directory
WORKDIR /app
RUN sed -i "s|ssh:\/\/git|https:\/\/$GIT_TOKEN|g" package.json && npm install

# Install app dependencies
RUN mkdir runtime

CMD ["npm", "start"]
