FROM node:10-jessie-slim
ARG GIT_TOKEN
# Bundle APP files
COPY ./ /app
RUN npm install -y git
# Set working directory
WORKDIR /app
RUN sed -i "s|ssh:\/\/git|https:\/\/$GIT_TOKEN|g" package.json && npm install

# Install app dependencies
RUN npm install && mkdir runtime

CMD ["npm", "start"]
