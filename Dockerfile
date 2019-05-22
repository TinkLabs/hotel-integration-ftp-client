FROM node:8
ARG GIT_TOKEN
# Bundle APP files
COPY ./ /app
RUN yum install -y git
# Set working directory
WORKDIR /app
RUN sed -i "s|ssh:\/\/git|https:\/\/$GIT_TOKEN|g" package.json && npm install

# Install app dependencies
RUN npm install && mkdir runtime

CMD ["npm", "start"]
