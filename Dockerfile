FROM node:14-alpine3.14 AS builder
# FROM ubuntu:latest AS builder

WORKDIR /app
COPY package.json yarn.lock ./
RUN apk add --update --repository http://dl-cdn.alpinelinux.org/alpine/v3.14/community --repository http://dl-cdn.alpinelinux.org/alpine/v3.14/main vips-dev 
RUN apk add --no-cache python2 py-pip make g++
# RUN apt update
# RUN apt install -y python2 make g++ nodejs npm
# RUN npm install -g yarn

# ENV PYTHON=/usr/bin/python
# RUN yarn config set --global python /usr/bin/python
# RUN apt update
# RUN apt install -y curl | apt install -y python2
# RUN curl -sL https://deb.nodesource.com/setup_14.x | sudo -E bash - | apt install -y nodejs build-essential
# RUN curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | sudo apt-key add - | echo "deb https://dl.yarnpkg.com/debian/ stable main" | sudo tee /etc/apt/sources.list.d/yarn.list | apt update | apt install -y yarn

RUN yarn install
COPY . .
RUN yarn build

FROM node:14-alpine3.14
RUN apk add --update --repository http://dl-cdn.alpinelinux.org/alpine/v3.14/community --repository http://dl-cdn.alpinelinux.org/alpine/v3.14/main vips-dev 
RUN apk add --no-cache python2 py-pip make g++ tzdata
RUN echo "Asia/Seoul" > /etc/timezone

# FROM ubuntu:latest
# RUN apt update
# RUN apt install -y python2 make g++ nodejs npm
# RUN npm install -g yarn

ARG NODE_ENV=production
ENV NODE_ENV $NODE_ENV
ENV PORT 3000

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install

COPY --from=builder /app/dist/ dist/
COPY custom custom
COPY metadata metadata
COPY migrations migrations
COPY migrations-v1 migrations-v1

HEALTHCHECK --interval=60s --timeout=2s --retries=3 CMD wget localhost:${PORT}/healthz -q -O - > /dev/null 2>&1

EXPOSE $PORT
CMD ["yarn", "start"]
