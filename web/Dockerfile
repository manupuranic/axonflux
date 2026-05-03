FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ARG INTERNAL_API_URL
ENV INTERNAL_API_URL=$INTERNAL_API_URL

RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]