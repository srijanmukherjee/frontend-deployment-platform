FROM node:20-alpine3.19

RUN apk add git

WORKDIR /home/app

COPY package.json package.json
COPY yarn.lock yarn.lock
RUN yarn install

COPY main.sh main.sh
COPY build.js build.js

RUN chmod +x main.sh 
RUN chmod +x build.js 

ENTRYPOINT [ "/home/app/main.sh" ]